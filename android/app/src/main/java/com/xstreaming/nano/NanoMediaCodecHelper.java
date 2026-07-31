package com.xstreaming.nano;

import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.os.Build;

import androidx.annotation.Nullable;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

final class NanoMediaCodecHelper {
    private static final List<String> SOFTWARE_DECODER_PREFIXES = Arrays.asList(
            "omx.google",
            "avcdecoder",
            "omx.ffmpeg",
            "c2.android"
    );

    private NanoMediaCodecHelper() {}

    @Nullable
    static String getPreferredDecoderName(String mime) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.ALL_CODECS).getCodecInfos()) {
            if (isCandidateDecoder(info, mime) && decoderSupportsLowLatency(info.getName(), mime)) {
                return info.getName();
            }
        }
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.ALL_CODECS).getCodecInfos()) {
            if (isCandidateDecoder(info, mime)) {
                return info.getName();
            }
        }
        return null;
    }

    static boolean decoderSupportsLowLatency(@Nullable String codecName, @Nullable String mime) {
        if (codecName == null || mime == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return false;
        }
        try {
            MediaCodecInfo info = findCodecInfoByName(codecName);
            if (info == null) {
                return false;
            }
            MediaCodecInfo.CodecCapabilities caps = info.getCapabilitiesForType(mime);
            return caps != null && caps.isFeatureSupported("low-latency");
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static boolean isCandidateDecoder(MediaCodecInfo info, String mime) {
        if (info.isEncoder()) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info.isAlias()) {
            return false;
        }
        if (!supportsType(info, mime)) {
            return false;
        }
        return !isSoftwareDecoder(info);
    }

    private static boolean supportsType(MediaCodecInfo info, String mime) {
        for (String type : info.getSupportedTypes()) {
            if (type.equalsIgnoreCase(mime)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isSoftwareDecoder(MediaCodecInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info.isSoftwareOnly()) {
            return true;
        }
        String lower = info.getName().toLowerCase(Locale.US);
        for (String prefix : SOFTWARE_DECODER_PREFIXES) {
            if (lower.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    @Nullable
    private static MediaCodecInfo findCodecInfoByName(String codecName) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.ALL_CODECS).getCodecInfos()) {
            if (info.getName().equalsIgnoreCase(codecName)) {
                return info;
            }
        }
        return null;
    }
}
