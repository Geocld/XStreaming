package com.xstreaming.webrtc;

import androidx.annotation.Nullable;

import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoDecoderFactory;

import org.webrtc.EglBase;
import org.webrtc.VideoCodecInfo;
import org.webrtc.VideoDecoder;
import org.webrtc.VideoDecoderFactory;

public class LowLatencyVideoDecoderFactory implements VideoDecoderFactory {
    private final VideoDecoderFactory delegate;

    public LowLatencyVideoDecoderFactory(@Nullable EglBase.Context eglContext) {
        delegate = new H264AndSoftwareVideoDecoderFactory(eglContext);
    }

    @Nullable
    @Override
    public VideoDecoder createDecoder(VideoCodecInfo codecInfo) {
        VideoDecoder decoder = delegate.createDecoder(codecInfo);
        if (decoder == null) {
            return null;
        }

        if (codecInfo != null && codecInfo.name != null && codecInfo.name.equalsIgnoreCase("H264")) {
            return new LowLatencyVideoDecoder(decoder);
        }

        return decoder;
    }

    @Override
    public VideoCodecInfo[] getSupportedCodecs() {
        return delegate.getSupportedCodecs();
    }
}
