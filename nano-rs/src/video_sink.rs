pub trait VideoFrameSink: Send + Sync {
    fn push_h264_access_unit(&self, data: &[u8], pts_us: i64, keyframe: bool);

    fn drop_pending_output(&self, _reason: &str) {}
}
