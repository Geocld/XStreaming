package com.oney.WebRTCModule;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Point;
import android.opengl.GLES20;
import android.util.Log;
import android.view.ViewGroup;

import androidx.core.view.ViewCompat;

import com.facebook.react.bridge.ReactContext;
import com.xstreaming.fsr.FsrVideoProcessor;

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
import java.util.List;
import java.util.Objects;

public class RTCFsrVideoView extends ViewGroup {
    private static final ScalingType DEFAULT_SCALING_TYPE = ScalingType.SCALE_ASPECT_FIT;
    private static final String TAG = WebRTCModule.TAG;
    private static final int VIDEO_FORMAT_MODE_AUTO = 0;
    private static final int VIDEO_FORMAT_MODE_STRETCH = 1;
    private static final int VIDEO_FORMAT_MODE_ZOOM = 2;
    private static final int VIDEO_FORMAT_MODE_FIXED_RATIO = 3;

    private static int surfaceViewRendererInstances;
    private static final Object EGL_LAYOUT_ASPECT_REFLECTION_LOCK = new Object();
    private static Field surfaceViewRendererEglRendererField;
    private static Method eglRendererSetLayoutAspectRatioMethod;
    private static boolean eglLayoutAspectReflectionReady;

    private final Object layoutSyncRoot = new Object();
    private final SurfaceViewRenderer surfaceViewRenderer;

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

    private boolean fsrEnabled = true;
    private float fsrSharpness = 2f;
    private boolean fsrInitialized;
    private Object fsrDrawerProxy;
    private Object fallbackDrawer;

    private final FsrVideoProcessor fsrVideoProcessor;

    private final RendererEvents rendererEvents = new RendererEvents() {
        @Override
        public void onFirstFrameRendered() {
            RTCFsrVideoView.this.onFirstFrameRendered();
        }

        @Override
        public void onFrameResolutionChanged(int videoWidth, int videoHeight, int rotation) {
            RTCFsrVideoView.this.onFrameResolutionChanged(videoWidth, videoHeight, rotation);
        }
    };

    private final Runnable requestSurfaceViewRendererLayoutRunnable = this::requestSurfaceViewRendererLayout;

    public RTCFsrVideoView(Context context) {
        super(context);

        fsrVideoProcessor = new FsrVideoProcessor(context.getApplicationContext());

        surfaceViewRenderer = new SurfaceViewRenderer(context);
        addView(surfaceViewRenderer);

        setMirror(false);
        setScalingType(DEFAULT_SCALING_TYPE);
    }

    private void cleanSurfaceViewRenderer() {
        surfaceViewRenderer.setBackgroundColor(Color.BLACK);
        surfaceViewRenderer.clearImage();
    }

    private VideoTrack getVideoTrackForStreamURL(String streamURL) {
        VideoTrack result = null;

        if (streamURL != null) {
            ReactContext reactContext = (ReactContext) getContext();
            WebRTCModule module = reactContext.getNativeModule(WebRTCModule.class);
            MediaStream stream = module.getStreamForReactTag(streamURL);

            if (stream != null) {
                List<VideoTrack> videoTracks = stream.videoTracks;
                if (!videoTracks.isEmpty()) {
                    result = videoTracks.get(0);
                }
            }

            if (result == null) {
                Log.w(TAG, "No video stream for react tag: " + streamURL);
            }
        }

        return result;
    }

    @Override
    protected void onAttachedToWindow() {
        try {
            tryAddRendererToVideoTrack();
        } finally {
            super.onAttachedToWindow();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        try {
            removeRendererFromVideoTrack();
        } finally {
            super.onDetachedFromWindow();
        }
    }

    private void onFirstFrameRendered() {
        post(() -> {
            Log.d(TAG, "First frame rendered (FSR view).");
            surfaceViewRenderer.setBackgroundColor(Color.TRANSPARENT);
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

        if (changed) {
            post(requestSurfaceViewRendererLayoutRunnable);
        }
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int height = b - t;
        int width = r - l;

        if (height == 0 || width == 0) {
            l = t = r = b = 0;
        } else {
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
                r = width;
                l = 0;
                b = height;
                t = 0;
            } else if (frameHeight == 0 || frameWidth == 0) {
                l = t = r = b = 0;
            } else {
                float frameAspectRatio =
                        (frameRotation % 180 == 0)
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

                l = (width - frameDisplaySize.x) / 2;
                t = (height - frameDisplaySize.y) / 2;
                r = l + frameDisplaySize.x;
                b = t + frameDisplaySize.y;
            }
        }

        surfaceViewRenderer.layout(l, t, r, b);
        applyRendererLayoutAspectRatio(r - l, b - t);
    }

    private void removeRendererFromVideoTrack() {
        if (rendererAttached) {
            if (videoTrack != null) {
                ThreadUtils.runOnExecutor(() -> {
                    try {
                        videoTrack.removeSink(surfaceViewRenderer);
                    } catch (Throwable ignored) {
                        // Ignore track lifecycle race.
                    }
                });
            }

            surfaceViewRenderer.release();
            releaseDrawerResources();
            surfaceViewRendererInstances--;
            rendererAttached = false;

            synchronized (layoutSyncRoot) {
                frameHeight = 0;
                frameRotation = 0;
                frameWidth = 0;
            }
            requestSurfaceViewRendererLayout();
        }
    }

    @SuppressLint("WrongCall")
    private void requestSurfaceViewRendererLayout() {
        surfaceViewRenderer.requestLayout();
        if (!ViewCompat.isInLayout(this)) {
            onLayout(false, getLeft(), getTop(), getRight(), getBottom());
        }
    }

    public void setMirror(boolean mirror) {
        if (this.mirror != mirror) {
            this.mirror = mirror;
            surfaceViewRenderer.setMirror(mirror);
            requestSurfaceViewRendererLayout();
        }
    }

    public void setObjectFit(String objectFit) {
        ScalingType scalingType =
                "cover".equals(objectFit) ? ScalingType.SCALE_ASPECT_FILL : ScalingType.SCALE_ASPECT_FIT;
        setScalingType(scalingType);
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

        requestSurfaceViewRendererLayout();
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
            Object eglRenderer = surfaceViewRendererEglRendererField.get(surfaceViewRenderer);
            if (eglRenderer != null) {
                eglRendererSetLayoutAspectRatioMethod.invoke(eglRenderer, aspectRatio);
            }
        } catch (Throwable tr) {
            if (!eglLayoutAspectReflectionFailed) {
                eglLayoutAspectReflectionFailed = true;
                Log.w(TAG, "Failed to apply FSR renderer layout aspect ratio override.", tr);
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
                    Log.w(TAG, "Unable to resolve FSR EglRenderer#setLayoutAspectRatio reflection.", tr);
                }
                return false;
            }
        }
    }

    private void setScalingType(ScalingType scalingType) {
        synchronized (layoutSyncRoot) {
            if (this.scalingType == scalingType) {
                return;
            }
            this.scalingType = scalingType;
            surfaceViewRenderer.setScalingType(scalingType);
        }
        requestSurfaceViewRendererLayout();
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

    private void setVideoTrack(VideoTrack videoTrack) {
        VideoTrack oldVideoTrack = this.videoTrack;

        if (oldVideoTrack != videoTrack) {
            if (oldVideoTrack != null) {
                if (videoTrack == null) {
                    cleanSurfaceViewRenderer();
                }
                removeRendererFromVideoTrack();
            }

            this.videoTrack = videoTrack;

            if (videoTrack != null) {
                tryAddRendererToVideoTrack();
                if (oldVideoTrack == null) {
                    cleanSurfaceViewRenderer();
                }
            }
        }
    }

    public void setZOrder(int zOrder) {
        switch (zOrder) {
            case 0:
                surfaceViewRenderer.setZOrderMediaOverlay(false);
                break;
            case 1:
                surfaceViewRenderer.setZOrderMediaOverlay(true);
                break;
            case 2:
                surfaceViewRenderer.setZOrderOnTop(true);
                break;
            default:
                break;
        }
    }

    public void setFsrEnabled(boolean enabled) {
        fsrEnabled = enabled;
        fsrVideoProcessor.setFsrEnabled(enabled);
    }

    public void setFsrSharpness(float sharpness) {
        fsrSharpness = sharpness;
        fsrVideoProcessor.setSharpness(sharpness / 10f);
    }

    private void tryAddRendererToVideoTrack() {
        if (!rendererAttached && videoTrack != null && ViewCompat.isAttachedToWindow(this)) {
            EglBase.Context sharedContext = EglUtils.getRootEglBaseContext();

            if (sharedContext == null) {
                Log.e(TAG, "Failed to render a VideoTrack in FSR view!");
                return;
            }

            try {
                boolean fsrInitOk = initRendererWithFsrDrawer(sharedContext, rendererEvents);
                if (!fsrInitOk) {
                    surfaceViewRenderer.init(sharedContext, rendererEvents);
                    Log.w(TAG, "FSR drawer init failed; fallback to default renderer.");
                }
                surfaceViewRendererInstances++;
            } catch (Exception e) {
                Logging.e(
                        TAG,
                        "Failed to initialize FSR surfaceViewRenderer on instance " + surfaceViewRendererInstances,
                        e
                );
                return;
            }

            ThreadUtils.runOnExecutor(() -> {
                try {
                    videoTrack.addSink(surfaceViewRenderer);
                } catch (Throwable tr) {
                    Log.e(TAG, "Failed to add renderer", tr);
                }
            });

            rendererAttached = true;
        }
    }

    private boolean initRendererWithFsrDrawer(EglBase.Context sharedContext, RendererEvents events)
            throws ClassNotFoundException, InvocationTargetException, IllegalAccessException {
        Object drawer = getOrCreateFsrDrawerProxy();
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
                method.invoke(surfaceViewRenderer, sharedContext, events, EglBase.CONFIG_PLAIN, drawer);
                return true;
            }
            if (params.length == 3
                    && params[0] == EglBase.Context.class
                    && params[1] == RendererEvents.class
                    && params[2].isAssignableFrom(glDrawerClass)) {
                method.invoke(surfaceViewRenderer, sharedContext, events, drawer);
                return true;
            }
        }
        return false;
    }

    private Object getOrCreateFsrDrawerProxy() {
        if (fsrDrawerProxy != null) {
            return fsrDrawerProxy;
        }

        try {
            final Class<?> glDrawerClass = Class.forName("org.webrtc.RendererCommon$GlDrawer");
            fsrDrawerProxy = Proxy.newProxyInstance(
                    glDrawerClass.getClassLoader(),
                    new Class<?>[]{glDrawerClass},
                    new FsrDrawerInvocationHandler()
            );
            return fsrDrawerProxy;
        } catch (ClassNotFoundException e) {
            Log.e(TAG, "GlDrawer class not found", e);
            return null;
        }
    }

    private final class FsrDrawerInvocationHandler implements InvocationHandler {
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
                return "RTCFsrGlDrawer";
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

            if (!fsrEnabled) {
                invokeFallbackDrawer("drawOes", args);
                return;
            }

            try {
                int textureId = getIntArg(args, 0, 0);
                float[] texMatrix = args[1] instanceof float[] ? (float[]) args[1] : identityMatrix;
                int frameWidth = getIntArg(args, 2, 0);
                int frameHeight = getIntArg(args, 3, 0);
                int viewportX = getIntArg(args, 4, 0);
                int viewportY = getIntArg(args, 5, 0);
                int viewportWidth = getIntArg(args, 6, frameWidth);
                int viewportHeight = getIntArg(args, 7, frameHeight);

                if (textureId == 0) {
                    invokeFallbackDrawer("drawOes", args);
                    return;
                }

                if (viewportWidth > 0 && viewportHeight > 0) {
                    GLES20.glViewport(viewportX, viewportY, viewportWidth, viewportHeight);
                }

                ensureFsrInitialized();
                fsrVideoProcessor.setSharpness(fsrSharpness / 10f);
                if (viewportWidth > 0 && viewportHeight > 0) {
                    fsrVideoProcessor.setSurfaceSize(viewportWidth, viewportHeight);
                } else if (frameWidth > 0 && frameHeight > 0) {
                    fsrVideoProcessor.setSurfaceSize(frameWidth, frameHeight);
                }

                boolean rendered = fsrVideoProcessor.draw(
                        textureId,
                        System.nanoTime() / 1000,
                        frameWidth,
                        frameHeight,
                        texMatrix
                );
                if (!rendered) {
                    invokeFallbackDrawer("drawOes", args);
                }
            } catch (Throwable t) {
                Log.e(TAG, "FSR draw failed, fallback to default OES drawer.", t);
                invokeFallbackDrawer("drawOes", args);
            }
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

    private synchronized void ensureFsrInitialized() {
        if (fsrInitialized) {
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
        fsrVideoProcessor.initialize(major, minor, extensions == null ? "" : extensions);
        fsrVideoProcessor.setFsrEnabled(fsrEnabled);
        fsrVideoProcessor.setSharpness(fsrSharpness / 10f);
        fsrInitialized = true;
    }

    private int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
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
        if (fsrInitialized) {
            try {
                fsrVideoProcessor.release();
            } catch (Throwable t) {
                Log.w(TAG, "Failed to release FSR processor", t);
            }
            fsrInitialized = false;
        }

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
}
