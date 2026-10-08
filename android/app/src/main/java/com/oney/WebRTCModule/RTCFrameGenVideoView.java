package com.oney.WebRTCModule;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.graphics.SurfaceTexture;
import android.hardware.HardwareBuffer;
import android.media.Image;
import android.media.ImageReader;
import android.opengl.GLES20;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.ViewGroup;

import androidx.core.view.ViewCompat;
import androidx.media3.common.util.GlUtil.GlException;
import androidx.media3.common.util.UnstableApi;

import com.facebook.react.bridge.ReactContext;
import com.lsfg.android.session.NativeBridge;
import com.xstreaming.framegen.FrameGenExportProcessor;
import com.xstreaming.framegen.FrameGenLog;
import com.xstreaming.framegen.LsfgRuntime;
import com.xstreaming.fsr.FsrVideoProcessor;
import com.xstreaming.gl.VideoProcessingGLSurfaceView;

import org.webrtc.EglBase;
import org.webrtc.Logging;
import org.webrtc.MediaStream;
import org.webrtc.RendererCommon;
import org.webrtc.RendererCommon.RendererEvents;
import org.webrtc.RendererCommon.ScalingType;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoTrack;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Objects;

@UnstableApi
public class RTCFrameGenVideoView extends ViewGroup {
    private static final ScalingType DEFAULT_SCALING_TYPE = ScalingType.SCALE_ASPECT_FIT;
    private static final String TAG = "RTCFrameGenVideoView";
    private static final int VIDEO_FORMAT_MODE_AUTO = 0;
    private static final int VIDEO_FORMAT_MODE_STRETCH = 1;
    private static final int VIDEO_FORMAT_MODE_ZOOM = 2;
    private static final int VIDEO_FORMAT_MODE_FIXED_RATIO = 3;
    private static final int EXPORT_QUEUE_DEPTH = 5;
    private static final int EXPORT_BACKLOG_KEEP_FRAMES = 2;
    private static final int DEBUG_FRAME_LOG_LIMIT = 12;
    private static final long DISPLAY_MONITOR_INTERVAL_MS = 500L;
    private static final long DISPLAY_STALL_FALLBACK_MS = 1500L;
    private static final int DRAW_LOG_LIMIT = 12;
    private static final int[] FRAMEGEN_EGL_CONFIG = EglBase.CONFIG_RECORDABLE;

    private static int surfaceViewRendererInstances;
    private static final Object EGL_LAYOUT_ASPECT_REFLECTION_LOCK = new Object();
    private static Field surfaceViewRendererEglRendererField;
    private static Method eglRendererSetLayoutAspectRatioMethod;
    private static boolean eglLayoutAspectReflectionReady;

    private final Object layoutSyncRoot = new Object();
    private final SurfaceViewRenderer inputRenderer;
    private final FsrVideoProcessor outputVideoProcessor;
    private final VideoProcessingGLSurfaceView outputDisplayView;
    private final FrameGenExportProcessor exportProcessor;

    private int frameHeight;
    private int frameRotation;
    private int frameWidth;
    private boolean mirror;
    private boolean rendererAttached;
    private ScalingType scalingType;
    private int videoFormatMode = VIDEO_FORMAT_MODE_AUTO;
    private float videoFormatAspectRatio;
    private String videoFormat = "";
    private boolean eglLayoutAspectReflectionFailed;
    private String streamURL;
    private VideoTrack videoTrack;

    private boolean fsrEnabled;
    private float fsrSharpness = 2f;
    private boolean logVerbose;
    private boolean framegenFp16;
    private int videoFps = 60;

    private boolean framegenActive;
    private boolean framegenDisplayActive;
    private boolean framegenUnavailable;
    private boolean bootstrapInProgress;
    private boolean exportProcessorInitialized;
    private boolean pendingDisplayModeLayout;
    private boolean displayMonitorScheduled;
    private long lastObservedPostedFrameCount;
    private long lastPostedFrameProgressMs;
    private Object framegenDrawerProxy;
    private Object fallbackDrawer;

    private ImageReader inputReader;
    private HandlerThread inputThread;
    private Handler inputHandler;
    private int exportedFrameLogCount;
    private int drawLogCount;
    private long lastStableTimestampNs = Long.MIN_VALUE;
    private Surface pendingExportSurface;
    private int pendingExportWidth;
    private int pendingExportHeight;

    private SurfaceTexture outputSurfaceTexture;
    private Surface outputSurface;
    private int outputSurfaceWidth;
    private int outputSurfaceHeight;
    private Surface lastBoundOutputSurface;
    private int lastBoundOutputWidth;
    private int lastBoundOutputHeight;
    private boolean outputSurfaceReady;

    private final RendererEvents rendererEvents = new RendererEvents() {
        @Override
        public void onFirstFrameRendered() {
            RTCFrameGenVideoView.this.onFirstFrameRendered();
        }

        @Override
        public void onFrameResolutionChanged(int videoWidth, int videoHeight, int rotation) {
            RTCFrameGenVideoView.this.onFrameResolutionChanged(videoWidth, videoHeight, rotation);
        }
    };

    private final Runnable requestLayoutRunnable = this::requestRendererLayout;
    private final Runnable framegenDisplayMonitorRunnable = () -> {
        displayMonitorScheduled = false;
        monitorFramegenDisplay();
    };

    public RTCFrameGenVideoView(Context context) {
        super(context);

        FrameGenLog.init(context);
        exportProcessor = new FrameGenExportProcessor(context.getApplicationContext());

        inputRenderer = new SurfaceViewRenderer(context);
        inputRenderer.setBackgroundColor(Color.BLACK);
        addView(inputRenderer);

        outputVideoProcessor = new FsrVideoProcessor(context.getApplicationContext());
        outputVideoProcessor.setFsrEnabled(false);
        outputDisplayView = new VideoProcessingGLSurfaceView(
                context,
                false,
                outputVideoProcessor,
                new VideoProcessingGLSurfaceView.SurfaceListener() {
                    @Override
                    public void onInputSurfaceAvailable(SurfaceTexture surfaceTexture) {
                        attachOutputSurface(surfaceTexture);
                    }

                    @Override
                    public void onInputSurfaceDestroyed() {
                        detachOutputSurface();
                    }
                }
        );
        addView(outputDisplayView);

        setMirror(false);
        setScalingType(DEFAULT_SCALING_TYPE);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        outputDisplayView.onResume();
        tryAddRendererToVideoTrack();
    }

    @Override
    protected void onDetachedFromWindow() {
        try {
            removeRendererFromVideoTrack();
            releaseInputReader();
            teardownLsfg();
            stopFramegenDisplayMonitor();
            outputDisplayView.onPause();
        } finally {
            super.onDetachedFromWindow();
        }
    }

    private void onFirstFrameRendered() {
        post(() -> {
            Log.d(TAG, "First frame rendered (framegen view).");
            inputRenderer.setBackgroundColor(Color.TRANSPARENT);
        });
    }

    private void onFrameResolutionChanged(int videoWidth, int videoHeight, int rotation) {
        boolean changed = false;
        synchronized (layoutSyncRoot) {
            if (this.frameHeight != videoHeight) {
                this.frameHeight = videoHeight;
                changed = true;
            }
            if (this.frameRotation != rotation) {
                this.frameRotation = rotation;
                changed = true;
            }
            if (this.frameWidth != videoWidth) {
                this.frameWidth = videoWidth;
                changed = true;
            }
        }
        if (videoWidth > 0 && videoHeight > 0) {
            outputDisplayView.setFrameInputSize(videoWidth, videoHeight);
            applyOutputSurfaceBufferSize(videoWidth, videoHeight);
            if (framegenActive) {
                bindNativeOutputSurface();
            }
            maybeStartFramegen(videoWidth, videoHeight);
        }
        if (changed) {
            post(requestLayoutRunnable);
        }
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int height = b - t;
        int width = r - l;
        int childLeft = 0;
        int childTop = 0;
        int childRight = 0;
        int childBottom = 0;

        if (height > 0 && width > 0) {
            int frameHeight;
            int frameRotation;
            int frameWidth;
            ScalingType scalingType;
            int videoFormatMode;
            float videoFormatAspectRatio;

            synchronized (layoutSyncRoot) {
                frameHeight = this.frameHeight;
                frameRotation = this.frameRotation;
                frameWidth = this.frameWidth;
                scalingType = this.scalingType;
                videoFormatMode = this.videoFormatMode;
                videoFormatAspectRatio = this.videoFormatAspectRatio;
            }

            if (videoFormatMode == VIDEO_FORMAT_MODE_STRETCH) {
                childRight = width;
                childBottom = height;
            } else if (frameHeight > 0 && frameWidth > 0) {
                float frameAspectRatio = (frameRotation % 180 == 0)
                        ? frameWidth / (float) frameHeight
                        : frameHeight / (float) frameWidth;
                float targetAspectRatio = videoFormatMode == VIDEO_FORMAT_MODE_FIXED_RATIO
                        ? videoFormatAspectRatio
                        : frameAspectRatio;
                ScalingType layoutScalingType = videoFormatMode == VIDEO_FORMAT_MODE_ZOOM
                        ? ScalingType.SCALE_ASPECT_FILL
                        : scalingType;
                Point frameDisplaySize = RendererCommon.getDisplaySize(
                        layoutScalingType,
                        targetAspectRatio,
                        width,
                        height
                );
                childLeft = (width - frameDisplaySize.x) / 2;
                childTop = (height - frameDisplaySize.y) / 2;
                childRight = childLeft + frameDisplaySize.x;
                childBottom = childTop + frameDisplaySize.y;
            }
        }

        if (framegenDisplayActive) {
            outputDisplayView.setAlpha(1f);
            inputRenderer.layout(-1, -1, 0, 0);
            outputDisplayView.layout(childLeft, childTop, childRight, childBottom);
        } else {
            outputDisplayView.setAlpha(0f);
            inputRenderer.layout(childLeft, childTop, childRight, childBottom);
            outputDisplayView.layout(0, 0, 1, 1);
        }
        applyRendererLayoutAspectRatio(childRight - childLeft, childBottom - childTop);
        pendingDisplayModeLayout = false;
    }

    public void setMirror(boolean mirror) {
        if (this.mirror != mirror) {
            this.mirror = mirror;
            inputRenderer.setMirror(mirror);
            requestRendererLayout();
        }
    }

    public void setObjectFit(String objectFit) {
        ScalingType next = "cover".equals(objectFit)
                ? ScalingType.SCALE_ASPECT_FILL
                : ScalingType.SCALE_ASPECT_FIT;
        setScalingType(next);
    }

    public void setVideoFormat(String videoFormat) {
        String normalized = videoFormat == null ? "" : videoFormat.trim();
        if (Objects.equals(this.videoFormat, normalized)) {
            return;
        }

        this.videoFormat = normalized;
        synchronized (layoutSyncRoot) {
            if (normalized.isEmpty()) {
                videoFormatMode = VIDEO_FORMAT_MODE_AUTO;
                videoFormatAspectRatio = 0f;
            } else if ("Stretch".equals(normalized)) {
                videoFormatMode = VIDEO_FORMAT_MODE_STRETCH;
                videoFormatAspectRatio = 0f;
            } else if ("Zoom".equals(normalized)) {
                videoFormatMode = VIDEO_FORMAT_MODE_ZOOM;
                videoFormatAspectRatio = 0f;
            } else {
                float parsedRatio = parseVideoAspectRatio(normalized);
                if (parsedRatio > 0f) {
                    videoFormatMode = VIDEO_FORMAT_MODE_FIXED_RATIO;
                    videoFormatAspectRatio = parsedRatio;
                } else {
                    videoFormatMode = VIDEO_FORMAT_MODE_AUTO;
                    videoFormatAspectRatio = 0f;
                }
            }
        }
        requestRendererLayout();
    }

    void setStreamURL(String streamURL) {
        if (!Objects.equals(streamURL, this.streamURL)) {
            VideoTrack candidateTrack = getVideoTrackForStreamURL(streamURL);
            if (this.videoTrack != candidateTrack) {
                setVideoTrack(null);
            }
            this.streamURL = streamURL;
            setVideoTrack(candidateTrack);
        }
    }

    public void setZOrder(int zOrder) {
        switch (zOrder) {
            case 0:
                inputRenderer.setZOrderMediaOverlay(false);
                break;
            case 1:
                inputRenderer.setZOrderMediaOverlay(true);
                break;
            case 2:
                inputRenderer.setZOrderOnTop(true);
                break;
            default:
                break;
        }
    }

    public void setFsrEnabled(boolean enabled) {
        fsrEnabled = enabled;
        outputVideoProcessor.setFsrEnabled(enabled);
    }

    public void setFsrSharpness(float sharpness) {
        fsrSharpness = sharpness;
        outputVideoProcessor.setSharpness(sharpness / 10f);
    }

    public void setLogVerbose(boolean enabled) {
        logVerbose = enabled;
        FrameGenLog.configure(getContext(), enabled);
    }

    public void setFramegenFp16(boolean enabled) {
        framegenFp16 = enabled;
    }

    public void setVideoFps(int fps) {
        if (fps > 0) {
            videoFps = fps;
        }
    }

    private VideoTrack getVideoTrackForStreamURL(String streamURL) {
        VideoTrack result = null;
        if (streamURL != null) {
            ReactContext reactContext = (ReactContext) getContext();
            WebRTCModule module = reactContext.getNativeModule(WebRTCModule.class);
            MediaStream stream = module.getStreamForReactTag(streamURL);
            if (stream != null && !stream.videoTracks.isEmpty()) {
                result = stream.videoTracks.get(0);
            }
            if (result == null) {
                Log.w(TAG, "No video stream for react tag: " + streamURL);
            }
        }
        return result;
    }

    private void setVideoTrack(VideoTrack videoTrack) {
        VideoTrack oldVideoTrack = this.videoTrack;
        if (oldVideoTrack != videoTrack) {
            if (oldVideoTrack != null) {
                if (videoTrack == null) {
                    cleanInputRenderer();
                }
                removeRendererFromVideoTrack();
            }
            this.videoTrack = videoTrack;
            if (videoTrack != null) {
                tryAddRendererToVideoTrack();
                if (oldVideoTrack == null) {
                    cleanInputRenderer();
                }
            }
        }
    }

    private void cleanInputRenderer() {
        inputRenderer.setBackgroundColor(Color.BLACK);
        inputRenderer.clearImage();
    }

    private void tryAddRendererToVideoTrack() {
        if (!rendererAttached && videoTrack != null && ViewCompat.isAttachedToWindow(this)) {
            EglBase.Context sharedContext = EglUtils.getRootEglBaseContext();
            if (sharedContext == null) {
                Log.e(TAG, "Failed to render a VideoTrack in framegen view!");
                return;
            }

            try {
                boolean initOk = initRendererWithFrameGenDrawer(sharedContext, rendererEvents);
                if (!initOk) {
                    inputRenderer.init(sharedContext, rendererEvents);
                    framegenUnavailable = true;
                    FrameGenLog.w(TAG, "FG drawer init failed; fallback to default renderer");
                } else {
                    FrameGenLog.milestone(TAG, "FG drawer initialized with recordable EGL config");
                }
                surfaceViewRendererInstances++;
            } catch (Exception e) {
                FrameGenLog.w(TAG, "FG renderer initialization failed", e);
                Logging.e(TAG, "Failed to initialize framegen SurfaceViewRenderer on instance "
                        + surfaceViewRendererInstances, e);
                return;
            }

            ThreadUtils.runOnExecutor(() -> {
                try {
                    videoTrack.addSink(inputRenderer);
                } catch (Throwable tr) {
                    Log.e(TAG, "Failed to add renderer", tr);
                }
            });
            rendererAttached = true;
        }
    }

    private void removeRendererFromVideoTrack() {
        if (!rendererAttached) {
            return;
        }
        if (videoTrack != null) {
            ThreadUtils.runOnExecutor(() -> {
                try {
                    videoTrack.removeSink(inputRenderer);
                } catch (Throwable ignored) {
                    // Ignore track lifecycle race.
                }
            });
        }
        inputRenderer.release();
        releaseDrawerResources();
        surfaceViewRendererInstances--;
        rendererAttached = false;
        synchronized (layoutSyncRoot) {
            frameHeight = 0;
            frameRotation = 0;
            frameWidth = 0;
        }
        requestRendererLayout();
    }

    private boolean initRendererWithFrameGenDrawer(EglBase.Context sharedContext, RendererEvents events)
            throws ClassNotFoundException, InvocationTargetException, IllegalAccessException {
        Object drawer = getOrCreateFrameGenDrawerProxy();
        if (drawer == null) {
            return false;
        }
        Class<?> glDrawerClass = Class.forName("org.webrtc.RendererCommon$GlDrawer");
        Method[] methods = SurfaceViewRenderer.class.getMethods();
        for (Method method : methods) {
            if (!"init".equals(method.getName())) {
                continue;
            }
            Class<?>[] params = method.getParameterTypes();
            if (params.length == 4
                    && params[0] == EglBase.Context.class
                    && params[1] == RendererEvents.class
                    && params[2] == int[].class
                    && params[3].isAssignableFrom(glDrawerClass)) {
                method.invoke(inputRenderer, sharedContext, events, FRAMEGEN_EGL_CONFIG, drawer);
                return true;
            }
            if (params.length == 3
                    && params[0] == EglBase.Context.class
                    && params[1] == RendererEvents.class
                    && params[2].isAssignableFrom(glDrawerClass)) {
                method.invoke(inputRenderer, sharedContext, events, drawer);
                return true;
            }
        }
        return false;
    }

    private Object getOrCreateFrameGenDrawerProxy() {
        if (framegenDrawerProxy != null) {
            return framegenDrawerProxy;
        }
        try {
            Class<?> glDrawerClass = Class.forName("org.webrtc.RendererCommon$GlDrawer");
            framegenDrawerProxy = Proxy.newProxyInstance(
                    glDrawerClass.getClassLoader(),
                    new Class<?>[]{glDrawerClass},
                    new FrameGenDrawerInvocationHandler()
            );
            return framegenDrawerProxy;
        } catch (ClassNotFoundException e) {
            Log.e(TAG, "GlDrawer class not found", e);
            return null;
        }
    }

    private final class FrameGenDrawerInvocationHandler implements InvocationHandler {
        private final float[] identityMatrix = new float[]{
                1f, 0f, 0f, 0f,
                0f, 1f, 0f, 0f,
                0f, 0f, 1f, 0f,
                0f, 0f, 0f, 1f,
        };

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            String name = method.getName();
            if ("drawOes".equals(name)) {
                handleDrawOes(args);
                return null;
            }
            if ("drawRgb".equals(name) || "drawYuv".equals(name)) {
                invokeFallbackDrawer(name, args);
                return null;
            }
            if ("release".equals(name)) {
                releaseDrawerResources();
                invokeFallbackDrawer("release", null);
                return null;
            }
            if ("toString".equals(name)) {
                return "RTCFrameGenGlDrawer";
            }
            if ("hashCode".equals(name)) {
                return System.identityHashCode(proxy);
            }
            if ("equals".equals(name)) {
                return proxy == (args != null && args.length > 0 ? args[0] : null);
            }
            return null;
        }

        private void handleDrawOes(Object[] args) {
            if (args == null || args.length < 2) {
                return;
            }

            int textureId = getIntArg(args, 0, 0);
            float[] texMatrix = args[1] instanceof float[] ? (float[]) args[1] : identityMatrix;
            int frameWidth = getIntArg(args, 2, 0);
            int frameHeight = getIntArg(args, 3, 0);
            int viewportX = getIntArg(args, 4, 0);
            int viewportY = getIntArg(args, 5, 0);
            int viewportWidth = getIntArg(args, 6, frameWidth);
            int viewportHeight = getIntArg(args, 7, frameHeight);
            if (drawLogCount < DRAW_LOG_LIMIT) {
                FrameGenLog.milestone(TAG, "FG drawOes #" + (drawLogCount + 1)
                        + " tex=" + textureId
                        + " frame=" + frameWidth + "x" + frameHeight
                        + " viewport=" + viewportWidth + "x" + viewportHeight
                        + " active=" + framegenActive
                        + " display=" + framegenDisplayActive
                        + " pendingSurface=" + (pendingExportSurface != null)
                        + " unavailable=" + framegenUnavailable);
                drawLogCount++;
            }

            if (textureId == 0 || frameWidth <= 0 || frameHeight <= 0 || framegenUnavailable) {
                invokeFallbackDrawOes(args, viewportX, viewportY, viewportWidth, viewportHeight);
                return;
            }

            maybeStartFramegen(frameWidth, frameHeight);
            attachPendingExportSurfaceOnGlThread();

            if (!framegenActive || pendingExportSurface != null) {
                invokeFallbackDrawOes(args, viewportX, viewportY, viewportWidth, viewportHeight);
                return;
            }

            boolean exported = false;
            try {
                ensureExportProcessorInitialized();
                exported = exportProcessor.draw(
                        textureId,
                        System.nanoTime() / 1000L,
                        frameWidth,
                        frameHeight,
                        texMatrix
                );
            } catch (Throwable t) {
                FrameGenLog.w(TAG, "Framegen export failed; fallback to default OES drawer", t);
            }

            if (!exported || !framegenDisplayActive) {
                invokeFallbackDrawOes(args, viewportX, viewportY, viewportWidth, viewportHeight);
            }
        }

        private void invokeFallbackDrawOes(
                Object[] args,
                int viewportX,
                int viewportY,
                int viewportWidth,
                int viewportHeight
        ) {
            if (viewportWidth > 0 && viewportHeight > 0) {
                GLES20.glViewport(viewportX, viewportY, viewportWidth, viewportHeight);
            }
            invokeFallbackDrawer("drawOes", args);
        }

        private int getIntArg(Object[] args, int index, int fallback) {
            if (index >= args.length || args[index] == null) {
                return fallback;
            }
            Object value = args[index];
            if (value instanceof Integer) {
                return (Integer) value;
            }
            if (value instanceof Number) {
                return ((Number) value).intValue();
            }
            return fallback;
        }
    }

    private synchronized void ensureExportProcessorInitialized() {
        if (exportProcessorInitialized) {
            return;
        }
        int major = 2;
        int minor = 0;
        String version = GLES20.glGetString(GLES20.GL_VERSION);
        if (version != null) {
            String cleaned = version.replace("OpenGL ES", "").trim();
            String[] parts = cleaned.split("[ .]");
            if (parts.length > 0) {
                major = parseInt(parts[0], 2);
            }
            if (parts.length > 1) {
                minor = parseInt(parts[1], 0);
            }
        }
        String extensions = GLES20.glGetString(GLES20.GL_EXTENSIONS);
        exportProcessor.initialize(major, minor, extensions == null ? "" : extensions);
        exportProcessor.setFsrEnabled(false);
        exportProcessorInitialized = true;
    }

    private void attachPendingExportSurfaceOnGlThread() {
        Surface surface = pendingExportSurface;
        if (surface == null) {
            return;
        }
        exportProcessor.setExportSurface(surface, pendingExportWidth, pendingExportHeight);
        FrameGenLog.milestone(TAG, "FG export surface attached on WebRTC GL thread "
                + pendingExportWidth + "x" + pendingExportHeight);
        pendingExportSurface = null;
    }

    private void maybeStartFramegen(int width, int height) {
        if (framegenActive || framegenUnavailable || bootstrapInProgress || !outputSurfaceReady) {
            return;
        }
        if (width <= 0 || height <= 0) {
            return;
        }
        bootstrapInProgress = true;
        FrameGenLog.configure(getContext(), logVerbose);
        FrameGenLog.milestone(TAG, "FG bootstrap start " + width + "x" + height
                + " outputReady=" + outputSurfaceReady
                + " fp16=" + framegenFp16);
        final Context appContext = getContext().getApplicationContext();
        final int renderWidth = width;
        final int renderHeight = height;
        new Thread(() -> {
            LsfgRuntime.PrepareResult prepareResult = LsfgRuntime.ensureReady(appContext);
            boolean enableLsfg = prepareResult.ready;
            if (enableLsfg) {
                int rc = LsfgRuntime.initContext(
                        appContext,
                        renderWidth,
                        renderHeight,
                        false,
                        framegenFp16
                );
                enableLsfg = rc == 0;
                if (!enableLsfg) {
                    FrameGenLog.w(TAG, "LSFG initContext failed rc=" + rc);
                }
            } else {
                FrameGenLog.w(TAG, "LSFG runtime unavailable: " + prepareResult.message);
            }

            final boolean finalEnableLsfg = enableLsfg;
            post(() -> {
                bootstrapInProgress = false;
                if (!finalEnableLsfg) {
                    framegenUnavailable = true;
                    setFramegenDisplayActive(false);
                    FrameGenLog.milestone(TAG, "FG bootstrap failed before input reader");
                    return;
                }
                if (!prepareInputReader(renderWidth, renderHeight)) {
                    framegenUnavailable = true;
                    teardownLsfg();
                    setFramegenDisplayActive(false);
                    FrameGenLog.milestone(TAG, "FG input reader preparation failed");
                    return;
                }
                framegenActive = true;
                bindNativeOutputSurface();
                setFramegenDisplayActive(false);
                startFramegenDisplayMonitor();
                FrameGenLog.milestone(TAG, "FG native path active " + renderWidth + "x" + renderHeight);
            });
        }, "xstreaming-lsfg-bootstrap").start();
    }

    private void startFramegenDisplayMonitor() {
        stopFramegenDisplayMonitor();
        lastObservedPostedFrameCount = readPostedFrameCount();
        lastPostedFrameProgressMs = System.currentTimeMillis();
        scheduleFramegenDisplayMonitor();
    }

    private void stopFramegenDisplayMonitor() {
        if (displayMonitorScheduled) {
            removeCallbacks(framegenDisplayMonitorRunnable);
            displayMonitorScheduled = false;
        }
        lastObservedPostedFrameCount = 0;
        lastPostedFrameProgressMs = 0;
    }

    private void scheduleFramegenDisplayMonitor() {
        if (!framegenActive || displayMonitorScheduled || !ViewCompat.isAttachedToWindow(this)) {
            return;
        }
        displayMonitorScheduled = true;
        postDelayed(framegenDisplayMonitorRunnable, DISPLAY_MONITOR_INTERVAL_MS);
    }

    private void monitorFramegenDisplay() {
        if (!framegenActive) {
            return;
        }

        long nowMs = System.currentTimeMillis();
        long postedFrames = readPostedFrameCount();
        if (postedFrames > lastObservedPostedFrameCount) {
            lastObservedPostedFrameCount = postedFrames;
            lastPostedFrameProgressMs = nowMs;
            if (!framegenDisplayActive) {
                setFramegenDisplayActive(true);
                FrameGenLog.milestone(TAG, "FG output visible, posted=" + postedFrames);
            }
        } else if (
                framegenDisplayActive
                        && lastPostedFrameProgressMs > 0
                        && nowMs - lastPostedFrameProgressMs > DISPLAY_STALL_FALLBACK_MS
        ) {
            setFramegenDisplayActive(false);
            FrameGenLog.w(TAG, "FG output stalled; fallback to WebRTC renderer posted=" + postedFrames);
        }

        scheduleFramegenDisplayMonitor();
    }

    private long readPostedFrameCount() {
        try {
            return NativeBridge.getPostedFrameCount();
        } catch (Throwable t) {
            return 0;
        }
    }

    private boolean prepareInputReader(int width, int height) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return false;
        }

        releaseInputReader();
        inputThread = new HandlerThread("xstreaming-lsfg-input");
        inputThread.start();
        inputHandler = new Handler(inputThread.getLooper());

        long readerUsage = HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE
                | HardwareBuffer.USAGE_GPU_COLOR_OUTPUT;
        ImageReader.Builder builder = new ImageReader.Builder(width, height);
        builder.setImageFormat(PixelFormat.RGBA_8888);
        builder.setDefaultHardwareBufferFormat(HardwareBuffer.RGBA_8888);
        builder.setMaxImages(EXPORT_QUEUE_DEPTH);
        builder.setUsage(readerUsage);
        inputReader = builder.build();
        exportedFrameLogCount = 0;
        drawLogCount = 0;
        lastStableTimestampNs = Long.MIN_VALUE;

        inputReader.setOnImageAvailableListener(reader -> {
            ArrayDeque<Image> pendingImages = new ArrayDeque<>(EXPORT_BACKLOG_KEEP_FRAMES);
            try {
                Image firstImage = reader.acquireNextImage();
                if (firstImage == null) {
                    return;
                }
                pendingImages.addLast(firstImage);

                int droppedStaleFrames = 0;
                while (true) {
                    Image nextImage = reader.acquireNextImage();
                    if (nextImage == null) {
                        break;
                    }
                    pendingImages.addLast(nextImage);
                    if (pendingImages.size() > EXPORT_BACKLOG_KEEP_FRAMES) {
                        pendingImages.removeFirst().close();
                        droppedStaleFrames++;
                    }
                }

                if (droppedStaleFrames > 0) {
                    FrameGenLog.i(TAG, "Trimmed export backlog dropped=" + droppedStaleFrames
                            + " kept=" + pendingImages.size());
                }

                while (!pendingImages.isEmpty()) {
                    Image image = pendingImages.removeFirst();
                    HardwareBuffer buffer = image.getHardwareBuffer();
                    if (buffer != null) {
                        long stableTimestampNs = nextStableTimestampNs();
                        if (exportedFrameLogCount < DEBUG_FRAME_LOG_LIMIT) {
                            FrameGenLog.milestone(TAG, "FG ImageReader frame #" + (exportedFrameLogCount + 1)
                                    + " ts=" + image.getTimestamp()
                                    + " stableTs=" + stableTimestampNs
                                    + " size=" + image.getWidth() + "x" + image.getHeight());
                        }
                        try {
                            NativeBridge.pushFrame(buffer, stableTimestampNs);
                            exportedFrameLogCount++;
                        } finally {
                            buffer.close();
                        }
                    }
                    image.close();
                }
            } catch (Throwable t) {
                FrameGenLog.w(TAG, "pushFrame failed", t);
            } finally {
                while (!pendingImages.isEmpty()) {
                    pendingImages.removeFirst().close();
                }
            }
        }, inputHandler);

        Surface exportSurface = inputReader.getSurface();
        if (exportSurface == null) {
            inputReader.close();
            inputReader = null;
            inputThread.quitSafely();
            inputThread = null;
            inputHandler = null;
            return false;
        }
        pendingExportSurface = exportSurface;
        pendingExportWidth = width;
        pendingExportHeight = height;
        FrameGenLog.milestone(TAG, "FG created ImageReader "
                + width + "x" + height
                + " usage=0x" + Long.toHexString(readerUsage));
        return true;
    }

    private void releaseInputReader() {
        pendingExportSurface = null;
        if (inputReader != null) {
            inputReader.close();
            inputReader = null;
        }
        if (inputThread != null) {
            inputThread.quitSafely();
            inputThread = null;
        }
        inputHandler = null;
        lastStableTimestampNs = Long.MIN_VALUE;
    }

    private long nextStableTimestampNs() {
        long frameIntervalNs = 1_000_000_000L / Math.max(1, videoFps);
        if (lastStableTimestampNs == Long.MIN_VALUE) {
            lastStableTimestampNs = System.nanoTime();
            return lastStableTimestampNs;
        }
        lastStableTimestampNs += frameIntervalNs;
        return lastStableTimestampNs;
    }

    private void attachOutputSurface(SurfaceTexture surfaceTexture) {
        if (surfaceTexture == null) {
            return;
        }
        int width = Math.max(1, frameWidth);
        int height = Math.max(1, frameHeight);
        surfaceTexture.setDefaultBufferSize(width, height);
        outputDisplayView.setFrameInputSize(width, height);

        if (outputSurface != null) {
            outputSurface.release();
        }
        outputSurfaceTexture = surfaceTexture;
        outputSurface = new Surface(surfaceTexture);
        outputSurfaceWidth = width;
        outputSurfaceHeight = height;
        outputSurfaceReady = outputSurface.isValid();
        if (outputSurfaceReady) {
            FrameGenLog.milestone(TAG, "FG output bridge surface ready -> " + width + "x" + height);
            if (framegenActive) {
                bindNativeOutputSurface();
            } else if (frameWidth > 0 && frameHeight > 0) {
                maybeStartFramegen(frameWidth, frameHeight);
            }
        }
    }

    private void detachOutputSurface() {
        outputSurfaceReady = false;
        outputSurfaceTexture = null;
        if (outputSurface != null) {
            outputSurface.release();
        }
        outputSurface = null;
        outputSurfaceWidth = 0;
        outputSurfaceHeight = 0;
        lastBoundOutputSurface = null;
        lastBoundOutputWidth = 0;
        lastBoundOutputHeight = 0;
        if (framegenActive) {
            try {
                NativeBridge.setOutputSurface(null, 0, 0);
            } catch (Throwable t) {
                Log.w(TAG, "Failed to clear LSFG output surface", t);
            }
        }
    }

    private void bindNativeOutputSurface() {
        if (!framegenActive || outputSurface == null || !outputSurface.isValid()) {
            return;
        }
        if (outputSurface == lastBoundOutputSurface
                && outputSurfaceWidth == lastBoundOutputWidth
                && outputSurfaceHeight == lastBoundOutputHeight) {
            return;
        }
        float targetRefreshRate = resolveTargetRefreshRateHz();
        requestMaxRefreshRate(outputSurface, targetRefreshRate);
        NativeBridge.setOutputSurface(outputSurface, outputSurfaceWidth, outputSurfaceHeight);
        if (targetRefreshRate > 1f) {
            NativeBridge.setVsyncPeriodNs((long) (1_000_000_000d / targetRefreshRate));
        } else {
            NativeBridge.setVsyncPeriodNs(0L);
        }
        lastBoundOutputSurface = outputSurface;
        lastBoundOutputWidth = outputSurfaceWidth;
        lastBoundOutputHeight = outputSurfaceHeight;
        FrameGenLog.milestone(TAG, "FG LSFG output target refresh -> " + targetRefreshRate + "Hz");
    }

    private void applyOutputSurfaceBufferSize(int width, int height) {
        if (outputSurfaceTexture != null && width > 0 && height > 0) {
            outputSurfaceTexture.setDefaultBufferSize(width, height);
            outputSurfaceWidth = width;
            outputSurfaceHeight = height;
        }
    }

    private float resolveTargetRefreshRateHz() {
        Display display = outputDisplayView.getDisplay();
        if (display == null) {
            return 0f;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Display.Mode[] modes = display.getSupportedModes();
            if (modes != null && modes.length > 0) {
                float maxRefreshRate = 0f;
                for (Display.Mode mode : modes) {
                    if (mode != null && mode.getRefreshRate() > maxRefreshRate) {
                        maxRefreshRate = mode.getRefreshRate();
                    }
                }
                if (maxRefreshRate > 0f) {
                    return maxRefreshRate;
                }
            }
        }
        return display.getRefreshRate();
    }

    private void requestMaxRefreshRate(Surface surface, float refreshRate) {
        if (surface == null || !surface.isValid()
                || refreshRate <= 0f || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        try {
            surface.setFrameRate(
                    refreshRate,
                    Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE,
                    Surface.CHANGE_FRAME_RATE_ALWAYS
            );
        } catch (Throwable t) {
            Log.w(TAG, "setFrameRate(" + refreshRate + "Hz) failed", t);
        }
    }

    private void teardownLsfg() {
        stopFramegenDisplayMonitor();
        try {
            NativeBridge.setOutputSurface(null, 0, 0);
        } catch (Throwable t) {
            Log.w(TAG, "Failed to clear LSFG output surface", t);
        }
        try {
            NativeBridge.destroyContext();
        } catch (Throwable t) {
            Log.w(TAG, "Failed to destroy LSFG context", t);
        }
        framegenActive = false;
        lastBoundOutputSurface = null;
        lastBoundOutputWidth = 0;
        lastBoundOutputHeight = 0;
        setFramegenDisplayActive(false);
    }

    private void setFramegenDisplayActive(boolean active) {
        if (framegenDisplayActive != active) {
            framegenDisplayActive = active;
        }
        if (!pendingDisplayModeLayout) {
            pendingDisplayModeLayout = true;
            post(requestLayoutRunnable);
        }
    }

    @SuppressLint("WrongCall")
    private void requestRendererLayout() {
        inputRenderer.requestLayout();
        outputDisplayView.requestLayout();
        if (!ViewCompat.isInLayout(this)) {
            onLayout(false, getLeft(), getTop(), getRight(), getBottom());
        }
    }

    private void setScalingType(ScalingType scalingType) {
        synchronized (layoutSyncRoot) {
            if (this.scalingType == scalingType) {
                return;
            }
            this.scalingType = scalingType;
            inputRenderer.setScalingType(scalingType);
        }
        requestRendererLayout();
    }

    private float parseVideoAspectRatio(String format) {
        switch (format) {
            case "16:10":
                return 16f / 10f;
            case "18:9":
                return 18f / 9f;
            case "21:9":
                return 21f / 9f;
            case "4:3":
                return 4f / 3f;
            default:
                String[] parts = format.split(":");
                if (parts.length != 2) {
                    return 0f;
                }
                try {
                    float width = Float.parseFloat(parts[0]);
                    float height = Float.parseFloat(parts[1]);
                    if (width > 0f && height > 0f) {
                        return width / height;
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore invalid ratio format.
                }
                return 0f;
        }
    }

    private void applyRendererLayoutAspectRatio(int layoutWidth, int layoutHeight) {
        float rendererLayoutAspectRatio = 0f;
        if (layoutWidth > 0 && layoutHeight > 0) {
            rendererLayoutAspectRatio = layoutWidth / (float) layoutHeight;
        }
        int currentVideoFormatMode;
        int currentFrameWidth;
        int currentFrameHeight;
        int currentFrameRotation;
        synchronized (layoutSyncRoot) {
            currentVideoFormatMode = videoFormatMode;
            currentFrameWidth = frameWidth;
            currentFrameHeight = frameHeight;
            currentFrameRotation = frameRotation;
        }
        if (currentVideoFormatMode == VIDEO_FORMAT_MODE_STRETCH) {
            rendererLayoutAspectRatio = (currentFrameWidth > 0 && currentFrameHeight > 0)
                    ? getCurrentFrameAspectRatio(currentFrameWidth, currentFrameHeight, currentFrameRotation)
                    : 0f;
        } else if (currentVideoFormatMode == VIDEO_FORMAT_MODE_FIXED_RATIO
                && currentFrameWidth > 0
                && currentFrameHeight > 0) {
            rendererLayoutAspectRatio = getCurrentFrameAspectRatio(
                    currentFrameWidth,
                    currentFrameHeight,
                    currentFrameRotation
            );
        }
        setSurfaceViewRendererLayoutAspectRatio(rendererLayoutAspectRatio);
    }

    private float getCurrentFrameAspectRatio(int frameWidth, int frameHeight, int frameRotation) {
        if (frameWidth <= 0 || frameHeight <= 0) {
            return 0f;
        }
        return (frameRotation % 180 == 0)
                ? frameWidth / (float) frameHeight
                : frameHeight / (float) frameWidth;
    }

    private void setSurfaceViewRendererLayoutAspectRatio(float aspectRatio) {
        if (!ensureEglLayoutAspectReflectionReady()) {
            return;
        }
        try {
            Object eglRenderer = surfaceViewRendererEglRendererField.get(inputRenderer);
            if (eglRenderer != null) {
                eglRendererSetLayoutAspectRatioMethod.invoke(eglRenderer, aspectRatio);
            }
        } catch (Throwable tr) {
            if (!eglLayoutAspectReflectionFailed) {
                eglLayoutAspectReflectionFailed = true;
                Log.w(TAG, "Failed to apply framegen renderer layout aspect ratio override.", tr);
            }
        }
    }

    private boolean ensureEglLayoutAspectReflectionReady() {
        synchronized (EGL_LAYOUT_ASPECT_REFLECTION_LOCK) {
            if (eglLayoutAspectReflectionReady) {
                return true;
            }
            try {
                surfaceViewRendererEglRendererField = SurfaceViewRenderer.class.getDeclaredField("eglRenderer");
                surfaceViewRendererEglRendererField.setAccessible(true);
                Class<?> eglRendererClass = Class.forName("org.webrtc.EglRenderer");
                eglRendererSetLayoutAspectRatioMethod = eglRendererClass.getMethod("setLayoutAspectRatio", float.class);
                eglLayoutAspectReflectionReady = true;
                return true;
            } catch (Throwable tr) {
                if (!eglLayoutAspectReflectionFailed) {
                    eglLayoutAspectReflectionFailed = true;
                    Log.w(TAG, "Unable to resolve EglRenderer#setLayoutAspectRatio reflection.", tr);
                }
                return false;
            }
        }
    }

    private synchronized Object getFallbackDrawer() {
        if (fallbackDrawer != null) {
            return fallbackDrawer;
        }
        try {
            Class<?> drawerClass = Class.forName("org.webrtc.GlRectDrawer");
            fallbackDrawer = drawerClass.getConstructor().newInstance();
            return fallbackDrawer;
        } catch (Throwable t) {
            Log.e(TAG, "Failed to create GlRectDrawer fallback", t);
            return null;
        }
    }

    private void invokeFallbackDrawer(String methodName, Object[] args) {
        Object drawer = getFallbackDrawer();
        if (drawer == null) {
            return;
        }
        try {
            Method target = findByNameAndArgCount(drawer.getClass(), methodName, args == null ? 0 : args.length);
            if (target == null) {
                return;
            }
            target.invoke(drawer, args == null ? new Object[0] : args);
        } catch (Throwable t) {
            Log.e(TAG, "Fallback drawer invocation failed: " + methodName, t);
        }
    }

    private Method findByNameAndArgCount(Class<?> clazz, String name, int argCount) {
        for (Method method : clazz.getMethods()) {
            if (method.getName().equals(name) && method.getParameterCount() == argCount) {
                return method;
            }
        }
        return null;
    }

    private synchronized void releaseDrawerResources() {
        try {
            exportProcessor.setExportSurface(null, 0, 0);
            exportProcessor.release();
        } catch (Throwable t) {
            Log.w(TAG, "Failed to release frame export processor", t);
        }
        exportProcessorInitialized = false;

        if (fallbackDrawer != null) {
            try {
                Method release = findByNameAndArgCount(fallbackDrawer.getClass(), "release", 0);
                if (release != null) {
                    release.invoke(fallbackDrawer);
                }
            } catch (Throwable t) {
                Log.w(TAG, "Failed to release fallback drawer", t);
            }
            fallbackDrawer = null;
        }
    }

    private int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
