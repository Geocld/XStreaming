use core::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NanoError {
    MissingStreamingToken,
    MissingTokenForPlatform,
    MissingWebToken,
    MissingRemoteSessionId,
    InvalidBaseUri,
    InvalidState(&'static str),
    InvalidSessionId,
    InvalidSdp(&'static str),
    InvalidCandidate(&'static str),
    PeerConnection(&'static str),
    Signaling(&'static str),
    PeerConnectionOwned(String),
    SignalingOwned(String),
    Json(String),
    RuntimeMessage(String),
}

impl fmt::Display for NanoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NanoError::MissingStreamingToken => f.write_str("missing streaming token"),
            NanoError::MissingTokenForPlatform => f.write_str("missing token for platform"),
            NanoError::MissingWebToken => f.write_str("missing web token"),
            NanoError::MissingRemoteSessionId => f.write_str("missing remote session id"),
            NanoError::InvalidBaseUri => f.write_str("invalid base uri"),
            NanoError::InvalidState(msg) => f.write_str(msg),
            NanoError::InvalidSessionId => f.write_str("invalid session id"),
            NanoError::InvalidSdp(msg) => f.write_str(msg),
            NanoError::InvalidCandidate(msg) => f.write_str(msg),
            NanoError::PeerConnection(msg) => f.write_str(msg),
            NanoError::Signaling(msg) => f.write_str(msg),
            NanoError::PeerConnectionOwned(msg) => f.write_str(msg),
            NanoError::SignalingOwned(msg) => f.write_str(msg),
            NanoError::Json(msg) => f.write_str(msg),
            NanoError::RuntimeMessage(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for NanoError {}
