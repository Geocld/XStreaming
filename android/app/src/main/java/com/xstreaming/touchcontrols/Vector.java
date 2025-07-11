package com.xstreaming.touchcontrols;

import android.view.View;

public class Vector {
    public final float x;
    public final float y;

    public Vector(float x, float y) {
        this.x = x;
        this.y = y;
    }

    // Operator overloads
    public Vector plus(Vector o) {
        return new Vector(this.x + o.x, this.y + o.y);
    }

    public Vector minus(Vector o) {
        return new Vector(this.x - o.x, this.y - o.y);
    }

    public Vector plus(float s) {
        return new Vector(this.x + s, this.y + s);
    }

    public Vector minus(float s) {
        return new Vector(this.x - s, this.y - s);
    }

    public Vector times(float s) {
        return new Vector(this.x * s, this.y * s);
    }

    public Vector divide(float s) {
        return this.times(1f / s);
    }

    public Vector times(Vector o) {
        return new Vector(this.x * o.x, this.y * o.y);
    }

    public Vector divide(Vector o) {
        return this.times(new Vector(1.0f / o.x, 1.0f / o.y));
    }

    public float getLengthSq() {
        return x * x + y * y;
    }

    public float getLength() {
        return (float) Math.sqrt(getLengthSq());  // 使用 Math.sqrt 而不是 kotlin.math.sqrt
    }

    public Vector getNormalized() {
        float length = getLength();
        if (length == 0) {
            return new Vector(0, 0);
        }
        return this.divide(length);
    }

    public static Vector getLocationOnScreen(View view) {
        int[] location = new int[2];
        view.getLocationOnScreen(location);
        return new Vector(location[0], location[1]);
    }

    @Override
    public String toString() {
        return "Vector(" + x + ", " + y + ")";
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        Vector vector = (Vector) obj;
        return Float.compare(vector.x, x) == 0 && Float.compare(vector.y, y) == 0;
    }

    @Override
    public int hashCode() {
        int result = Float.hashCode(x);
        result = 31 * result + Float.hashCode(y);
        return result;
    }
}
