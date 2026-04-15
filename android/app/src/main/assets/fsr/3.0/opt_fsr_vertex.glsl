#version 300 es
precision mediump float;

// 顶点属性
in vec4 aPosition;
in vec4 aTexCoords;

// 输出到片段着色器
out vec2 vTexCoord;

// 变换矩阵
uniform mat4 uTexTransform;

void main() {
    gl_Position = aPosition;
    vTexCoord = (uTexTransform * aTexCoords).xy;
}