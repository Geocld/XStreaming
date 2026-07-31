use crate::protocol::{IceCandidate, SdpOfferBody};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignalingStep {
    Idle,
    PlayRequested,
    WaitingForState,
    ReadyToConnect,
    LocalOfferPrepared,
    LocalOfferPublished,
    RemoteAnswerReceived,
    RemoteIceReceived,
    Connected,
    Closing,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignalingTranscript {
    pub session_id: String,
    pub step: SignalingStep,
    pub play_request_json: Option<String>,
    pub configuration_json: Option<String>,
    pub local_offer: Option<String>,
    pub remote_answer: Option<String>,
    pub local_candidates: Vec<IceCandidate>,
    pub remote_candidates: Vec<IceCandidate>,
    pub last_keepalive_json: Option<String>,
    pub connect_user_token: Option<String>,
}

impl SignalingTranscript {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
            step: SignalingStep::Idle,
            play_request_json: None,
            configuration_json: None,
            local_offer: None,
            remote_answer: None,
            local_candidates: Vec::new(),
            remote_candidates: Vec::new(),
            last_keepalive_json: None,
            connect_user_token: None,
        }
    }

    pub fn record_play_request(&mut self, body_json: impl Into<String>) {
        self.play_request_json = Some(body_json.into());
        self.step = SignalingStep::PlayRequested;
    }

    pub fn record_configuration(&mut self, body_json: impl Into<String>) {
        self.configuration_json = Some(body_json.into());
        self.step = SignalingStep::WaitingForState;
    }

    pub fn record_local_offer(&mut self, offer: impl Into<String>) {
        self.local_offer = Some(offer.into());
        self.step = SignalingStep::LocalOfferPrepared;
    }

    pub fn publish_local_offer(&mut self, offer: &SdpOfferBody) {
        self.local_offer = Some(offer.sdp.clone());
        self.step = SignalingStep::LocalOfferPublished;
    }

    pub fn record_remote_answer(&mut self, answer: impl Into<String>) {
        self.remote_answer = Some(answer.into());
        self.step = SignalingStep::RemoteAnswerReceived;
    }

    pub fn record_local_candidate(&mut self, candidate: IceCandidate) {
        self.local_candidates.push(candidate);
    }

    pub fn record_remote_candidate(&mut self, candidate: IceCandidate) {
        self.remote_candidates.push(candidate);
        self.step = SignalingStep::RemoteIceReceived;
    }

    pub fn record_keepalive(&mut self, body_json: impl Into<String>) {
        self.last_keepalive_json = Some(body_json.into());
    }

    pub fn record_connect_token(&mut self, user_token: impl Into<String>) {
        self.connect_user_token = Some(user_token.into());
    }

    pub fn mark_ready_to_connect(&mut self) {
        self.step = SignalingStep::ReadyToConnect;
    }

    pub fn mark_connected(&mut self) {
        self.step = SignalingStep::Connected;
    }

    pub fn mark_closing(&mut self) {
        self.step = SignalingStep::Closing;
    }

    pub fn mark_closed(&mut self) {
        self.step = SignalingStep::Closed;
    }
}
