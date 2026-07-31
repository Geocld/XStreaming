use core::fmt;

use crate::auth::{AuthBundle, Platform};
use crate::channels::{default_channel_vec, ChannelSpec};
use crate::error::NanoError;
use serde_json::Value;

pub const NANO_VERSION: &str = "V3;WebrtcTransport.dll";
pub const CLIENT_APP_ID: &str = "www.xbox.com";
pub const CLIENT_APP_TYPE: &str = "browser";
pub const CLIENT_APP_VERSION: &str = "29.9.35";
pub const CLIENT_SDK_VERSION: &str = "10.6.8";
pub const HTTP_ENVIRONMENT: &str = "prod";
pub const DEFAULT_TIMEZONE_OFFSET_MINUTES: i32 = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodecProfile {
    Auto,
    H264High,
    H264Medium,
    H264Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoProfile {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub codec: CodecProfile,
    pub max_operating_rate: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransceiverDirection {
    SendRecv,
    SendOnly,
    RecvOnly,
    Inactive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransceiverSpec {
    pub kind: &'static str,
    pub direction: TransceiverDirection,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IceServer {
    pub urls: String,
    pub username: Option<String>,
    pub credential: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerConnectionPlan {
    pub transceivers: Vec<TransceiverSpec>,
    pub channels: Vec<ChannelSpec>,
    pub ice_servers: Vec<IceServer>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamRequest {
    pub platform: Platform,
    /// Cloud uses this as `titleId`; Home uses this as `serverId`.
    pub session_id: String,
    pub title_id: Option<String>,
    pub console_id: Option<String>,
    pub base_uri: String,
    pub video: VideoProfile,
    pub preferred_language: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionBlueprint {
    pub platform: Platform,
    /// The user-selected title id or console id passed from RN.
    pub session_id: String,
    pub title_id: Option<String>,
    pub console_id: Option<String>,
    pub base_uri: String,
    pub gs_token: String,
    pub web_token: Option<String>,
    pub video: VideoProfile,
    pub preferred_language: String,
    pub peer: PeerConnectionPlan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequestSpec {
    pub method: HttpMethod,
    pub url: String,
    pub authorization: Option<String>,
    pub accept: Option<&'static str>,
    pub content_type: Option<&'static str>,
    pub x_ms_device_info: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionPlayBody {
    pub client_session_id: String,
    pub title_id: String,
    pub server_id: String,
    pub system_update_group: String,
    pub settings: SessionPlaySettings,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionPlaySettings {
    pub nano_version: String,
    pub enable_text_to_speech: bool,
    pub high_contrast: u8,
    pub locale: String,
    pub use_ice_connection: bool,
    pub timezone_offset_minutes: i32,
    pub sdk_type: String,
    pub os_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceInfo {
    pub client_app_version: String,
    pub client_sdk_version: String,
    pub os_name: String,
    pub os_version: String,
    pub display_width: u32,
    pub display_height: u32,
    pub browser_name: String,
    pub browser_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionEndpoints {
    pub base_uri: String,
    pub platform: Platform,
    pub remote_session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionConfiguration {
    pub keep_alive_pulse_in_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionStateResponse {
    pub state: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionPlayResponse {
    pub session_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SdpOfferKind {
    Primary,
    ChatRenegotiation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SdpOfferBody {
    pub kind: SdpOfferKind,
    pub sdp: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SdpExchangeResponse {
    pub sdp: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IceCandidate {
    pub candidate: String,
    pub sdp_mid: String,
    pub sdp_mline_index: String,
    pub message_type: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IceCandidateInput {
    Raw(String),
    Structured(IceCandidate),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IceExchangeBody {
    pub candidates: Vec<IceCandidate>,
}

impl Platform {
    pub fn route_name(self) -> &'static str {
        match self {
            Platform::Home => "home",
            Platform::Cloud => "cloud",
        }
    }
}

impl SessionBlueprint {
    pub fn from_request(auth: &AuthBundle, request: StreamRequest) -> Result<Self, NanoError> {
        let token = auth.selected_streaming_token(request.platform)?;
        let base_uri = if request.base_uri.trim().is_empty() {
            token.base_uri.clone()
        } else {
            request.base_uri
        };

        if base_uri.trim().is_empty() {
            return Err(NanoError::InvalidBaseUri);
        }

        Ok(Self {
            platform: request.platform,
            session_id: request.session_id,
            title_id: request.title_id,
            console_id: request.console_id,
            base_uri,
            gs_token: token.gs_token.clone(),
            web_token: auth.web.as_ref().map(|value| value.raw.clone()),
            video: request.video,
            preferred_language: request.preferred_language,
            peer: PeerConnectionPlan::default(),
        })
    }

    pub fn play_body(&self) -> SessionPlayBody {
        SessionPlayBody {
            client_session_id: String::new(),
            title_id: if self.platform == Platform::Cloud {
                self.title_id
                    .clone()
                    .unwrap_or_else(|| self.session_id.clone())
            } else {
                String::new()
            },
            server_id: if self.platform == Platform::Home {
                self.console_id
                    .clone()
                    .unwrap_or_else(|| self.session_id.clone())
            } else {
                String::new()
            },
            system_update_group: String::new(),
            settings: SessionPlaySettings {
                nano_version: NANO_VERSION.to_owned(),
                enable_text_to_speech: false,
                high_contrast: 0,
                locale: if self.preferred_language.trim().is_empty() {
                    "en-US".to_owned()
                } else {
                    self.preferred_language.clone()
                },
                use_ice_connection: false,
                timezone_offset_minutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
                sdk_type: "web".to_owned(),
                os_name: os_name_for_resolution(self.video.height),
            },
        }
    }

    pub fn device_info(&self) -> DeviceInfo {
        DeviceInfo {
            client_app_version: CLIENT_APP_VERSION.to_owned(),
            client_sdk_version: CLIENT_SDK_VERSION.to_owned(),
            os_name: os_name_for_resolution(self.video.height),
            os_version: "22631.2715".to_owned(),
            display_width: 4096,
            display_height: 2160,
            browser_name: "edge".to_owned(),
            browser_version: "140.0.3485.66".to_owned(),
        }
    }

    pub fn play_request(&self) -> HttpRequestSpec {
        HttpRequestSpec::post(
            format!(
                "{}/v5/sessions/{}/play",
                trim_trailing_slash(&self.base_uri),
                self.platform.route_name()
            ),
            Some(format!("Bearer {}", self.gs_token)),
            Some(self.play_body().to_json()),
        )
        .with_device_info(self.device_info().to_json())
    }

    pub fn web_token(&self) -> Option<&str> {
        self.web_token.as_deref()
    }

    pub fn endpoints(&self, remote_session_id: impl Into<String>) -> SessionEndpoints {
        SessionEndpoints {
            base_uri: self.base_uri.clone(),
            platform: self.platform,
            remote_session_id: remote_session_id.into(),
        }
    }
}

impl HttpRequestSpec {
    pub fn get(url: impl Into<String>, authorization: Option<String>) -> Self {
        Self {
            method: HttpMethod::Get,
            url: url.into(),
            authorization,
            accept: None,
            content_type: Some("application/json"),
            x_ms_device_info: None,
            body: None,
        }
    }

    pub fn post(
        url: impl Into<String>,
        authorization: Option<String>,
        body: Option<String>,
    ) -> Self {
        Self {
            method: HttpMethod::Post,
            url: url.into(),
            authorization,
            accept: Some("application/json"),
            content_type: Some("application/json"),
            x_ms_device_info: None,
            body,
        }
    }

    pub fn delete(url: impl Into<String>, authorization: Option<String>) -> Self {
        Self {
            method: HttpMethod::Delete,
            url: url.into(),
            authorization,
            accept: None,
            content_type: Some("application/json"),
            x_ms_device_info: None,
            body: None,
        }
    }

    pub fn with_device_info(mut self, value: String) -> Self {
        self.x_ms_device_info = Some(value);
        self
    }
}

impl SessionEndpoints {
    fn base_path(&self) -> String {
        format!(
            "{}/v5/sessions/{}/{}",
            trim_trailing_slash(&self.base_uri),
            self.platform.route_name(),
            self.remote_session_id
        )
    }

    pub fn state_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::get(format!("{}/state", self.base_path()), bearer(gs_token))
    }

    pub fn configuration_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::get(
            format!("{}/configuration", self.base_path()),
            bearer(gs_token),
        )
    }

    pub fn sdp_post_request(&self, gs_token: &str, body: SdpOfferBody) -> HttpRequestSpec {
        HttpRequestSpec::post(
            format!("{}/sdp", self.base_path()),
            bearer(gs_token),
            Some(body.to_json()),
        )
    }

    pub fn sdp_poll_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::get(format!("{}/sdp", self.base_path()), bearer(gs_token))
    }

    pub fn ice_post_request(&self, gs_token: &str, body: IceExchangeBody) -> HttpRequestSpec {
        HttpRequestSpec::post(
            format!("{}/ice", self.base_path()),
            bearer(gs_token),
            Some(body.to_json()),
        )
    }

    pub fn ice_poll_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::get(format!("{}/ice", self.base_path()), bearer(gs_token))
    }

    pub fn connect_request(&self, gs_token: &str, user_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::post(
            format!("{}/connect", self.base_path()),
            bearer(gs_token),
            Some(json_object(vec![field(
                "userToken",
                json_string(user_token),
            )])),
        )
    }

    pub fn keepalive_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::post(
            format!("{}/keepalive", self.base_path()),
            bearer(gs_token),
            Some("{}".to_owned()),
        )
    }

    pub fn stop_request(&self, gs_token: &str) -> HttpRequestSpec {
        HttpRequestSpec::delete(self.base_path(), bearer(gs_token))
    }
}

impl SessionConfiguration {
    pub fn to_json(&self) -> String {
        json_object(vec![field(
            "keepAlivePulseInSeconds",
            self.keep_alive_pulse_in_seconds.to_string(),
        )])
    }

    pub fn from_keepalive_pulse(value: u32) -> Self {
        Self {
            keep_alive_pulse_in_seconds: value,
        }
    }

    pub fn from_json(value: &str) -> Result<Self, NanoError> {
        let parsed = parse_json(value)?;
        let keep_alive = parsed
            .get("keepAlivePulseInSeconds")
            .and_then(Value::as_u64)
            .unwrap_or(20) as u32;
        Ok(Self::from_keepalive_pulse(keep_alive))
    }
}

impl SessionStateResponse {
    pub fn from_json(value: &str) -> Result<Self, NanoError> {
        let parsed = parse_json(value)?;
        let state = parsed
            .get("state")
            .and_then(Value::as_str)
            .ok_or_else(|| NanoError::Json("missing state".to_owned()))?
            .to_owned();
        let error_message = parsed
            .get("errorDetails")
            .and_then(|details| details.get("message"))
            .and_then(Value::as_str)
            .map(|value| value.to_owned());
        Ok(Self {
            state,
            error_message,
        })
    }
}

impl SessionPlayResponse {
    pub fn session_id(&self) -> Option<&str> {
        self.session_path.split('/').nth(3)
    }

    pub fn into_session_id(self) -> Option<String> {
        self.session_id().map(|value| value.to_owned())
    }

    pub fn from_json(value: &str) -> Result<Self, NanoError> {
        let parsed = parse_json(value)?;
        let session_path = parsed
            .get("sessionPath")
            .and_then(Value::as_str)
            .ok_or_else(|| NanoError::Json("missing sessionPath".to_owned()))?
            .to_owned();
        Ok(Self { session_path })
    }
}

impl SdpExchangeResponse {
    pub fn from_offer_sdp(sdp: impl Into<String>) -> Self {
        Self { sdp: sdp.into() }
    }

    pub fn from_json(value: &str) -> Result<Self, NanoError> {
        let parsed = parse_json(value)?;
        if let Some(exchange_response) = parsed.get("exchangeResponse") {
            if let Some(text) = exchange_response.as_str() {
                if let Ok(inner) = serde_json::from_str::<Value>(text) {
                    if let Some(sdp) = inner.get("sdp").and_then(Value::as_str) {
                        return Ok(Self::from_offer_sdp(sdp.to_owned()));
                    }
                    return Ok(Self::from_offer_sdp(text.to_owned()));
                }
                return Ok(Self::from_offer_sdp(text.to_owned()));
            }
            if let Some(sdp) = exchange_response.get("sdp").and_then(Value::as_str) {
                return Ok(Self::from_offer_sdp(sdp.to_owned()));
            }
        }
        if let Some(sdp) = parsed.get("sdp").and_then(Value::as_str) {
            return Ok(Self::from_offer_sdp(sdp.to_owned()));
        }
        Err(NanoError::Json(
            "missing sdp in exchange response".to_owned(),
        ))
    }
}

impl SessionPlayBody {
    pub fn to_json(&self) -> String {
        json_object(vec![
            field("clientSessionId", json_string(&self.client_session_id)),
            field("titleId", json_string(&self.title_id)),
            field("systemUpdateGroup", json_string(&self.system_update_group)),
            field("settings", self.settings.to_json()),
            field("serverId", json_string(&self.server_id)),
            field("fallbackRegionNames", json_array(Vec::new())),
        ])
    }
}

impl SessionPlaySettings {
    pub fn to_json(&self) -> String {
        json_object(vec![
            field("nanoVersion", json_string(&self.nano_version)),
            field("enableTextToSpeech", json_bool(self.enable_text_to_speech)),
            field("highContrast", self.high_contrast.to_string()),
            field("locale", json_string(&self.locale)),
            field("useIceConnection", json_bool(self.use_ice_connection)),
            field(
                "timezoneOffsetMinutes",
                self.timezone_offset_minutes.to_string(),
            ),
            field("sdkType", json_string(&self.sdk_type)),
            field("osName", json_string(&self.os_name)),
        ])
    }
}

impl DeviceInfo {
    pub fn to_json(&self) -> String {
        json_object(vec![
            field(
                "appInfo",
                json_object(vec![field(
                    "env",
                    json_object(vec![
                        field("clientAppId", json_string(CLIENT_APP_ID)),
                        field("clientAppType", json_string(CLIENT_APP_TYPE)),
                        field("clientAppVersion", json_string(&self.client_app_version)),
                        field("clientSdkVersion", json_string(&self.client_sdk_version)),
                        field("httpEnvironment", json_string(HTTP_ENVIRONMENT)),
                        field("sdkInstallId", json_string("")),
                    ]),
                )]),
            ),
            field(
                "dev",
                json_object(vec![
                    field(
                        "hw",
                        json_object(vec![
                            field("make", json_string("Microsoft")),
                            field("model", json_string("unknown")),
                            field("platformType", json_string("desktop")),
                            field("sdktype", json_string("web")),
                        ]),
                    ),
                    field(
                        "os",
                        json_object(vec![
                            field("name", json_string(&self.os_name)),
                            field("ver", json_string(&self.os_version)),
                            field("platform", json_string("desktop")),
                        ]),
                    ),
                    field(
                        "displayInfo",
                        json_object(vec![
                            field(
                                "dimensions",
                                json_object(vec![
                                    field("widthInPixels", self.display_width.to_string()),
                                    field("heightInPixels", self.display_height.to_string()),
                                ]),
                            ),
                            field(
                                "pixelDensity",
                                json_object(vec![
                                    field("dpiX", "1".to_owned()),
                                    field("dpiY", "1".to_owned()),
                                ]),
                            ),
                        ]),
                    ),
                    field(
                        "browser",
                        json_object(vec![
                            field("browserName", json_string(&self.browser_name)),
                            field("browserVersion", json_string(&self.browser_version)),
                        ]),
                    ),
                ]),
            ),
        ])
    }
}

impl SdpOfferBody {
    pub fn primary(sdp: impl Into<String>) -> Self {
        Self {
            kind: SdpOfferKind::Primary,
            sdp: sdp.into(),
        }
    }

    pub fn chat_renegotiation(sdp: impl Into<String>) -> Self {
        Self {
            kind: SdpOfferKind::ChatRenegotiation,
            sdp: sdp.into(),
        }
    }

    pub fn to_json(&self) -> String {
        let configuration = match self.kind {
            SdpOfferKind::Primary => primary_sdp_configuration_json(),
            SdpOfferKind::ChatRenegotiation => json_object(vec![field(
                "isMediaStreamsChatRenegotiation",
                json_bool(true),
            )]),
        };

        json_object(vec![
            field("messageType", json_string("offer")),
            field("sdp", json_string(&self.sdp)),
            field("configuration", configuration),
        ])
    }
}

impl IceCandidate {
    pub fn new(candidate: impl Into<String>, sdp_mid: impl Into<String>, index: u32) -> Self {
        Self {
            candidate: candidate.into(),
            sdp_mid: sdp_mid.into(),
            sdp_mline_index: index.to_string(),
            message_type: "iceCandidate",
        }
    }

    pub fn end_of_candidates() -> Self {
        Self::new("a=end-of-candidates", "0", 0)
    }

    pub fn is_end_of_candidates(&self) -> bool {
        self.candidate.trim() == "a=end-of-candidates"
    }

    pub fn has_invalid_tcp_type(&self) -> bool {
        self.candidate.contains("UDP") && self.candidate.contains("tcptype")
    }

    pub fn to_json(&self) -> String {
        json_object(vec![
            field("candidate", json_string(&self.candidate)),
            field("messageType", json_string(self.message_type)),
            field("sdpMLineIndex", json_string(&self.sdp_mline_index)),
            field("sdpMid", json_string(&self.sdp_mid)),
        ])
    }
}

impl IceCandidateInput {
    pub fn into_candidate(self) -> IceCandidate {
        match self {
            IceCandidateInput::Raw(candidate) => IceCandidate::new(candidate, "0", 0),
            IceCandidateInput::Structured(candidate) => candidate,
        }
    }
}

impl From<IceCandidate> for IceCandidateInput {
    fn from(value: IceCandidate) -> Self {
        IceCandidateInput::Structured(value)
    }
}

impl From<&str> for IceCandidateInput {
    fn from(value: &str) -> Self {
        IceCandidateInput::Raw(value.to_owned())
    }
}

impl From<String> for IceCandidateInput {
    fn from(value: String) -> Self {
        IceCandidateInput::Raw(value)
    }
}

impl IceExchangeBody {
    pub fn from_local_candidates(candidates: impl IntoIterator<Item = IceCandidate>) -> Self {
        Self {
            candidates: candidates
                .into_iter()
                .filter(|candidate| !candidate.is_end_of_candidates())
                .filter(|candidate| !candidate.has_invalid_tcp_type())
                .collect(),
        }
    }

    pub fn to_json(&self) -> String {
        json_object(vec![
            field("messageType", json_string("iceCandidate")),
            field(
                "candidate",
                json_array(self.candidates.iter().map(IceCandidate::to_json).collect()),
            ),
        ])
    }

    pub fn from_json(value: &str) -> Result<Vec<IceCandidate>, NanoError> {
        let parsed = parse_json(value)?;
        let exchange = parsed
            .get("exchangeResponse")
            .or_else(|| parsed.get("candidate"))
            .ok_or_else(|| NanoError::Json("missing ICE exchangeResponse".to_owned()))?;

        let candidates_value = if let Some(text) = exchange.as_str() {
            serde_json::from_str::<Value>(text).unwrap_or(Value::Null)
        } else {
            exchange.clone()
        };

        let Some(list) = candidates_value.as_array() else {
            return Err(NanoError::Json(
                "ICE exchangeResponse is not an array".to_owned(),
            ));
        };

        let mut candidates = Vec::new();
        for item in list {
            let Some(candidate) = item.get("candidate").and_then(Value::as_str) else {
                continue;
            };
            if candidate.trim() == "a=end-of-candidates" {
                continue;
            }
            if candidate.contains("UDP") && candidate.contains("tcptype") {
                continue;
            }
            let sdp_mid = item
                .get("sdpMid")
                .and_then(Value::as_str)
                .unwrap_or("0")
                .to_owned();
            let index = item
                .get("sdpMLineIndex")
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(0);
            candidates.push(IceCandidate::new(candidate.to_owned(), sdp_mid, index));
        }

        Ok(candidates)
    }
}

impl Default for PeerConnectionPlan {
    fn default() -> Self {
        Self {
            transceivers: vec![
                TransceiverSpec {
                    kind: "video",
                    direction: TransceiverDirection::RecvOnly,
                },
                TransceiverSpec {
                    kind: "audio",
                    direction: TransceiverDirection::SendRecv,
                },
            ],
            channels: default_channel_vec(),
            ice_servers: default_ice_servers(),
        }
    }
}

impl fmt::Display for HttpMethod {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
            HttpMethod::Delete => "DELETE",
        })
    }
}

pub fn default_ice_servers() -> Vec<IceServer> {
    vec![
        IceServer {
            urls: "stun:worldaz.relay.teams.microsoft.com:3478".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:stun.l.google.com:19302".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:stun1.l.google.com:19302".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:relay1.expressturn.com".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:relay2.expressturn.com".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:stun.kinesisvideo.us-east-1.amazonaws.com:443".to_owned(),
            username: None,
            credential: None,
        },
        IceServer {
            urls: "stun:stun.douyucdn.cn:18000".to_owned(),
            username: None,
            credential: None,
        },
    ]
}

pub fn default_stream_request(platform: Platform, session_id: impl Into<String>) -> StreamRequest {
    StreamRequest {
        platform,
        session_id: session_id.into(),
        title_id: None,
        console_id: None,
        base_uri: String::new(),
        video: VideoProfile {
            width: 1920,
            height: 1080,
            fps: 60,
            bitrate_kbps: 20_000,
            codec: CodecProfile::Auto,
            max_operating_rate: 0x7fff,
        },
        preferred_language: "en-US".to_owned(),
    }
}

pub fn os_name_for_resolution(height: u32) -> String {
    match height {
        1080 => "windows".to_owned(),
        1081 | 1440 => "tizen".to_owned(),
        _ => "android".to_owned(),
    }
}

fn primary_sdp_configuration_json() -> String {
    let version_range = |min_version: u8, max_version: u8| {
        json_object(vec![
            field("minVersion", min_version.to_string()),
            field("maxVersion", max_version.to_string()),
        ])
    };

    json_object(vec![
        field(
            "chatConfiguration",
            json_object(vec![
                field("bytesPerSample", "2".to_owned()),
                field("expectedClipDurationMs", "20".to_owned()),
                field(
                    "format",
                    json_object(vec![
                        field("codec", json_string("opus")),
                        field("container", json_string("webm")),
                    ]),
                ),
                field("numChannels", "1".to_owned()),
                field("sampleFrequencyHz", "24000".to_owned()),
            ]),
        ),
        field("chat", version_range(1, 1)),
        field("control", version_range(1, 3)),
        field("input", version_range(1, 8)),
        field("message", version_range(1, 1)),
    ])
}

fn trim_trailing_slash(value: &str) -> &str {
    value.trim_end_matches('/')
}

fn bearer(token: &str) -> Option<String> {
    Some(format!("Bearer {}", token))
}

pub fn force_stereo_audio_sdp(sdp: &str) -> Result<String, NanoError> {
    let mut lines: Vec<String> = sdp
        .replace('\r', "")
        .split('\n')
        .map(|line| line.to_owned())
        .collect();

    let mut audio_start = None;
    let mut audio_end = lines.len();
    for (index, line) in lines.iter().enumerate() {
        if line.starts_with("m=audio ") {
            audio_start = Some(index);
            for (next_index, next_line) in lines.iter().enumerate().skip(index + 1) {
                if next_line.starts_with("m=") {
                    audio_end = next_index;
                    break;
                }
            }
            break;
        }
    }

    let Some(start) = audio_start else {
        return Err(NanoError::InvalidSdp("no audio media in SDP"));
    };

    let mut opus_payload = None;
    for line in &lines[start..audio_end] {
        if let Some(rest) = line.strip_prefix("a=rtpmap:") {
            let mut parts = rest.split_whitespace();
            if let (Some(payload), Some(codec)) = (parts.next(), parts.next()) {
                if codec.to_ascii_lowercase().starts_with("opus/") {
                    opus_payload = Some(payload.to_owned());
                    break;
                }
            }
        }
    }

    let Some(payload) = opus_payload else {
        return Err(NanoError::InvalidSdp("no opus codec in SDP"));
    };

    for line in &mut lines[start..audio_end] {
        if let Some(rest) = line.strip_prefix(&format!("a=fmtp:{payload} ")) {
            if rest.contains("stereo=") {
                let mut updated = Vec::new();
                for item in rest.split(';') {
                    let item = item.trim();
                    if !item.is_empty() && !item.starts_with("stereo=") {
                        updated.push(item.to_owned());
                    }
                }
                updated.push("stereo=1".to_owned());
                *line = format!("a=fmtp:{payload} {}", updated.join(";"));
            } else {
                *line = format!(
                    "a=fmtp:{payload} {}{}",
                    rest,
                    if rest.is_empty() { "" } else { ";" }
                );
                if !line.ends_with("stereo=1") {
                    line.push_str("stereo=1");
                }
            }
            return Ok(lines.join("\r\n"));
        }
    }

    Err(NanoError::InvalidSdp("no opus fmtp in SDP"))
}

pub(crate) fn json_object(fields: Vec<String>) -> String {
    format!("{{{}}}", fields.join(","))
}

pub(crate) fn json_array(items: Vec<String>) -> String {
    format!("[{}]", items.join(","))
}

pub(crate) fn field(key: &str, value: String) -> String {
    format!("{}:{}", json_string(key), value)
}

pub(crate) fn json_string(value: &str) -> String {
    format!("\"{}\"", escape_json(value))
}

pub(crate) fn json_bool(value: bool) -> String {
    if value {
        "true".to_owned()
    } else {
        "false".to_owned()
    }
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0c}' => escaped.push_str("\\f"),
            ch if ch.is_control() => escaped.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => escaped.push(ch),
        }
    }
    escaped
}

fn parse_json(value: &str) -> Result<Value, NanoError> {
    serde_json::from_str::<Value>(value).map_err(|error| NanoError::Json(error.to_string()))
}
