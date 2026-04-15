#version 310 es
//==============================================================================================================================
// An optimized AMD FSR 1.0 implementation for Mobiles
// EASU and RCAS are combined in a single pass.
// Based on https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h
// Details can be found: https://atyuwen.github.io/posts/optimizing-fsr/
// Distributed under the MIT License. Copyright (c) 2021 atyuwen.
// -- FsrEasuSampleH should be implemented by calling shader, like following:
//    AH3 FsrEasuSampleH(AF2 p) { return MyTex.SampleLevel(LinearSampler, p, 0).xyz; }
//==============================================================================================================================
#extension GL_OES_EGL_image_external_essl3 : require
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform samplerExternalOES inputTexture; // 纹理
// uniform vec2 inputTextureSize; // 输入纹理大小
uniform vec2 outputTextureSize; // 输出纹理大小
uniform float uHdrToneMap; // 是否启用 HDR 色调映射

in vec2 vTexCoord; // 从顶点着色器传过来的纹理坐标
out vec4 fragColor; // 输出颜色
//------------------------------------------------------------------------------------------------------------------------------
float AMin3H1(float x, float y, float z) {
	return min(x, min(y, z));
}

float AMax3H1(float x, float y, float z) {
	return max(x, max(y, z));
}

float ARcpH1(float x) {
    return 1.0 / x;
}

float ARsqH1(float x) {
    return 1.0 / sqrt(x);
}

float ASatH1(float x) {
    return clamp(x, 0.0, 1.0);
}

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

#define FSR_RCAS_LIMIT (0.25 - (1.0 / 16.0))

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

// This runs 2 taps in parallel.
void FsrEasuTapH(
    inout vec2 aCR, inout vec2 aCG, inout vec2 aCB,
    inout vec2 aW,
    vec2 offX, vec2 offY,
    vec2 dir,
    vec2 len,
    float lob,
    float clp,
    vec2 cR, vec2 cG, vec2 cB
){
    vec2 vX, vY;
    vX = offX *  dir.xx  + offY * dir.yy;
    vY = offX * (-dir.yy) + offY * dir.xx;
    vX *= len.x;
    vY *= len.y;
    vec2 d2 = vX * vX + vY * vY;
    d2 = min(d2, clp);
    vec2 wB = vec2(2.0 / 5.0) * d2 + vec2(-1.0);
    vec2 wA = vec2(lob) * d2 + vec2(-1.0);
    wB *= wB;
    wA *= wA;
    wB = vec2(25.0 / 16.0) * wB + vec2(-(25.0 / 16.0 - 1.0));
    vec2 w = wB * wA;
    aCR += cR * w;
    aCG += cG * w;
    aCB += cB * w;
    aW += w;
}

void FsrMobile(
    out vec3 pix,
    vec2 ip,
    vec4 con0,
    vec4 con1,
    vec4 con2,
    vec4 con3
) {
//------------------------------------------------------------------------------------------------------------------------------
    // Direction is the '+' diff.
    //    A
    //  B C D
    //    E
    vec2 pp = ip * con0.xy + con0.zw;
    vec2 tc = (pp + vec2(0.5)) * con1.xy;
    vec3 sC = sampleInput(tc);
#if 0  // Set to 1 to make FSR only affect the screen's central region.
    if (any(abs(tc - 0.5) > float(0.75 / 2.0))) {
        pix = sC;
        return;
    }
#endif
    vec3 sA = sampleInput(tc - vec2(0, con1.y));
    vec3 sB = sampleInput(tc - vec2(con1.x, 0));
    vec3 sD = sampleInput(tc + vec2(con1.x, 0));
    vec3 sE = sampleInput(tc + vec2(0, con1.y));
//------------------------------------------------------------------------------------------------------------------------------ 
    // Combined RCAS: Min and max of ring.
    float mn4R = min(AMin3H1(sA.r, sB.r, sD.r), sE.r);
    float mn4G = min(AMin3H1(sA.g, sB.g, sD.g), sE.g);
    float mn4B = min(AMin3H1(sA.b, sB.b, sD.b), sE.b);
    float mx4R = max(AMax3H1(sA.r, sB.r, sD.r), sE.r);
    float mx4G = max(AMax3H1(sA.g, sB.g, sD.g), sE.g);
    float mx4B = max(AMax3H1(sA.b, sB.b, sD.b), sE.b);
    // Immediate constants for peak range.
    vec2 peakC = vec2(1.0, -1.0 * 4.0);
    // Limiters, these need to be high precision RCPs.
    float hitMinR = mn4R * ARcpH1(4.0 * mx4R);
    float hitMinG = mn4G * ARcpH1(4.0 * mx4G);
    float hitMinB = mn4B * ARcpH1(4.0 * mx4B);
    float hitMaxR = (peakC.x-mx4R) * ARcpH1(4.0 * mn4R + peakC.y);
    float hitMaxG = (peakC.x-mx4G) * ARcpH1(4.0 *mn4G + peakC.y);
    float hitMaxB = (peakC.x-mx4B) * ARcpH1(4.0 * mn4B + peakC.y);
    float lobeR = max(-hitMinR, hitMaxR);
    float lobeG = max(-hitMinG, hitMaxG);
    float lobeB = max(-hitMinB, hitMaxB);
    float lobe = max(-FSR_RCAS_LIMIT, min(AMax3H1(lobeR, lobeG, lobeB), 0.0)) * con0.x;
    // Resolve, which needs the medium precision rcp approximation to avoid visible tonality changes.
    float rcpL = ARcpH1(4.0 * lobe + 1.0);
    vec3 contrast = (lobe * sA+ lobe * sB + lobe * sD + lobe * sE) * rcpL;
//------------------------------------------------------------------------------------------------------------------------------
    float lA = sA.r * 0.5 + sA.g;
    float lB = sB.r * 0.5 + sB.g;
    float lC = sC.r * 0.5 + sC.g;
    float lD = sD.r * 0.5 + sD.g;
    float lE = sE.r * 0.5 + sE.g;
    // Then takes magnitude from abs average of both sides of 'C'.
    // Length converts gradient reversal to 0, smoothly to non-reversal at 1, shaped, then adding horz and vert terms.
    float dc = lD - lC;
    float cb = lC - lB;
    float lenX = max(abs(dc), abs(cb));
    lenX = ARcpH1(lenX);
    float dirX = lD - lB;
    lenX = ASatH1(abs(dirX) * lenX);
    lenX *= lenX;
    // Repeat for the y axis.
    float ec = lE - lC;
    float ca = lC - lA;
    float lenY = max(abs(ec), abs(ca));
    lenY = ARcpH1(lenY);
    float dirY = lE - lA;
    lenY = ASatH1(abs(dirY) * lenY);
    float len = lenY * lenY + lenX;
    vec2 dir = vec2(dirX, dirY);
    //------------------------------------------------------------------------------------------------------------------------------ 
    vec2 dir2 = dir * dir;
    float dirR = dir2.x + dir2.y;
    if (dirR < float(1.0 / 64.0)) {
        pix = contrast + sC * rcpL;
        return;
    }
    dirR = ARsqH1(dirR);
    dir *= vec2(dirR);
    len = len * 0.5;
    len *= len;
    float stretch = (dir.x * dir.x + dir.y * dir.y) * ARcpH1(max(abs(dir.x), abs(dir.y)));
    vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 + (-0.5 * len));
    float lob = float(0.5) + ((1.0 / 4.0- 0.04) -0.5) * len;
    float clp = ARcpH1(lob);
//------------------------------------------------------------------------------------------------------------------------------
    vec2 fp = floor(pp);
    pp -= fp;
    vec2 ppp = vec2(pp);
    // vec2 p0 = fp * con1.xy + con1.zw;
    // vec2 p1 = p0 + con2.xy;
    // vec2 p2 = p0 + con2.zw;
    // vec2 p3 = p0 + con3.xy;
    // p0.y -= con1.w;
    // p3.y += con1.w;
    // vec4 fgcbR = FsrEasuRH(p0);
    // vec4 fgcbG = FsrEasuGH(p0);
    // vec4 fgcbB = FsrEasuBH(p0);
    // vec4 ijfeR = FsrEasuRH(p1);
    // vec4 ijfeG = FsrEasuGH(p1);
    // vec4 ijfeB = FsrEasuBH(p1);
    // vec4 klhgR = FsrEasuRH(p2);
    // vec4 klhgG = FsrEasuGH(p2);
    // vec4 klhgB = FsrEasuBH(p2);
    // vec4 nokjR = FsrEasuRH(p3);
    // vec4 nokjG = FsrEasuGH(p3);
    // vec4 nokjB = FsrEasuBH(p3);
    // Driver compatibility path: use texture() sampling to avoid external texture overload issues.
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
    vec4 fgcbR = vec4(f.r, g.r, c.r, b.r);
    vec4 fgcbG = vec4(f.g, g.g, c.g, b.g);
    vec4 fgcbB = vec4(f.b, g.b, c.b, b.b);
    vec4 ijfeR = vec4(i.r, j.r, f.r, e.r);
    vec4 ijfeG = vec4(i.g, j.g, f.g, e.g);
    vec4 ijfeB = vec4(i.b, j.b, f.b, e.b);
    vec4 klhgR = vec4(k.r, l.r, h.r, g.r);
    vec4 klhgG = vec4(k.g, l.g, h.g, g.g);
    vec4 klhgB = vec4(k.b, l.b, h.b, g.b);
    vec4 nokjR = vec4(n.r, o.r, k.r, j.r);
    vec4 nokjG = vec4(n.g, o.g, k.g, j.g);
    vec4 nokjB = vec4(n.b, o.b, k.b, j.b);
//------------------------------------------------------------------------------------------------------------------------------
    // This part is different for FP16, working pairs of taps at a time.
    vec2 pR = vec2(0.0);
    vec2 pG = vec2(0.0);
    vec2 pB = vec2(0.0);
    vec2 pW = vec2(0.0);
    FsrEasuTapH(pR, pG, pB, pW, vec2( 1.0, 0.0) - ppp.xx, vec2(-1.0,-1.0) - ppp.yy, dir, len2, lob, clp, fgcbR.zw, fgcbG.zw, fgcbB.zw);
    FsrEasuTapH(pR, pG, pB, pW, vec2(-1.0, 0.0) - ppp.xx, vec2( 1.0, 1.0) - ppp.yy, dir, len2, lob, clp, ijfeR.xy, ijfeG.xy, ijfeB.xy);
    FsrEasuTapH(pR, pG, pB, pW, vec2( 0.0,-1.0) - ppp.xx, vec2( 0.0, 0.0) - ppp.yy, dir, len2, lob, clp, ijfeR.zw, ijfeG.zw, ijfeB.zw);
    FsrEasuTapH(pR, pG, pB, pW, vec2( 1.0, 2.0) - ppp.xx, vec2( 1.0, 1.0) - ppp.yy, dir, len2, lob, clp, klhgR.xy, klhgG.xy, klhgB.xy);
    FsrEasuTapH(pR, pG, pB, pW, vec2( 2.0, 1.0) - ppp.xx, vec2( 0.0, 0.0) - ppp.yy, dir, len2, lob, clp, klhgR.zw, klhgG.zw, klhgB.zw);
    FsrEasuTapH(pR, pG, pB, pW, vec2( 0.0, 1.0) - ppp.xx, vec2( 2.0, 2.0) - ppp.yy, dir, len2, lob, clp, nokjR.xy, nokjG.xy, nokjB.xy);
    vec3 aC = vec3(pR.x + pR.y, pG.x + pG.y, pB.x + pB.y);
    float aW =  pW.x + pW.y;
//------------------------------------------------------------------------------------------------------------------------------
    pix = contrast + aC * vec3(ARcpH1(aW) * rcpL);
}

void main() {
    vec2 texSize = vec2(textureSize(inputTexture, 0));
    vec4 con0, con1, con2, con3;
    FsrEasuCon(con0, con1, con2, con3,
                texSize.x, texSize.y,
                texSize.x, texSize.y,
                outputTextureSize.x, outputTextureSize.y);
    if (con0.x > 1.0 || con0.y > 1.0) {
        fragColor = vec4(sampleInput(vTexCoord), 1.0);
    } else {
        vec3 pix;
        vec2 ip = vTexCoord * outputTextureSize;
        FsrMobile(pix, ip, con0, con1, con2, con3);
        fragColor = vec4(pix, 1.0);
    }
}
