pub trait AudioFrameSink {
    fn push_opus_frame(&self, data: &[u8], pts_us: i64, sample_rate: u32, channels: u16);
}
