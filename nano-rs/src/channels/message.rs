use super::{ChannelKind, ChannelSpec};
use crate::protocol::{field, json_array, json_object, json_string};

pub const MESSAGE_CHANNEL: ChannelSpec = ChannelSpec {
    kind: ChannelKind::Message,
    name: "message",
    ordered: false,
    protocol: "messageV1",
};

pub fn spec() -> ChannelSpec {
    MESSAGE_CHANNEL
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageHandshake {
    pub version: String,
    pub id: String,
    pub cv: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageEnvelope {
    pub envelope_type: MessageEnvelopeType,
    pub id: String,
    pub target: Option<String>,
    pub content: String,
    pub cv: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageEnvelopeType {
    Handshake,
    HandshakeAck,
    Message,
    TransactionStart,
    TransactionComplete,
    ReceiverCancel,
    SenderCancel,
    Unhandled,
    Error,
}

impl MessageHandshake {
    pub fn to_json(&self) -> String {
        json_object(vec![
            field("type", json_string("Handshake")),
            field("version", json_string(&self.version)),
            field("id", json_string(&self.id)),
            field("cv", json_string(&self.cv)),
        ])
    }
}

impl MessageEnvelope {
    pub fn handshake_ack(
        version: impl Into<String>,
        id: impl Into<String>,
        cv: impl Into<String>,
    ) -> Self {
        let version = version.into();
        Self {
            envelope_type: MessageEnvelopeType::HandshakeAck,
            id: id.into(),
            target: None,
            content: json_object(vec![field("version", json_string(&version))]),
            cv: cv.into(),
        }
    }

    pub fn message(
        target: impl Into<String>,
        content: impl Into<String>,
        id: impl Into<String>,
        cv: impl Into<String>,
    ) -> Self {
        Self {
            envelope_type: MessageEnvelopeType::Message,
            id: id.into(),
            target: Some(target.into()),
            content: content.into(),
            cv: cv.into(),
        }
    }

    pub fn transaction_start(
        target: impl Into<String>,
        content: impl Into<String>,
        id: impl Into<String>,
        cv: impl Into<String>,
    ) -> Self {
        Self {
            envelope_type: MessageEnvelopeType::TransactionStart,
            id: id.into(),
            target: Some(target.into()),
            content: content.into(),
            cv: cv.into(),
        }
    }

    pub fn to_json(&self) -> String {
        let type_name = match self.envelope_type {
            MessageEnvelopeType::Handshake => "Handshake",
            MessageEnvelopeType::HandshakeAck => "HandshakeAck",
            MessageEnvelopeType::Message => "Message",
            MessageEnvelopeType::TransactionStart => "TransactionStart",
            MessageEnvelopeType::TransactionComplete => "TransactionComplete",
            MessageEnvelopeType::ReceiverCancel => "ReceiverCancel",
            MessageEnvelopeType::SenderCancel => "SenderCancel",
            MessageEnvelopeType::Unhandled => "Unhandled",
            MessageEnvelopeType::Error => "Error",
        };

        let mut fields = vec![
            field("type", json_string(type_name)),
            field("id", json_string(&self.id)),
            field("content", self.content.clone()),
            field("cv", json_string(&self.cv)),
        ];
        if let Some(target) = &self.target {
            fields.insert(3, field("target", json_string(target)));
        }
        json_object(fields)
    }
}

pub fn default_supported_system_uis() -> Vec<i32> {
    vec![10, 19, 31, 27, 32, -44, 40, 41, -43]
}

pub fn initial_system_ui_messages(max_touchpoints: u32) -> Vec<MessageEnvelope> {
    let mut messages = Vec::new();
    messages.push(MessageEnvelope::message(
        "/streaming/systemUi/configuration",
        json_object(vec![
            field(
                "version",
                json_array(vec!["0".into(), "2".into(), "0".into()]),
            ),
            field(
                "systemUis",
                json_array(
                    default_supported_system_uis()
                        .into_iter()
                        .map(|item| item.to_string())
                        .collect(),
                ),
            ),
        ]),
        "1",
        "1",
    ));
    messages.push(MessageEnvelope::message(
        "/streaming/properties/clientappinstallidchanged",
        json_object(vec![field(
            "clientAppInstallId",
            json_string("00000000-0000-0000-0000-000000000000"),
        )]),
        "2",
        "2",
    ));
    messages.push(MessageEnvelope::message(
        "/streaming/characteristics/orientationchanged",
        json_object(vec![field("orientation", "0".to_owned())]),
        "3",
        "3",
    ));
    messages.push(MessageEnvelope::message(
        "/streaming/characteristics/touchinputenabledchanged",
        json_object(vec![field(
            "touchInputEnabled",
            (max_touchpoints > 0).to_string(),
        )]),
        "4",
        "4",
    ));
    messages.push(MessageEnvelope::message(
        "/streaming/characteristics/clientdevicecapabilities",
        "{}".to_owned(),
        "5",
        "5",
    ));
    messages.push(MessageEnvelope::message(
        "/streaming/characteristics/dimensionschanged",
        json_object(vec![
            field("horizontal", "1920".to_owned()),
            field("vertical", "1080".to_owned()),
            field("preferredWidth", "1920".to_owned()),
            field("preferredHeight", "1080".to_owned()),
            field("safeAreaLeft", "0".to_owned()),
            field("safeAreaTop", "0".to_owned()),
            field("safeAreaRight", "1920".to_owned()),
            field("safeAreaBottom", "1080".to_owned()),
            field("supportsCustomResolution", "true".to_owned()),
        ]),
        "6",
        "6",
    ));
    messages
}
