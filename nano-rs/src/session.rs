use crate::error::NanoError;
use crate::protocol::{
    HttpRequestSpec, IceCandidate, IceCandidateInput, IceExchangeBody, SdpExchangeResponse,
    SdpOfferBody, SessionBlueprint, SessionConfiguration, SessionEndpoints, SessionPlayResponse,
    StreamRequest,
};
use crate::stats::StreamStats;
use crate::transport::{SignalingStep, SignalingTranscript};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaTrackKind {
    Video,
    Audio,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Idle,
    Preparing,
    PlayRequested,
    WaitingForState,
    LocalOfferReady,
    LocalOfferPublished,
    RemoteAnswerReady,
    Connected,
    Closing,
    Closed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionEvent {
    Started,
    PlayPrepared,
    PlayResponseRecorded,
    ConfigurationRecorded,
    LocalOfferRecorded,
    RemoteAnswerRecorded,
    CandidateRecorded,
    TrackObserved,
    Connected,
    Closed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionSnapshot {
    pub state: SessionState,
    pub stats: StreamStats,
    pub local_description_set: bool,
    pub remote_description_set: bool,
    pub remote_candidate_count: usize,
    pub observed_tracks: Vec<MediaTrackKind>,
    pub remote_session_id: Option<String>,
    pub configuration: Option<SessionConfiguration>,
}

#[derive(Debug, Clone)]
pub struct NanoWebRtcSession {
    blueprint: SessionBlueprint,
    transcript: SignalingTranscript,
    state: SessionState,
    stats: StreamStats,
    events: Vec<SessionEvent>,
    observed_tracks: Vec<MediaTrackKind>,
    remote_session_id: Option<String>,
    configuration: Option<SessionConfiguration>,
}

impl NanoWebRtcSession {
    pub fn from_blueprint(blueprint: SessionBlueprint) -> Result<Self, NanoError> {
        if blueprint.session_id.trim().is_empty() {
            return Err(NanoError::InvalidSessionId);
        }

        Ok(Self {
            transcript: SignalingTranscript::new(&blueprint.session_id),
            blueprint,
            state: SessionState::Idle,
            stats: StreamStats::default(),
            events: Vec::new(),
            observed_tracks: Vec::new(),
            remote_session_id: None,
            configuration: None,
        })
    }

    pub fn from_request(
        auth: &crate::auth::AuthBundle,
        request: StreamRequest,
    ) -> Result<Self, NanoError> {
        Self::from_blueprint(SessionBlueprint::from_request(auth, request)?)
    }

    pub fn start(&mut self) {
        self.state = SessionState::Preparing;
        self.events.push(SessionEvent::Started);
        self.transcript.mark_ready_to_connect();
    }

    pub fn play_request(&mut self) -> HttpRequestSpec {
        self.state = SessionState::PlayRequested;
        let request = self.blueprint.play_request();
        self.transcript
            .record_play_request(self.blueprint.play_body().to_json());
        self.events.push(SessionEvent::PlayPrepared);
        request
    }

    pub fn record_play_response(&mut self, session_id: impl Into<String>) {
        self.remote_session_id = Some(session_id.into());
        self.events.push(SessionEvent::PlayResponseRecorded);
    }

    pub fn record_play_response_body(
        &mut self,
        response: SessionPlayResponse,
    ) -> Result<(), NanoError> {
        let session_id = response
            .into_session_id()
            .ok_or(NanoError::MissingRemoteSessionId)?;
        self.record_play_response(session_id);
        Ok(())
    }

    pub fn record_local_offer(&mut self, sdp: impl Into<String>) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        let sdp = sdp.into();
        if sdp.trim().is_empty() {
            return Err(NanoError::InvalidSdp("local offer is empty"));
        }

        self.transcript.record_local_offer(sdp);
        self.state = SessionState::LocalOfferReady;
        self.events.push(SessionEvent::LocalOfferRecorded);
        Ok(())
    }

    pub fn publish_local_offer(&mut self) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        if self.transcript.local_offer.is_none() {
            return Err(NanoError::InvalidState(
                "local offer must be recorded first",
            ));
        }

        self.transcript.step = SignalingStep::LocalOfferPublished;
        self.state = SessionState::LocalOfferPublished;
        Ok(())
    }

    pub fn record_configuration(&mut self, configuration: SessionConfiguration) {
        self.transcript
            .record_configuration(configuration.to_json());
        self.configuration = Some(configuration);
        self.state = SessionState::WaitingForState;
        self.events.push(SessionEvent::ConfigurationRecorded);
    }

    pub fn set_remote_session_id(&mut self, session_id: impl Into<String>) {
        self.remote_session_id = Some(session_id.into());
    }

    pub fn remote_session_id(&self) -> Option<&str> {
        self.remote_session_id.as_deref()
    }

    pub fn configuration(&self) -> Option<&SessionConfiguration> {
        self.configuration.as_ref()
    }

    pub fn endpoints(&self) -> Result<SessionEndpoints, NanoError> {
        let remote_session_id = self
            .remote_session_id
            .as_ref()
            .ok_or(NanoError::MissingRemoteSessionId)?;
        Ok(self.blueprint.endpoints(remote_session_id.clone()))
    }

    pub fn build_state_request(&self) -> Result<HttpRequestSpec, NanoError> {
        Ok(self.endpoints()?.state_request(&self.blueprint.gs_token))
    }

    pub fn build_configuration_request(&self) -> Result<HttpRequestSpec, NanoError> {
        Ok(self
            .endpoints()?
            .configuration_request(&self.blueprint.gs_token))
    }

    pub fn build_primary_sdp_offer_request(
        &mut self,
        offer_sdp: impl Into<String>,
    ) -> Result<HttpRequestSpec, NanoError> {
        let offer = SdpOfferBody::primary(offer_sdp.into());
        self.record_local_offer(offer.sdp.clone())?;
        Ok(self
            .endpoints()?
            .sdp_post_request(&self.blueprint.gs_token, offer))
    }

    pub fn build_chat_sdp_offer_request(
        &mut self,
        offer_sdp: impl Into<String>,
    ) -> Result<HttpRequestSpec, NanoError> {
        let offer = SdpOfferBody::chat_renegotiation(offer_sdp.into());
        self.transcript.publish_local_offer(&offer);
        self.state = SessionState::LocalOfferPublished;
        Ok(self
            .endpoints()?
            .sdp_post_request(&self.blueprint.gs_token, offer))
    }

    pub fn build_sdp_poll_request(&self) -> Result<HttpRequestSpec, NanoError> {
        Ok(self.endpoints()?.sdp_poll_request(&self.blueprint.gs_token))
    }

    pub fn record_sdp_answer_response(
        &mut self,
        response: SdpExchangeResponse,
    ) -> Result<(), NanoError> {
        self.record_remote_answer(response.sdp)
    }

    pub fn record_remote_answer(&mut self, sdp: impl Into<String>) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        let sdp = sdp.into();
        if sdp.trim().is_empty() {
            return Err(NanoError::InvalidSdp("remote answer is empty"));
        }

        self.transcript.record_remote_answer(sdp);
        self.state = SessionState::RemoteAnswerReady;
        self.events.push(SessionEvent::RemoteAnswerRecorded);
        Ok(())
    }

    pub fn build_ice_post_request(
        &mut self,
        candidates: impl IntoIterator<Item = IceCandidate>,
    ) -> Result<HttpRequestSpec, NanoError> {
        let body = IceExchangeBody::from_local_candidates(candidates);
        for candidate in &body.candidates {
            self.transcript.record_local_candidate(candidate.clone());
        }
        Ok(self
            .endpoints()?
            .ice_post_request(&self.blueprint.gs_token, body))
    }

    pub fn build_ice_poll_request(&self) -> Result<HttpRequestSpec, NanoError> {
        Ok(self.endpoints()?.ice_poll_request(&self.blueprint.gs_token))
    }

    pub fn build_connect_request(
        &mut self,
        user_token: impl Into<String>,
    ) -> Result<HttpRequestSpec, NanoError> {
        let token = user_token.into();
        self.transcript.record_connect_token(token.clone());
        Ok(self
            .endpoints()?
            .connect_request(&self.blueprint.gs_token, &token))
    }

    pub fn build_connect_request_from_web_token(&mut self) -> Result<HttpRequestSpec, NanoError> {
        let token = self
            .blueprint
            .web_token()
            .ok_or(NanoError::MissingWebToken)?;
        self.build_connect_request(token.to_owned())
    }

    pub fn build_keepalive_request(&mut self) -> Result<HttpRequestSpec, NanoError> {
        let request = self
            .endpoints()?
            .keepalive_request(&self.blueprint.gs_token);
        self.transcript.record_keepalive("{}".to_owned());
        Ok(request)
    }

    pub fn build_stop_request(&self) -> Result<HttpRequestSpec, NanoError> {
        Ok(self.endpoints()?.stop_request(&self.blueprint.gs_token))
    }

    pub fn connect(&mut self) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        if self.transcript.local_offer.is_none() {
            return Err(NanoError::InvalidState(
                "local offer must be recorded first",
            ));
        }
        if self.transcript.remote_answer.is_none() {
            return Err(NanoError::InvalidState(
                "remote answer must be recorded first",
            ));
        }

        self.transcript.mark_connected();
        self.state = SessionState::Connected;
        self.events.push(SessionEvent::Connected);
        Ok(())
    }

    pub fn close(&mut self) {
        self.state = SessionState::Closing;
        self.transcript.mark_closing();
        self.transcript.mark_closed();
        self.state = SessionState::Closed;
        self.events.push(SessionEvent::Closed);
    }

    pub fn mark_failed(&mut self) {
        self.state = SessionState::Failed;
    }

    pub fn update_rtt(&mut self, value_ms: f64) {
        self.stats.update_rtt(value_ms);
    }

    pub fn update_jitter(&mut self, value_ms: f64) {
        self.stats.update_jitter(value_ms);
    }

    pub fn update_bitrate(&mut self, value_bps: u64) {
        self.stats.update_bitrate(value_bps);
    }

    pub fn update_packet_loss(&mut self, value_pct: f64) {
        self.stats.update_packet_loss(value_pct);
    }

    pub fn update_decode_time(&mut self, value_ms: f64) {
        self.stats.update_decode_time(value_ms);
    }

    pub fn update_fps(&mut self, value_fps: f64) {
        self.stats.update_fps(value_fps);
    }

    pub fn update_audio_level(&mut self, value: f64) {
        self.stats.update_audio_level(value);
    }

    pub fn record_frame_drop(&mut self) {
        self.stats.record_frame_drop();
    }

    pub fn record_observed_track(&mut self, kind: MediaTrackKind) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        self.observed_tracks.push(kind);
        self.events.push(SessionEvent::TrackObserved);
        Ok(())
    }

    pub fn record_remote_candidate(
        &mut self,
        candidate: impl Into<IceCandidateInput>,
    ) -> Result<(), NanoError> {
        self.ensure_not_closed()?;
        self.transcript
            .record_remote_candidate(candidate.into().into_candidate());
        self.events.push(SessionEvent::CandidateRecorded);
        Ok(())
    }

    pub fn snapshot(&self) -> SessionSnapshot {
        SessionSnapshot {
            state: self.state,
            stats: self.stats.clone(),
            local_description_set: self.transcript.local_offer.is_some(),
            remote_description_set: self.transcript.remote_answer.is_some(),
            remote_candidate_count: self.transcript.remote_candidates.len(),
            observed_tracks: self.observed_tracks.clone(),
            remote_session_id: self.remote_session_id.clone(),
            configuration: self.configuration.clone(),
        }
    }

    pub fn blueprint(&self) -> &SessionBlueprint {
        &self.blueprint
    }

    pub fn transcript(&self) -> &SignalingTranscript {
        &self.transcript
    }

    pub fn events(&self) -> &[SessionEvent] {
        &self.events
    }

    fn ensure_not_closed(&self) -> Result<(), NanoError> {
        if matches!(self.state, SessionState::Closed | SessionState::Failed) {
            return Err(NanoError::InvalidState("session is closed"));
        }
        Ok(())
    }
}
