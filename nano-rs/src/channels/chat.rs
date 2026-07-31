use super::{ChannelKind, ChannelSpec};
use crate::protocol::{field, json_bool, json_object};

pub const CHAT_CHANNEL: ChannelSpec = ChannelSpec {
    kind: ChannelKind::Chat,
    name: "chat",
    ordered: false,
    protocol: "chatV1",
};

pub fn spec() -> ChannelSpec {
    CHAT_CHANNEL
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatRenegotiation {
    pub is_media_streams_chat_renegotiation: bool,
}

impl ChatRenegotiation {
    pub fn enabled() -> Self {
        Self {
            is_media_streams_chat_renegotiation: true,
        }
    }

    pub fn to_json(&self) -> String {
        json_object(vec![field(
            "isMediaStreamsChatRenegotiation",
            json_bool(self.is_media_streams_chat_renegotiation),
        )])
    }
}
