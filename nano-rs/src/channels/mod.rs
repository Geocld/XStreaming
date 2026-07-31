mod chat;
mod control;
mod input;
mod message;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelKind {
    Input,
    Chat,
    Control,
    Message,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChannelSpec {
    pub kind: ChannelKind,
    pub name: &'static str,
    pub ordered: bool,
    pub protocol: &'static str,
}

pub fn default_channels() -> [ChannelSpec; 4] {
    [
        input::spec(),
        chat::spec(),
        control::spec(),
        message::spec(),
    ]
}

pub fn default_channel_vec() -> Vec<ChannelSpec> {
    default_channels().to_vec()
}

pub use chat::{spec as chat_spec, ChatRenegotiation, CHAT_CHANNEL};
pub use control::{spec as control_spec, ControlMessage, CONTROL_CHANNEL};
pub use input::{
    parse_server_message as parse_input_server_message, spec as input_spec,
    GamepadInputPhysicality, InputFrame, InputPacket, InputServerMessage, MetadataFrame,
    PointerFrame, PointerType, PointerWireData, ReportType, RumbleData, INPUT_CHANNEL,
};
pub use message::{
    default_supported_system_uis, initial_system_ui_messages, spec as message_spec,
    MessageEnvelope, MessageEnvelopeType, MessageHandshake, MESSAGE_CHANNEL,
};
