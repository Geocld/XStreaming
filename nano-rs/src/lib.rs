#[cfg(target_os = "android")]
pub mod android;
pub mod audio_sink;
pub mod auth;
pub mod backend;
pub mod channels;
pub mod connection;
pub mod error;
pub mod logging;
pub mod protocol;
pub mod session;
pub mod signaling;
pub mod stats;
pub mod transport;
pub mod video_sink;
pub mod webrtc_backend;

pub use auth::{AuthBundle, Platform, StreamingTokenSnapshot, WebTokenSnapshot};
pub use backend::{AndroidSessionConfig, NanoSessionHandle};
pub use channels::{ChannelKind, ChannelSpec};
pub use connection::{NanoConnection, NanoPeerConnection, NanoSignalingClient};
pub use error::NanoError;
pub use protocol::{
    default_stream_request, CodecProfile, DeviceInfo, HttpMethod, HttpRequestSpec, IceCandidate,
    IceCandidateInput, IceExchangeBody, IceServer, PeerConnectionPlan, SdpExchangeResponse,
    SdpOfferBody, SdpOfferKind, SessionBlueprint, SessionConfiguration, SessionEndpoints,
    SessionPlayBody, SessionPlayResponse, SessionPlaySettings, SessionStateResponse, StreamRequest,
    TransceiverSpec, VideoProfile,
};
pub use session::{MediaTrackKind, NanoWebRtcSession, SessionEvent, SessionSnapshot, SessionState};
pub use stats::StreamStats;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_channel_plan_matches_current_web_client() {
        let plan = PeerConnectionPlan::default();
        assert_eq!(plan.channels.len(), 4);
        assert_eq!(
            plan.channels[0],
            ChannelSpec {
                kind: ChannelKind::Input,
                name: "input",
                ordered: true,
                protocol: "1.0",
            }
        );
        assert_eq!(plan.channels[1].name, "chat");
        assert_eq!(plan.channels[2].name, "control");
        assert_eq!(plan.channels[3].name, "message");
        assert_eq!(plan.transceivers.len(), 2);
        assert_eq!(plan.transceivers[0].kind, "video");
        assert_eq!(
            plan.transceivers[0].direction,
            protocol::TransceiverDirection::RecvOnly
        );
        assert_eq!(plan.transceivers[1].kind, "audio");
        assert_eq!(
            plan.transceivers[1].direction,
            protocol::TransceiverDirection::SendRecv
        );
        assert_eq!(plan.ice_servers.len(), 7);
    }

    #[test]
    fn blueprint_reuses_selected_token() {
        let mut auth = AuthBundle::default();
        auth.home = Some(StreamingTokenSnapshot {
            gs_token: "home-gs".into(),
            base_uri: "https://example.invalid".into(),
            created_at_ms: Some(1),
            expires_at_ms: Some(2),
        });

        let mut request = default_stream_request(Platform::Home, "session-1");
        request.base_uri = "https://example.invalid".into();
        let blueprint = SessionBlueprint::from_request(&auth, request).unwrap();
        assert_eq!(blueprint.gs_token, "home-gs");
        assert_eq!(blueprint.peer.channels.len(), 4);
    }

    #[test]
    fn play_request_matches_current_xcloud_shape() {
        let mut auth = AuthBundle::default();
        auth.cloud = Some(StreamingTokenSnapshot {
            gs_token: "cloud-gs".into(),
            base_uri: "https://cloud.example.invalid".into(),
            created_at_ms: Some(1),
            expires_at_ms: Some(2),
        });

        let request = default_stream_request(Platform::Cloud, "title-1");
        let mut session = NanoWebRtcSession::from_request(&auth, request).unwrap();
        let play = session.play_request();
        let body = play.body.as_ref().unwrap();
        let device = play.x_ms_device_info.as_ref().unwrap();

        assert_eq!(play.method, HttpMethod::Post);
        assert_eq!(
            play.url,
            "https://cloud.example.invalid/v5/sessions/cloud/play"
        );
        assert_eq!(play.authorization.as_deref(), Some("Bearer cloud-gs"));
        assert!(body.contains("\"titleId\":\"title-1\""));
        assert!(body.contains("\"nanoVersion\":\"V3;WebrtcTransport.dll\""));
        assert!(body.contains("\"useIceConnection\":false"));
        assert!(device.contains("\"clientAppId\":\"www.xbox.com\""));
    }

    #[test]
    fn sdp_and_ice_requests_follow_current_exchange_shape() {
        let mut auth = AuthBundle::default();
        auth.home = Some(StreamingTokenSnapshot {
            gs_token: "home-gs".into(),
            base_uri: "https://home.example.invalid".into(),
            created_at_ms: Some(1),
            expires_at_ms: Some(2),
        });

        let request = default_stream_request(Platform::Home, "console-1");
        let mut session = NanoWebRtcSession::from_request(&auth, request).unwrap();
        session
            .record_play_response_body(SessionPlayResponse {
                session_path: "/sessions/home/remote-session-1".to_owned(),
            })
            .unwrap();

        let sdp = session.build_primary_sdp_offer_request("v=0\r\n").unwrap();
        let sdp_body = sdp.body.as_ref().unwrap();
        assert_eq!(
            sdp.url,
            "https://home.example.invalid/v5/sessions/home/remote-session-1/sdp"
        );
        assert!(sdp_body.contains("\"messageType\":\"offer\""));
        assert!(sdp_body.contains("\"chatConfiguration\""));
        assert!(sdp_body.contains("\"input\":{\"minVersion\":1,\"maxVersion\":8}"));

        let ice = session
            .build_ice_post_request(vec![
                IceCandidate::new("a=end-of-candidates", "0", 0),
                IceCandidate::new(
                    "candidate:1 1 UDP 1 127.0.0.1 9000 typ host tcptype passive",
                    "0",
                    0,
                ),
                IceCandidate::new("candidate:2 1 UDP 1 127.0.0.1 9001 typ host", "0", 0),
            ])
            .unwrap();
        let ice_body = ice.body.as_ref().unwrap();
        assert!(ice_body.contains("\"messageType\":\"iceCandidate\""));
        assert!(ice_body.contains("9001"));
        assert!(!ice_body.contains("end-of-candidates"));
        assert!(!ice_body.contains("tcptype"));
    }

    #[test]
    fn input_packet_matches_current_data_channel_header() {
        let packet = channels::InputPacket::with_data(
            7,
            Vec::new(),
            vec![channels::InputFrame {
                a: 1,
                left_thumb_x_axis: 1.0,
                ..Default::default()
            }],
            Vec::new(),
            1920,
            1080,
        )
        .to_bytes(12.5);

        assert_eq!(u16::from_le_bytes([packet[0], packet[1]]), 2);
        assert_eq!(
            u32::from_le_bytes([packet[2], packet[3], packet[4], packet[5]]),
            7
        );
        assert_eq!(packet[14], 1);
        assert_eq!(packet[15], 0);
        assert_eq!(u16::from_le_bytes([packet[16], packet[17]]), 16);
        assert_eq!(i16::from_le_bytes([packet[18], packet[19]]), 32767);
    }

    #[test]
    fn input_metadata_packet_matches_processed_frame_shape() {
        let packet = channels::InputPacket::with_data(
            9,
            vec![channels::MetadataFrame {
                server_data_key: 1234,
                first_frame_packet_arrival_time_ms: 10023,
                frame_submitted_time_ms: 10023,
                frame_decoded_time_ms: 10033,
                frame_rendered_time_ms: 10033,
            }],
            Vec::new(),
            Vec::new(),
            1920,
            1080,
        )
        .to_bytes(10034.0);

        assert_eq!(u16::from_le_bytes([packet[0], packet[1]]), 1);
        assert_eq!(
            u32::from_le_bytes([packet[2], packet[3], packet[4], packet[5]]),
            9
        );
        assert_eq!(packet[14], 1);
        assert_eq!(
            u32::from_le_bytes([packet[15], packet[16], packet[17], packet[18]]),
            1234
        );
        assert_eq!(
            u32::from_le_bytes([packet[19], packet[20], packet[21], packet[22]]),
            10023
        );
        assert_eq!(
            u32::from_le_bytes([packet[35], packet[36], packet[37], packet[38]]),
            10034
        );
    }

    #[test]
    fn input_server_message_parses_vibration_payload() {
        let message =
            channels::parse_input_server_message(&[128, 0, 0, 0, 1, 2, 3, 4, 200, 0, 15, 0, 25])
                .unwrap();
        let rumble = message.rumble.unwrap();
        assert!((rumble.strong_magnitude - 0.01).abs() < f32::EPSILON);
        assert!((rumble.weak_magnitude - 0.02).abs() < f32::EPSILON);
        assert!((rumble.left_trigger - 0.03).abs() < f32::EPSILON);
        assert!((rumble.right_trigger - 0.04).abs() < f32::EPSILON);
        assert_eq!(rumble.duration_ms, 200);
        assert_eq!(rumble.delay_ms, 15);
        assert_eq!(rumble.repeat, 25);
    }

    #[test]
    fn session_state_machine_tracks_offer_answer_and_connect() {
        let mut auth = AuthBundle::default();
        auth.cloud = Some(StreamingTokenSnapshot {
            gs_token: "cloud-gs".into(),
            base_uri: "https://example.invalid".into(),
            created_at_ms: Some(1),
            expires_at_ms: Some(2),
        });

        let mut request = default_stream_request(Platform::Cloud, "session-2");
        request.base_uri = "https://example.invalid".into();
        let mut session = NanoWebRtcSession::from_request(&auth, request).unwrap();
        session.start();
        session.record_local_offer("v=0").unwrap();
        session.publish_local_offer().unwrap();
        session.record_remote_answer("v=0").unwrap();
        session
            .record_remote_candidate("candidate:1 1 udp 1 127.0.0.1 3478 typ host")
            .unwrap();
        session
            .record_observed_track(MediaTrackKind::Video)
            .unwrap();
        session.connect().unwrap();

        let snapshot = session.snapshot();
        assert_eq!(snapshot.state, SessionState::Connected);
        assert!(snapshot.local_description_set);
        assert!(snapshot.remote_description_set);
        assert_eq!(snapshot.remote_candidate_count, 1);
        assert_eq!(snapshot.observed_tracks.len(), 1);
        assert!(matches!(
            session.events().last(),
            Some(SessionEvent::Connected)
        ));
    }

    #[derive(Debug, Default)]
    struct FakePeer {
        prepared: bool,
        remote_answer: Option<String>,
        remote_candidates: Vec<IceCandidate>,
        closed: bool,
    }

    impl NanoPeerConnection for FakePeer {
        fn prepare(&mut self, plan: &PeerConnectionPlan) -> Result<(), NanoError> {
            assert_eq!(plan.channels.len(), 4);
            self.prepared = true;
            Ok(())
        }

        fn create_offer(&mut self) -> Result<String, NanoError> {
            if !self.prepared {
                return Err(NanoError::PeerConnection("peer was not prepared"));
            }
            Ok("v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 127\r\n".to_owned())
        }

        fn set_remote_answer(&mut self, sdp: &str) -> Result<(), NanoError> {
            self.remote_answer = Some(sdp.to_owned());
            Ok(())
        }

        fn drain_local_candidates(&mut self) -> Result<Vec<IceCandidate>, NanoError> {
            Ok(vec![IceCandidate::new(
                "candidate:1 1 UDP 1 127.0.0.1 9000 typ host",
                "0",
                0,
            )])
        }

        fn add_remote_candidate(&mut self, candidate: &IceCandidate) -> Result<(), NanoError> {
            self.remote_candidates.push(candidate.clone());
            Ok(())
        }

        fn close(&mut self) -> Result<(), NanoError> {
            self.closed = true;
            Ok(())
        }
    }

    #[derive(Debug, Default)]
    struct FakeSignaling {
        urls: Vec<String>,
        connect_body: Option<String>,
    }

    impl FakeSignaling {
        fn record(&mut self, request: HttpRequestSpec) -> HttpRequestSpec {
            self.urls.push(request.url.clone());
            request
        }
    }

    impl NanoSignalingClient for FakeSignaling {
        fn play(&mut self, request: HttpRequestSpec) -> Result<SessionPlayResponse, NanoError> {
            self.record(request);
            Ok(SessionPlayResponse {
                session_path: "/sessions/cloud/remote-session-3".to_owned(),
            })
        }

        fn configuration(
            &mut self,
            request: HttpRequestSpec,
        ) -> Result<SessionConfiguration, NanoError> {
            self.record(request);
            Ok(SessionConfiguration::from_keepalive_pulse(20))
        }

        fn post_sdp_offer(&mut self, request: HttpRequestSpec) -> Result<(), NanoError> {
            let request = self.record(request);
            assert!(request.body.unwrap().contains("\"messageType\":\"offer\""));
            Ok(())
        }

        fn poll_sdp_answer(
            &mut self,
            request: HttpRequestSpec,
        ) -> Result<SdpExchangeResponse, NanoError> {
            self.record(request);
            Ok(SdpExchangeResponse::from_offer_sdp("v=0\r\nm=video 9\r\n"))
        }

        fn post_ice_candidates(&mut self, request: HttpRequestSpec) -> Result<(), NanoError> {
            let request = self.record(request);
            assert!(request
                .body
                .unwrap()
                .contains("\"messageType\":\"iceCandidate\""));
            Ok(())
        }

        fn poll_ice_candidates(
            &mut self,
            request: HttpRequestSpec,
        ) -> Result<Vec<IceCandidate>, NanoError> {
            self.record(request);
            Ok(vec![IceCandidate::new(
                "candidate:2 1 UDP 1 127.0.0.1 9001 typ host",
                "0",
                0,
            )])
        }

        fn connect(&mut self, request: HttpRequestSpec) -> Result<(), NanoError> {
            let request = self.record(request);
            self.connect_body = request.body;
            Ok(())
        }

        fn keepalive(&mut self, request: HttpRequestSpec) -> Result<(), NanoError> {
            self.record(request);
            Ok(())
        }

        fn stop(&mut self, request: HttpRequestSpec) -> Result<(), NanoError> {
            self.record(request);
            Ok(())
        }
    }

    #[test]
    fn connection_runner_reuses_auth_and_drives_current_signaling_order() {
        let mut auth = AuthBundle::default();
        auth.cloud = Some(StreamingTokenSnapshot {
            gs_token: "cloud-gs".into(),
            base_uri: "https://cloud.example.invalid".into(),
            created_at_ms: Some(1),
            expires_at_ms: Some(2),
        });
        auth.web = Some(WebTokenSnapshot {
            raw: "web-token".into(),
            not_after_ms: Some(3),
        });

        let request = default_stream_request(Platform::Cloud, "title-3");
        let session = NanoWebRtcSession::from_request(&auth, request).unwrap();
        let mut connection =
            NanoConnection::new(session, FakePeer::default(), FakeSignaling::default());

        let snapshot = connection.start().unwrap();
        assert_eq!(snapshot.state, SessionState::Connected);
        assert_eq!(snapshot.remote_candidate_count, 1);
        assert_eq!(
            snapshot.remote_session_id.as_deref(),
            Some("remote-session-3")
        );

        connection.keepalive().unwrap();
        connection.stop().unwrap();

        let (_, peer, signaling) = connection.into_parts();
        assert!(peer.closed);
        assert_eq!(
            signaling.connect_body.as_deref(),
            Some("{\"userToken\":\"web-token\"}")
        );
        assert_eq!(
            signaling.urls,
            vec![
                "https://cloud.example.invalid/v5/sessions/cloud/play",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/configuration",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/sdp",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/sdp",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/ice",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/ice",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/connect",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3/keepalive",
                "https://cloud.example.invalid/v5/sessions/cloud/remote-session-3",
            ]
        );
    }
}
