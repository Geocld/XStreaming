package com.xstreaming.framegen;

import android.content.Context;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.view.Surface;

import androidx.annotation.Nullable;
import androidx.media3.common.util.GlProgram;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.GlUtil.GlException;
import androidx.media3.common.util.UnstableApi;

import com.xstreaming.fsr.FsrVideoProcessor;
import com.xstreaming.fsr.VideoProcessor;

import java.io.IOException;

@UnstableApi
public final class FrameGenExportProcessor implements VideoProcessor {

    private static final String TAG = "FrameGenExport";
    private final Context context;
    private final FsrVideoProcessor fsrVideoProcessor;

    @Nullable
    private GlProgram passthroughProgram;
    @Nullable
    private Surface exportSurface;

    private EGLConfig exportConfig;
    private android.opengl.EGLDisplay exportDisplay = EGL14.EGL_NO_DISPLAY;
    private android.opengl.EGLContext exportContext = EGL14.EGL_NO_CONTEXT;
    private EGLSurface exportEglSurface = EGL14.EGL_NO_SURFACE;

    private int exportWidth;
    private int exportHeight;
    private int previewWidth = 1;
    private int previewHeight = 1;
    private long lastSubmittedTimestampUs = Long.MIN_VALUE;
    private int skippedFrameLogCount;
    private int exportedFrameLogCount;
    private boolean fsrEnabled;
    private boolean hdrToneMappingEnabled;

    public FrameGenExportProcessor(Context context) {
        this.context = context.getApplicationContext();
        this.fsrVideoProcessor = new FsrVideoProcessor(this.context);
    }

    @Override
    public void initialize(int glMajorVersion, int glMinorVersion, String extensions) {
        releaseProgram();
        destroyExportEglSurface();
        exportConfig = null;
        exportDisplay = EGL14.EGL_NO_DISPLAY;
        exportContext = EGL14.EGL_NO_CONTEXT;
        lastSubmittedTimestampUs = Long.MIN_VALUE;
        skippedFrameLogCount = 0;
        exportedFrameLogCount = 0;
        fsrVideoProcessor.initialize(glMajorVersion, glMinorVersion, extensions);
        fsrVideoProcessor.setHdrToneMappingEnabled(hdrToneMappingEnabled);
        fsrVideoProcessor.setFsrEnabled(fsrEnabled);
        FrameGenLog.i(TAG, "Frame export processor initialized on GLES " + glMajorVersion + "." + glMinorVersion);
    }

    @Override
    public void setSurfaceSize(int width, int height) {
        previewWidth = Math.max(1, width);
        previewHeight = Math.max(1, height);
    }

    public void setExportSurface(@Nullable Surface surface, int width, int height) {
        boolean sameSurface = exportSurface == surface;
        if (sameSurface && exportWidth == width && exportHeight == height) {
            return;
        }
        destroyExportEglSurface();
        exportSurface = surface;
        exportWidth = width;
        exportHeight = height;
        lastSubmittedTimestampUs = Long.MIN_VALUE;
        skippedFrameLogCount = 0;
        exportedFrameLogCount = 0;
        if (surface == null) {
            FrameGenLog.milestone(TAG, "FG export surface cleared");
        } else {
            fsrVideoProcessor.setSurfaceSize(width, height);
            FrameGenLog.milestone(TAG, "FG export surface attached " + width + "x" + height);
        }
    }

    public void setFsrEnabled(boolean enabled) {
        fsrEnabled = enabled;
        fsrVideoProcessor.setFsrEnabled(enabled);
    }

    public void setHdrToneMappingEnabled(boolean enabled) {
        hdrToneMappingEnabled = enabled;
        fsrVideoProcessor.setHdrToneMappingEnabled(enabled);
    }

    @Override
    public boolean draw(
            int frameTexture,
            long frameTimestampUs,
            int frameWidth,
            int frameHeight,
            float[] transformMatrix
    ) throws GlException {
        clearPreviewSurface();

        if (frameTexture == 0
                || frameTimestampUs <= 0
                || frameTimestampUs == lastSubmittedTimestampUs
                || frameWidth <= 0
                || frameHeight <= 0
                || exportSurface == null
                || !exportSurface.isValid()
                || exportWidth <= 0
                || exportHeight <= 0) {
            if (skippedFrameLogCount < 12) {
                skippedFrameLogCount++;
                FrameGenLog.milestone(TAG, "FG skip export frame tex=" + frameTexture
                        + " ts=" + frameTimestampUs
                        + " frame=" + frameWidth + "x" + frameHeight
                        + " exportSurface=" + (exportSurface != null && exportSurface.isValid())
                        + " export=" + exportWidth + "x" + exportHeight
                        + " lastTs=" + lastSubmittedTimestampUs);
            }
            return false;
        }

        if (!ensureExportEglSurface()) {
            return false;
        }

        if (renderIntoExportSurface(frameTexture, frameTimestampUs, frameWidth, frameHeight, transformMatrix)) {
            lastSubmittedTimestampUs = frameTimestampUs;
            if (exportedFrameLogCount < 12) {
                exportedFrameLogCount++;
                FrameGenLog.milestone(TAG, "FG exported frame #" + exportedFrameLogCount
                        + " ts=" + frameTimestampUs
                        + " frame=" + frameWidth + "x" + frameHeight);
            }
            return true;
        } else {
            destroyExportEglSurface();
            return false;
        }
    }

    @Override
    public void release() {
        destroyExportEglSurface();
        releaseProgram();
        fsrVideoProcessor.release();
        exportSurface = null;
        exportConfig = null;
        exportDisplay = EGL14.EGL_NO_DISPLAY;
        exportContext = EGL14.EGL_NO_CONTEXT;
        lastSubmittedTimestampUs = Long.MIN_VALUE;
    }

    private boolean ensureExportEglSurface() {
        if (exportSurface == null || !exportSurface.isValid()) {
            return false;
        }

        android.opengl.EGLDisplay currentDisplay = EGL14.eglGetCurrentDisplay();
        android.opengl.EGLContext currentContext = EGL14.eglGetCurrentContext();
        EGLSurface currentDrawSurface = EGL14.eglGetCurrentSurface(EGL14.EGL_DRAW);
        if (currentDisplay == EGL14.EGL_NO_DISPLAY
                || currentContext == EGL14.EGL_NO_CONTEXT
                || currentDrawSurface == EGL14.EGL_NO_SURFACE) {
            FrameGenLog.w(TAG, "Current EGL state unavailable for frame export");
            return false;
        }

        // android.opengl.EGLContext is a Java wrapper object. On some stacks
        // eglGetCurrentContext() can hand back a different wrapper instance
        // for the same native EGLContext handle, which makes `==` unstable and
        // forces us to destroy/recreate the export window surface every frame.
        // The processor lifecycle already resets this state on real context
        // recreation, so for the steady-state stream path reusing the live
        // surface whenever the EGLDisplay matches is the safer behavior.
        if (exportEglSurface != EGL14.EGL_NO_SURFACE
                && currentDisplay == exportDisplay) {
            return true;
        }

        destroyExportEglSurface();
        exportDisplay = currentDisplay;
        exportContext = currentContext;
        exportConfig = resolveCurrentConfig(currentDisplay, currentDrawSurface);
        if (exportConfig == null) {
            FrameGenLog.w(TAG, "Failed to resolve current EGL config, trying RGBA8888 window fallback");
            exportConfig = chooseWindowConfig(currentDisplay);
            if (exportConfig == null) {
                FrameGenLog.w(TAG, "Failed to choose fallback EGL config for frame export");
                return false;
            }
        }

        exportEglSurface = createWindowSurface(currentDisplay, exportConfig, "current");
        if (exportEglSurface == EGL14.EGL_NO_SURFACE) {
            EGLConfig fallbackConfig = chooseWindowConfig(currentDisplay);
            if (fallbackConfig != null && fallbackConfig != exportConfig) {
                FrameGenLog.w(TAG, "eglCreateWindowSurface failed with current config, retrying fallback config");
                exportConfig = fallbackConfig;
                exportEglSurface = createWindowSurface(currentDisplay, exportConfig, "fallback");
            }
        }
        if (exportEglSurface == EGL14.EGL_NO_SURFACE) {
            return false;
        }

        FrameGenLog.milestone(TAG, "FG export EGL surface ready " + exportWidth + "x" + exportHeight);
        return true;
    }

    private boolean renderIntoExportSurface(
            int frameTexture,
            long frameTimestampUs,
            int frameWidth,
            int frameHeight,
            float[] transformMatrix
    ) {
        android.opengl.EGLDisplay currentDisplay = EGL14.eglGetCurrentDisplay();
        android.opengl.EGLContext currentContext = EGL14.eglGetCurrentContext();
        EGLSurface previousDrawSurface = EGL14.eglGetCurrentSurface(EGL14.EGL_DRAW);
        EGLSurface previousReadSurface = EGL14.eglGetCurrentSurface(EGL14.EGL_READ);
        if (currentDisplay == EGL14.EGL_NO_DISPLAY
                || currentContext == EGL14.EGL_NO_CONTEXT
                || previousDrawSurface == EGL14.EGL_NO_SURFACE
                || previousReadSurface == EGL14.EGL_NO_SURFACE) {
            return false;
        }

        try {
            if (!EGL14.eglMakeCurrent(currentDisplay, exportEglSurface, exportEglSurface, currentContext)) {
                FrameGenLog.w(TAG, "eglMakeCurrent(export) failed: 0x"
                        + Integer.toHexString(EGL14.eglGetError()));
                return false;
            }

            GLES20.glViewport(0, 0, exportWidth, exportHeight);
            if (fsrEnabled) {
                fsrVideoProcessor.setSurfaceSize(exportWidth, exportHeight);
                fsrVideoProcessor.draw(
                        frameTexture,
                        frameTimestampUs,
                        frameWidth,
                        frameHeight,
                        transformMatrix
                );
            } else {
                GlProgram program = ensurePassthroughProgram();
                GLES20.glClearColor(0f, 0f, 0f, 1f);
                GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
                program.use();
                program.setSamplerTexIdUniform("inputTexture", frameTexture, 0);
                program.setFloatsUniform("uTexTransform", transformMatrix);
                program.setFloatUniform("uHdrToneMap", 0f);
                program.bindAttributesAndUniforms();
                GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
                GlUtil.checkGlError();
            }
            EGLExt.eglPresentationTimeANDROID(currentDisplay, exportEglSurface, frameTimestampUs * 1000L);
            if (!EGL14.eglSwapBuffers(currentDisplay, exportEglSurface)) {
                FrameGenLog.w(TAG, "eglSwapBuffers(export) failed: 0x"
                        + Integer.toHexString(EGL14.eglGetError()));
                return false;
            }
            return true;
        } catch (GlException | IOException e) {
            FrameGenLog.w(TAG, "Frame export draw failed", e);
            return false;
        } finally {
            EGL14.eglMakeCurrent(currentDisplay, previousDrawSurface, previousReadSurface, currentContext);
            clearPreviewSurface();
        }
    }

    @Nullable
    private EGLConfig resolveCurrentConfig(android.opengl.EGLDisplay display, EGLSurface drawSurface) {
        int[] configId = new int[1];
        if (!EGL14.eglQuerySurface(display, drawSurface, EGL14.EGL_CONFIG_ID, configId, 0)) {
            return null;
        }

        int[] numConfigs = new int[1];
        if (!EGL14.eglGetConfigs(display, null, 0, 0, numConfigs, 0) || numConfigs[0] <= 0) {
            return null;
        }

        EGLConfig[] configs = new EGLConfig[numConfigs[0]];
        if (!EGL14.eglGetConfigs(display, configs, 0, configs.length, numConfigs, 0)) {
            return null;
        }

        int[] value = new int[1];
        for (EGLConfig config : configs) {
            if (config == null) {
                continue;
            }
            if (EGL14.eglGetConfigAttrib(display, config, EGL14.EGL_CONFIG_ID, value, 0)
                    && value[0] == configId[0]) {
                return config;
            }
        }
        return null;
    }

    @Nullable
    private EGLConfig chooseWindowConfig(android.opengl.EGLDisplay display) {
        int[] attribList = new int[]{
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
                EGL14.EGL_RED_SIZE, 8,
                EGL14.EGL_GREEN_SIZE, 8,
                EGL14.EGL_BLUE_SIZE, 8,
                EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_NONE
        };
        EGLConfig[] configs = new EGLConfig[1];
        int[] numConfigs = new int[1];
        if (!EGL14.eglChooseConfig(display, attribList, 0, configs, 0, configs.length, numConfigs, 0)
                || numConfigs[0] <= 0
                || configs[0] == null) {
            return null;
        }
        return configs[0];
    }

    private EGLSurface createWindowSurface(
            android.opengl.EGLDisplay display,
            EGLConfig config,
            String label
    ) {
        EGLSurface surface = EGL14.eglCreateWindowSurface(
                display,
                config,
                exportSurface,
                new int[]{EGL14.EGL_NONE},
                0
        );
        if (surface == null || surface == EGL14.EGL_NO_SURFACE) {
            FrameGenLog.w(TAG, "eglCreateWindowSurface(" + label + ") failed: 0x"
                    + Integer.toHexString(EGL14.eglGetError()));
            return EGL14.EGL_NO_SURFACE;
        }
        return surface;
    }

    private GlProgram ensurePassthroughProgram() throws GlException, IOException {
        if (passthroughProgram == null) {
            passthroughProgram = new GlProgram(
                    context,
                    "fsr/2.0/opt_fsr_vertex.glsl",
                    "fsr/2.0/passthrough_fragment.glsl"
            );
            passthroughProgram.setBufferAttribute(
                    "aPosition",
                    GlUtil.getNormalizedCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );
            passthroughProgram.setBufferAttribute(
                    "aTexCoords",
                    GlUtil.getTextureCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );
        }
        return passthroughProgram;
    }

    private void clearPreviewSurface() {
        GLES20.glViewport(0, 0, previewWidth, previewHeight);
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
    }

    private void destroyExportEglSurface() {
        if (exportDisplay != EGL14.EGL_NO_DISPLAY && exportEglSurface != EGL14.EGL_NO_SURFACE) {
            EGL14.eglDestroySurface(exportDisplay, exportEglSurface);
        }
        exportEglSurface = EGL14.EGL_NO_SURFACE;
    }

    private void releaseProgram() {
        if (passthroughProgram == null) {
            return;
        }
        try {
            passthroughProgram.delete();
        } catch (GlException e) {
            FrameGenLog.w(TAG, "Failed to delete passthrough program", e);
        }
        passthroughProgram = null;
    }
}
