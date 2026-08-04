use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
use jni::sys::{jboolean, jfloat, jint, jlong};
use jni::{JNIEnv, JavaVM};

use crate::audio_sink::AudioFrameSink;
use crate::auth::{AuthBundle, Platform, StreamingTokenSnapshot, WebTokenSnapshot};
use crate::backend::{AndroidSessionConfig, NanoSessionHandle, SessionEventSink};
use crate::channels::{InputFrame, RumbleData};
use crate::error::NanoError;
use crate::protocol::{default_stream_request, IceServer};
use crate::stats::StreamStats;
use crate::video_sink::VideoFrameSink;

#[cfg(target_os = "android")]
#[repr(C)]
struct ANativeWindow(c_void);

#[cfg(target_os = "android")]
extern "C" {
    fn ANativeWindow_fromSurface(
        env: *mut jni::sys::JNIEnv,
        surface: jni::sys::jobject,
    ) -> *mut ANativeWindow;
    fn ANativeWindow_release(window: *mut ANativeWindow);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BridgeState {
    Idle,
    Ready,
    Running,
    Failed,
    Stopped,
}

struct AndroidBridge {
    java_vm: Option<Arc<JavaVM>>,
    java_bridge: Option<GlobalRef>,
    session_id: String,
    stream_type: String,
    render_engine: String,
    base_uri: String,
    gs_token: String,
    web_token: String,
    resolution: i32,
    preferred_language: String,
    ice_server_url: String,
    ice_server_username: String,
    ice_server_credential: String,
    stereo_audio_enabled: bool,
    coop: bool,
    auth_ready: bool,
    has_web_token: bool,
    has_streaming_tokens: bool,
    surface_ready: bool,
    surface_width: i32,
    surface_height: i32,
    native_window: Option<usize>,
    session_handle: Option<NanoSessionHandle>,
    status_text: String,
    state: BridgeState,
}

impl AndroidBridge {
    fn new(java_vm: Option<Arc<JavaVM>>, java_bridge: Option<GlobalRef>) -> Self {
        Self {
            java_vm,
            java_bridge,
            session_id: String::new(),
            stream_type: String::new(),
            render_engine: "nano".to_owned(),
            base_uri: String::new(),
            gs_token: String::new(),
            web_token: String::new(),
            resolution: 1080,
            preferred_language: "en-US".to_owned(),
            ice_server_url: String::new(),
            ice_server_username: String::new(),
            ice_server_credential: String::new(),
            stereo_audio_enabled: false,
            coop: false,
            auth_ready: false,
            has_web_token: false,
            has_streaming_tokens: false,
            surface_ready: false,
            surface_width: 0,
            surface_height: 0,
            native_window: None,
            session_handle: None,
            status_text: "bridge idle".to_owned(),
            state: BridgeState::Idle,
        }
    }

    fn update_stream_info(
        &mut self,
        session_id: String,
        stream_type: String,
        render_engine: String,
        base_uri: String,
        gs_token: String,
        web_token: String,
        resolution: i32,
        preferred_language: String,
        ice_server_url: String,
        ice_server_username: String,
        ice_server_credential: String,
        stereo_audio_enabled: bool,
        coop: bool,
        has_web_token: bool,
        has_streaming_tokens: bool,
        auth_ready: bool,
    ) {
        self.session_id = session_id;
        self.stream_type = stream_type;
        self.render_engine = if render_engine.trim().is_empty() {
            "nano".to_owned()
        } else {
            render_engine
        };
        self.base_uri = base_uri;
        self.gs_token = gs_token;
        self.web_token = web_token;
        self.resolution = if resolution > 0 { resolution } else { 1080 };
        self.preferred_language = if preferred_language.trim().is_empty() {
            "en-US".to_owned()
        } else {
            preferred_language
        };
        self.ice_server_url = ice_server_url;
        self.ice_server_username = ice_server_username;
        self.ice_server_credential = ice_server_credential;
        self.stereo_audio_enabled = stereo_audio_enabled;
        self.coop = coop;
        self.has_web_token = has_web_token;
        self.has_streaming_tokens = has_streaming_tokens;
        self.auth_ready = auth_ready;
        self.refresh_status("stream-info");
        crate::nano_log!(
            "stream-info session={} type={} engine={} baseUri={} gsTokenPresent={} webTokenPresent={} authReady={}",
            self.session_id,
            self.stream_type,
            self.render_engine,
            !self.base_uri.trim().is_empty(),
            !self.gs_token.trim().is_empty(),
            !self.web_token.trim().is_empty(),
            self.auth_ready
        );
    }

    fn set_surface(
        &mut self,
        env: &JNIEnv<'_>,
        surface: Option<JObject<'_>>,
        width: i32,
        height: i32,
    ) {
        self.release_surface();
        self.surface_width = width;
        self.surface_height = height;
        self.surface_ready = false;

        if let Some(surface) = surface {
            if !surface.is_null() {
                let native_window = unsafe {
                    ANativeWindow_fromSurface(env.get_native_interface(), surface.into_raw())
                };
                if !native_window.is_null() {
                    self.native_window = Some(native_window as usize);
                    self.surface_ready = true;
                }
            }
        }

        self.refresh_status("surface");
        crate::nano_log!(
            "set-surface ready={} size={}x{} nativeWindowPresent={}",
            self.surface_ready,
            self.surface_width,
            self.surface_height,
            self.native_window.is_some()
        );
    }

    fn start(&mut self) {
        crate::nano_log!(
            "start requested engine={} authReady={} surfaceReady={} existingBackend={}",
            self.render_engine,
            self.auth_ready,
            self.surface_ready,
            self.session_handle.is_some()
        );
        if self.render_engine != "nano" {
            self.state = BridgeState::Ready;
            self.refresh_status("start-skipped");
            crate::nano_warn!("start skipped because engine is {}", self.render_engine);
            return;
        }

        if self.session_handle.is_none() {
            match self.start_backend() {
                Ok(handle) => {
                    self.session_handle = Some(handle);
                    crate::nano_log!("backend handle created");
                }
                Err(error) => {
                    self.state = BridgeState::Failed;
                    self.status_text = format!("start failed: {error}");
                    self.refresh_status("start-error");
                    crate::nano_error!("start failed: {error}");
                    return;
                }
            }
        }

        self.state = if self.surface_ready {
            BridgeState::Running
        } else {
            BridgeState::Ready
        };
        self.refresh_status("start");
        crate::nano_log!("start state={:?}", self.state);
    }

    fn stop(&mut self) {
        crate::nano_log!(
            "stop requested backendPresent={}",
            self.session_handle.is_some()
        );
        if let Some(mut handle) = self.session_handle.take() {
            let _ = handle.stop();
        }
        self.state = BridgeState::Stopped;
        self.refresh_status("stop");
    }

    fn send_gamepad_state(&self, frame: InputFrame) {
        let Some(handle) = self.session_handle.as_ref() else {
            // crate::nano_warn!("gamepad input skipped because backend is not running");
            return;
        };
        if let Err(_error) = handle.send_gamepad_frame(frame) {
            // crate::nano_warn!("gamepad input enqueue failed: {error}");
        }
    }

    fn release_surface(&mut self) {
        crate::nano_log!(
            "release-surface nativeWindowPresent={}",
            self.native_window.is_some()
        );
        if let Some(native_window) = self.native_window.take() {
            unsafe {
                ANativeWindow_release(native_window as *mut ANativeWindow);
            }
        }
        self.surface_ready = false;
        self.surface_width = 0;
        self.surface_height = 0;
    }

    fn refresh_status(&mut self, reason: &str) {
        self.status_text = format!(
            "{reason} | session={} | type={} | engine={} | surface={}x{} | auth={}{}{}",
            self.session_id,
            self.stream_type,
            self.render_engine,
            self.surface_width,
            self.surface_height,
            if self.auth_ready { "ready" } else { "pending" },
            if self.has_web_token || self.has_streaming_tokens {
                " | tokens=present"
            } else {
                ""
            },
            if self.session_handle.is_some() {
                " | backend=running"
            } else {
                ""
            }
        );
    }

    fn start_backend(&self) -> Result<NanoSessionHandle, NanoError> {
        crate::nano_log!("start-backend build config");
        let config = self.build_session_config()?;
        NanoSessionHandle::start(config)
    }

    fn build_session_config(&self) -> Result<AndroidSessionConfig, NanoError> {
        if self.gs_token.trim().is_empty() || self.base_uri.trim().is_empty() {
            return Err(NanoError::MissingStreamingToken);
        }
        if self.web_token.trim().is_empty() {
            return Err(NanoError::MissingWebToken);
        }

        let platform = if self.stream_type.eq_ignore_ascii_case("cloud") {
            Platform::Cloud
        } else {
            Platform::Home
        };

        let mut auth = AuthBundle::default();
        let token_snapshot = StreamingTokenSnapshot {
            gs_token: self.gs_token.clone(),
            base_uri: self.base_uri.clone(),
            created_at_ms: None,
            expires_at_ms: None,
        };
        match platform {
            Platform::Home => auth.home = Some(token_snapshot),
            Platform::Cloud => auth.cloud = Some(token_snapshot),
        }

        if !self.web_token.trim().is_empty() {
            auth.web = Some(WebTokenSnapshot {
                raw: self.web_token.clone(),
                not_after_ms: None,
            });
        }

        let mut request = default_stream_request(platform, self.session_id.clone());
        request.base_uri = self.base_uri.clone();
        request.preferred_language = self.preferred_language.clone();
        request.video.height = self.resolution.max(1) as u32;
        request.video.width = match self.resolution {
            720 => 1280,
            1080 | 1081 => 1920,
            _ => 1920,
        };

        let mut extra_ice_servers = Vec::new();
        if !self.ice_server_url.trim().is_empty() {
            extra_ice_servers.push(IceServer {
                urls: self.ice_server_url.clone(),
                username: if self.ice_server_username.trim().is_empty() {
                    None
                } else {
                    Some(self.ice_server_username.clone())
                },
                credential: if self.ice_server_credential.trim().is_empty() {
                    None
                } else {
                    Some(self.ice_server_credential.clone())
                },
            });
        }

        let video_sink =
            self.java_vm
                .as_ref()
                .zip(self.java_bridge.as_ref())
                .map(|(java_vm, java_bridge)| {
                    Arc::new(AndroidVideoSink::new(
                        Arc::clone(java_vm),
                        java_bridge.clone(),
                    )) as Arc<dyn VideoFrameSink + Send + Sync>
                });
        let audio_sink =
            self.java_vm
                .as_ref()
                .zip(self.java_bridge.as_ref())
                .map(|(java_vm, java_bridge)| {
                    Arc::new(AndroidAudioSink::new(
                        Arc::clone(java_vm),
                        java_bridge.clone(),
                    )) as Arc<dyn AudioFrameSink + Send + Sync>
                });
        let event_sink =
            self.java_vm
                .as_ref()
                .zip(self.java_bridge.as_ref())
                .map(|(java_vm, java_bridge)| {
                    Arc::new(AndroidSessionEventSink::new(
                        Arc::clone(java_vm),
                        java_bridge.clone(),
                    )) as Arc<dyn SessionEventSink + Send + Sync>
                });
        crate::nano_log!(
            "session-config platform={:?} resolution={} requestVideo={}x{} extraIceServers={} videoSink={} audioSink={} eventSink={}",
            platform,
            self.resolution,
            request.video.width,
            request.video.height,
            extra_ice_servers.len(),
            video_sink.is_some(),
            audio_sink.is_some(),
            event_sink.is_some()
        );

        Ok(AndroidSessionConfig {
            auth,
            request,
            stereo_audio_enabled: self.stereo_audio_enabled,
            max_touchpoints: 10,
            coop: self.coop,
            extra_ice_servers,
            video_sink,
            audio_sink,
            event_sink,
        })
    }
}

#[cfg(target_os = "android")]
#[derive(Clone)]
struct AndroidSessionEventSink {
    java_vm: Arc<JavaVM>,
    java_bridge: GlobalRef,
}

#[cfg(target_os = "android")]
impl AndroidSessionEventSink {
    fn new(java_vm: Arc<JavaVM>, java_bridge: GlobalRef) -> Self {
        Self {
            java_vm,
            java_bridge,
        }
    }
}

#[cfg(target_os = "android")]
impl SessionEventSink for AndroidSessionEventSink {
    fn update_status(&self, stage: &str, message: &str, terminal: bool) {
        let Ok(mut env) = self.java_vm.attach_current_thread_as_daemon() else {
            return;
        };
        let Ok(stage) = env.new_string(stage) else {
            return;
        };
        let Ok(message) = env.new_string(message) else {
            return;
        };
        let stage_object = JObject::from(stage);
        let message_object = JObject::from(message);
        let _ = env.call_method(
            self.java_bridge.as_obj(),
            "updateSessionStatus",
            "(Ljava/lang/String;Ljava/lang/String;Z)V",
            &[
                JValue::Object(&stage_object),
                JValue::Object(&message_object),
                JValue::Bool(if terminal {
                    1 as jboolean
                } else {
                    0 as jboolean
                }),
            ],
        );
        let _ = env.delete_local_ref(stage_object);
        let _ = env.delete_local_ref(message_object);
    }

    fn update_stats(&self, stats: &StreamStats) {
        let Ok(mut env) = self.java_vm.attach_current_thread_as_daemon() else {
            return;
        };
        let _ = env.call_method(
            self.java_bridge.as_obj(),
            "updateWebRtcStats",
            "(DDDDDDDDDD)V",
            &[
                JValue::Double(stats.round_trip_time_ms.unwrap_or(-1.0)),
                JValue::Double(stats.jitter_ms.unwrap_or(-1.0)),
                JValue::Double(stats.fps.unwrap_or(-1.0)),
                JValue::Double(stats.frames_dropped as f64),
                JValue::Double(stats.frames_received as f64),
                JValue::Double(stats.packets_received as f64),
                JValue::Double(stats.packets_lost as f64),
                JValue::Double(stats.packet_loss_pct.unwrap_or(-1.0)),
                JValue::Double(
                    stats
                        .bitrate_bps
                        .map(|value| value as f64 / 1_000_000.0)
                        .unwrap_or(-1.0),
                ),
                JValue::Double(stats.decode_time_ms.unwrap_or(-1.0)),
            ],
        );
    }

    fn on_rumble(&self, rumble: RumbleData) {
        let Ok(mut env) = self.java_vm.attach_current_thread_as_daemon() else {
            return;
        };
        let _ = env.call_method(
            self.java_bridge.as_obj(),
            "onRumble",
            "(DIIIDDDD)V",
            &[
                JValue::Double(rumble.start_delay_ms as f64),
                JValue::Int(rumble.duration_ms.min(i32::MAX as u16) as jint),
                JValue::Int(rumble.delay_ms.min(i32::MAX as u16) as jint),
                JValue::Int(rumble.repeat as jint),
                JValue::Double(rumble.weak_magnitude as f64),
                JValue::Double(rumble.strong_magnitude as f64),
                JValue::Double(rumble.left_trigger as f64),
                JValue::Double(rumble.right_trigger as f64),
            ],
        );
    }
}

#[cfg(target_os = "android")]
struct AndroidVideoSink {
    sender: SyncSender<AndroidVideoFrame>,
}

#[cfg(target_os = "android")]
impl AndroidVideoSink {
    fn new(java_vm: Arc<JavaVM>, java_bridge: GlobalRef) -> Self {
        let (sender, receiver) = sync_channel::<AndroidVideoFrame>(180);
        thread::Builder::new()
            .name("NanoAndroidVideoSink".to_owned())
            .spawn(move || {
                let Ok(mut env) = java_vm.attach_current_thread_as_daemon() else {
                    crate::nano_warn!("android video sink worker failed to attach JVM");
                    return;
                };
                crate::nano_log!("android video sink worker started");
                let mut queued_frames = 0u64;
                while let Ok(frame) = receiver.recv() {
                    if frame.data.is_empty() {
                        continue;
                    }
                    let Ok(byte_buffer) = (unsafe {
                        env.new_direct_byte_buffer(frame.data.as_ptr() as *mut u8, frame.data.len())
                    }) else {
                        continue;
                    };
                    let byte_object = JObject::from(byte_buffer);
                    let _ = env.call_method(
                        java_bridge.as_obj(),
                        "queueVideoFrame",
                        "(Ljava/nio/ByteBuffer;JZ)V",
                        &[
                            JValue::Object(&byte_object),
                            JValue::Long(frame.pts_us),
                            JValue::Bool(if frame.keyframe {
                                1 as jboolean
                            } else {
                                0 as jboolean
                            }),
                        ],
                    );
                    let _ = env.delete_local_ref(byte_object);
                    queued_frames += 1;
                    if queued_frames == 1 || queued_frames % 120 == 0 {
                        crate::nano_log!(
                            "android video sink queued frame count={queued_frames} ptsUs={}",
                            frame.pts_us
                        );
                    }
                }
                crate::nano_log!("android video sink worker stopped queued={queued_frames}");
            })
            .ok();
        Self { sender }
    }
}

#[cfg(target_os = "android")]
struct AndroidVideoFrame {
    data: Vec<u8>,
    pts_us: i64,
    keyframe: bool,
}

#[cfg(target_os = "android")]
impl VideoFrameSink for AndroidVideoSink {
    fn push_h264_access_unit(&self, data: &[u8], pts_us: i64, keyframe: bool) {
        if data.is_empty() {
            return;
        }
        if let Err(error) = self.sender.send(AndroidVideoFrame {
            data: data.to_vec(),
            pts_us,
            keyframe,
        }) {
            crate::nano_warn!("android video sink send failed: {error}");
        }
    }

    fn drop_pending_output(&self, reason: &str) {
        crate::nano_log!("android video sink drop_pending_output ignored reason={reason}");
    }
}

#[cfg(target_os = "android")]
#[derive(Clone)]
struct AndroidAudioSink {
    java_vm: Arc<JavaVM>,
    java_bridge: GlobalRef,
}

#[cfg(target_os = "android")]
impl AndroidAudioSink {
    fn new(java_vm: Arc<JavaVM>, java_bridge: GlobalRef) -> Self {
        Self {
            java_vm,
            java_bridge,
        }
    }
}

#[cfg(target_os = "android")]
impl AudioFrameSink for AndroidAudioSink {
    fn push_opus_frame(&self, data: &[u8], pts_us: i64, sample_rate: u32, channels: u16) {
        let Ok(mut env) = self.java_vm.attach_current_thread_as_daemon() else {
            return;
        };
        if data.is_empty() {
            return;
        }
        let Ok(byte_buffer) =
            (unsafe { env.new_direct_byte_buffer(data.as_ptr() as *mut u8, data.len()) })
        else {
            return;
        };
        let byte_object = JObject::from(byte_buffer);
        let _ = env.call_method(
            self.java_bridge.as_obj(),
            "queueAudioFrame",
            "(Ljava/nio/ByteBuffer;JII)V",
            &[
                JValue::Object(&byte_object),
                JValue::Long(pts_us),
                JValue::Int(sample_rate.min(i32::MAX as u32) as jint),
                JValue::Int(channels.min(i32::MAX as u16) as jint),
            ],
        );
        let _ = env.delete_local_ref(byte_object);
    }
}

static NEXT_HANDLE: AtomicI64 = AtomicI64::new(1);
static REGISTRY: OnceLock<Mutex<HashMap<i64, AndroidBridge>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<i64, AndroidBridge>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn with_bridge_mut<R>(handle: jlong, f: impl FnOnce(&mut AndroidBridge) -> R) -> Option<R> {
    let mut guard = registry().lock().ok()?;
    guard.get_mut(&handle).map(f)
}

fn insert_bridge(java_vm: Option<JavaVM>, java_bridge: Option<GlobalRef>) -> jlong {
    let handle = NEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    crate::nano_log!(
        "insert-bridge handle={} javaVm={} javaBridge={}",
        handle,
        java_vm.is_some(),
        java_bridge.is_some()
    );
    if let Ok(mut guard) = registry().lock() {
        guard.insert(
            handle,
            AndroidBridge::new(java_vm.map(Arc::new), java_bridge),
        );
    }
    handle
}

fn remove_bridge(handle: jlong) {
    if let Ok(mut guard) = registry().lock() {
        if let Some(mut bridge) = guard.remove(&handle) {
            bridge.stop();
            bridge.release_surface();
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeCreateBridge<'local>(
    env: JNIEnv<'local>,
    this: JObject<'local>,
) -> jlong {
    let java_vm = env.get_java_vm().ok();
    let java_bridge = env.new_global_ref(&this).ok();
    let handle = insert_bridge(java_vm, java_bridge);
    crate::nano_log!("nativeCreateBridge handle={handle}");
    handle
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeDestroyBridge<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) {
    if handle != 0 {
        crate::nano_log!("nativeDestroyBridge handle={handle}");
        remove_bridge(handle);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeSetStreamInfo<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    session_id: JString<'local>,
    stream_type: JString<'local>,
    render_engine: JString<'local>,
    base_uri: JString<'local>,
    gs_token: JString<'local>,
    web_token: JString<'local>,
    resolution: jint,
    preferred_language: JString<'local>,
    ice_server_url: JString<'local>,
    ice_server_username: JString<'local>,
    ice_server_credential: JString<'local>,
    stereo_audio_enabled: jboolean,
    coop: jboolean,
    has_web_token: jboolean,
    has_streaming_tokens: jboolean,
    auth_ready: jboolean,
) {
    let session_id = env
        .get_string(&session_id)
        .map(|value| value.into())
        .unwrap_or_default();
    let stream_type = env
        .get_string(&stream_type)
        .map(|value| value.into())
        .unwrap_or_default();
    let render_engine = env
        .get_string(&render_engine)
        .map(|value| value.into())
        .unwrap_or_default();
    let base_uri = env
        .get_string(&base_uri)
        .map(|value| value.into())
        .unwrap_or_default();
    let gs_token = env
        .get_string(&gs_token)
        .map(|value| value.into())
        .unwrap_or_default();
    let web_token = env
        .get_string(&web_token)
        .map(|value| value.into())
        .unwrap_or_default();
    let preferred_language = env
        .get_string(&preferred_language)
        .map(|value| value.into())
        .unwrap_or_default();
    let ice_server_url = env
        .get_string(&ice_server_url)
        .map(|value| value.into())
        .unwrap_or_default();
    let ice_server_username = env
        .get_string(&ice_server_username)
        .map(|value| value.into())
        .unwrap_or_default();
    let ice_server_credential = env
        .get_string(&ice_server_credential)
        .map(|value| value.into())
        .unwrap_or_default();

    let stereo_audio_enabled = stereo_audio_enabled != 0;
    let coop = coop != 0;
    let has_web_token = has_web_token != 0;
    let has_streaming_tokens = has_streaming_tokens != 0;
    let auth_ready = auth_ready != 0;

    crate::nano_log!(
        "nativeSetStreamInfo handle={} session={} type={} engine={} authReady={} streamingTokens={} webToken={}",
        handle,
        session_id,
        stream_type,
        render_engine,
        auth_ready,
        has_streaming_tokens,
        has_web_token
    );
    let _ = with_bridge_mut(handle, |bridge| {
        bridge.update_stream_info(
            session_id,
            stream_type,
            render_engine,
            base_uri,
            gs_token,
            web_token,
            resolution,
            preferred_language,
            ice_server_url,
            ice_server_username,
            ice_server_credential,
            stereo_audio_enabled,
            coop,
            has_web_token,
            has_streaming_tokens,
            auth_ready,
        );
    });
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeSetSurface<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    surface: JObject<'local>,
    width: jint,
    height: jint,
) {
    crate::nano_log!(
        "nativeSetSurface handle={} nullSurface={} size={}x{}",
        handle,
        surface.is_null(),
        width,
        height
    );
    let _ = with_bridge_mut(handle, |bridge| {
        bridge.set_surface(
            &env,
            if surface.is_null() {
                None
            } else {
                Some(surface)
            },
            width,
            height,
        );
    });
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeStart<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) {
    crate::nano_log!("nativeStart handle={handle}");
    let _ = with_bridge_mut(handle, |bridge| bridge.start());
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeStop<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) {
    crate::nano_log!("nativeStop handle={handle}");
    let _ = with_bridge_mut(handle, |bridge| bridge.stop());
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeSendGamepadState<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
    gamepad_index: jint,
    nexus: jint,
    menu: jint,
    view: jint,
    a: jint,
    b: jint,
    x: jint,
    y: jint,
    dpad_up: jint,
    dpad_down: jint,
    dpad_left: jint,
    dpad_right: jint,
    left_shoulder: jint,
    right_shoulder: jint,
    left_thumb: jint,
    right_thumb: jint,
    left_thumb_x_axis: jfloat,
    left_thumb_y_axis: jfloat,
    right_thumb_x_axis: jfloat,
    right_thumb_y_axis: jfloat,
    left_trigger: jfloat,
    right_trigger: jfloat,
) {
    // crate::nano_log!(
    //     "nativeSendGamepadState handle={} gamepadIndex={}",
    //     handle,
    //     gamepad_index
    // );
    let frame = InputFrame {
        gamepad_index: gamepad_index.clamp(0, u8::MAX as jint) as u8,
        nexus: bool_to_u8(nexus),
        menu: bool_to_u8(menu),
        view: bool_to_u8(view),
        a: bool_to_u8(a),
        b: bool_to_u8(b),
        x: bool_to_u8(x),
        y: bool_to_u8(y),
        dpad_up: bool_to_u8(dpad_up),
        dpad_down: bool_to_u8(dpad_down),
        dpad_left: bool_to_u8(dpad_left),
        dpad_right: bool_to_u8(dpad_right),
        left_shoulder: bool_to_u8(left_shoulder),
        right_shoulder: bool_to_u8(right_shoulder),
        left_thumb: bool_to_u8(left_thumb),
        right_thumb: bool_to_u8(right_thumb),
        left_thumb_x_axis: left_thumb_x_axis as f32,
        left_thumb_y_axis: left_thumb_y_axis as f32,
        right_thumb_x_axis: right_thumb_x_axis as f32,
        right_thumb_y_axis: right_thumb_y_axis as f32,
        left_trigger: left_trigger as f32,
        right_trigger: right_trigger as f32,
        physical_physicality: None,
        virtual_physicality: None,
    };
    let _ = with_bridge_mut(handle, |bridge| bridge.send_gamepad_state(frame));
}

#[no_mangle]
pub extern "system" fn Java_com_xstreaming_nano_NanoRustBridge_nativeReleaseSurface<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    handle: jlong,
) {
    crate::nano_log!("nativeReleaseSurface handle={handle}");
    let _ = with_bridge_mut(handle, |bridge| bridge.release_surface());
}

fn bool_to_u8(value: jint) -> u8 {
    if value > 0 {
        1
    } else {
        0
    }
}
