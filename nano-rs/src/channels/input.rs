use super::{ChannelKind, ChannelSpec};

pub const INPUT_CHANNEL: ChannelSpec = ChannelSpec {
    kind: ChannelKind::Input,
    name: "input",
    ordered: true,
    protocol: "1.0",
};

pub fn spec() -> ChannelSpec {
    INPUT_CHANNEL
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputFrame {
    pub gamepad_index: u8,
    pub nexus: u8,
    pub menu: u8,
    pub view: u8,
    pub a: u8,
    pub b: u8,
    pub x: u8,
    pub y: u8,
    pub dpad_up: u8,
    pub dpad_down: u8,
    pub dpad_left: u8,
    pub dpad_right: u8,
    pub left_shoulder: u8,
    pub right_shoulder: u8,
    pub left_thumb: u8,
    pub right_thumb: u8,
    pub left_thumb_x_axis: f32,
    pub left_thumb_y_axis: f32,
    pub right_thumb_x_axis: f32,
    pub right_thumb_y_axis: f32,
    pub left_trigger: f32,
    pub right_trigger: f32,
    pub physical_physicality: Option<u32>,
    pub virtual_physicality: Option<u32>,
}

impl Default for InputFrame {
    fn default() -> Self {
        Self {
            gamepad_index: 0,
            nexus: 0,
            menu: 0,
            view: 0,
            a: 0,
            b: 0,
            x: 0,
            y: 0,
            dpad_up: 0,
            dpad_down: 0,
            dpad_left: 0,
            dpad_right: 0,
            left_shoulder: 0,
            right_shoulder: 0,
            left_thumb: 0,
            right_thumb: 0,
            left_thumb_x_axis: 0.0,
            left_thumb_y_axis: 0.0,
            right_thumb_x_axis: 0.0,
            right_thumb_y_axis: 0.0,
            left_trigger: 0.0,
            right_trigger: 0.0,
            physical_physicality: None,
            virtual_physicality: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PointerWireData {
    pub height: f32,
    pub pressure: f32,
    pub twist: f32,
    pub width: f32,
    pub pointer_id: u32,
    pub x: f32,
    pub y: f32,
    pub event_type: PointerType,
    pub client_height: Option<u32>,
    pub client_width: Option<u32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PointerFrame {
    pub events: Vec<PointerWireData>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PointerType {
    Unknown = 0,
    PointerDown = 1,
    PointerUp = 2,
    PointerMove = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportType {
    None = 0,
    Metadata = 1,
    Gamepad = 2,
    Pointer = 4,
    ClientMetadata = 8,
    ServerMetadata = 16,
    Mouse = 32,
    Keyboard = 64,
    Vibration = 128,
    Sensor = 256,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GamepadInputPhysicality {
    None = 0x00000000,
    DPadUp = 0x00000001,
    DPadDown = 0x00000002,
    DPadLeft = 0x00000004,
    DPadRight = 0x00000008,
    Menu = 0x00000010,
    View = 0x00000020,
    LeftThumb = 0x00000040,
    RightThumb = 0x00000080,
    LeftShoulder = 0x00000100,
    RightShoulder = 0x00000200,
    Nexus = 0x00000400,
    Misc = 0x00000800,
    A = 0x00001000,
    B = 0x00002000,
    X = 0x00004000,
    Y = 0x00008000,
    LeftTrigger = 0x00010000,
    RightTrigger = 0x00020000,
    LeftThumbXAxis = 0x00040000,
    LeftThumbYAxis = 0x00080000,
    RightThumbXAxis = 0x00100000,
    RightThumbYAxis = 0x00200000,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputPacket {
    report_type: u16,
    sequence: u32,
    metadata_frames: Vec<MetadataFrame>,
    gamepad_frames: Vec<InputFrame>,
    pointer_frames: Vec<PointerFrame>,
    server_width: u32,
    server_height: u32,
    max_touchpoints: u8,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MetadataFrame {
    pub server_data_key: u32,
    pub first_frame_packet_arrival_time_ms: u32,
    pub frame_submitted_time_ms: u32,
    pub frame_decoded_time_ms: u32,
    pub frame_rendered_time_ms: u32,
}

impl InputPacket {
    pub fn client_metadata(sequence: u32, max_touchpoints: u8) -> Self {
        Self {
            report_type: ReportType::ClientMetadata as u16,
            sequence,
            metadata_frames: Vec::new(),
            gamepad_frames: Vec::new(),
            pointer_frames: Vec::new(),
            server_width: 1920,
            server_height: 1080,
            max_touchpoints,
        }
    }

    pub fn with_data(
        sequence: u32,
        metadata_frames: Vec<MetadataFrame>,
        gamepad_frames: Vec<InputFrame>,
        pointer_frames: Vec<PointerFrame>,
        server_width: u32,
        server_height: u32,
    ) -> Self {
        let mut report_type = ReportType::None as u16;
        if !metadata_frames.is_empty() {
            report_type |= ReportType::Metadata as u16;
        }
        if !gamepad_frames.is_empty() {
            report_type |= ReportType::Gamepad as u16;
        }
        if !pointer_frames.is_empty() {
            report_type |= ReportType::Pointer as u16;
        }

        Self {
            report_type,
            sequence,
            metadata_frames,
            gamepad_frames,
            pointer_frames,
            server_width: server_width.max(1),
            server_height: server_height.max(1),
            max_touchpoints: 0,
        }
    }

    pub fn to_bytes(&self, timestamp_ms: f64) -> Vec<u8> {
        let mut total_size = 14;
        if !self.metadata_frames.is_empty() {
            total_size += 1 + 28 * self.metadata_frames.len();
        }
        if !self.gamepad_frames.is_empty() {
            total_size += 1 + 23 * self.gamepad_frames.len();
        }
        if !self.pointer_frames.is_empty() {
            total_size += 1 + self
                .pointer_frames
                .iter()
                .map(|frame| 1 + 20 * frame.events.len())
                .sum::<usize>();
        }
        if self.report_type == ReportType::ClientMetadata as u16 {
            total_size += 1;
        }

        let mut packet = vec![0u8; total_size];
        write_u16(&mut packet, 0, self.report_type);
        write_u32(&mut packet, 2, self.sequence);
        write_f64(&mut packet, 6, timestamp_ms);

        let mut offset = 14;
        if !self.metadata_frames.is_empty() {
            packet[offset] = self.metadata_frames.len() as u8;
            offset += 1;
            for frame in &self.metadata_frames {
                write_u32(&mut packet, offset, frame.server_data_key);
                write_u32(
                    &mut packet,
                    offset + 4,
                    frame.first_frame_packet_arrival_time_ms,
                );
                write_u32(&mut packet, offset + 8, frame.frame_submitted_time_ms);
                write_u32(&mut packet, offset + 12, frame.frame_decoded_time_ms);
                write_u32(&mut packet, offset + 16, frame.frame_rendered_time_ms);
                write_u32(
                    &mut packet,
                    offset + 20,
                    timestamp_ms.round().max(0.0) as u32,
                );
                write_u32(
                    &mut packet,
                    offset + 24,
                    timestamp_ms.round().max(0.0) as u32,
                );
                offset += 28;
            }
        }

        if !self.gamepad_frames.is_empty() {
            packet[offset] = self.gamepad_frames.len() as u8;
            offset += 1;
            for frame in &self.gamepad_frames {
                packet[offset] = frame.gamepad_index;
                offset += 1;

                let mut button_mask = 0u16;
                if frame.nexus > 0 {
                    button_mask |= 2;
                }
                if frame.menu > 0 {
                    button_mask |= 4;
                }
                if frame.view > 0 {
                    button_mask |= 8;
                }
                if frame.a > 0 {
                    button_mask |= 16;
                }
                if frame.b > 0 {
                    button_mask |= 32;
                }
                if frame.x > 0 {
                    button_mask |= 64;
                }
                if frame.y > 0 {
                    button_mask |= 128;
                }
                if frame.dpad_up > 0 {
                    button_mask |= 256;
                }
                if frame.dpad_down > 0 {
                    button_mask |= 512;
                }
                if frame.dpad_left > 0 {
                    button_mask |= 1024;
                }
                if frame.dpad_right > 0 {
                    button_mask |= 2048;
                }
                if frame.left_shoulder > 0 {
                    button_mask |= 4096;
                }
                if frame.right_shoulder > 0 {
                    button_mask |= 8192;
                }
                if frame.left_thumb > 0 {
                    button_mask |= 16384;
                }
                if frame.right_thumb > 0 {
                    button_mask |= 32768;
                }

                write_u16(&mut packet, offset, button_mask);
                write_i16(
                    &mut packet,
                    offset + 2,
                    normalize_axis_value(frame.left_thumb_x_axis),
                );
                write_i16(
                    &mut packet,
                    offset + 4,
                    normalize_axis_value(-frame.left_thumb_y_axis),
                );
                write_i16(
                    &mut packet,
                    offset + 6,
                    normalize_axis_value(frame.right_thumb_x_axis),
                );
                write_i16(
                    &mut packet,
                    offset + 8,
                    normalize_axis_value(-frame.right_thumb_y_axis),
                );
                write_u16(
                    &mut packet,
                    offset + 10,
                    normalize_trigger_value(frame.left_trigger),
                );
                write_u16(
                    &mut packet,
                    offset + 12,
                    normalize_trigger_value(frame.right_trigger),
                );
                write_u32(
                    &mut packet,
                    offset + 14,
                    frame
                        .physical_physicality
                        .unwrap_or_else(|| calculate_gamepad_physicality(frame)),
                );
                write_u32(
                    &mut packet,
                    offset + 18,
                    frame.virtual_physicality.unwrap_or(0),
                );
                offset += 22;
            }
        }

        if !self.pointer_frames.is_empty() {
            packet[offset] = self.pointer_frames.len() as u8;
            offset += 1;
            for frame in &self.pointer_frames {
                packet[offset] = frame.events.len() as u8;
                offset += 1;
                for event in &frame.events {
                    write_u16(
                        &mut packet,
                        offset,
                        clamp_u16_f32(
                            (event.height * self.server_height as f32)
                                / event.client_height.unwrap_or(1) as f32,
                        ),
                    );
                    write_u16(
                        &mut packet,
                        offset + 2,
                        clamp_u16_f32(
                            (event.width * self.server_width as f32)
                                / event.client_width.unwrap_or(1) as f32,
                        ),
                    );
                    packet[offset + 4] = clamp_u8(event.pressure * 255.0);
                    write_u16(&mut packet, offset + 5, clamp_u16_f32(event.twist));
                    write_u32(&mut packet, offset + 7, event.pointer_id);
                    write_u32(
                        &mut packet,
                        offset + 11,
                        clamp_u32(
                            (event.x * self.server_width as f32)
                                / event.client_width.unwrap_or(1) as f32,
                        ),
                    );
                    write_u32(
                        &mut packet,
                        offset + 15,
                        clamp_u32(
                            (event.y * self.server_height as f32)
                                / event.client_height.unwrap_or(1) as f32,
                        ),
                    );
                    packet[offset + 19] = event.event_type as u8;
                    offset += 20;
                }
            }
        }

        if self.report_type == ReportType::ClientMetadata as u16 {
            packet[offset] = self.max_touchpoints;
        }

        packet
    }
}

fn normalize_trigger_value(value: f32) -> u16 {
    if value < 0.0 {
        0
    } else {
        clamp_u16_f32(65535.0 * value)
    }
}

fn normalize_axis_value(value: f32) -> i16 {
    let scaled = value * 32767.0;
    scaled.clamp(-32767.0, 32767.0) as i16
}

fn calculate_gamepad_physicality(frame: &InputFrame) -> u32 {
    let mut physicality = GamepadInputPhysicality::None as u32;
    if frame.dpad_up > 0 {
        physicality |= GamepadInputPhysicality::DPadUp as u32;
    }
    if frame.dpad_down > 0 {
        physicality |= GamepadInputPhysicality::DPadDown as u32;
    }
    if frame.dpad_left > 0 {
        physicality |= GamepadInputPhysicality::DPadLeft as u32;
    }
    if frame.dpad_right > 0 {
        physicality |= GamepadInputPhysicality::DPadRight as u32;
    }
    if frame.menu > 0 {
        physicality |= GamepadInputPhysicality::Menu as u32;
    }
    if frame.view > 0 {
        physicality |= GamepadInputPhysicality::View as u32;
    }
    if frame.left_thumb > 0 {
        physicality |= GamepadInputPhysicality::LeftThumb as u32;
    }
    if frame.right_thumb > 0 {
        physicality |= GamepadInputPhysicality::RightThumb as u32;
    }
    if frame.left_shoulder > 0 {
        physicality |= GamepadInputPhysicality::LeftShoulder as u32;
    }
    if frame.right_shoulder > 0 {
        physicality |= GamepadInputPhysicality::RightShoulder as u32;
    }
    if frame.nexus > 0 {
        physicality |= GamepadInputPhysicality::Nexus as u32;
    }
    if frame.a > 0 {
        physicality |= GamepadInputPhysicality::A as u32;
    }
    if frame.b > 0 {
        physicality |= GamepadInputPhysicality::B as u32;
    }
    if frame.x > 0 {
        physicality |= GamepadInputPhysicality::X as u32;
    }
    if frame.y > 0 {
        physicality |= GamepadInputPhysicality::Y as u32;
    }
    if frame.left_trigger > 0.0 {
        physicality |= GamepadInputPhysicality::LeftTrigger as u32;
    }
    if frame.right_trigger > 0.0 {
        physicality |= GamepadInputPhysicality::RightTrigger as u32;
    }
    if frame.left_thumb_x_axis.abs() > 0.0 {
        physicality |= GamepadInputPhysicality::LeftThumbXAxis as u32;
    }
    if frame.left_thumb_y_axis.abs() > 0.0 {
        physicality |= GamepadInputPhysicality::LeftThumbYAxis as u32;
    }
    if frame.right_thumb_x_axis.abs() > 0.0 {
        physicality |= GamepadInputPhysicality::RightThumbXAxis as u32;
    }
    if frame.right_thumb_y_axis.abs() > 0.0 {
        physicality |= GamepadInputPhysicality::RightThumbYAxis as u32;
    }

    physicality
}

fn clamp_u8(value: f32) -> u8 {
    if !value.is_finite() {
        return 0;
    }
    value.round().clamp(0.0, 255.0) as u8
}

fn clamp_u16_f32(value: f32) -> u16 {
    if !value.is_finite() {
        return 0;
    }
    value.round().clamp(0.0, u16::MAX as f32) as u16
}

fn clamp_u32(value: f32) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    value.round().clamp(0.0, u32::MAX as f32) as u32
}

fn write_u16(buf: &mut [u8], offset: usize, value: u16) {
    buf[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn write_i16(buf: &mut [u8], offset: usize, value: i16) {
    buf[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn write_u32(buf: &mut [u8], offset: usize, value: u32) {
    buf[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn write_f64(buf: &mut [u8], offset: usize, value: f64) {
    buf[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}
