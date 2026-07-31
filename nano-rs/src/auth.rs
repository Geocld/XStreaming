use crate::error::NanoError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Home,
    Cloud,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamingTokenSnapshot {
    pub gs_token: String,
    pub base_uri: String,
    pub created_at_ms: Option<u64>,
    pub expires_at_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebTokenSnapshot {
    pub raw: String,
    pub not_after_ms: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuthBundle {
    pub home: Option<StreamingTokenSnapshot>,
    pub cloud: Option<StreamingTokenSnapshot>,
    pub web: Option<WebTokenSnapshot>,
}

impl AuthBundle {
    pub fn selected_streaming_token(
        &self,
        platform: Platform,
    ) -> Result<&StreamingTokenSnapshot, NanoError> {
        self.selected_streaming_token_ref(platform)
    }

    fn selected_streaming_token_ref(
        &self,
        platform: Platform,
    ) -> Result<&StreamingTokenSnapshot, NanoError> {
        match platform {
            Platform::Home => self.home.as_ref().ok_or(NanoError::MissingTokenForPlatform),
            Platform::Cloud => self
                .cloud
                .as_ref()
                .ok_or(NanoError::MissingTokenForPlatform),
        }
    }

    pub fn selected_gs_token(&self, platform: Platform) -> Result<&str, NanoError> {
        Ok(&self.selected_streaming_token_ref(platform)?.gs_token)
    }

    pub fn has_any_stream_token(&self) -> bool {
        self.home.is_some() || self.cloud.is_some()
    }
}
