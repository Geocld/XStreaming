#version 300 es
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
precision mediump float;

uniform sampler2D inputTexture; // 纹理采样器
uniform float sharpness; // 锐化强度

in vec2 vTexCoord; // 从顶点着色器传过来的纹理坐标
out vec4 fragColor; // 输出颜色

//_____________________________________________________________/\_______________________________________________________________
//==============================================================================================================================
//
//                                      FSR - [RCAS] ROBUST CONTRAST ADAPTIVE SHARPENING
//
//------------------------------------------------------------------------------------------------------------------------------
// CAS uses a simplified mechanism to convert local contrast into a variable amount of sharpness.
// RCAS uses a more exact mechanism, solving for the maximum local sharpness possible before clipping.
// RCAS also has a built in process to limit sharpening of what it detects as possible noise.
// RCAS sharper does not support scaling, as it should be applied after EASU scaling.
// Pass EASU output straight into RCAS, no color conversions necessary.
//------------------------------------------------------------------------------------------------------------------------------
// RCAS is based on the following logic.
// RCAS uses a 5 tap filter in a cross pattern (same as CAS),
//    w                n
//  w 1 w  for taps  w m e 
//    w                s
// Where 'w' is the negative lobe weight.
//  output = (w*(n+e+w+s)+m)/(4*w+1)
// RCAS solves for 'w' by seeing where the signal might clip out of the {0 to 1} input range,
//  0 == (w*(n+e+w+s)+m)/(4*w+1) -> w = -m/(n+e+w+s)
//  1 == (w*(n+e+w+s)+m)/(4*w+1) -> w = (1-m)/(n+e+w+s-4*1)
// Then chooses the 'w' which results in no clipping, limits 'w', and multiplies by the 'sharp' amount.
// This solution above has issues with MSAA input as the steps along the gradient cause edge detection issues.
// So RCAS uses 4x the maximum and 4x the minimum (depending on equation)in place of the individual taps.
// As well as switching from 'm' to either the minimum or maximum (depending on side), to help in energy conservation.
// This stabilizes RCAS.
// RCAS does a simple highpass which is normalized against the local contrast then shaped,
//       0.25
//  0.25  -1  0.25
//       0.25
// This is used as a noise detection filter, to reduce the effect of RCAS on grain, and focus on real edges.
//
//  GLSL example for the required callbacks :
// 
//  AH4 FsrRcasLoadH(ASW2 p){return AH4(imageLoad(imgSrc,ASU2(p)));}
//  void FsrRcasInputH(inout AH1 r,inout AH1 g,inout AH1 b)
//  {
//    //do any simple input color conversions here or leave empty if none needed
//  }
//  
//  FsrRcasCon need to be called from the CPU or GPU to set up constants.
//  Including a GPU example here, the 'con' value would be stored out to a constant buffer.
// 
//  AU4 con;
//  FsrRcasCon(con,
//   0.0); // The scale is {0.0 := maximum sharpness, to N>0, where N is the number of stops (halving) of the reduction of sharpness}.
// ---------------
// RCAS sharpening supports a CAS-like pass-through alpha via,
//  #define FSR_RCAS_PASSTHROUGH_ALPHA 1
// RCAS also supports a define to enable a more expensive path to avoid some sharpening of noise.
// Would suggest it is better to apply film grain after RCAS sharpening (and after scaling) instead of using this define,
//  #define FSR_RCAS_DENOISE 1
//==============================================================================================================================
// This is set at the limit of providing unnatural results for sharpening.

float APrxMedRcpF1(float a) {
	float b = uintBitsToFloat(uint(0x7ef19fff) - floatBitsToUint(a));
	return b * (-b * a + 2.0);
}

// float APrxLoRcpF1(float a) {
// 	return uintBitsToFloat(uint(0x7ef07ebb) - floatBitsToUint(a));
// }

// float APrxLoRsqF1(float a) {
//     return uintBitsToFloat(uint(0x5f347d74) - (floatBitsToUint(a) >> uint(1)));
// }

float AMin3F1(float x, float y, float z) {
	return min(x, min(y, z));
}

float AMax3F1(float x, float y, float z) {
	return max(x, max(y, z));
}

#define FSR_RCAS_LIMIT (0.25-(1.0/16.0))

// RCAS 算法锐化常量
void FsrRcasCon(
    out vec4 con, // RCAS 算法常量
    float sharpness // 该尺度为{0.0表示最大值，至N>0，其中N为锐度降低（减半）的停止次数}
) {
    // Transform from stops to linear value.
    float linearSharpness = exp2(-sharpness);
    // vec2 hSharp = vec2(sharpness, sharpness); // 16-bit半精度用的，这里用不到
    con = vec4(
        linearSharpness, 
        0.0, // uintBitsToFloat(packHalf2x16(hSharp)),
        0.0, 
        0.0
    );
}

// RCAS 算法
void FsrRcasF(
    out vec3 pix, // 输出像素颜色(RGB)
    vec2 ip, // 输出像素的位置.
    vec4 con, // RCAS 算法常量, 由 FsrRcasCon 函数计算得到.
    sampler2D tex // 输入纹理
) {
    // Algorithm uses minimal 3x3 pixel neighborhood.
    //    b 
    //  d e f
    //    h
    vec2 sp = ip;
    vec3 b = texelFetch(tex, ivec2(sp) + ivec2( 0,-1), 0).rgb;
    vec3 d = texelFetch(tex, ivec2(sp) + ivec2(-1, 0), 0).rgb;
    vec3 e = texelFetch(tex, ivec2(sp)               , 0).rgb;
    vec3 f = texelFetch(tex, ivec2(sp) + ivec2( 1, 0), 0).rgb;
    vec3 h = texelFetch(tex, ivec2(sp) + ivec2( 0, 1), 0).rgb;

    // Rename (32-bit) or regroup (16-bit).
    float bR = b.r;
    float bG = b.g;
    float bB = b.b;
    float dR = d.r;
    float dG = d.g;
    float dB = d.b;
    float eR = e.r;
    float eG = e.g;
    float eB = e.b;
    float fR = f.r;
    float fG = f.g;
    float fB = f.b;
    float hR = h.r;
    float hG = h.g;
    float hB = h.b;

    // Run optional input transform.
    // FsrRcasInputF(bR,bG,bB);
    // FsrRcasInputF(dR,dG,dB);
    // FsrRcasInputF(eR,eG,eB);
    // FsrRcasInputF(fR,fG,fB);
    // FsrRcasInputF(hR,hG,hB);

    // Luma times 2.
    float bL = bB * 0.5 + (bR * 0.5 + bG);
    float dL = dB * 0.5 + (dR * 0.5 + dG);
    float eL = eB * 0.5 + (eR * 0.5 + eG);
    float fL = fB * 0.5 + (fR * 0.5 + fG);
    float hL = hB * 0.5 + (hR * 0.5 + hG);

    // Noise detection.
    float nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
    nz = clamp(abs(nz) * APrxMedRcpF1(AMax3F1(AMax3F1(bL , dL, eL), fL, hL) - AMin3F1(AMin3F1(bL, dL, eL), fL, hL)), 0.0, 1.0);
    nz = -0.5 * nz + 1.0;

    // Min and max of ring.
    float mn4R = min(AMin3F1(bR, dR, fR), hR);
    float mn4G = min(AMin3F1(bG, dG, fG), hG);
    float mn4B = min(AMin3F1(bB, dB, fB), hB);
    float mx4R = max(AMax3F1(bR, dR, fR), hR);
    float mx4G = max(AMax3F1(bG, dG, fG), hG);
    float mx4B = max(AMax3F1(bB, dB, fB), hB);

    // Immediate constants for peak range.
    vec2 peakC = vec2(1.0, -1.0 * 4.0);

    // Limiters, these need to be high precision RCPs.
    float hitMinR = min(mn4R, eR) / (4.0 * mx4R);
    float hitMinG = min(mn4G, eG) / (4.0 * mx4G);
    float hitMinB = min(mn4B, eB) / (4.0 * mx4B);
    float hitMaxR = (peakC.x - max(mx4R, eR)) / (4.0 * mn4R+peakC.y);
    float hitMaxG = (peakC.x - max(mx4G, eG)) / (4.0 * mn4G+peakC.y);
    float hitMaxB = (peakC.x - max(mx4B, eB)) / (4.0 * mn4B+peakC.y);
    float lobeR = max(-hitMinR, hitMaxR);
    float lobeG = max(-hitMinG, hitMaxG);
    float lobeB = max(-hitMinB, hitMaxB);
    float lobe = max(-FSR_RCAS_LIMIT, min(AMax3F1(lobeR, lobeG, lobeB), 0.0)) * con.x;
    
    // Apply noise removal.
    #ifdef FSR_RCAS_DENOISE
    lobe *= nz;
    #endif
    // Resolve, which needs the medium precision rcp approximation to avoid visible tonality changes.
    float rcpL = APrxMedRcpF1(4.0 * lobe +1.0);
    float pixR = (lobe * bR + lobe * dR + lobe * hR + lobe * fR + eR) * rcpL;
    float pixG = (lobe * bG + lobe * dG + lobe * hG + lobe * fG + eG) * rcpL;
    float pixB = (lobe * bB + lobe * dB + lobe * hB + lobe * fB + eB) * rcpL;
    pix = vec3(pixR, pixG, pixB);
}

void main() {
    vec2 texSize = vec2(textureSize(inputTexture, 0));
    vec2 ip = vTexCoord.xy * texSize;
    vec3 pix;
    vec4 con;
    FsrRcasCon(con, sharpness);
    FsrRcasF(pix, ip, con, inputTexture);
    fragColor = vec4(pix, 1.0);
}