use super::{ChannelKind, ChannelSpec};
use crate::protocol::{field, json_object, json_string};

pub const CONTROL_CHANNEL: ChannelSpec = ChannelSpec {
    kind: ChannelKind::Control,
    name: "control",
    ordered: false,
    protocol: "controlV1",
};

pub fn spec() -> ChannelSpec {
    CONTROL_CHANNEL
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlMessage {
    AuthorizationRequest { access_key: String },
    VideoKeyframeRequested { ifr_requested: bool },
    GamepadChanged { gamepad_index: u32, was_added: bool },
}

impl ControlMessage {
    pub fn authorization_request(access_key: impl Into<String>) -> Self {
        Self::AuthorizationRequest {
            access_key: access_key.into(),
        }
    }

    pub fn video_keyframe_requested(ifr_requested: bool) -> Self {
        Self::VideoKeyframeRequested { ifr_requested }
    }

    pub fn gamepad_changed(gamepad_index: u32, was_added: bool) -> Self {
        Self::GamepadChanged {
            gamepad_index,
            was_added,
        }
    }

    pub fn to_json(&self) -> String {
        match self {
            ControlMessage::AuthorizationRequest { access_key } => json_object(vec![
                field("message", json_string("authorizationRequest")),
                field("accessKey", json_string(access_key)),
            ]),
            ControlMessage::VideoKeyframeRequested { ifr_requested } => json_object(vec![
                field("message", json_string("videoKeyframeRequested")),
                field("ifrRequested", ifr_requested.to_string()),
            ]),
            ControlMessage::GamepadChanged {
                gamepad_index,
                was_added,
            } => json_object(vec![
                field("message", json_string("gamepadChanged")),
                field("gamepadIndex", gamepad_index.to_string()),
                field("wasAdded", was_added.to_string()),
            ]),
        }
    }
}
