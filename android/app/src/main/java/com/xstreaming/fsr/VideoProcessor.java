package com.xstreaming.fsr;

import androidx.media3.common.util.GlUtil.GlException;

public interface VideoProcessor {
    void initialize(int glMajorVersion, int glMinorVersion, String extensions);

    void setSurfaceSize(int width, int height);

    boolean draw(int frameTexture,
                 long frameTimestampUs,
                 int frameWidth,
                 int frameHeight,
                 float[] transformMatrix) throws GlException;

    void release();
}
