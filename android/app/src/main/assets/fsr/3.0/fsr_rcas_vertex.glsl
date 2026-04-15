#version 300 es

// 顶点属性
in vec4 aPosition;
in vec4 aTexCoords;

// 输出到片段着色器
out vec2 vTexCoord;

void main() {
    gl_Position = aPosition;
    vTexCoord = aTexCoords.xy;
}