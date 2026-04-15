#version 310 es
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// FidelityFX FSR v1.0.2 by AMD
// Reference https://github.com/GPUOpen-Effects/FidelityFX-FSR/tree/master/ffx-fsr

#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;

uniform samplerExternalOES inputTexture; // 纹理
// uniform vec2 inputTextureSize; // 输入纹理大小
uniform vec2 outputTextureSize; // 输出纹理大小
uniform float uHdrToneMap; // HDR tone mapping 开关

in vec2 vTexCoord; // 从顶点着色器传过来的纹理坐标
out vec4 fragColor; // 输出颜色

vec3 applyHdrToneMap(vec3 color) {
    if (uHdrToneMap < 0.5) {
        return color;
    }

    const float m1 = 0.1593017578125;
    const float m2 = 78.84375;
    const float c1 = 0.8359375;
    const float c2 = 18.8515625;
    const float c3 = 18.6875;

    vec3 powered = pow(max(color, vec3(0.0)), vec3(1.0 / m2));
    vec3 numerator = max(powered - vec3(c1), vec3(0.0));
    vec3 denominator = max(vec3(c2) - vec3(c3) * powered, vec3(1e-6));

    vec3 linearHdr2020 = pow(numerator / denominator, vec3(1.0 / m1)) * 10000.0;
    vec3 linearHdr709 = max(vec3(
        dot(linearHdr2020, vec3(1.6605, -0.5876, -0.0728)),
        dot(linearHdr2020, vec3(-0.1246, 1.1329, -0.0083)),
        dot(linearHdr2020, vec3(-0.0182, -0.1006, 1.1187))
    ), vec3(0.0));
    vec3 linearScene = linearHdr709 / 203.0;
    vec3 linearSdr = linearScene / (vec3(1.0) + linearScene);
    linearSdr = mix(linearSdr, sqrt(max(linearSdr, vec3(0.0))), 0.10);
    linearSdr = clamp(linearSdr, 0.0, 1.0);

    vec3 lower = linearSdr * 12.92;
    vec3 higher = 1.055 * pow(max(linearSdr, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    vec3 cutoff = step(vec3(0.0031308), linearSdr);
    return mix(lower, higher, cutoff);
}

vec3 sampleInput(vec2 uv) {
    return applyHdrToneMap(texture(inputTexture, uv).rgb);
}

//==============================================================================================================================
//
//                                        FSR - [EASU] EDGE ADAPTIVE SPATIAL UPSAMPLING
//
//------------------------------------------------------------------------------------------------------------------------------
// EASU provides a high quality spatial-only scaling at relatively low cost.
// Meaning EASU is appropiate for laptops and other low-end GPUs.
// Quality from 1x to 4x area scaling is good.
//------------------------------------------------------------------------------------------------------------------------------
// The scalar uses a modified fast approximation to the standard lanczos(size=2) kernel.
// EASU runs in a single pass, so it applies a directionally and anisotropically adaptive radial lanczos.
// This is also kept as simple as possible to have minimum runtime.
//------------------------------------------------------------------------------------------------------------------------------
// The lanzcos filter has negative lobes, so by itself it will introduce ringing.
// To remove all ringing, the algorithm uses the nearest 2x2 input texels as a neighborhood,
// and limits output to the minimum and maximum of that neighborhood.
//------------------------------------------------------------------------------------------------------------------------------
// Input image requirements:
// 
// Color needs to be encoded as 3 channel[red, green, blue](e.g.XYZ not supported)
// Each channel needs to be in the range[0, 1]
// Any color primaries are supported
// Display / tonemapping curve needs to be as if presenting to sRGB display or similar(e.g.Gamma 2.0)
// There should be no banding in the input
// There should be no high amplitude noise in the input
// There should be no noise in the input that is not at input pixel granularity
// For performance purposes, use 32bpp formats
//------------------------------------------------------------------------------------------------------------------------------
// Best to apply EASU at the end of the frame after tonemapping 
// but before film grain or composite of the UI.
//------------------------------------------------------------------------------------------------------------------------------

float APrxLoRcpF1(float a) {
    return uintBitsToFloat(uint(0x7ef07ebb) - floatBitsToUint(a));
}

float APrxLoRsqF1(float a) {
    return uintBitsToFloat(uint(0x5f347d74) - (floatBitsToUint(a) >> uint(1)));
}

vec3 AMin3F3(vec3 x, vec3 y, vec3 z) {
    return min(x, min(y, z));
}

vec3 AMax3F3(vec3 x, vec3 y, vec3 z) {
    return max(x, max(y, z));
}

// 计算并设置 EASU 算法需要的常量
void FsrEasuCon(
    out vec4 con0, out vec4 con1, out vec4 con2, out vec4 con3,
    // This the rendered image resolution being upscaled
    float inputViewportInPixelsX, float inputViewportInPixelsY,
    // This is the resolution of the resource containing the input image (useful for dynamic resolution)
    float inputSizeInPixelsX, float inputSizeInPixelsY,
    // This is the display resolution which the input image gets upscaled to
    float outputSizeInPixelsX, float outputSizeInPixelsY
) {
    con0 = vec4(
      inputViewportInPixelsX / outputSizeInPixelsX,
      inputViewportInPixelsY / outputSizeInPixelsY,
      0.5 * inputViewportInPixelsX / outputSizeInPixelsX - 0.5,
      0.5 * inputViewportInPixelsY / outputSizeInPixelsY - 0.5
    );

    con1 = vec4(
      1.0 / inputSizeInPixelsX,
      1.0 / inputSizeInPixelsY,
      1.0 / inputSizeInPixelsX,
      -1.0 / inputSizeInPixelsY
    );

    con2 = vec4(
      -1.0 / inputSizeInPixelsX,
      2.0 / inputSizeInPixelsY,
      1.0 / inputSizeInPixelsX,
      2.0 / inputSizeInPixelsY
    );

    con3 = vec4(
      0.0 / inputSizeInPixelsX,
      4.0 / inputSizeInPixelsY,
      0.0, 
      0.0
    );
}

void FsrEasuConOffset(
    out vec4 con0, out vec4 con1, out vec4 con2, out vec4 con3,
    float inputViewportInPixelsX, float inputViewportInPixelsY,
    float inputSizeInPixelsX, float inputSizeInPixelsY,
    float outputSizeInPixelsX, float outputSizeInPixelsY,
    // This is the input image offset into the resource containing it (useful for dynamic resolution)
    float inputOffsetInPixelsX, float inputOffsetInPixelsY
) {
    FsrEasuCon(con0, con1, con2, con3, inputViewportInPixelsX, inputViewportInPixelsY, inputSizeInPixelsX, inputSizeInPixelsY, outputSizeInPixelsX, outputSizeInPixelsY);
    con0.z = 0.5 * inputViewportInPixelsX / outputSizeInPixelsX - 0.5 + inputOffsetInPixelsX;
    con0.w = 0.5 * inputViewportInPixelsY / outputSizeInPixelsY - 0.5 + inputOffsetInPixelsY;
}

void FsrEasuTapF(
    inout vec3 aC, // Accumulated color, with negative lobe.
    inout float aW, // Accumulated weight.
    vec2 off, // Pixel offset from resolve position to tap.
    vec2 dir, // Gradient direction.
    vec2 len, // Length.
    float lob, // Negative lobe strength.
    float clp, // Clipping point.
    vec3 c // Tap color.
) {
    // Rotate offset by direction.
    vec2 v;
    v.x = (off.x * ( dir.x)) + (off.y * dir.y);
    v.y = (off.x * (-dir.y)) + (off.y * dir.x);
    // Anisotropy.
    v *= len;
    // Compute distance^2.
    float d2 = v.x * v.x + v.y * v.y;
    // Limit to the window as at corner, 2 taps can easily be outside.
    d2 = min(d2, clp);
    // Approximation of lancos2 without sin() or rcp(), or sqrt() to get x.
    //  (25/16 * (2/5 * x^2 - 1)^2 - (25/16 - 1)) * (1/4 * x^2 - 1)^2
    //  |_______________________________________|   |_______________|
    //                   base                             window
    // The general form of the 'base' is,
    //  (a*(b*x^2-1)^2-(a-1))
    // Where 'a=1/(2*b-b^2)' and 'b' moves around the negative lobe.
    float wB = float(2.0 / 5.0) * d2 + -1.0;
    float wA = lob * d2 + -1.0;
    wB *= wB;
    wA *= wA;
    wB = float(25.0 / 16.0) * wB + float(-(25.0 / 16.0 - 1.0));
    float w = wB * wA;
    // Do weighted average.
    aC += c * w;
    aW += w;
}

 void FsrEasuSetF(
    inout vec2 dir,
    inout float len,
    vec2 pp,
    bool biS, bool biT, bool biU, bool biV,
    float lA, float lB, float lC, float lD, float lE
 ) {
    // Compute bilinear weight, branches factor out as predicates are compiler time immediates.
    //  s t
    //  u v
    float w = 0.0;
    if (biS) w = (1.0 - pp.x) * (1.0 - pp.y);
    if (biT) w =        pp.x  * (1.0 - pp.y);
    if (biU) w = (1.0 - pp.x) *        pp.y;
    if (biV) w =        pp.x  *        pp.y;
    // Direction is the '+' diff.
    //    a
    //  b c d
    //    e
    // Then takes magnitude from abs average of both sides of 'c'.
    // Length converts gradient reversal to 0, smoothly to non-reversal at 1, shaped, then adding horz and vert terms.
    float dc = lD - lC;
    float cb = lC- lB;
    float lenX = max(abs(dc), abs(cb));
    lenX = APrxLoRcpF1(lenX);
    float dirX = lD - lB;
    dir.x += dirX * w;
    lenX = clamp(abs(dirX)*lenX, 0.0, 1.0);
    lenX *= lenX;
    len += lenX * w;
    // Repeat for the y axis.
    float ec = lE - lC;
    float ca= lC - lA;
    float lenY = max(abs(ec), abs(ca));
    lenY = APrxLoRcpF1(lenY);
    float dirY = lE - lA;
    dir.y += dirY * w;
    lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
    lenY *= lenY;
    len += lenY * w;
}

void FsrEasuF(
    out vec3 pix, // Output values.
    vec2 ip, // Pixel position in output.
    vec4 con0, vec4 con1, vec4 con2, vec4 con3, // Constants generated by FsrEasuCon().
    samplerExternalOES tex
) {
    // Get position of 'f'.
    vec2 pp = ip * con0.xy + con0.zw;
    vec2 fp = floor(pp);
    pp -= fp;

    // 12-tap kernel.
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    // Gather 4 ordering.
    //  a b
    //  r g
    // For packed FP16, need either {rg} or {ab} so using the following setup for gather in all versions,
    //    a b    <- unused (z)
    //    r g
    //  a b a b
    //  r g r g
    //    a b
    //    r g    <- unused (z)
    // Allowing dead-code removal to remove the 'z's.

    //      +---+---+
    //      |   |   |
    //      +--(0)--+
    //      | b | c |
    //  +---F---+---+---+
    //  | e | f | g | h |
    //  +--(1)--+--(2)--+
    //  | i | j | k | l |
    //  +---+---+---+---+
    //      | n | o |
    //      +--(3)--+
    //      |   |   |
    //      +---+---+

    vec3 b = sampleInput((fp + vec2( 0.5, -0.5)) * con1.xy);
    vec3 c = sampleInput((fp + vec2( 1.5, -0.5)) * con1.xy);
    vec3 e = sampleInput((fp + vec2(-0.5,  0.5)) * con1.xy);
    vec3 f = sampleInput((fp + vec2( 0.5,  0.5)) * con1.xy);
    vec3 g = sampleInput((fp + vec2( 1.5,  0.5)) * con1.xy);
    vec3 h = sampleInput((fp + vec2( 2.5,  0.5)) * con1.xy);
    vec3 i = sampleInput((fp + vec2(-0.5,  1.5)) * con1.xy);
    vec3 j = sampleInput((fp + vec2( 0.5,  1.5)) * con1.xy);
    vec3 k = sampleInput((fp + vec2( 1.5,  1.5)) * con1.xy);
    vec3 l = sampleInput((fp + vec2( 2.5,  1.5)) * con1.xy);
    vec3 n = sampleInput((fp + vec2( 0.5,  2.5)) * con1.xy);
    vec3 o = sampleInput((fp + vec2( 1.5,  2.5)) * con1.xy);

    // vec3 b = texture(tex, vTexCoord + vec2( 0.5, -0.5) * con1.xy).rgb;
    // vec3 c = texture(tex, vTexCoord + vec2( 1.5, -0.5) * con1.xy).rgb;
    // vec3 e = texture(tex, vTexCoord + vec2(-0.5,  0.5) * con1.xy).rgb;
    // vec3 f = texture(tex, vTexCoord + vec2( 0.5,  0.5) * con1.xy).rgb;
    // vec3 g = texture(tex, vTexCoord + vec2( 1.5,  0.5) * con1.xy).rgb;
    // vec3 h = texture(tex, vTexCoord + vec2( 2.5,  0.5) * con1.xy).rgb;
    // vec3 i = texture(tex, vTexCoord + vec2(-0.5,  1.5) * con1.xy).rgb;
    // vec3 j = texture(tex, vTexCoord + vec2( 0.5,  1.5) * con1.xy).rgb;
    // vec3 k = texture(tex, vTexCoord + vec2( 1.5,  1.5) * con1.xy).rgb;
    // vec3 l = texture(tex, vTexCoord + vec2( 2.5,  1.5) * con1.xy).rgb;
    // vec3 n = texture(tex, vTexCoord + vec2( 0.5,  2.5) * con1.xy).rgb;
    // vec3 o = texture(tex, vTexCoord + vec2( 1.5,  2.5) * con1.xy).rgb;


    vec4 bczzR = vec4(b.r, c.r, 0.0, 0.0);
    vec4 bczzG = vec4(b.g, c.g, 0.0, 0.0);
    vec4 bczzB = vec4(b.b, c.b, 0.0, 0.0);
    vec4 ijfeR = vec4(i.r, j.r, f.r, e.r);
    vec4 ijfeG = vec4(i.g, j.g, f.g, e.g);
    vec4 ijfeB = vec4(i.b, j.b, f.b, e.b);
    vec4 klhgR = vec4(k.r, l.r, h.r, g.r);
    vec4 klhgG = vec4(k.g, l.g, h.g, g.g);
    vec4 klhgB = vec4(k.b, l.b, h.b, g.b);
    vec4 zzonR = vec4(0.0, 0.0, o.r, n.r);
    vec4 zzonG = vec4(0.0, 0.0, o.g, n.g);
    vec4 zzonB = vec4(0.0, 0.0, o.b, n.b);

    // Simplest multi-channel approximate luma possible (luma times 2, in 2 FMA/MAD).
    vec4 bczzL = bczzB * 0.5 + bczzG * 0.5 + bczzR;
    vec4 ijfeL = ijfeB * 0.5 + ijfeG * 0.5 + ijfeR ;
    vec4 klhgL = klhgB * 0.5 + klhgG * 0.5 + klhgR;
    vec4 zzonL = zzonB * 0.5 + zzonG * 0.5 + zzonR;

    // Rename.
    float bL = bczzL.x;
    float cL = bczzL.y;
    float iL = ijfeL.x;
    float jL = ijfeL.y;
    float fL = ijfeL.z;
    float eL = ijfeL.w;
    float kL = klhgL.x;
    float lL = klhgL.y;
    float hL = klhgL.z;
    float gL = klhgL.w;
    float oL = zzonL.z;
    float nL = zzonL.w;

    // Accumulate for bilinear interpolation.
    vec2 dir = vec2(0.0);
    float len = 0.0;
    FsrEasuSetF(dir, len, pp, true , false, false, false, bL, eL, fL, gL, jL);
    FsrEasuSetF(dir, len, pp, false, true , false, false, cL, fL, gL, hL, kL);
    FsrEasuSetF(dir, len, pp, false, false, true , false, fL, iL, jL, kL, nL);
    FsrEasuSetF(dir, len, pp, false, false, false, true , gL, jL, kL, lL, oL);

    // Normalize with approximation, and cleanup close to zero.
    vec2 dir2 = dir*dir;
    float dirR = dir2.x + dir2.y;
    bool zro = dirR < float(1.0 / 32768.0);
    dirR = APrxLoRsqF1(dirR);
    dirR = zro? 1.0 : dirR;
    dir.x = zro? 1.0 : dir.x;
    dir *= vec2(dirR);
    // Transform from {0 to 2} to {0 to 1} range, and shape with square.
    len = len * 0.5;
    len *= len;
    // Stretch kernel {1.0 vert|horz, to sqrt(2.0) on diagonal}.
    float stretch = (dir.x * dir.x + dir.y * dir.y) * APrxLoRcpF1(max(abs(dir.x), abs(dir.y)));
    // Anisotropic length after rotation,
    //  x := 1.0 lerp to 'stretch' on edges
    //  y := 1.0 lerp to 2x on edges
    vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 + -0.5 * len);
    // Based on the amount of 'edge',
    // the window shifts from +/-{sqrt(2.0) to slightly beyond 2.0}.
    float lob= 0.5 + float((1.0 / 4.0 - 0.04) - 0.5) * len;
    // Set distance^2 clipping point to the end of the adjustable window.
    float clp = APrxLoRcpF1(lob);

    // Accumulation
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    vec3 min4 = min(AMin3F3(
        vec3(ijfeR.z, ijfeG.z, ijfeB.z),
        vec3(klhgR.w, klhgG.w, klhgB.w),
        vec3(ijfeR.y, ijfeG.y, ijfeB.y)),
        vec3(klhgR.x, klhgG.x, klhgB.x)
    );
    vec3 max4 = max(AMax3F3(
        vec3(ijfeR.z, ijfeG.z, ijfeB.z),
        vec3(klhgR.w, klhgG.w, klhgB.w),
        vec3(ijfeR.y, ijfeG.y, ijfeB.y)),
        vec3(klhgR.x,klhgG.x,klhgB.x)
    );
    vec3 aC = vec3(0.0);
    float aW = 0.0;
    FsrEasuTapF(aC, aW, vec2( 0.0,-1.0) - pp, dir, len2, lob, clp, vec3(bczzR.x,bczzG.x,bczzB.x)); // b
    FsrEasuTapF(aC, aW, vec2( 1.0,-1.0) - pp, dir, len2, lob, clp, vec3(bczzR.y,bczzG.y,bczzB.y)); // c
    FsrEasuTapF(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, vec3(ijfeR.x,ijfeG.x,ijfeB.x)); // i
    FsrEasuTapF(aC, aW, vec2( 0.0, 1.0) - pp, dir, len2, lob, clp, vec3(ijfeR.y,ijfeG.y,ijfeB.y)); // j
    FsrEasuTapF(aC, aW, vec2( 0.0, 0.0) - pp, dir, len2, lob, clp, vec3(ijfeR.z,ijfeG.z,ijfeB.z)); // f
    FsrEasuTapF(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, vec3(ijfeR.w,ijfeG.w,ijfeB.w)); // e
    FsrEasuTapF(aC, aW, vec2( 1.0, 1.0) - pp, dir, len2, lob, clp, vec3(klhgR.x,klhgG.x,klhgB.x)); // k
    FsrEasuTapF(aC, aW, vec2( 2.0, 1.0) - pp, dir, len2, lob, clp, vec3(klhgR.y,klhgG.y,klhgB.y)); // l
    FsrEasuTapF(aC, aW, vec2( 2.0, 0.0) - pp, dir, len2, lob, clp, vec3(klhgR.z,klhgG.z,klhgB.z)); // h
    FsrEasuTapF(aC, aW, vec2( 1.0, 0.0) - pp, dir, len2, lob, clp, vec3(klhgR.w,klhgG.w,klhgB.w)); // g
    FsrEasuTapF(aC, aW, vec2( 1.0, 2.0) - pp, dir, len2, lob, clp, vec3(zzonR.z,zzonG.z,zzonB.z)); // o
    FsrEasuTapF(aC, aW, vec2( 0.0, 2.0) - pp, dir, len2, lob, clp, vec3(zzonR.w,zzonG.w,zzonB.w)); // n

    // Normalize and dering.
    pix = min(
        max4, 
        max(min4, aC * vec3((1.0 / aW)))
    );
}

void main() {
    vec2 texSize = vec2(textureSize(inputTexture, 0));
    vec4 con0, con1, con2, con3;
    FsrEasuCon(con0, con1, con2, con3,
                texSize.x, texSize.y,
                texSize.x, texSize.y,
                outputTextureSize.x, outputTextureSize.y);
    vec3 pix;
    vec2 ip = floor(vTexCoord * outputTextureSize);
    FsrEasuF(pix, ip, con0, con1, con2, con3, inputTexture);
    fragColor = vec4(pix, 1.0);
}
