use std::time::{Duration, Instant};

use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method};
use serde_json::Value;

use crate::error::NanoError;
use crate::protocol::{
    HttpMethod, HttpRequestSpec, IceCandidate, IceExchangeBody, SdpExchangeResponse,
    SessionConfiguration, SessionPlayResponse, SessionStateResponse,
};

#[derive(Debug, Clone)]
pub struct NanoHttpSignalingClient {
    client: Client,
}

impl NanoHttpSignalingClient {
    pub fn new() -> Result<Self, NanoError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| NanoError::SignalingOwned(error.to_string()))?;
        Ok(Self { client })
    }

    pub async fn play(&self, request: HttpRequestSpec) -> Result<SessionPlayResponse, NanoError> {
        let text = self.request_text(request).await?;
        SessionPlayResponse::from_json(&text)
    }

    pub async fn configuration(
        &self,
        request: HttpRequestSpec,
    ) -> Result<SessionConfiguration, NanoError> {
        let text = self.request_text(request).await?;
        SessionConfiguration::from_json(&text)
    }

    pub async fn state(&self, request: HttpRequestSpec) -> Result<SessionStateResponse, NanoError> {
        let text = self.request_text(request).await?;
        SessionStateResponse::from_json(&text)
    }

    pub async fn post_sdp_offer(&self, request: HttpRequestSpec) -> Result<(), NanoError> {
        self.request_text(request).await.map(|_| ())
    }

    pub async fn poll_sdp_answer(
        &self,
        request: HttpRequestSpec,
    ) -> Result<SdpExchangeResponse, NanoError> {
        let text = self.request_text(request).await?;
        SdpExchangeResponse::from_json(&text)
    }

    pub async fn post_ice_candidates(&self, request: HttpRequestSpec) -> Result<(), NanoError> {
        self.request_text(request).await.map(|_| ())
    }

    pub async fn poll_ice_candidates(
        &self,
        request: HttpRequestSpec,
    ) -> Result<Vec<IceCandidate>, NanoError> {
        let text = self.request_text(request).await?;
        IceExchangeBody::from_json(&text)
    }

    pub async fn connect(&self, request: HttpRequestSpec) -> Result<(), NanoError> {
        self.request_text(request).await.map(|_| ())
    }

    pub async fn keepalive(&self, request: HttpRequestSpec) -> Result<(), NanoError> {
        self.request_text(request).await.map(|_| ())
    }

    pub async fn stop(&self, request: HttpRequestSpec) -> Result<(), NanoError> {
        self.request_text(request).await.map(|_| ())
    }

    pub async fn request_text(&self, request: HttpRequestSpec) -> Result<String, NanoError> {
        let HttpRequestSpec {
            method,
            url,
            authorization,
            accept,
            content_type,
            x_ms_device_info,
            body,
        } = request;
        let method_name = match method {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Delete => Method::DELETE,
        };
        let start = Instant::now();
        let body_len = body.as_ref().map(|value| value.len()).unwrap_or(0);
        crate::nano_log!(
            "http request start method={} url={} auth={} accept={} contentType={} deviceInfo={} bodyLen={}",
            method_name.as_str(),
            url,
            authorization.is_some(),
            accept.unwrap_or(""),
            content_type.unwrap_or(""),
            x_ms_device_info.is_some(),
            body_len
        );

        let mut builder = self.client.request(method_name, &url);
        if let Some(value) = authorization {
            builder = builder.header(AUTHORIZATION, value);
        }
        if let Some(value) = accept {
            builder = builder.header(ACCEPT, value);
        }
        if let Some(value) = content_type {
            builder = builder.header(CONTENT_TYPE, value);
        }
        if let Some(value) = x_ms_device_info {
            builder = builder.header("X-MS-Device-Info", value);
        }
        if let Some(body) = body {
            builder = builder.body(body);
        }

        let response = builder.send().await.map_err(|error| {
            crate::nano_error!(
                "http request send failed url={} elapsedMs={} error={}",
                url,
                start.elapsed().as_millis(),
                error
            );
            NanoError::SignalingOwned(error.to_string())
        })?;
        let status = response.status();
        let text = response.text().await.map_err(|error| {
            crate::nano_error!(
                "http response body read failed url={} status={} elapsedMs={} error={}",
                url,
                status,
                start.elapsed().as_millis(),
                error
            );
            NanoError::SignalingOwned(error.to_string())
        })?;
        crate::nano_log!(
            "http response url={} status={} elapsedMs={} bodyLen={}",
            url,
            status,
            start.elapsed().as_millis(),
            text.len()
        );
        if !status.is_success() {
            let preview: String = text.chars().take(512).collect();
            crate::nano_error!(
                "http response error url={} status={} bodyPreview={}",
                url,
                status,
                preview
            );
            return Err(NanoError::SignalingOwned(format!(
                "http status {}: {}",
                status, text
            )));
        }
        Ok(text)
    }

    pub async fn request_json(&self, request: HttpRequestSpec) -> Result<Value, NanoError> {
        let text = self.request_text(request).await?;
        serde_json::from_str::<Value>(&text).map_err(|error| NanoError::Json(error.to_string()))
    }
}
