package com.xstreaming.fsr;

import android.content.Context;
import android.opengl.EGL14;
import android.opengl.GLES20;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.media3.common.util.GlProgram;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.GlUtil.GlException;
import androidx.media3.common.util.UnstableApi;

import java.io.IOException;

@UnstableApi
public class FsrVideoProcessor implements VideoProcessor {

    private static final String TAG = "FsrVideoProcessor";
    // Keep two-pass pipeline enabled; runtime failures will fallback automatically.
    private static final boolean ENABLE_TWO_PASS_PIPELINE = true;
    // Some drivers fail with invalid operation on 3.1 two-pass uniforms; prefer 3.1 mobile instead.
    private static final boolean ENABLE_TWO_PASS_FOR_31 = false;
    // Enable software HDR->SDR mapping for SDR output windows.
    private static final boolean FORCE_SOFTWARE_HDR_TONE_MAP = true;

    private static final int EGL_EXTENSIONS = 0x3055;
    private static final int EGL_GL_COLORSPACE_KHR = 0x309D;
    private static final int EGL_GL_COLORSPACE_BT2020_PQ_EXT = 0x3340;

    private static final int PIPELINE_NONE = 0;
    private static final int PIPELINE_TWO_PASS = 1;
    private static final int PIPELINE_MOBILE_SINGLE_PASS = 2;

    private final Context context;

    private int pipelineMode = PIPELINE_NONE;
    private String activeShaderDir = "fsr/2.0/";
    private boolean needInputSize = true;

    private final int[] framebuffers = new int[1];
    private final int[] textures = new int[1];

    @Nullable
    private GlProgram easuProgram;
    @Nullable
    private GlProgram rcasProgram;
    @Nullable
    private GlProgram mobileProgram;
    @Nullable
    private GlProgram passthroughProgram;

    // RCAS sharpness is inverse (0 = strongest, bigger = weaker).
    private float rcasSharpness = 0.1f;
    // Mobile single-pass shader uses 1.0 as normal strength.
    private float mobileSharpness = 1.5f;

    private boolean mobileHasSharpness;
    private boolean mobileHasHdrToneMap;
    private boolean twoPassFailureLogged;

    private boolean fsrEnabled = true;
    private boolean hdrInputEnabled;
    private boolean usingPqWindow;

    private int outputWidth = -1;
    private int outputHeight = -1;
    private float[] outputSize = new float[2];

    public FsrVideoProcessor(Context context) {
        this.context = context.getApplicationContext();
    }

    @Override
    public void initialize(int glMajorVersion, int glMinorVersion, String extensions) {
        resetPrograms();
        deleteFramebuffer();
        detectHdrWindowState();

        boolean supportsExternalOesEssl3 = extensions != null
                && extensions.contains("GL_OES_EGL_image_external_essl3");

        String preferredDir = "fsr/2.0/";
        boolean preferredNeedInputSize = true;
        if (supportsExternalOesEssl3) {
            if (glMajorVersion > 3 || (glMajorVersion == 3 && glMinorVersion >= 1)) {
                preferredDir = "fsr/3.1/";
                preferredNeedInputSize = false;
            } else if (glMajorVersion == 3 && glMinorVersion == 0) {
                preferredDir = "fsr/3.0/";
                preferredNeedInputSize = false;
            }
        } else if (glMajorVersion >= 3) {
            Log.w(TAG, "GLES3 context without GL_OES_EGL_image_external_essl3, force FSR 2.0 shaders");
        }

        Log.i(TAG, "FSR preferred shader dir: " + preferredDir);
        Log.i(TAG, "OpenGL extensions: " + extensions);

        boolean skipTwoPassForDriverStability = !ENABLE_TWO_PASS_PIPELINE;
        if (skipTwoPassForDriverStability) {
            Log.w(TAG, "Skip two-pass FSR globally, use mobile pipeline for stability");
        }

        boolean tryTwoPassPreferred = !skipTwoPassForDriverStability
                && (!"fsr/3.1/".equals(preferredDir) || ENABLE_TWO_PASS_FOR_31);
        if ("fsr/3.1/".equals(preferredDir) && !ENABLE_TWO_PASS_FOR_31) {
            Log.w(TAG, "Skip two-pass for fsr/3.1 and use 3.1 mobile path to avoid driver invalid-operation");
        }
        if (tryTwoPassPreferred
                && (tryInitTwoPass(preferredDir, preferredNeedInputSize)
                || (!"fsr/2.0/".equals(preferredDir) && tryInitTwoPass("fsr/2.0/", true)))) {
            // Keep texture parameters aligned with TvBox FsrVideoProcessor implementation.
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
            return;
        }

        // If two-pass FSR hits driver compiler bugs, fallback to mobile single-pass FSR (still has sharpening).
        boolean preferredHasHdrToneMap = true;
        boolean preferredHasSharpness = "fsr/2.0/".equals(preferredDir);
        if (tryInitMobileSinglePass(
                preferredDir,
                preferredNeedInputSize,
                preferredHasHdrToneMap,
                preferredHasSharpness
        )
                || (!"fsr/2.0/".equals(preferredDir)
                && tryInitMobileSinglePass("fsr/2.0/", true, true, true))) {
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
            return;
        }

        pipelineMode = PIPELINE_NONE;
        activeShaderDir = "none";
        Log.e(TAG, "All FSR pipelines failed, fallback to passthrough only");
    }

    @Override
    public void setSurfaceSize(int width, int height) {
        if (width <= 0 || height <= 0) {
            return;
        }
        if (outputWidth == width && outputHeight == height) {
            return;
        }
        Log.i(TAG, "setSurfaceSize(" + width + "," + height + ")");
        outputWidth = width;
        outputHeight = height;
        outputSize = new float[]{width, height};

        if (pipelineMode == PIPELINE_TWO_PASS) {
            deleteFramebuffer();
            createFramebuffer();
        } else {
            deleteFramebuffer();
        }
    }

    @Override
    public boolean draw(int frameTexture,
                        long frameTimestampUs,
                        int frameWidth,
                        int frameHeight,
                        float[] transformMatrix) {
        if (!fsrEnabled) {
            return drawPassthrough(frameTexture, transformMatrix);
        }

        if (pipelineMode == PIPELINE_TWO_PASS) {
            return drawTwoPass(frameTexture, frameWidth, frameHeight, transformMatrix);
        }
        if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
            return drawMobileSinglePass(frameTexture, frameWidth, frameHeight, transformMatrix);
        }

        return drawPassthrough(frameTexture, transformMatrix);
    }

    @Override
    public void release() {
        resetPrograms();
        deleteFramebuffer();
    }

    public void setHdrToneMappingEnabled(boolean enabled) {
        hdrInputEnabled = enabled;
        if (enabled && !FORCE_SOFTWARE_HDR_TONE_MAP) {
            Log.i(
                    TAG,
                    "HDR stream detected; software HDR tone-map disabled."
            );
        }
    }

    public void setSharpness(float value) {
        float clamped = Math.max(0f, Math.min(2f, value));
        mobileSharpness = clamped;
        // Map [0..2] (stronger as larger) to RCAS stop domain [2..0].
        rcasSharpness = 2f - clamped;
        Log.i(
                TAG,
                "Sharpness request=" + value + ", clamped=" + clamped
                        + ", mobileApplied=" + mobileSharpness
                        + ", rcasApplied=" + rcasSharpness
        );
        logEffectiveSharpness("setSharpness");
    }

    public void resetSharpness() {
        rcasSharpness = 0.2f;
        mobileSharpness = 1.4f;
        logEffectiveSharpness("resetSharpness");
    }

    public void setFsrEnabled(boolean enabled) {
        fsrEnabled = enabled;
    }

    public void setBypassScaleThreshold(float threshold) {
        // No-op in current FSR pipeline. Kept for API compatibility.
    }

    public void setMaxFsrPixels(int maxPixels) {
        // No-op in current FSR pipeline. Kept for API compatibility.
    }

    public void setOutputSizeOverride(int width, int height) {
        // No-op in current FSR pipeline. Kept for API compatibility.
    }

    private boolean tryInitTwoPass(String shaderDir, boolean requireInputSize) {
        try {
            GlProgram easu = new GlProgram(
                    context,
                    shaderDir + "fsr_easu_vertex.glsl",
                    shaderDir + "fsr_easu_fragment.glsl"
            );
            easu.setBufferAttribute(
                    "aPosition",
                    GlUtil.getNormalizedCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );
            easu.setBufferAttribute(
                    "aTexCoords",
                    GlUtil.getTextureCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );

            GlProgram rcas = new GlProgram(
                    context,
                    shaderDir + "fsr_rcas_vertex.glsl",
                    shaderDir + "fsr_rcas_fragment.glsl"
            );
            rcas.setBufferAttribute(
                    "aPosition",
                    GlUtil.getNormalizedCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );
            rcas.setBufferAttribute(
                    "aTexCoords",
                    GlUtil.getTextureCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );

            easuProgram = easu;
            rcasProgram = rcas;
            needInputSize = requireInputSize;
            pipelineMode = PIPELINE_TWO_PASS;
            activeShaderDir = shaderDir;
            if (outputWidth > 0 && outputHeight > 0) {
                createFramebuffer();
            }
            Log.i(TAG, "FSR pipeline active: two-pass, shaderDir=" + shaderDir);
            logEffectiveSharpness("init-two-pass");
            return true;
        } catch (GlException | IOException e) {
            Log.e(TAG, "Failed to initialize two-pass FSR from " + shaderDir, e);
            safeDeleteProgram(easuProgram);
            easuProgram = null;
            safeDeleteProgram(rcasProgram);
            rcasProgram = null;
            return false;
        }
    }

    private boolean tryInitMobileSinglePass(String shaderDir,
                                            boolean requireInputSize,
                                            boolean hasHdrToneMapUniform,
                                            boolean hasSharpnessUniform) {
        try {
            GlProgram program = new GlProgram(
                    context,
                    shaderDir + "opt_fsr_vertex.glsl",
                    shaderDir + "opt_fsr_fragment.glsl"
            );
            program.setBufferAttribute(
                    "aPosition",
                    GlUtil.getNormalizedCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );
            program.setBufferAttribute(
                    "aTexCoords",
                    GlUtil.getTextureCoordinateBounds(),
                    GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
            );

            mobileProgram = program;
            needInputSize = requireInputSize;
            mobileHasHdrToneMap = hasHdrToneMapUniform;
            mobileHasSharpness = hasSharpnessUniform;
            pipelineMode = PIPELINE_MOBILE_SINGLE_PASS;
            activeShaderDir = shaderDir;
            deleteFramebuffer();
            Log.w(TAG, "FSR pipeline fallback: mobile single-pass, shaderDir=" + shaderDir);
            logEffectiveSharpness("init-mobile-single-pass");
            return true;
        } catch (GlException | IOException e) {
            Log.e(TAG, "Failed to initialize mobile single-pass FSR from " + shaderDir, e);
            safeDeleteProgram(mobileProgram);
            mobileProgram = null;
            return false;
        }
    }

    private boolean drawTwoPass(int frameTexture,
                                int frameWidth,
                                int frameHeight,
                                float[] transformMatrix) {
        GlProgram easu = easuProgram;
        GlProgram rcas = rcasProgram;
        if (easu == null || rcas == null) {
            return drawPassthrough(frameTexture, transformMatrix);
        }
        if (outputWidth <= 0 || outputHeight <= 0) {
            return drawPassthrough(frameTexture, transformMatrix);
        }
        if (framebuffers[0] == 0 || textures[0] == 0) {
            createFramebuffer();
            if (framebuffers[0] == 0 || textures[0] == 0) {
                return drawPassthrough(frameTexture, transformMatrix);
            }
        }

        float[] inputTextureSize = null;
        if (needInputSize) {
            inputTextureSize = (frameWidth > 0 && frameHeight > 0)
                    ? new float[]{frameWidth, frameHeight}
                    : new float[]{0f, 0f};
        }

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, framebuffers[0]);
        try {
            easu.setSamplerTexIdUniform("inputTexture", frameTexture, 0);
            if (inputTextureSize != null) {
                easu.setFloatsUniform("inputTextureSize", inputTextureSize);
            }
            easu.setFloatsUniform("outputTextureSize", outputSize);
            easu.setFloatsUniform("uTexTransform", transformMatrix);
            easu.setFloatUniform("uHdrToneMap", shouldApplySoftwareHdrToneMap() ? 1f : 0f);
            easu.bindAttributesAndUniforms();
        } catch (GlException e) {
            Log.e(TAG, "Failed to bind EASU shader program (" + activeShaderDir + ")", e);
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
            fallbackToMobileSinglePass("bind-easu");
            if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
                return drawMobileSinglePass(frameTexture, frameWidth, frameHeight, transformMatrix);
            } else {
                return drawPassthrough(frameTexture, transformMatrix);
            }
        }
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        if (!checkGlError("Failed EASU draw")) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
            fallbackToMobileSinglePass("draw-easu");
            if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
                return drawMobileSinglePass(frameTexture, frameWidth, frameHeight, transformMatrix);
            } else {
                return drawPassthrough(frameTexture, transformMatrix);
            }
        }

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
        try {
            rcas.setSamplerTexIdUniform("inputTexture", textures[0], 0);
            if (needInputSize) {
                rcas.setFloatsUniform("inputTextureSize", outputSize);
            }
            rcas.setFloatUniform("sharpness", rcasSharpness);
            rcas.bindAttributesAndUniforms();
        } catch (GlException e) {
            Log.e(TAG, "Failed to bind RCAS shader program (" + activeShaderDir + ")", e);
            fallbackToMobileSinglePass("bind-rcas");
            if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
                return drawMobileSinglePass(frameTexture, frameWidth, frameHeight, transformMatrix);
            } else {
                return drawPassthrough(frameTexture, transformMatrix);
            }
        }
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        if (!checkGlError("Failed RCAS draw")) {
            fallbackToMobileSinglePass("draw-rcas");
            if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
                return drawMobileSinglePass(frameTexture, frameWidth, frameHeight, transformMatrix);
            } else {
                return drawPassthrough(frameTexture, transformMatrix);
            }
        }
        return true;
    }

    private boolean drawMobileSinglePass(int frameTexture,
                                         int frameWidth,
                                         int frameHeight,
                                         float[] transformMatrix) {
        GlProgram program = mobileProgram;
        if (program == null || outputWidth <= 0 || outputHeight <= 0) {
            return drawPassthrough(frameTexture, transformMatrix);
        }

        float[] inputTextureSize = null;
        if (needInputSize) {
            inputTextureSize = (frameWidth > 0 && frameHeight > 0)
                    ? new float[]{frameWidth, frameHeight}
                    : new float[]{0f, 0f};
        }

        try {
            program.setSamplerTexIdUniform("inputTexture", frameTexture, 0);
            if (inputTextureSize != null) {
                program.setFloatsUniform("inputTextureSize", inputTextureSize);
            }
            program.setFloatsUniform("outputTextureSize", outputSize);
            program.setFloatsUniform("uTexTransform", transformMatrix);
            if (mobileHasHdrToneMap) {
                program.setFloatUniform("uHdrToneMap", shouldApplySoftwareHdrToneMap() ? 1f : 0f);
            }
            if (mobileHasSharpness) {
                program.setFloatUniform("sharpness", mobileSharpness);
            }
            program.bindAttributesAndUniforms();
        } catch (GlException e) {
            Log.e(TAG, "Failed to bind mobile FSR shader program (" + activeShaderDir + ")", e);
            return drawPassthrough(frameTexture, transformMatrix);
        }

        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        if (!checkGlError("Failed mobile FSR draw")) {
            return drawPassthrough(frameTexture, transformMatrix);
        }
        return true;
    }

    private void createFramebuffer() {
        if (outputWidth <= 0 || outputHeight <= 0) {
            return;
        }
        GLES20.glGenFramebuffers(1, framebuffers, 0);
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, framebuffers[0]);

        GLES20.glGenTextures(1, textures, 0);
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[0]);
        GLES20.glTexImage2D(
                GLES20.GL_TEXTURE_2D,
                0,
                GLES20.GL_RGBA,
                outputWidth,
                outputHeight,
                0,
                GLES20.GL_RGBA,
                GLES20.GL_UNSIGNED_BYTE,
                null
        );
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);

        GLES20.glFramebufferTexture2D(
                GLES20.GL_FRAMEBUFFER,
                GLES20.GL_COLOR_ATTACHMENT0,
                GLES20.GL_TEXTURE_2D,
                textures[0],
                0
        );

        int status = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER);
        if (status != GLES20.GL_FRAMEBUFFER_COMPLETE) {
            Log.e(TAG, "Framebuffer is not complete: " + status);
            deleteFramebuffer();
        }

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
    }

    private void deleteFramebuffer() {
        if (framebuffers[0] != 0) {
            GLES20.glDeleteFramebuffers(1, framebuffers, 0);
            framebuffers[0] = 0;
        }
        if (textures[0] != 0) {
            GLES20.glDeleteTextures(1, textures, 0);
            textures[0] = 0;
        }
    }

    private boolean drawPassthrough(int frameTexture, float[] transformMatrix) {
        GlProgram program;
        try {
            program = ensurePassthroughProgram();
            program.setSamplerTexIdUniform("inputTexture", frameTexture, 0);
            program.setFloatsUniform("uTexTransform", transformMatrix);
            program.setFloatUniform("uHdrToneMap", shouldApplySoftwareHdrToneMap() ? 1f : 0f);
            program.bindAttributesAndUniforms();
        } catch (GlException | IOException e) {
            Log.e(TAG, "Failed to bind passthrough shader program", e);
            return false;
        }

        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        return checkGlError("FSR passthrough draw failed");
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

    private void resetPrograms() {
        safeDeleteProgram(easuProgram);
        easuProgram = null;

        safeDeleteProgram(rcasProgram);
        rcasProgram = null;

        safeDeleteProgram(mobileProgram);
        mobileProgram = null;

        safeDeleteProgram(passthroughProgram);
        passthroughProgram = null;

        pipelineMode = PIPELINE_NONE;
        activeShaderDir = "none";
        needInputSize = true;
        mobileHasSharpness = false;
        mobileHasHdrToneMap = false;
        twoPassFailureLogged = false;
    }

    private void fallbackToMobileSinglePass(String reason) {
        if (pipelineMode != PIPELINE_TWO_PASS) {
            return;
        }
        String failedShaderDir = activeShaderDir;
        boolean failedNeedInputSize = needInputSize;
        if (!twoPassFailureLogged) {
            Log.w(TAG, "Switching pipeline from two-pass to mobile single-pass, reason=" + reason
                    + ", shaderDir=" + activeShaderDir);
            twoPassFailureLogged = true;
        }
        safeDeleteProgram(easuProgram);
        easuProgram = null;
        safeDeleteProgram(rcasProgram);
        rcasProgram = null;
        deleteFramebuffer();
        pipelineMode = PIPELINE_NONE;
        activeShaderDir = "none";

        boolean failedHasHdrToneMap = true;
        boolean failedHasSharpness = "fsr/2.0/".equals(failedShaderDir);
        if (tryInitMobileSinglePass(
                failedShaderDir,
                failedNeedInputSize,
                failedHasHdrToneMap,
                failedHasSharpness
        )) {
            return;
        }
        if (!"fsr/2.0/".equals(failedShaderDir)) {
            tryInitMobileSinglePass("fsr/2.0/", true, true, true);
        }
    }

    private boolean checkGlError(String message) {
        try {
            GlUtil.checkGlError();
            return true;
        } catch (GlException e) {
            Log.e(TAG, message, e);
            return false;
        }
    }

    private void logEffectiveSharpness(String reason) {
        if (pipelineMode == PIPELINE_TWO_PASS) {
            Log.i(
                    TAG,
                    "Effective sharpness [" + reason + "]: pipeline=two-pass, using rcasSharpness="
                            + rcasSharpness + " (smaller is sharper)"
            );
            return;
        }
        if (pipelineMode == PIPELINE_MOBILE_SINGLE_PASS) {
            Log.i(
                    TAG,
                    "Effective sharpness [" + reason + "]: pipeline=mobile-single-pass, using mobileSharpness="
                            + mobileSharpness + " (larger is sharper)"
            );
            return;
        }
        Log.i(TAG, "Effective sharpness [" + reason + "]: pipeline=none");
    }

    private boolean shouldApplySoftwareHdrToneMap() {
        if (!hdrInputEnabled) {
            return false;
        }
        if (usingPqWindow) {
            // PQ output window should preserve HDR signal and avoid SDR tone map in this shader path.
            return false;
        }
        return FORCE_SOFTWARE_HDR_TONE_MAP;
    }

    private void detectHdrWindowState() {
        usingPqWindow = false;
        android.opengl.EGLDisplay display = EGL14.eglGetCurrentDisplay();
        android.opengl.EGLSurface drawSurface = EGL14.eglGetCurrentSurface(EGL14.EGL_DRAW);
        if (display == null || display == EGL14.EGL_NO_DISPLAY
                || drawSurface == null || drawSurface == EGL14.EGL_NO_SURFACE) {
            return;
        }

        String eglExtensions = EGL14.eglQueryString(display, EGL_EXTENSIONS);
        boolean supportsPqColorspace = eglExtensions != null
                && eglExtensions.contains("EGL_KHR_gl_colorspace")
                && eglExtensions.contains("EGL_EXT_gl_colorspace_bt2020_pq");
        if (!supportsPqColorspace) {
            Log.i(TAG, "EGL PQ colorspace extension unavailable; use SDR window path.");
            return;
        }

        int[] colorspace = new int[1];
        if (EGL14.eglQuerySurface(display, drawSurface, EGL_GL_COLORSPACE_KHR, colorspace, 0)) {
            usingPqWindow = colorspace[0] == EGL_GL_COLORSPACE_BT2020_PQ_EXT;
        }

        Log.i(
                TAG,
                "HDR surface state: usingPqWindow=" + usingPqWindow
                        + ", forceSoftwareToneMap=" + FORCE_SOFTWARE_HDR_TONE_MAP
        );
    }

    private void safeDeleteProgram(@Nullable GlProgram program) {
        if (program == null) {
            return;
        }
        try {
            program.delete();
        } catch (GlException e) {
            Log.w(TAG, "Failed to delete GL program", e);
        }
    }
}
