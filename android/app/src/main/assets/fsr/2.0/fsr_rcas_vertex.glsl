// 顶点属性
attribute vec4 aPosition;
attribute vec4 aTexCoords;

// 输出到片段着色器
varying vec2 vTexCoord;

void main() {
    gl_Position = aPosition;
    vTexCoord = aTexCoords.xy;
}