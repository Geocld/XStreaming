#[derive(Debug, Clone, PartialEq)]
pub struct StreamStats {
    pub round_trip_time_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub bitrate_bps: Option<u64>,
    pub packet_loss_pct: Option<f64>,
    pub decode_time_ms: Option<f64>,
    pub fps: Option<f64>,
    pub audio_level: Option<f64>,
    pub frames_dropped: u64,
    pub frames_received: u64,
    pub packets_lost: u64,
    pub packets_received: u64,
}

impl Default for StreamStats {
    fn default() -> Self {
        Self {
            round_trip_time_ms: None,
            jitter_ms: None,
            bitrate_bps: None,
            packet_loss_pct: None,
            decode_time_ms: None,
            fps: None,
            audio_level: None,
            frames_dropped: 0,
            frames_received: 0,
            packets_lost: 0,
            packets_received: 0,
        }
    }
}

impl StreamStats {
    pub fn record_frame_drop(&mut self) {
        self.frames_dropped += 1;
    }

    pub fn update_frames_received(&mut self, value: u64) {
        self.frames_received = value;
    }

    pub fn update_packets_lost(&mut self, value: u64) {
        self.packets_lost = value;
    }

    pub fn update_packets_received(&mut self, value: u64) {
        self.packets_received = value;
    }

    pub fn update_rtt(&mut self, value_ms: f64) {
        self.round_trip_time_ms = Some(value_ms);
    }

    pub fn update_jitter(&mut self, value_ms: f64) {
        self.jitter_ms = Some(value_ms);
    }

    pub fn update_bitrate(&mut self, value_bps: u64) {
        self.bitrate_bps = Some(value_bps);
    }

    pub fn update_packet_loss(&mut self, value_pct: f64) {
        self.packet_loss_pct = Some(value_pct);
    }

    pub fn update_decode_time(&mut self, value_ms: f64) {
        self.decode_time_ms = Some(value_ms);
    }

    pub fn update_fps(&mut self, value_fps: f64) {
        self.fps = Some(value_fps);
    }

    pub fn update_audio_level(&mut self, value: f64) {
        self.audio_level = Some(value);
    }
}
