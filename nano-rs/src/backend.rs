use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tokio::runtime::Builder;
use tokio::sync::{mpsc as tokio_mpsc, watch};
use tokio::time::sleep;

use crate::audio_sink::AudioFrameSink;
use crate::auth::AuthBundle;
use crate::channels::InputFrame;
use crate::error::NanoError;
use crate::protocol::{IceServer, PeerConnectionPlan, SessionBlueprint, StreamRequest};
use crate::session::NanoWebRtcSession;
use crate::signaling::NanoHttpSignalingClient;
use crate::stats::StreamStats;
use crate::video_sink::VideoFrameSink;
use crate::webrtc_backend::{PeerStatsBaseline, RealNanoPeerConnection};

pub trait SessionEventSink {
    fn update_status(&self, stage: &str, message: &str, terminal: bool);
    fn update_stats(&self, stats: &StreamStats);
}

#[derive(Clone)]
pub struct AndroidSessionConfig {
    pub auth: AuthBundle,
    pub request: StreamRequest,
    pub stereo_audio_enabled: bool,
    pub max_touchpoints: u8,
    pub coop: bool,
    pub extra_ice_servers: Vec<IceServer>,
    pub video_sink: Option<Arc<dyn VideoFrameSink + Send + Sync>>,
    pub audio_sink: Option<Arc<dyn AudioFrameSink + Send + Sync>>,
    pub event_sink: Option<Arc<dyn SessionEventSink + Send + Sync>>,
}

#[derive(Debug)]
pub struct NanoSessionHandle {
    stop_tx: watch::Sender<bool>,
    input_tx: tokio_mpsc::UnboundedSender<InputFrame>,
    join_handle: Option<thread::JoinHandle<Result<(), NanoError>>>,
}

impl NanoSessionHandle {
    pub fn start(config: AndroidSessionConfig) -> Result<Self, NanoError> {
        let (stop_tx, stop_rx) = watch::channel(false);
        let (input_tx, input_rx) = tokio_mpsc::unbounded_channel();
        let (ready_tx, ready_rx) = std_mpsc::channel();
        crate::nano_log!("session-handle start thread");

        let event_sink = config.event_sink.clone();
        let join_handle = thread::spawn(move || {
            let runtime = Builder::new_multi_thread()
                .enable_all()
                .worker_threads(2)
                .thread_name("nano-web-rtc")
                .build()
                .map_err(|error| NanoError::RuntimeMessage(error.to_string()))?;

            let _ = ready_tx.send(Ok(()));
            let result = runtime.block_on(run_session(config, stop_rx, input_rx));
            if let Err(error) = &result {
                crate::nano_error!("run-session failed: {error}");
                if let Some(event_sink) = event_sink.as_ref() {
                    event_sink.update_status("failed", &error.to_string(), true);
                }
            } else {
                crate::nano_log!("run-session finished");
            }
            result
        });

        match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => Ok(Self {
                stop_tx,
                input_tx,
                join_handle: Some(join_handle),
            }),
            Ok(Err(error)) => {
                let _ = stop_tx.send(true);
                let _ = join_handle.join();
                Err(error)
            }
            Err(_) => Ok(Self {
                stop_tx,
                input_tx,
                join_handle: Some(join_handle),
            }),
        }
    }

    pub fn send_gamepad_frame(&self, frame: InputFrame) -> Result<(), NanoError> {
        self.input_tx
            .send(frame)
            .map_err(|_| NanoError::RuntimeMessage("nano input channel closed".to_owned()))
    }

    pub fn stop(&mut self) -> Result<(), NanoError> {
        let _ = self.stop_tx.send(true);
        if let Some(join_handle) = self.join_handle.take() {
            match join_handle.join() {
                Ok(result) => result,
                Err(_) => Err(NanoError::RuntimeMessage(
                    "nano session thread panicked".to_owned(),
                )),
            }
        } else {
            Ok(())
        }
    }
}

async fn run_session(
    config: AndroidSessionConfig,
    mut stop_rx: watch::Receiver<bool>,
    mut input_rx: tokio_mpsc::UnboundedReceiver<InputFrame>,
) -> Result<(), NanoError> {
    crate::nano_log!("run-session start");
    emit_status(
        config.event_sink.as_ref(),
        "connecting",
        "Connecting...",
        false,
    );
    let mut session = NanoWebRtcSession::from_request(&config.auth, config.request.clone())?;
    session.start();
    crate::nano_log!("run-session initialized");

    let signaling = NanoHttpSignalingClient::new()?;
    let mut request = session.play_request();
    if request.body.is_none() {
        request.body = Some(session.blueprint().play_body().to_json());
    }
    crate::nano_log!("run-session play request");
    let play_response = signaling.play(request).await?;
    session.record_play_response_body(play_response)?;
    crate::nano_log!("run-session play response recorded");

    let connect_sent = wait_for_provisioned_state(&signaling, &mut session, &mut stop_rx).await?;
    crate::nano_log!("run-session provisioned connectSent={connect_sent}");

    let configuration = signaling
        .configuration(session.build_configuration_request()?)
        .await?;
    session.record_configuration(configuration);
    crate::nano_log!("run-session configuration recorded");
    emit_status(
        config.event_sink.as_ref(),
        "configuration",
        "Configuration obtained successfully, initiating offer...",
        false,
    );

    let peer_plan = build_peer_plan(session.blueprint(), &config);
    let peer = RealNanoPeerConnection::new(
        &peer_plan,
        config.max_touchpoints,
        config.coop,
        config.video_sink.clone(),
        config.audio_sink.clone(),
        config.event_sink.clone(),
    )
    .await?;
    crate::nano_log!("run-session peer created");
    let input_peer = peer.clone();
    tokio::spawn(async move {
        while let Some(frame) = input_rx.recv().await {
            if let Err(error) = input_peer.send_gamepad_frame(frame).await {
                crate::nano_warn!("input gamepad frame send failed: {error}");
            }
        }
        crate::nano_log!("input gamepad frame loop stopped");
    });

    let offer_sdp = peer.create_offer(config.stereo_audio_enabled).await?;
    crate::nano_log!("run-session local offer created");
    signaling
        .post_sdp_offer(session.build_primary_sdp_offer_request(offer_sdp)?)
        .await?;
    crate::nano_log!("run-session local offer posted");

    let answer = wait_for_sdp_answer(&signaling, &session, &mut stop_rx).await?;
    emit_status(
        config.event_sink.as_ref(),
        "remote-offer",
        "Remote offer retrieved successfully...",
        false,
    );
    peer.set_remote_answer(&answer.sdp).await?;
    session.record_sdp_answer_response(answer)?;
    crate::nano_log!("run-session remote answer set");
    emit_status(
        config.event_sink.as_ref(),
        "ready-ice",
        "Ready to send ICE...",
        false,
    );

    if let Some(event_sink) = config.event_sink.clone() {
        let stats_peer = peer.clone();
        let mut stats_stop_rx = stop_rx.clone();
        tokio::spawn(async move {
            run_stats_loop(stats_peer, event_sink, &mut stats_stop_rx).await;
        });
    }

    let local_candidates = peer.drain_local_candidates().await?;
    crate::nano_log!(
        "run-session posting local candidates count={}",
        local_candidates.len()
    );
    signaling
        .post_ice_candidates(session.build_ice_post_request(local_candidates)?)
        .await?;

    let remote_candidates = wait_for_remote_ice(&signaling, &session, &mut stop_rx).await?;
    crate::nano_log!(
        "run-session remote candidates count={}",
        remote_candidates.len()
    );
    for candidate in remote_candidates {
        peer.add_remote_candidate(&candidate).await?;
        session.record_remote_candidate(candidate)?;
    }
    emit_status(
        config.event_sink.as_ref(),
        "ice-exchanged",
        "Exchange ICE successfully...",
        false,
    );

    if !connect_sent && session.blueprint().web_token().is_some() {
        signaling
            .connect(session.build_connect_request_from_web_token()?)
            .await?;
        session.connect()?;
        crate::nano_log!("run-session connect sent from web token");
    }

    let pulse = session
        .configuration()
        .map(|configuration| configuration.keep_alive_pulse_in_seconds)
        .unwrap_or(20)
        .max(5);
    let mut keepalive = tokio::time::interval(Duration::from_secs(u64::from(pulse)));

    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                break;
            }
            _ = keepalive.tick() => {
                crate::nano_log!("run-session keepalive");
                signaling.keepalive(session.build_keepalive_request()?).await?;
            }
        }
    }

    crate::nano_log!("run-session stopping");
    let _ = signaling.stop(session.build_stop_request()?).await;
    let _ = peer.close().await;
    session.close();
    crate::nano_log!("run-session closed");
    Ok(())
}

fn emit_status(
    event_sink: Option<&Arc<dyn SessionEventSink + Send + Sync>>,
    stage: &str,
    message: &str,
    terminal: bool,
) {
    if let Some(event_sink) = event_sink {
        event_sink.update_status(stage, message, terminal);
    }
}

async fn run_stats_loop(
    peer: RealNanoPeerConnection,
    event_sink: Arc<dyn SessionEventSink + Send + Sync>,
    stop_rx: &mut watch::Receiver<bool>,
) {
    let mut baseline = PeerStatsBaseline::default();
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                break;
            }
            _ = interval.tick() => {
                let stats = peer.collect_stream_stats(&mut baseline).await;
                event_sink.update_stats(&stats);
            }
        }
    }
    crate::nano_log!("stats loop stopped");
}

async fn wait_for_provisioned_state(
    signaling: &NanoHttpSignalingClient,
    session: &mut NanoWebRtcSession,
    stop_rx: &mut watch::Receiver<bool>,
) -> Result<bool, NanoError> {
    let mut connect_sent = false;
    loop {
        if *stop_rx.borrow() {
            return Err(NanoError::RuntimeMessage("session stopped".to_owned()));
        }

        let state = signaling.state(session.build_state_request()?).await?;
        crate::nano_log!("state poll state={}", state.state);
        match state.state.as_str() {
            "Provisioned" => return Ok(connect_sent),
            "WaitingForResources" | "Provisioning" => {
                sleep(Duration::from_secs(1)).await;
            }
            "ReadyToConnect" => {
                if !connect_sent && session.blueprint().web_token().is_some() {
                    signaling
                        .connect(session.build_connect_request_from_web_token()?)
                        .await?;
                    connect_sent = true;
                }
                sleep(Duration::from_secs(1)).await;
            }
            "Failed" => {
                crate::nano_error!(
                    "state failed message={}",
                    state.error_message.as_deref().unwrap_or("unknown")
                );
                return Err(NanoError::SignalingOwned(
                    state
                        .error_message
                        .unwrap_or_else(|| "streaming failed".to_owned()),
                ));
            }
            _ => {
                sleep(Duration::from_secs(1)).await;
            }
        }
    }
}

async fn wait_for_sdp_answer(
    signaling: &NanoHttpSignalingClient,
    session: &NanoWebRtcSession,
    stop_rx: &mut watch::Receiver<bool>,
) -> Result<crate::protocol::SdpExchangeResponse, NanoError> {
    loop {
        if *stop_rx.borrow() {
            return Err(NanoError::RuntimeMessage("session stopped".to_owned()));
        }
        match signaling
            .poll_sdp_answer(session.build_sdp_poll_request()?)
            .await
        {
            Ok(answer) => {
                crate::nano_log!("sdp answer received");
                return Ok(answer);
            }
            Err(NanoError::Json(_)) => {
                crate::nano_log!("sdp answer not ready");
                sleep(Duration::from_secs(1)).await;
            }
            Err(error) => {
                crate::nano_error!("sdp answer poll failed: {error}");
                return Err(error);
            }
        }
    }
}

async fn wait_for_remote_ice(
    signaling: &NanoHttpSignalingClient,
    session: &NanoWebRtcSession,
    stop_rx: &mut watch::Receiver<bool>,
) -> Result<Vec<crate::protocol::IceCandidate>, NanoError> {
    loop {
        if *stop_rx.borrow() {
            return Err(NanoError::RuntimeMessage("session stopped".to_owned()));
        }
        match signaling
            .poll_ice_candidates(session.build_ice_poll_request()?)
            .await
        {
            Ok(candidates) if !candidates.is_empty() => {
                crate::nano_log!("remote ice received count={}", candidates.len());
                return Ok(candidates);
            }
            Ok(_) => {
                crate::nano_log!("remote ice not ready");
                sleep(Duration::from_secs(1)).await;
            }
            Err(NanoError::Json(_)) => {
                crate::nano_log!("remote ice poll json-not-ready");
                sleep(Duration::from_secs(1)).await;
            }
            Err(error) => {
                crate::nano_error!("remote ice poll failed: {error}");
                return Err(error);
            }
        }
    }
}

fn build_peer_plan(
    blueprint: &SessionBlueprint,
    config: &AndroidSessionConfig,
) -> PeerConnectionPlan {
    let mut plan = blueprint.peer.clone();
    if !config.extra_ice_servers.is_empty() {
        plan.ice_servers.extend(config.extra_ice_servers.clone());
    }
    plan
}
