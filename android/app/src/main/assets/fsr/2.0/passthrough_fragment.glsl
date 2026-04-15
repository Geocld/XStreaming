#extension GL_OES_EGL_image_external : require
precision mediump float;

uniform samplerExternalOES inputTexture;
uniform float uHdrToneMap;

varying vec2 vTexCoord;

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

void main() {
    vec3 color = texture2D(inputTexture, vTexCoord).rgb;
    gl_FragColor = vec4(applyHdrToneMap(color), 1.0);
}
