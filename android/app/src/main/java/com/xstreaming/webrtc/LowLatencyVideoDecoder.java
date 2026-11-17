package com.xstreaming.webrtc;

import android.media.MediaFormat;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;

import org.webrtc.EncodedImage;
import org.webrtc.VideoCodecStatus;
import org.webrtc.VideoDecoder;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Locale;

class LowLatencyVideoDecoder implements VideoDecoder {
    private static final String TAG = "LowLatencyDecoder";
    private static final int OPERATING_RATE = 0x7FFF;

    private final VideoDecoder delegate;
    private boolean patched;

    private int streamWidth = 1920;
    private int streamHeight = 1080;

    LowLatencyVideoDecoder(VideoDecoder delegate) {
        this.delegate = delegate;
    }

    @Override
    public VideoCodecStatus initDecode(Settings settings, Callback decodeCallback) {
        if (settings != null) {
            streamWidth = settings.width > 0 ? settings.width : 1920;
            streamHeight = settings.height > 0 ? settings.height : 1080;
        }
        if (com.xstreaming.MainActivity.instance != null && com.xstreaming.LowLatencyDecoderConfig.isEnabled(com.xstreaming.MainActivity.instance)) {
            patchMediaCodecWrapperFactory();
        }
        return delegate.initDecode(settings, decodeCallback);
    }

    @Override
    public VideoCodecStatus release() {
        return delegate.release();
    }

    @Override
    public long createNative(long nativePeerConnectionFactory) {
        return delegate.createNative(nativePeerConnectionFactory);
    }

    @Override
    public VideoCodecStatus decode(EncodedImage frame, DecodeInfo info) {
        if (frame != null && frame.buffer != null) {
            try {
                boolean isKey = frame.frameType == EncodedImage.FrameType.VideoFrameKey;
                if (isKey) {
                    com.xstreaming.recording.GameRecorder.getInstance().cacheSpsPps(frame.buffer);
                }
                if (com.xstreaming.recording.GameRecorder.getInstance().isRecording()) {
                    int width = frame.encodedWidth > 0 ? frame.encodedWidth : streamWidth;
                    int height = frame.encodedHeight > 0 ? frame.encodedHeight : streamHeight;
                    long ptsUs = frame.captureTimeNs > 0 ? frame.captureTimeNs / 1000L : System.nanoTime() / 1000L;
                    com.xstreaming.recording.GameRecorder.getInstance().feedVideoFrame(
                            frame.buffer,
                            ptsUs,
                            isKey,
                            width,
                            height
                    );
                }
            } catch (Throwable t) {
                Log.w(TAG, "Error recording video frame", t);
            }
        }
        return delegate.decode(frame, info);
    }

    @Override
    public String getImplementationName() {
        return delegate.getImplementationName();
    }

    private void patchMediaCodecWrapperFactory() {
        if (patched) {
            return;
        }
        patched = true;

        try {
            Field factoryField = findMediaCodecWrapperFactoryField(delegate.getClass());
            if (factoryField == null) {
                Log.w(TAG, "MediaCodecWrapperFactory field not found on " + delegate.getClass().getName());
                return;
            }

            factoryField.setAccessible(true);
            Object originalFactory = factoryField.get(delegate);
            if (originalFactory == null) {
                Log.w(TAG, "MediaCodecWrapperFactory is null on " + delegate.getClass().getName());
                return;
            }

            Class<?> factoryInterface = factoryField.getType();
            Object proxyFactory = Proxy.newProxyInstance(
                    factoryInterface.getClassLoader(),
                    new Class<?>[]{factoryInterface},
                    new MediaCodecWrapperFactoryHandler(originalFactory)
            );
            factoryField.set(delegate, proxyFactory);
            Log.i(TAG, "Installed low latency MediaCodec wrapper for " + delegate.getClass().getName());
        } catch (Throwable tr) {
            Log.w(TAG, "Failed to install low latency MediaCodec wrapper.", tr);
        }
    }

    @Nullable
    private static Field findMediaCodecWrapperFactoryField(Class<?> clazz) {
        Class<?> current = clazz;
        while (current != null) {
            for (Field field : current.getDeclaredFields()) {
                if ("org.webrtc.MediaCodecWrapperFactory".equals(field.getType().getName())
                        || field.getName().toLowerCase(Locale.US).contains("mediacodecwrapperfactory")) {
                    return field;
                }
            }
            current = current.getSuperclass();
        }
        return null;
    }

    private static class MediaCodecWrapperFactoryHandler implements InvocationHandler {
        private final Object delegateFactory;

        MediaCodecWrapperFactoryHandler(Object delegateFactory) {
            this.delegateFactory = delegateFactory;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            Object result = invokeDelegate(delegateFactory, method, args);
            if (!"createByCodecName".equals(method.getName()) || result == null) {
                return result;
            }

            String codecName = args != null && args.length > 0 && args[0] instanceof String
                    ? (String) args[0]
                    : "";
            Class<?> codecWrapperInterface = result.getClass().getInterfaces().length > 0
                    ? result.getClass().getInterfaces()[0]
                    : null;
            if (codecWrapperInterface == null
                    || !"org.webrtc.MediaCodecWrapper".equals(codecWrapperInterface.getName())) {
                codecWrapperInterface = findInterface(result.getClass(), "org.webrtc.MediaCodecWrapper");
            }

            if (codecWrapperInterface == null) {
                Log.w(TAG, "MediaCodecWrapper interface not found on " + result.getClass().getName());
                return result;
            }

            return Proxy.newProxyInstance(
                    codecWrapperInterface.getClassLoader(),
                    new Class<?>[]{codecWrapperInterface},
                    new MediaCodecWrapperHandler(result, codecName)
            );
        }
    }

    @Nullable
    private static Class<?> findInterface(Class<?> clazz, String interfaceName) {
        Class<?> current = clazz;
        while (current != null) {
            for (Class<?> item : current.getInterfaces()) {
                if (interfaceName.equals(item.getName())) {
                    return item;
                }
            }
            current = current.getSuperclass();
        }
        return null;
    }

    private static class MediaCodecWrapperHandler implements InvocationHandler {
        private final Object delegateCodec;
        private final String codecName;

        MediaCodecWrapperHandler(Object delegateCodec, String codecName) {
            this.delegateCodec = delegateCodec;
            this.codecName = codecName == null ? "" : codecName;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if ("configure".equals(method.getName())
                    && args != null
                    && args.length > 0
                    && args[0] instanceof MediaFormat) {
                applyLowLatencyFormat((MediaFormat) args[0], codecName);
            }
            return invokeDelegate(delegateCodec, method, args);
        }
    }

    private static Object invokeDelegate(Object target, Method method, Object[] args) throws Throwable {
        try {
            method.setAccessible(true);
            return method.invoke(target, args);
        } catch (InvocationTargetException ex) {
            throw ex.getCause() == null ? ex : ex.getCause();
        } catch (SecurityException ex) {
            return method.invoke(target, args);
        }
    }

    private static void applyLowLatencyFormat(MediaFormat format, String codecName) {
        putInt(format, "low-latency", 1);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            putInt(format, "priority", 0);
            putInt(format, "operating-rate", OPERATING_RATE);
        }

        putInt(format, "allow-frame-drop", 1);
        putInt(format, "vdec-lowlatency", 1);
        putInt(format, "vendor.low-latency.enable", 1);

        String normalizedCodecName = codecName == null ? "" : codecName.toLowerCase(Locale.US);
        if (isQualcommDecoder(normalizedCodecName)) {
            putInt(format, "vendor.qti-ext-dec-picture-order.enable", 1);
            putInt(format, "vendor.qti-ext-dec-low-latency.enable", 1);
            putInt(format, "vendor.rtc-ext-dec-low-latency.enable", 1);
        }

        if (isHiSiliconDecoder(normalizedCodecName)) {
            putInt(format, "vendor.hisi-ext-low-latency-video-dec.video-scene-for-low-latency-req", 1);
            putInt(format, "vendor.hisi-ext-low-latency-video-dec.video-scene-for-low-latency-rdy", -1);
            putInt(format, "vendor.hisi-ext-dec-low-latency.enable", 1);
            putInt(format, "vendor.hisi-ext-dec-output-order.enable", 1);
            putInt(format, "vendor.hisi-ext-dec-realtime.enable", 1);
        }

        if (isMediaTekDecoder(normalizedCodecName)) {
            applyMediaTekLowLatencyFormat(format);
        }

        if (isExynosDecoder(normalizedCodecName)) {
            putInt(format, "vendor.rtc-ext-dec-low-latency.enable", 1);
            putInt(format, "vendor.sec.dec.low-latency.enable", 1);
            putInt(format, "vendor.sec.dec.realtime.enable", 1);
            putInt(format, "vendor.sec.dec.output-order.enable", 1);
        }

        if (isAmlogicDecoder(normalizedCodecName)) {
            putInt(format, "vendor.amlogic.lowlatency.mode", 1);
            putInt(format, "vendor.amlogic.tunnel.mode", 0);
            putInt(format, "vendor.amlogic.frame-skip.enable", 0);
        }

        if (isTegraDecoder(normalizedCodecName)) {
            putInt(format, "vendor.nvidia.low-latency.enable", 1);
            putInt(format, "vendor.nvidia.realtime.enable", 1);
            putInt(format, "vendor.nvidia.game-streaming.enable", 1);
        }

        Log.i(TAG, "Applied low latency decoder format for codec=" + codecName);
    }

    private static void applyMediaTekLowLatencyFormat(MediaFormat format) {
        putInt(format, "vendor.mtk.vdec.cpu.boost.mode", 1);
        putInt(format, "vendor.mtk.vdec.cpu.boost.mode.value", 2);
        putInt(format, "vendor.mtk.ext.dolby.vision.cpu-boost", 1);
        putInt(format, "vendor.mtk.vdec.dvfs.mode", 1);
        putInt(format, "vendor.mtk.vdec.dvfs.level", 1);
        putInt(format, "vendor.mtk.vdec.bq.guard.interval.time.value", 2);
        putInt(format, "vendor.mtk.vdec.buffer.fetch.timeout.ms.value", 2);
        putInt(format, "vendor.mtk.vdec.vsync.adjust.enable", 0);
        putInt(format, "vendor.mtk.vdec.buffer.fetch.timeout.ms", 4);
        putInt(format, "vendor.mtk.vdec.bq.guard.interval.time", 4);
        putInt(format, "vendor.mtk.vdec.input.max.queue.depth", 3);
        putInt(format, "vendor.mtk.vdec.output.max.queue.depth", 3);
        putInt(format, "vendor.mtk.vdec.low-latency.mode", 1);
        putInt(format, "vendor.mtk.vdec.ultra-low-latency", 0);
        putInt(format, "vendor.mtk.vdec.disable-idle", 1);
        putInt(format, "vendor.mtk.vdec.preload.frame.count", 1);
        putInt(format, "vendor.mtk.vdec.realtime.priority", 1);
        putInt(format, "vendor.mtk.vdec.no-reorder", 1);
        putInt(format, "vendor.mtk.vdec.decode-immediately", 1);
        putInt(format, "vendor.mtk.vdec.force-max-freq", 1);
    }

    private static boolean isQualcommDecoder(String codecName) {
        return codecName.contains("qcom") || codecName.contains("qti");
    }

    private static boolean isMediaTekDecoder(String codecName) {
        return codecName.startsWith("omx.mtk") || codecName.startsWith("c2.mtk");
    }

    private static boolean isExynosDecoder(String codecName) {
        return codecName.startsWith("omx.exynos") || codecName.startsWith("c2.exynos");
    }

    private static boolean isAmlogicDecoder(String codecName) {
        return codecName.startsWith("omx.amlogic") || codecName.startsWith("c2.amlogic");
    }

    private static boolean isTegraDecoder(String codecName) {
        return codecName.startsWith("omx.nvidia") || codecName.startsWith("c2.nvidia");
    }

    private static boolean isHiSiliconDecoder(String codecName) {
        String hardware = Build.HARDWARE == null ? "" : Build.HARDWARE.toLowerCase(Locale.US);
        String board = Build.BOARD == null ? "" : Build.BOARD.toLowerCase(Locale.US);
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.US);
        return codecName.contains("hisi")
                || codecName.contains("kirin")
                || hardware.contains("hisi")
                || hardware.contains("kirin")
                || board.contains("hisi")
                || board.contains("kirin")
                || manufacturer.contains("huawei");
    }

    private static void putInt(MediaFormat format, String key, int value) {
        try {
            format.setInteger(key, value);
        } catch (Throwable tr) {
            Log.w(TAG, "Failed to set MediaFormat key " + key, tr);
        }
    }
}
