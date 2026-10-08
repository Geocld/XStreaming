package com.xstreaming.gl;

import com.xstreaming.fsr.VideoProcessor;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.SurfaceTexture;
import android.opengl.EGL14;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.SurfaceHolder;

import androidx.annotation.NonNull;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.GlUtil.GlException;
import androidx.media3.common.util.UnstableApi;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGL10;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.egl.EGLContext;
import javax.microedition.khronos.egl.EGLDisplay;
import javax.microedition.khronos.egl.EGLSurface;
import javax.microedition.khronos.opengles.GL10;

/**
 * GLSurfaceView 包装类，接收上游 SurfaceTexture 帧并交给 VideoProcessor 做二次处理。
 */
@SuppressLint("ViewConstructor")
@UnstableApi
public class VideoProcessingGLSurfaceView extends GLSurfaceView {

    public static final int EGL_PROTECTED_CONTENT_EXT = 0x32C0;
    public static final int EGL_RECORDABLE_ANDROID = 0x3142;
    private static final String TAG = "VideoProcessingGLView";

    private final VideoProcessor videoProcessor;
    private final SurfaceListener surfaceListener;
    private final boolean requireRecordableConfig;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final VideoRenderer renderer = new VideoRenderer();
    private int measuredWidthPx;
    private int measuredHeightPx;
    private float surfacePixelScale = 1f;
    private boolean fixedSurfaceSizeEnabled = false;
    private int fixedSurfaceWidth;
    private int fixedSurfaceHeight;

    public VideoProcessingGLSurfaceView(
            Context context,
            boolean requireSecureContext,
            VideoProcessor videoProcessor,
            SurfaceListener surfaceListener
    ) {
        this(context, requireSecureContext, false, videoProcessor, surfaceListener);
    }

    public VideoProcessingGLSurfaceView(
            Context context,
            boolean requireSecureContext,
            boolean requireRecordableConfig,
            VideoProcessor videoProcessor,
            SurfaceListener surfaceListener
    ) {
        super(context);
        this.videoProcessor = videoProcessor;
        this.surfaceListener = surfaceListener;
        this.requireRecordableConfig = requireRecordableConfig;
        init(requireSecureContext);
    }

    private void init(boolean requireSecureContext) {
        setEGLContextClientVersion(2);
        setEGLConfigChooser(new ConfigChooser(requireRecordableConfig));
        setEGLContextFactory(new ContextFactory(requireSecureContext));
        setEGLWindowSurfaceFactory(new WindowSurfaceFactory(requireSecureContext));
        setRenderer(renderer);
        setRenderMode(RENDERMODE_WHEN_DIRTY);
    }

    /**
     * 设置 Surface 实际像素与 View 尺寸的比例，例如传入 1.5 表示强制以 1.5x 像素渲染。
     */
    public void setSurfacePixelScale(float scale) {
        float safeScale = Math.max(1f, scale);
        if (Math.abs(surfacePixelScale - safeScale) < 0.01f) {
            return;
        }
        surfacePixelScale = safeScale;
        fixedSurfaceSizeEnabled = false;
        applyPreferredSurfaceSize();
    }

    /**
     * 固定底层 Surface 的像素尺寸，如果传入 <=0 则恢复跟随布局。
     */
    public void setFixedSurfacePixelSize(int width, int height) {
        if (width > 0 && height > 0) {
            fixedSurfaceSizeEnabled = true;
            fixedSurfaceWidth = width;
            fixedSurfaceHeight = height;
        } else {
            fixedSurfaceSizeEnabled = false;
        }
        applyPreferredSurfaceSize();
    }

    /**
     * 提供给上层设置当前视频帧原始输入尺寸，供 FSR 计算使用。
     */
    public void setFrameInputSize(int width, int height) {
        renderer.setFrameSize(width, height);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        Log.v(TAG, "onSizeChanged...");
        measuredWidthPx = w;
        measuredHeightPx = h;
        applyPreferredSurfaceSize();
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        queueEvent(() -> {
            renderer.release();
            videoProcessor.release();
        });
    }

    private void applyPreferredSurfaceSize() {
        Log.v(TAG, "applyPreferredSurfaceSize...");
        SurfaceHolder holder = getHolder();
        Log.v(TAG, "applyPreferredSurfaceSize holder..." + holder);
        if (holder == null) {
            return;
        }
        if (fixedSurfaceSizeEnabled && fixedSurfaceWidth > 0 && fixedSurfaceHeight > 0) {
            holder.setFixedSize(fixedSurfaceWidth, fixedSurfaceHeight);
            Log.i(TAG, "Apply fixed surface size: " + fixedSurfaceWidth + "x" + fixedSurfaceHeight);
            return;
        }
        if (surfacePixelScale > 1f && measuredWidthPx > 0 && measuredHeightPx > 0) {
            int scaledWidth = Math.round(measuredWidthPx * surfacePixelScale);
            int scaledHeight = Math.round(measuredHeightPx * surfacePixelScale);
            holder.setFixedSize(scaledWidth, scaledHeight);
            Log.i(TAG, "Apply pixel scale " + surfacePixelScale + " -> " + scaledWidth + "x" + scaledHeight);
        } else {
            holder.setSizeFromLayout();
        }
    }

    private final class VideoRenderer implements Renderer {

        private final AtomicBoolean frameAvailable = new AtomicBoolean(false);
        private final AtomicBoolean pendingBufferSizeUpdate = new AtomicBoolean(false);
        private final float[] transformMatrix = new float[16];

        private SurfaceTexture inputSurfaceTexture;
        private int textureId;
        private boolean initialized = false;
        private long frameTimestampUs;
        private int frameWidth = -1;
        private int frameHeight = -1;
        private int surfaceWidth = -1;
        private int surfaceHeight = -1;

        void setFrameSize(int width, int height) {
            frameWidth = width;
            frameHeight = height;
            pendingBufferSizeUpdate.set(true);
            VideoProcessingGLSurfaceView.this.requestRender();
        }

        @Override
        public void onSurfaceCreated(GL10 gl, EGLConfig config) {
            destroyInputSurfaceTexture(true);
            try {
                textureId = GlUtil.createExternalTexture();
            } catch (GlException e) {
                Log.e(TAG, "Failed to create external texture", e);
            }
            Log.d(TAG, "GL surface created, textureId=" + textureId);
            inputSurfaceTexture = new SurfaceTexture(textureId);
            pendingBufferSizeUpdate.set(true);
            maybeUpdateInputSurfaceDefaultSize();
            inputSurfaceTexture.setOnFrameAvailableListener(surfaceTexture -> {
                frameAvailable.set(true);
                requestRender();
            });
            notifySurfaceAvailable(inputSurfaceTexture);
        }

        @Override
        public void onSurfaceChanged(GL10 gl, int width, int height) {
            GLES20.glViewport(0, 0, width, height);
            surfaceWidth = width;
            surfaceHeight = height;
        }

        @Override
        public void onDrawFrame(GL10 gl) {
            if (!initialized) {
                initializeProcessor(gl);
            }
            if (surfaceWidth > 0 && surfaceHeight > 0) {
                videoProcessor.setSurfaceSize(surfaceWidth, surfaceHeight);
                surfaceWidth = -1;
                surfaceHeight = -1;
            }
            maybeUpdateInputSurfaceDefaultSize();

            if (frameAvailable.compareAndSet(true, false)) {
                SurfaceTexture surfaceTexture = inputSurfaceTexture;
                if (surfaceTexture != null) {
                    surfaceTexture.updateTexImage();
                    frameTimestampUs = surfaceTexture.getTimestamp() / 1000;
                    surfaceTexture.getTransformMatrix(transformMatrix);
                }
            }

            try {
                videoProcessor.draw(
                        textureId,
                        frameTimestampUs,
                        frameWidth,
                        frameHeight,
                        transformMatrix
                );
            } catch (GlException e) {
                throw new RuntimeException(e);
            }
        }

        private void initializeProcessor(GL10 gl) {
            String version = gl.glGetString(GL10.GL_VERSION);
            if (version == null) {
                version = "";
            }
            String cleaned = version.replace("OpenGL ES ", "");
            String[] parts = cleaned.split("[ .]");
            int major = parts.length > 0 ? parseInt(parts[0], 2) : 2;
            int minor = parts.length > 1 ? parseInt(parts[1], 0) : 0;
            String extensions = gl.glGetString(GL10.GL_EXTENSIONS);
            videoProcessor.initialize(major, minor, extensions != null ? extensions : "");
            initialized = true;
            Log.d(TAG, "VideoProcessor initialized, glVersion=" + major + "." + minor);
        }

        private int parseInt(String text, int fallback) {
            try {
                return Integer.parseInt(text);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }

        void release() {
            destroyInputSurfaceTexture(true);
        }

        private void maybeUpdateInputSurfaceDefaultSize() {
            if (!pendingBufferSizeUpdate.get()) {
                return;
            }
            SurfaceTexture surfaceTexture = inputSurfaceTexture;
            if (surfaceTexture == null || frameWidth <= 0 || frameHeight <= 0) {
                return;
            }
            surfaceTexture.setDefaultBufferSize(frameWidth, frameHeight);
            pendingBufferSizeUpdate.set(false);
            Log.i(TAG, "Input SurfaceTexture default size -> " + frameWidth + "x" + frameHeight);
        }

        private void notifySurfaceAvailable(SurfaceTexture surfaceTexture) {
            Log.d(TAG, "Input SurfaceTexture available");
            mainHandler.post(() -> surfaceListener.onInputSurfaceAvailable(surfaceTexture));
        }

        private void destroyInputSurfaceTexture(boolean notifyListener) {
            SurfaceTexture oldSurfaceTexture = inputSurfaceTexture;
            if (oldSurfaceTexture != null) {
                if (notifyListener) {
                    notifySurfaceDestroyedBlocking();
                }
                oldSurfaceTexture.release();
                inputSurfaceTexture = null;
            }
            if (textureId != 0) {
                GLES20.glDeleteTextures(1, new int[]{textureId}, 0);
                textureId = 0;
            }
            frameAvailable.set(false);
        }

        private void notifySurfaceDestroyedBlocking() {
            if (Looper.myLooper() == Looper.getMainLooper()) {
                surfaceListener.onInputSurfaceDestroyed();
                return;
            }
            CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> {
                surfaceListener.onInputSurfaceDestroyed();
                latch.countDown();
            });
            try {
                latch.await(300, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private static final class ContextFactory implements EGLContextFactory {

        private final boolean requireSecure;

        ContextFactory(boolean requireSecure) {
            this.requireSecure = requireSecure;
        }

        @Override
        public EGLContext createContext(EGL10 egl, EGLDisplay display, EGLConfig eglConfig) {
            int[] attrs = new int[]{
                    EGL14.EGL_CONTEXT_CLIENT_VERSION, 3,
                    EGL14.EGL_NONE
            };
            if (requireSecure) {
                attrs = new int[]{
                        EGL14.EGL_CONTEXT_CLIENT_VERSION, 3,
                        EGL_PROTECTED_CONTENT_EXT, EGL14.EGL_TRUE,
                        EGL14.EGL_NONE
                };
            }
            EGLContext context = egl.eglCreateContext(display, eglConfig, EGL10.EGL_NO_CONTEXT, attrs);
            if (context == null || EGL14.eglGetError() != EGL14.EGL_SUCCESS) {
                if (context != null) {
                    egl.eglDestroyContext(display, context);
                }
                int[] fallbackAttrs = new int[]{
                        EGL14.EGL_CONTEXT_CLIENT_VERSION, 2,
                        EGL14.EGL_NONE
                };
                context = egl.eglCreateContext(display, eglConfig, EGL10.EGL_NO_CONTEXT, fallbackAttrs);
            }
            return context;
        }

        @Override
        public void destroyContext(EGL10 egl, EGLDisplay display, EGLContext context) {
            egl.eglDestroyContext(display, context);
        }
    }

    private static final class ConfigChooser implements EGLConfigChooser {

        private final boolean requireRecordableConfig;

        ConfigChooser(boolean requireRecordableConfig) {
            this.requireRecordableConfig = requireRecordableConfig;
        }

        @Override
        public EGLConfig chooseConfig(EGL10 egl, EGLDisplay display) {
            int[] attrs = buildAttribs(requireRecordableConfig);
            int[] numConfigs = new int[1];
            if (!egl.eglChooseConfig(display, attrs, null, 0, numConfigs) || numConfigs[0] <= 0) {
                if (!requireRecordableConfig) {
                    return null;
                }
                attrs = buildAttribs(false);
                if (!egl.eglChooseConfig(display, attrs, null, 0, numConfigs) || numConfigs[0] <= 0) {
                    return null;
                }
            }

            EGLConfig[] configs = new EGLConfig[numConfigs[0]];
            if (!egl.eglChooseConfig(display, attrs, configs, configs.length, numConfigs) || numConfigs[0] <= 0) {
                return null;
            }
            return configs[0];
        }

        private int[] buildAttribs(boolean recordable) {
            if (recordable) {
                return new int[]{
                        EGL10.EGL_RED_SIZE, 8,
                        EGL10.EGL_GREEN_SIZE, 8,
                        EGL10.EGL_BLUE_SIZE, 8,
                        EGL10.EGL_ALPHA_SIZE, 8,
                        EGL10.EGL_DEPTH_SIZE, 0,
                        EGL10.EGL_STENCIL_SIZE, 0,
                        EGL10.EGL_RENDERABLE_TYPE, 4,
                        EGL_RECORDABLE_ANDROID, 1,
                        EGL10.EGL_NONE
                };
            }
            return new int[]{
                    EGL10.EGL_RED_SIZE, 8,
                    EGL10.EGL_GREEN_SIZE, 8,
                    EGL10.EGL_BLUE_SIZE, 8,
                    EGL10.EGL_ALPHA_SIZE, 8,
                    EGL10.EGL_DEPTH_SIZE, 0,
                    EGL10.EGL_STENCIL_SIZE, 0,
                    EGL10.EGL_RENDERABLE_TYPE, 4,
                    EGL10.EGL_NONE
            };
        }
    }

    private static final class WindowSurfaceFactory implements EGLWindowSurfaceFactory {

        private final boolean requireSecure;

        WindowSurfaceFactory(boolean requireSecure) {
            this.requireSecure = requireSecure;
        }

        @Override
        public EGLSurface createWindowSurface(EGL10 egl, EGLDisplay display, EGLConfig config, Object nativeWindow) {
            int[] attribList = requireSecure
                    ? new int[]{EGL_PROTECTED_CONTENT_EXT, EGL14.EGL_TRUE, EGL10.EGL_NONE}
                    : new int[]{EGL10.EGL_NONE};
            return egl.eglCreateWindowSurface(display, config, nativeWindow, attribList);
        }

        @Override
        public void destroySurface(EGL10 egl, EGLDisplay display, EGLSurface surface) {
            egl.eglDestroySurface(display, surface);
        }
    }

    public interface SurfaceListener {
        void onInputSurfaceAvailable(@NonNull SurfaceTexture surfaceTexture);

        void onInputSurfaceDestroyed();
    }
}
