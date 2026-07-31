use crate::error::NanoError;
use crate::protocol::{
    HttpRequestSpec, IceCandidate, PeerConnectionPlan, SdpExchangeResponse, SessionConfiguration,
    SessionPlayResponse,
};
use crate::session::{NanoWebRtcSession, SessionSnapshot};

pub trait NanoPeerConnection {
    fn prepare(&mut self, plan: &PeerConnectionPlan) -> Result<(), NanoError>;
    fn create_offer(&mut self) -> Result<String, NanoError>;
    fn set_remote_answer(&mut self, sdp: &str) -> Result<(), NanoError>;
    fn drain_local_candidates(&mut self) -> Result<Vec<IceCandidate>, NanoError>;
    fn add_remote_candidate(&mut self, candidate: &IceCandidate) -> Result<(), NanoError>;
    fn close(&mut self) -> Result<(), NanoError>;
}

pub trait NanoSignalingClient {
    fn play(&mut self, request: HttpRequestSpec) -> Result<SessionPlayResponse, NanoError>;
    fn configuration(
        &mut self,
        request: HttpRequestSpec,
    ) -> Result<SessionConfiguration, NanoError>;
    fn post_sdp_offer(&mut self, request: HttpRequestSpec) -> Result<(), NanoError>;
    fn poll_sdp_answer(
        &mut self,
        request: HttpRequestSpec,
    ) -> Result<SdpExchangeResponse, NanoError>;
    fn post_ice_candidates(&mut self, request: HttpRequestSpec) -> Result<(), NanoError>;
    fn poll_ice_candidates(
        &mut self,
        request: HttpRequestSpec,
    ) -> Result<Vec<IceCandidate>, NanoError>;
    fn connect(&mut self, request: HttpRequestSpec) -> Result<(), NanoError>;
    fn keepalive(&mut self, request: HttpRequestSpec) -> Result<(), NanoError>;
    fn stop(&mut self, request: HttpRequestSpec) -> Result<(), NanoError>;
}

#[derive(Debug)]
pub struct NanoConnection<P, S> {
    session: NanoWebRtcSession,
    peer: P,
    signaling: S,
}

impl<P, S> NanoConnection<P, S>
where
    P: NanoPeerConnection,
    S: NanoSignalingClient,
{
    pub fn new(session: NanoWebRtcSession, peer: P, signaling: S) -> Self {
        Self {
            session,
            peer,
            signaling,
        }
    }

    pub fn start(&mut self) -> Result<SessionSnapshot, NanoError> {
        self.session.start();
        self.peer.prepare(&self.session.blueprint().peer)?;

        let play_response = self.signaling.play(self.session.play_request())?;
        self.session.record_play_response_body(play_response)?;

        let configuration = self
            .signaling
            .configuration(self.session.build_configuration_request()?)?;
        self.session.record_configuration(configuration);

        let offer_sdp = self.peer.create_offer()?;
        let sdp_post = self.session.build_primary_sdp_offer_request(offer_sdp)?;
        self.signaling.post_sdp_offer(sdp_post)?;
        self.session.publish_local_offer()?;

        let answer = self
            .signaling
            .poll_sdp_answer(self.session.build_sdp_poll_request()?)?;
        self.peer.set_remote_answer(&answer.sdp)?;
        self.session.record_sdp_answer_response(answer)?;

        let local_candidates = self.peer.drain_local_candidates()?;
        self.signaling
            .post_ice_candidates(self.session.build_ice_post_request(local_candidates)?)?;

        let remote_candidates = self
            .signaling
            .poll_ice_candidates(self.session.build_ice_poll_request()?)?;
        for candidate in remote_candidates {
            self.peer.add_remote_candidate(&candidate)?;
            self.session.record_remote_candidate(candidate)?;
        }

        let connect = self.session.build_connect_request_from_web_token()?;
        self.signaling.connect(connect)?;
        self.session.connect()?;

        Ok(self.session.snapshot())
    }

    pub fn keepalive(&mut self) -> Result<(), NanoError> {
        let request = self.session.build_keepalive_request()?;
        self.signaling.keepalive(request)
    }

    pub fn stop(&mut self) -> Result<(), NanoError> {
        let stop_result = self.signaling.stop(self.session.build_stop_request()?);
        let close_result = self.peer.close();
        self.session.close();
        stop_result?;
        close_result
    }

    pub fn session(&self) -> &NanoWebRtcSession {
        &self.session
    }

    pub fn session_mut(&mut self) -> &mut NanoWebRtcSession {
        &mut self.session
    }

    pub fn into_parts(self) -> (NanoWebRtcSession, P, S) {
        (self.session, self.peer, self.signaling)
    }
}
