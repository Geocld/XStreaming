use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use bytes::{Bytes, BytesMut};
use rtp::codecs::h264::H264Packet;
use rtp::packetizer::Depacketizer;
use tokio::time::{sleep, timeout};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::{RTCIceCandidate, RTCIceCandidateInit};
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::RTCRtpTransceiverInit;
use webrtc::stats::StatsReportType;
use webrtc::track::track_remote::TrackRemote;

use crate::audio_sink::AudioFrameSink;
use crate::backend::SessionEventSink;
use crate::channels::{
    initial_system_ui_messages, ControlMessage, InputFrame, InputPacket, MessageHandshake,
    MetadataFrame,
};
use crate::error::NanoError;
use crate::protocol::{
    force_stereo_audio_sdp, IceCandidate, PeerConnectionPlan, TransceiverDirection,
};
use crate::session::MediaTrackKind;
use crate::stats::StreamStats;
use crate::video_sink::VideoFrameSink;

const CONTROL_ACCESS_KEY: &str = "4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E";
const VIDEO_KEYFRAME_REQUEST_MIN_INTERVAL: Duration = Duration::from_secs(1);
const VIDEO_KEYFRAME_REFRESH_INTERVAL: Duration = Duration::from_secs(10);
const MAX_H264_ACCESS_UNIT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug)]
struct PeerSharedState {
    local_candidates: Mutex<Vec<IceCandidate>>,
    observed_tracks: Mutex<Vec<MediaTrackKind>>,
    message_ready: AtomicBool,
    keyframe_requested: AtomicBool,
    message_id: AtomicU64,
    message_cv: AtomicU64,
    input_sequence: AtomicU64,
    video_packets_received: AtomicU64,
    video_bytes_received: AtomicU64,
    video_packets_lost: AtomicU64,
    video_frames_received: AtomicU64,
    video_frames_dropped: AtomicU64,
    video_jitter_us: AtomicU64,
    max_touchpoints: u8,
    coop: bool,
}

impl PeerSharedState {
    fn new(max_touchpoints: u8, coop: bool) -> Self {
        Self {
            local_candidates: Mutex::new(Vec::new()),
            observed_tracks: Mutex::new(Vec::new()),
            message_ready: AtomicBool::new(false),
            keyframe_requested: AtomicBool::new(false),
            message_id: AtomicU64::new(1),
            message_cv: AtomicU64::new(1),
            input_sequence: AtomicU64::new(1),
            video_packets_received: AtomicU64::new(0),
            video_bytes_received: AtomicU64::new(0),
            video_packets_lost: AtomicU64::new(0),
            video_frames_received: AtomicU64::new(0),
            video_frames_dropped: AtomicU64::new(0),
            video_jitter_us: AtomicU64::new(0),
            max_touchpoints,
            coop,
        }
    }

    fn next_message_id(&self) -> String {
        self.message_id.fetch_add(1, Ordering::Relaxed).to_string()
    }

    fn next_message_cv(&self) -> String {
        self.message_cv.fetch_add(1, Ordering::Relaxed).to_string()
    }

    fn next_input_sequence(&self) -> u32 {
        self.input_sequence.fetch_add(1, Ordering::Relaxed) as u32
    }

    fn push_local_candidate(&self, candidate: IceCandidate) {
        if let Ok(mut guard) = self.local_candidates.lock() {
            guard.push(candidate);
        }
    }

    fn local_candidates(&self) -> Vec<IceCandidate> {
        self.local_candidates
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    fn record_track(&self, kind: MediaTrackKind) -> bool {
        if let Ok(mut guard) = self.observed_tracks.lock() {
            if !guard.contains(&kind) {
                guard.push(kind);
            }
            return guard.contains(&MediaTrackKind::Video)
                && guard.contains(&MediaTrackKind::Audio);
        }
        false
    }
}

#[derive(Clone)]
pub struct RealNanoPeerConnection {
    pc: Arc<RTCPeerConnection>,
    shared: Arc<PeerSharedState>,
    video_sink: Option<Arc<dyn VideoFrameSink + Send + Sync>>,
    audio_sink: Option<Arc<dyn AudioFrameSink + Send + Sync>>,
    event_sink: Option<Arc<dyn SessionEventSink + Send + Sync>>,
    control_channel: Option<Arc<RTCDataChannel>>,
    input_channel: Option<Arc<RTCDataChannel>>,
    message_channel: Option<Arc<RTCDataChannel>>,
}

#[derive(Debug, Default)]
pub struct PeerStatsBaseline {
    sampled_at: Option<Instant>,
    video_bytes_received: u64,
    video_frames_received: u64,
}

impl RealNanoPeerConnection {
    pub async fn new(
        plan: &PeerConnectionPlan,
        max_touchpoints: u8,
        coop: bool,
        video_sink: Option<Arc<dyn VideoFrameSink + Send + Sync>>,
        audio_sink: Option<Arc<dyn AudioFrameSink + Send + Sync>>,
        event_sink: Option<Arc<dyn SessionEventSink + Send + Sync>>,
    ) -> Result<Self, NanoError> {
        crate::nano_log!(
            "peer new transceivers={} channels={} iceServers={} videoSink={} audioSink={}",
            plan.transceivers.len(),
            plan.channels.len(),
            plan.ice_servers.len(),
            video_sink.is_some(),
            audio_sink.is_some()
        );
        let api = build_api()?;
        let config = RTCConfiguration {
            ice_servers: plan
                .ice_servers
                .iter()
                .map(to_rtc_ice_server)
                .collect::<Vec<_>>(),
            ..Default::default()
        };
        let pc = Arc::new(
            api.new_peer_connection(config)
                .await
                .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?,
        );
        let shared = Arc::new(PeerSharedState::new(max_touchpoints, coop));
        let mut peer = Self {
            pc,
            shared,
            video_sink,
            audio_sink,
            event_sink,
            control_channel: None,
            input_channel: None,
            message_channel: None,
        };
        peer.prepare(plan).await?;
        Ok(peer)
    }

    async fn prepare(&mut self, plan: &PeerConnectionPlan) -> Result<(), NanoError> {
        for transceiver in &plan.transceivers {
            let direction = match transceiver.direction {
                TransceiverDirection::SendRecv => RTCRtpTransceiverDirection::Sendrecv,
                TransceiverDirection::SendOnly => RTCRtpTransceiverDirection::Sendonly,
                TransceiverDirection::RecvOnly => RTCRtpTransceiverDirection::Recvonly,
                TransceiverDirection::Inactive => RTCRtpTransceiverDirection::Inactive,
            };
            self.pc
                .add_transceiver_from_kind(
                    match transceiver.kind {
                        "audio" => RTPCodecType::Audio,
                        "video" => RTPCodecType::Video,
                        _ => RTPCodecType::Audio,
                    },
                    Some(RTCRtpTransceiverInit {
                        direction,
                        send_encodings: Vec::new(),
                    }),
                )
                .await
                .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
        }

        self.open_data_channels(plan).await?;
        self.bind_callbacks().await?;
        Ok(())
    }

    async fn open_data_channels(&mut self, plan: &PeerConnectionPlan) -> Result<(), NanoError> {
        for channel in &plan.channels {
            crate::nano_log!(
                "open data channel name={} protocol={} ordered={}",
                channel.name,
                channel.protocol,
                channel.ordered
            );
            let init = RTCDataChannelInit {
                ordered: Some(channel.ordered),
                protocol: Some(channel.protocol.to_owned()),
                ..Default::default()
            };
            let data_channel = self
                .pc
                .create_data_channel(channel.name, Some(init))
                .await
                .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;

            match channel.name {
                "input" => {
                    self.input_channel = Some(Arc::clone(&data_channel));
                    self.bind_input_channel(Arc::clone(&data_channel)).await?;
                }
                "control" => {
                    self.control_channel = Some(Arc::clone(&data_channel));
                    self.bind_control_channel(Arc::clone(&data_channel)).await?;
                }
                "message" => {
                    self.message_channel = Some(Arc::clone(&data_channel));
                    self.bind_message_channel(Arc::clone(&data_channel)).await?;
                }
                "chat" => {
                    self.bind_passthrough_channel(Arc::clone(&data_channel), "chat")
                        .await?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    async fn bind_callbacks(&self) -> Result<(), NanoError> {
        let shared = Arc::clone(&self.shared);
        let control_channel = self.control_channel.as_ref().map(Arc::clone);
        let video_sink = self.video_sink.as_ref().map(Arc::clone);
        let audio_sink = self.audio_sink.as_ref().map(Arc::clone);
        self.pc.on_track(Box::new(
            move |track: Arc<TrackRemote>, _receiver, _transceiver| {
                let shared = Arc::clone(&shared);
                let control_channel = control_channel.as_ref().map(Arc::clone);
                let video_sink = video_sink.as_ref().map(Arc::clone);
                let audio_sink = audio_sink.as_ref().map(Arc::clone);
                Box::pin(async move {
                    let kind = match track.kind() {
                        RTPCodecType::Audio => MediaTrackKind::Audio,
                        RTPCodecType::Video => MediaTrackKind::Video,
                        _ => MediaTrackKind::Other,
                    };
                    let codec = track.codec().capability;
                    crate::nano_log!(
                        "on-track kind={:?} codec={} clockRate={} ssrc={}",
                        kind,
                        codec.mime_type,
                        codec.clock_rate,
                        track.ssrc()
                    );
                    match kind {
                        MediaTrackKind::Video => {
                            let video_control_channel = control_channel.as_ref().map(Arc::clone);
                            if let Some(video_sink) = video_sink {
                                tokio::spawn(run_video_track(
                                    track,
                                    video_sink,
                                    Arc::clone(&shared),
                                    video_control_channel,
                                ));
                            } else {
                                tokio::spawn(run_video_track(
                                    track,
                                    Arc::new(NoopVideoSink),
                                    Arc::clone(&shared),
                                    video_control_channel,
                                ));
                            }
                        }
                        MediaTrackKind::Audio => {
                            tokio::spawn(run_audio_track(track, audio_sink));
                        }
                        MediaTrackKind::Other => {}
                    }

                    if shared.record_track(kind)
                        && !shared.keyframe_requested.swap(true, Ordering::SeqCst)
                    {
                        if let Some(channel) = control_channel {
                            let message = ControlMessage::video_keyframe_requested(false).to_json();
                            let _ = channel.send_text(message).await;
                            crate::nano_log!("initial video keyframe requested");
                        }
                    }
                })
            },
        ));

        let shared = Arc::clone(&self.shared);
        self.pc
            .on_ice_candidate(Box::new(move |candidate: Option<RTCIceCandidate>| {
                let shared = Arc::clone(&shared);
                Box::pin(async move {
                    if let Some(candidate) = candidate {
                        if let Ok(init) = candidate.to_json() {
                            if let Some(text) = candidate_to_protocol_candidate(&init) {
                                crate::nano_log!(
                                    "local ice candidate gathered mid={} mline={}",
                                    text.sdp_mid,
                                    text.sdp_mline_index
                                );
                                shared.push_local_candidate(text);
                            }
                        }
                    }
                })
            }));

        let event_sink = self.event_sink.as_ref().map(Arc::clone);
        self.pc
            .on_peer_connection_state_change(Box::new(move |state: RTCPeerConnectionState| {
                let event_sink = event_sink.as_ref().map(Arc::clone);
                Box::pin(async move {
                    crate::nano_log!("peer state={state:?}");
                    if let Some(event_sink) = event_sink {
                        match state {
                            RTCPeerConnectionState::Connected => {
                                event_sink.update_status("connected", "connected", false);
                            }
                            RTCPeerConnectionState::Failed => {
                                event_sink.update_status("failed", "NAT failed", true);
                            }
                            RTCPeerConnectionState::Closed => {
                                event_sink.update_status("closed", "Streaming is closed", true);
                            }
                            _ => {}
                        }
                    }
                })
            }));

        Ok(())
    }

    async fn bind_input_channel(&self, channel: Arc<RTCDataChannel>) -> Result<(), NanoError> {
        let shared = Arc::clone(&self.shared);
        let channel_for_open = Arc::clone(&channel);
        channel.on_open(Box::new(move || {
            let channel = Arc::clone(&channel_for_open);
            let shared = Arc::clone(&shared);
            Box::pin(async move {
                crate::nano_log!("input channel open");
                let packet = InputPacket::client_metadata(0, shared.max_touchpoints);
                let _ = channel.send(&Bytes::from(packet.to_bytes(now_ms()))).await;
                crate::nano_log!("input client metadata sent");
                tokio::spawn(run_processed_frame_loop(channel, shared));
            })
        }));
        Ok(())
    }

    async fn bind_control_channel(&self, channel: Arc<RTCDataChannel>) -> Result<(), NanoError> {
        channel.on_open(Box::new(move || {
            Box::pin(async move {
                crate::nano_log!("control channel open");
            })
        }));
        Ok(())
    }

    async fn bind_message_channel(&self, channel: Arc<RTCDataChannel>) -> Result<(), NanoError> {
        let shared = Arc::clone(&self.shared);
        let control_channel = self.control_channel.as_ref().map(Arc::clone);
        let channel_for_open = Arc::clone(&channel);
        channel.on_open(Box::new(move || {
            let channel = Arc::clone(&channel_for_open);
            let shared = Arc::clone(&shared);
            Box::pin(async move {
                crate::nano_log!("message channel open");
                let handshake = MessageHandshake {
                    version: "messageV1".to_owned(),
                    id: shared.next_message_id(),
                    cv: shared.next_message_cv(),
                };
                let _ = channel.send_text(handshake.to_json()).await;
            })
        }));

        let shared = Arc::clone(&self.shared);
        let channel_for_message = Arc::clone(&channel);
        channel.on_message(Box::new(move |msg: DataChannelMessage| {
            let shared = Arc::clone(&shared);
            let control_channel = control_channel.as_ref().map(Arc::clone);
            let channel = Arc::clone(&channel_for_message);
            Box::pin(async move {
                let Ok(text) = String::from_utf8(msg.data.to_vec()) else {
                    return;
                };
                if !shared.message_ready.load(Ordering::SeqCst) {
                    if let Some(message_type) = json_message_type(&text) {
                        if message_type == "HandshakeAck" {
                            crate::nano_log!("message handshake ack received");
                            shared.message_ready.store(true, Ordering::SeqCst);
                            if let Some(control_channel) = control_channel {
                                let _ = control_channel
                                    .send_text(
                                        ControlMessage::authorization_request(CONTROL_ACCESS_KEY)
                                            .to_json(),
                                    )
                                    .await;
                                let _ = control_channel
                                    .send_text(ControlMessage::gamepad_changed(0, false).to_json())
                                    .await;
                                if shared.coop {
                                    let _ = control_channel
                                        .send_text(
                                            ControlMessage::gamepad_changed(1, false).to_json(),
                                        )
                                        .await;
                                }
                                let shared = Arc::clone(&shared);
                                tokio::spawn(async move {
                                    sleep(Duration::from_millis(500)).await;
                                    let _ = control_channel
                                        .send_text(
                                            ControlMessage::gamepad_changed(0, true).to_json(),
                                        )
                                        .await;
                                    if shared.coop {
                                        let _ = control_channel
                                            .send_text(
                                                ControlMessage::gamepad_changed(1, true).to_json(),
                                            )
                                            .await;
                                    }
                                });
                            }
                            let _ = send_initial_message_bundle(&channel, &shared).await;
                        }
                    }
                }
            })
        }));
        Ok(())
    }

    async fn bind_passthrough_channel(
        &self,
        channel: Arc<RTCDataChannel>,
        label: &'static str,
    ) -> Result<(), NanoError> {
        channel.on_open(Box::new(move || {
            let label = label.to_owned();
            Box::pin(async move {
                crate::nano_log!("data channel opened label={label}");
            })
        }));
        Ok(())
    }

    pub async fn create_offer(&self, stereo_audio_enabled: bool) -> Result<String, NanoError> {
        crate::nano_log!("create offer stereoAudio={stereo_audio_enabled}");
        crate::nano_log!("create offer begin");
        let offer = timeout(Duration::from_secs(8), self.pc.create_offer(None))
            .await
            .map_err(|_| NanoError::PeerConnectionOwned("create offer timeout".to_owned()))?
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
        crate::nano_log!("create offer raw sdp len={}", offer.sdp.len());
        let mut server_offer_sdp = offer.sdp.clone();
        if stereo_audio_enabled {
            match force_stereo_audio_sdp(&offer.sdp) {
                Ok(sdp) => {
                    crate::nano_log!("create offer stereo rewrite applied");
                    server_offer_sdp = sdp;
                }
                Err(error) => {
                    crate::nano_warn!("create offer stereo rewrite skipped: {error}");
                }
            }
        }
        crate::nano_log!("create offer set local description begin");
        timeout(
            Duration::from_secs(8),
            self.pc.set_local_description(offer.clone()),
        )
        .await
        .map_err(|_| NanoError::PeerConnectionOwned("set local description timeout".to_owned()))?
        .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
        crate::nano_log!("create offer set local description done");
        crate::nano_log!("create offer wait ice begin");
        self.wait_for_candidate_gathering().await?;
        crate::nano_log!("create offer wait ice done");
        Ok(server_offer_sdp)
    }

    async fn wait_for_candidate_gathering(&self) -> Result<(), NanoError> {
        let started = Instant::now();
        let mut last_count = 0usize;
        let mut stable_count = 0usize;
        while started.elapsed() < Duration::from_secs(5) {
            sleep(Duration::from_millis(120)).await;
            let count = self.shared.local_candidates().len();
            if count > 0 && count == last_count {
                stable_count += 1;
                if stable_count >= 3 {
                    break;
                }
            } else {
                stable_count = 0;
                last_count = count;
            }
        }
        Ok(())
    }

    pub async fn set_remote_answer(&self, sdp: &str) -> Result<(), NanoError> {
        crate::nano_log!("set remote answer len={}", sdp.len());
        let answer = RTCSessionDescription::answer(sdp.to_owned())
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
        self.pc
            .set_remote_description(answer)
            .await
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))
    }

    pub async fn drain_local_candidates(&self) -> Result<Vec<IceCandidate>, NanoError> {
        let candidates = self.shared.local_candidates();
        crate::nano_log!("drain local candidates count={}", candidates.len());
        Ok(candidates)
    }

    pub async fn add_remote_candidate(&self, candidate: &IceCandidate) -> Result<(), NanoError> {
        if candidate.is_end_of_candidates() || candidate.has_invalid_tcp_type() {
            crate::nano_log!(
                "skip remote candidate mid={} mline={}",
                candidate.sdp_mid,
                candidate.sdp_mline_index
            );
            return Ok(());
        }
        crate::nano_log!(
            "add remote candidate mid={} mline={}",
            candidate.sdp_mid,
            candidate.sdp_mline_index
        );
        let init = RTCIceCandidateInit {
            candidate: candidate.candidate.clone(),
            sdp_mid: Some(candidate.sdp_mid.clone()),
            sdp_mline_index: Some(candidate.sdp_mline_index.parse::<u16>().unwrap_or(0)),
            username_fragment: None,
        };
        self.pc
            .add_ice_candidate(init)
            .await
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))
    }

    pub async fn send_gamepad_frame(&self, frame: InputFrame) -> Result<(), NanoError> {
        let Some(channel) = self.input_channel.as_ref() else {
            return Err(NanoError::RuntimeMessage(
                "input channel not ready".to_owned(),
            ));
        };

        let packet = InputPacket::with_data(
            self.shared.next_input_sequence(),
            Vec::new(),
            vec![frame],
            Vec::new(),
            1920,
            1080,
        );
        channel
            .send(&Bytes::from(packet.to_bytes(now_ms())))
            .await
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
        Ok(())
    }

    pub async fn collect_stream_stats(&self, baseline: &mut PeerStatsBaseline) -> StreamStats {
        let mut stats = StreamStats::default();
        let now = Instant::now();
        let mut video_bytes_received = self.shared.video_bytes_received.load(Ordering::Relaxed);
        let packets_received = self.shared.video_packets_received.load(Ordering::Relaxed);
        let packets_lost = self.shared.video_packets_lost.load(Ordering::Relaxed);
        let frames_received = self.shared.video_frames_received.load(Ordering::Relaxed);
        let frames_dropped = self.shared.video_frames_dropped.load(Ordering::Relaxed);
        let jitter_us = self.shared.video_jitter_us.load(Ordering::Relaxed);

        let report = self.pc.get_stats().await;
        for report in report.reports.values() {
            match report {
                StatsReportType::CandidatePair(candidate)
                    if candidate.state.to_string() == "succeeded" =>
                {
                    if candidate.current_round_trip_time.is_finite()
                        && candidate.current_round_trip_time > 0.0
                    {
                        stats.update_rtt(candidate.current_round_trip_time * 1000.0);
                    }
                }
                StatsReportType::InboundRTP(inbound) if inbound.kind == "video" => {
                    video_bytes_received = inbound.bytes_received;
                    stats.update_packets_received(inbound.packets_received);
                }
                StatsReportType::RemoteInboundRTP(remote) if remote.kind == "video" => {
                    if let Some(rtt) = remote.round_trip_time {
                        if rtt.is_finite() && rtt > 0.0 {
                            stats.update_rtt(rtt * 1000.0);
                        }
                    }
                    if remote.packets_lost > 0 {
                        stats.update_packets_lost(remote.packets_lost as u64);
                        let total = remote.packets_received + remote.packets_lost as u64;
                        if total > 0 {
                            stats.update_packet_loss(
                                remote.packets_lost as f64 * 100.0 / total as f64,
                            );
                        }
                    }
                }
                _ => {}
            }
        }

        if stats.packets_received == 0 {
            stats.update_packets_received(packets_received);
        }
        if stats.packets_lost == 0 {
            stats.update_packets_lost(packets_lost);
        }
        if stats.packet_loss_pct.is_none() {
            let total_packets = packets_received + packets_lost;
            if total_packets > 0 {
                stats.update_packet_loss(packets_lost as f64 * 100.0 / total_packets as f64);
            }
        }
        stats.update_frames_received(frames_received);
        stats.frames_dropped = frames_dropped;
        if jitter_us > 0 {
            stats.update_jitter(jitter_us as f64 / 1000.0);
        }

        if let Some(sampled_at) = baseline.sampled_at {
            let elapsed = now.duration_since(sampled_at).as_secs_f64();
            if elapsed > 0.0 {
                let byte_delta = video_bytes_received.saturating_sub(baseline.video_bytes_received);
                stats.update_bitrate((byte_delta as f64 * 8.0 / elapsed).round() as u64);
                let frame_delta = frames_received.saturating_sub(baseline.video_frames_received);
                stats.update_fps(frame_delta as f64 / elapsed);
            }
        }
        baseline.sampled_at = Some(now);
        baseline.video_bytes_received = video_bytes_received;
        baseline.video_frames_received = frames_received;

        stats
    }

    pub async fn close(&self) -> Result<(), NanoError> {
        self.pc
            .close()
            .await
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))
    }
}

fn build_api() -> Result<webrtc::api::API, NanoError> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
    let registry = register_default_interceptors(
        webrtc::interceptor::registry::Registry::new(),
        &mut media_engine,
    )
    .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
    Ok(APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build())
}

fn to_rtc_ice_server(server: &crate::protocol::IceServer) -> RTCIceServer {
    RTCIceServer {
        urls: vec![server.urls.clone()],
        username: server.username.clone().unwrap_or_default(),
        credential: server.credential.clone().unwrap_or_default(),
    }
}

fn candidate_to_protocol_candidate(init: &RTCIceCandidateInit) -> Option<IceCandidate> {
    let candidate = init.candidate.trim();
    if candidate.is_empty() || candidate == "a=end-of-candidates" {
        return None;
    }
    if candidate.contains("UDP") && candidate.contains("tcptype") {
        return None;
    }
    Some(IceCandidate::new(
        candidate.to_owned(),
        init.sdp_mid.clone().unwrap_or_else(|| "0".to_owned()),
        init.sdp_mline_index.unwrap_or(0) as u32,
    ))
}

fn json_message_type(value: &str) -> Option<String> {
    let parsed = serde_json::from_str::<serde_json::Value>(value).ok()?;
    parsed.get("type")?.as_str().map(|value| value.to_owned())
}

async fn send_initial_message_bundle(
    channel: &RTCDataChannel,
    shared: &PeerSharedState,
) -> Result<(), NanoError> {
    for message in initial_system_ui_messages(shared.max_touchpoints as u32) {
        channel
            .send_text(message.to_json())
            .await
            .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
    }
    Ok(())
}

async fn run_processed_frame_loop(channel: Arc<RTCDataChannel>, shared: Arc<PeerSharedState>) {
    sleep(Duration::from_secs(2)).await;
    loop {
        match send_processed_frame(&channel, &shared).await {
            Ok(sequence) => {
                crate::nano_log!("input processed frame sent sequence={sequence}");
            }
            Err(error) => {
                crate::nano_warn!("input processed frame stopped: {error}");
                break;
            }
        }
        sleep(Duration::from_secs(10)).await;
    }
}

async fn send_processed_frame(
    channel: &RTCDataChannel,
    shared: &PeerSharedState,
) -> Result<u32, NanoError> {
    let sequence = shared.next_input_sequence();
    let now = performance_now_ms();
    let now_u32 = clamp_f64_to_u32(now);
    let frame = MetadataFrame {
        server_data_key: epoch_ms_low_u32(),
        first_frame_packet_arrival_time_ms: now_u32.saturating_sub(80),
        frame_submitted_time_ms: now_u32.saturating_sub(80),
        frame_decoded_time_ms: now_u32,
        frame_rendered_time_ms: now_u32,
    };
    let packet = InputPacket::with_data(sequence, vec![frame], Vec::new(), Vec::new(), 1920, 1080);
    channel
        .send(&Bytes::from(packet.to_bytes(now)))
        .await
        .map_err(|error| NanoError::PeerConnectionOwned(error.to_string()))?;
    Ok(sequence)
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as f64)
        .unwrap_or(0.0)
}

fn epoch_ms_low_u32() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| (duration.as_millis() & u128::from(u32::MAX)) as u32)
        .unwrap_or(0)
}

fn performance_now_ms() -> f64 {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
}

fn clamp_f64_to_u32(value: f64) -> u32 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    value.round().min(f64::from(u32::MAX)) as u32
}

struct NoopVideoSink;

impl VideoFrameSink for NoopVideoSink {
    fn push_h264_access_unit(&self, _data: &[u8], _pts_us: i64, _keyframe: bool) {}
}

async fn run_audio_track(
    track: Arc<TrackRemote>,
    audio_sink: Option<Arc<dyn AudioFrameSink + Send + Sync>>,
) {
    let codec = track.codec().capability;
    let sample_rate = codec.clock_rate.max(1);
    let channels = codec.channels.max(1);
    crate::nano_log!(
        "audio track reader start codec={} sampleRate={} channels={} audioSink={}",
        codec.mime_type,
        sample_rate,
        channels,
        audio_sink.is_some()
    );
    let mut packets = 0u64;
    let mut first_timestamp: Option<u32> = None;

    while let Ok((packet, _)) = track.read_rtp().await {
        let payload = packet.payload;
        if payload.is_empty() {
            continue;
        }
        let first = first_timestamp.get_or_insert(packet.header.timestamp);
        let pts_us = u64::from(packet.header.timestamp.wrapping_sub(*first)) * 1_000_000
            / u64::from(sample_rate);

        if let Some(audio_sink) = audio_sink.as_ref() {
            audio_sink.push_opus_frame(&payload, pts_us as i64, sample_rate, channels);
        }

        packets += 1;
        if packets == 1 || packets % 300 == 0 {
            crate::nano_log!(
                "audio rtp packets={} bytes={} ptsUs={}",
                packets,
                payload.len(),
                pts_us
            );
        }
    }
    crate::nano_warn!("audio track reader stopped packets={packets}");
}

async fn run_video_track(
    track: Arc<TrackRemote>,
    video_sink: Arc<dyn VideoFrameSink + Send + Sync>,
    shared: Arc<PeerSharedState>,
    control_channel: Option<Arc<RTCDataChannel>>,
) {
    crate::nano_log!("video track reader start");
    let mut depacketizer = H264Packet::default();
    let clock_rate = track.codec().capability.clock_rate.max(1);
    let mut first_timestamp: Option<u32> = None;
    let first_arrival = Instant::now();
    let mut previous_transit: Option<f64> = None;
    let mut jitter_rtp_units = 0.0f64;
    let mut frame_buffer = BytesMut::new();
    let mut frame_timestamp = 0u32;
    let mut frames = 0u64;
    let mut last_sequence: Option<u16> = None;
    let mut sequence_gaps = 0u64;
    let mut stale_packets = 0u64;
    let mut short_payload_packets = 0u64;
    let mut depacketize_errors = 0u64;
    let mut last_keyframe_request: Option<Instant> = None;
    let mut last_observed_keyframe = Instant::now();
    let mut drop_current_access_unit = false;

    while let Ok((packet, _)) = track.read_rtp().await {
        shared
            .video_packets_received
            .fetch_add(1, Ordering::Relaxed);
        shared
            .video_bytes_received
            .fetch_add(packet.payload.len() as u64, Ordering::Relaxed);

        if let Some(previous) = last_sequence {
            let expected = previous.wrapping_add(1);
            if packet.header.sequence_number != expected {
                let sequence_delta = packet.header.sequence_number.wrapping_sub(expected);
                if sequence_delta > u16::MAX / 2 {
                    stale_packets += 1;
                    if stale_packets == 1 || stale_packets % 120 == 0 {
                        crate::nano_warn!(
                            "video stale rtp packet dropped count={} expected={} actual={} timestamp={}",
                            stale_packets,
                            expected,
                            packet.header.sequence_number,
                            packet.header.timestamp
                        );
                    }
                    continue;
                }

                let lost_packets = u64::from(sequence_delta.max(1));
                sequence_gaps += lost_packets;
                shared
                    .video_packets_lost
                    .fetch_add(lost_packets, Ordering::Relaxed);
                shared.video_frames_dropped.fetch_add(1, Ordering::Relaxed);
                frame_buffer.clear();
                drop_current_access_unit = true;
                video_sink.drop_pending_output("sequence-gap");
                crate::nano_warn!(
                    "video rtp sequence gap count={} expected={} actual={} timestamp={}",
                    sequence_gaps,
                    expected,
                    packet.header.sequence_number,
                    packet.header.timestamp
                );
                request_video_keyframe_throttled(
                    control_channel.as_ref(),
                    &mut last_keyframe_request,
                    "sequence-gap",
                )
                .await;
            }
        }
        last_sequence = Some(packet.header.sequence_number);
        if drop_current_access_unit {
            if packet.header.marker {
                drop_current_access_unit = false;
            }
            continue;
        }

        let payload = packet.payload;
        let nal = match depacketizer.depacketize(&payload) {
            Ok(bytes) => bytes,
            Err(error) => {
                depacketize_errors += 1;
                frame_buffer.clear();
                if payload.len() < 2 {
                    short_payload_packets += 1;
                    if short_payload_packets == 1 || short_payload_packets % 300 == 0 {
                        crate::nano_warn!(
                            "video short rtp payload ignored count={} bytes={} timestamp={}",
                            short_payload_packets,
                            payload.len(),
                            packet.header.timestamp
                        );
                    }
                } else {
                    shared.video_frames_dropped.fetch_add(1, Ordering::Relaxed);
                    video_sink.drop_pending_output("depacketize");
                    crate::nano_warn!(
                        "video depacketize failed count={} error={}",
                        depacketize_errors,
                        error
                    );
                    drop_current_access_unit = !packet.header.marker;
                    request_video_keyframe_throttled(
                        control_channel.as_ref(),
                        &mut last_keyframe_request,
                        "depacketize",
                    )
                    .await;
                }
                continue;
            }
        };
        if nal.is_empty() {
            continue;
        }

        if first_timestamp.is_none() {
            first_timestamp = Some(packet.header.timestamp);
        }
        if let Some(base_timestamp) = first_timestamp {
            let arrival_delta = first_arrival.elapsed().as_secs_f64() * f64::from(clock_rate);
            let rtp_delta = f64::from(packet.header.timestamp.wrapping_sub(base_timestamp));
            let transit = arrival_delta - rtp_delta;
            if let Some(previous_transit) = previous_transit {
                let delta = (transit - previous_transit).abs();
                jitter_rtp_units += (delta - jitter_rtp_units) / 16.0;
                let jitter_us = ((jitter_rtp_units / f64::from(clock_rate)) * 1_000_000.0).round();
                if jitter_us.is_finite() && jitter_us > 0.0 {
                    shared
                        .video_jitter_us
                        .store(jitter_us as u64, Ordering::Relaxed);
                }
            }
            previous_transit = Some(transit);
        }

        if frame_buffer.is_empty() {
            frame_timestamp = packet.header.timestamp;
        }
        frame_buffer.extend_from_slice(nal.as_ref());
        if frame_buffer.len() > MAX_H264_ACCESS_UNIT_BYTES {
            crate::nano_warn!(
                "video access unit too large bytes={} max={}",
                frame_buffer.len(),
                MAX_H264_ACCESS_UNIT_BYTES
            );
            frame_buffer.clear();
            shared.video_frames_dropped.fetch_add(1, Ordering::Relaxed);
            video_sink.drop_pending_output("oversized-au");
            drop_current_access_unit = true;
            request_video_keyframe_throttled(
                control_channel.as_ref(),
                &mut last_keyframe_request,
                "oversized-au",
            )
            .await;
            continue;
        }

        if !packet.header.marker {
            continue;
        }

        let base_timestamp = first_timestamp.unwrap_or(frame_timestamp);
        let pts_us = rtp_timestamp_to_us(frame_timestamp, base_timestamp, clock_rate);
        let keyframe = contains_idr_nalu(frame_buffer.as_ref());
        if keyframe {
            last_observed_keyframe = Instant::now();
        } else if last_observed_keyframe.elapsed() >= VIDEO_KEYFRAME_REFRESH_INTERVAL {
            request_video_keyframe_throttled(
                control_channel.as_ref(),
                &mut last_keyframe_request,
                "periodic-refresh",
            )
            .await;
            last_observed_keyframe = Instant::now();
        }
        frames += 1;
        shared
            .video_frames_received
            .store(frames, Ordering::Relaxed);
        if frames == 1 || keyframe || frames % 120 == 0 {
            crate::nano_log!(
                "video access unit frames={} bytes={} ptsUs={} keyframe={}",
                frames,
                frame_buffer.len(),
                pts_us,
                keyframe
            );
        }
        video_sink.push_h264_access_unit(frame_buffer.as_ref(), pts_us, keyframe);
        frame_buffer.clear();
    }
    crate::nano_warn!("video track reader stopped frames={frames}");
}

async fn request_video_keyframe_throttled(
    control_channel: Option<&Arc<RTCDataChannel>>,
    last_request: &mut Option<Instant>,
    reason: &str,
) {
    let now = Instant::now();
    if last_request
        .map(|last| now.duration_since(last) < VIDEO_KEYFRAME_REQUEST_MIN_INTERVAL)
        .unwrap_or(false)
    {
        return;
    }
    *last_request = Some(now);

    let Some(channel) = control_channel else {
        crate::nano_warn!("video keyframe request skipped reason={reason} controlChannel=false");
        return;
    };
    let message = ControlMessage::video_keyframe_requested(false).to_json();
    match channel.send_text(message).await {
        Ok(bytes) => crate::nano_log!("video keyframe requested reason={reason} bytes={bytes}"),
        Err(error) => crate::nano_warn!("video keyframe request failed reason={reason}: {error}"),
    }
}

fn rtp_timestamp_to_us(timestamp: u32, base_timestamp: u32, clock_rate: u32) -> i64 {
    let delta = timestamp.wrapping_sub(base_timestamp) as u64;
    ((delta * 1_000_000u64) / u64::from(clock_rate.max(1))) as i64
}

fn contains_idr_nalu(data: &[u8]) -> bool {
    let mut index = 0usize;
    while index + 5 <= data.len() {
        if data[index..].starts_with(&[0, 0, 0, 1]) {
            let nal_index = index + 4;
            if nal_index < data.len() && (data[nal_index] & 0x1f) == 5 {
                return true;
            }
            index = nal_index + 1;
        } else {
            index += 1;
        }
    }
    false
}
