// 顶点属性
attribute vec4 aPosition;
attribute vec4 aTexCoords;

// 输出到片段着色器
varying vec2 vTexCoord;

// 变换矩阵
uniform mat4 uTexTransform;

void main() {
    gl_Position = aPosition;
    vTexCoord = (uTexTransform * aTexCoords).xy;
}