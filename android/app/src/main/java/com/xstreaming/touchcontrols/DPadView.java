package com.xstreaming.touchcontrols;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;
import android.view.MotionEvent;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import com.xstreaming.R;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

public class DPadView extends CustomView {
    public interface DirectionStateCallback {
        void onDirectionPressIn(List<String> directions);
        void onDirectionPressOut(List<String> directions);
    }

    private enum Direction {
        UP,
        DOWN,
        LEFT,
        RIGHT
    }

    private final EnumSet<Direction> activeDirections = EnumSet.noneOf(Direction.class);
    private DirectionStateCallback directionStateCallback;
    private Drawable drawableIdle;
    private Drawable drawableUp;
    private Drawable drawableDown;
    private Drawable drawableLeft;
    private Drawable drawableRight;
    private Drawable drawableUpLeft;
    private Drawable drawableUpRight;
    private Drawable drawableDownLeft;
    private Drawable drawableDownRight;
    private int activePointerId = -1;

    public DPadView(Context context) {
        this(context, null);
    }

    public DPadView(Context context, @Nullable AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public DPadView(Context context, @Nullable AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        setClickable(true);
        loadDrawables(context);
    }

    private void loadDrawables(Context context) {
        drawableIdle = ContextCompat.getDrawable(context, R.drawable.control_dpad_idle);
        drawableUp = ContextCompat.getDrawable(context, R.drawable.control_dpad_up);
        drawableDown = ContextCompat.getDrawable(context, R.drawable.control_dpad_down);
        drawableLeft = ContextCompat.getDrawable(context, R.drawable.control_dpad_left);
        drawableRight = ContextCompat.getDrawable(context, R.drawable.control_dpad_right);
        drawableUpLeft = ContextCompat.getDrawable(context, R.drawable.control_dpad_left_up);
        drawableUpRight = ContextCompat.getDrawable(context, R.drawable.control_dpad_up_right);
        drawableDownLeft = ContextCompat.getDrawable(context, R.drawable.control_dpad_left_down);
        drawableDownRight = ContextCompat.getDrawable(context, R.drawable.control_dpad_right_down);
    }

    public void setDirectionStateCallback(DirectionStateCallback callback) {
        this.directionStateCallback = callback;
    }

    private List<String> toDirectionNames(EnumSet<Direction> directions) {
        List<String> names = new ArrayList<>();
        if (directions.contains(Direction.UP)) {
            names.add("DPadUp");
        }
        if (directions.contains(Direction.DOWN)) {
            names.add("DPadDown");
        }
        if (directions.contains(Direction.LEFT)) {
            names.add("DPadLeft");
        }
        if (directions.contains(Direction.RIGHT)) {
            names.add("DPadRight");
        }
        return names;
    }

    private void emitPressIn(List<String> directions) {
        if (directionStateCallback != null && !directions.isEmpty()) {
            directionStateCallback.onDirectionPressIn(directions);
        }
    }

    private void emitPressOut(List<String> directions) {
        if (directionStateCallback != null && !directions.isEmpty()) {
            directionStateCallback.onDirectionPressOut(directions);
        }
    }

    private void setActiveDirections(EnumSet<Direction> nextDirections) {
        if (activeDirections.equals(nextDirections)) {
            return;
        }

        EnumSet<Direction> released = EnumSet.noneOf(Direction.class);
        released.addAll(activeDirections);
        released.removeAll(nextDirections);

        EnumSet<Direction> pressed = EnumSet.noneOf(Direction.class);
        pressed.addAll(nextDirections);
        pressed.removeAll(activeDirections);

        activeDirections.clear();
        activeDirections.addAll(nextDirections);

        if (!released.isEmpty()) {
            emitPressOut(toDirectionNames(released));
        }
        if (!pressed.isEmpty()) {
            emitPressIn(toDirectionNames(pressed));
        }

        invalidate();
    }

    private EnumSet<Direction> resolveDirections(float touchX, float touchY) {
        float width = Math.max(1f, getWidth());
        float height = Math.max(1f, getHeight());
        float radius = Math.max(1f, Math.min(width, height) / 2f);
        float centerX = width / 2f;
        float centerY = height / 2f;

        float dx = (touchX - centerX) / radius;
        float dy = (touchY - centerY) / radius;
        float distance = (float) Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.3f) {
            return EnumSet.noneOf(Direction.class);
        }

        float angle = (float) Math.atan2(-dy, dx);
        if (angle < 0) {
            angle += (float) (Math.PI * 2);
        }

        float sector = (float) (Math.PI / 8);
        float threeSectors = sector * 3;
        float fiveSectors = sector * 5;
        float sevenSectors = sector * 7;
        float nineSectors = sector * 9;
        float elevenSectors = sector * 11;
        float thirteenSectors = sector * 13;
        float fifteenSectors = sector * 15;

        if (angle < sector || angle >= fifteenSectors) {
            return EnumSet.of(Direction.RIGHT);
        }
        if (angle < threeSectors) {
            return EnumSet.of(Direction.UP, Direction.RIGHT);
        }
        if (angle < fiveSectors) {
            return EnumSet.of(Direction.UP);
        }
        if (angle < sevenSectors) {
            return EnumSet.of(Direction.UP, Direction.LEFT);
        }
        if (angle < nineSectors) {
            return EnumSet.of(Direction.LEFT);
        }
        if (angle < elevenSectors) {
            return EnumSet.of(Direction.DOWN, Direction.LEFT);
        }
        if (angle < thirteenSectors) {
            return EnumSet.of(Direction.DOWN);
        }
        return EnumSet.of(Direction.DOWN, Direction.RIGHT);
    }

    private void updateFromTouch(float x, float y) {
        setActiveDirections(resolveDirections(x, y));
    }

    private void releaseAll() {
        if (activeDirections.isEmpty()) {
            activePointerId = -1;
            return;
        }

        EnumSet<Direction> released = EnumSet.noneOf(Direction.class);
        released.addAll(activeDirections);
        activeDirections.clear();
        emitPressOut(toDirectionNames(released));
        activePointerId = -1;
        invalidate();
    }

    private Drawable getCurrentDrawable() {
        if (activeDirections.isEmpty()) {
            return drawableIdle;
        }

        if (activeDirections.size() == 1) {
            if (activeDirections.contains(Direction.UP)) {
                return drawableUp;
            }
            if (activeDirections.contains(Direction.DOWN)) {
                return drawableDown;
            }
            if (activeDirections.contains(Direction.LEFT)) {
                return drawableLeft;
            }
            if (activeDirections.contains(Direction.RIGHT)) {
                return drawableRight;
            }
        }

        if (activeDirections.contains(Direction.UP) && activeDirections.contains(Direction.LEFT)) {
            return drawableUpLeft;
        }
        if (activeDirections.contains(Direction.UP) && activeDirections.contains(Direction.RIGHT)) {
            return drawableUpRight;
        }
        if (activeDirections.contains(Direction.DOWN) && activeDirections.contains(Direction.LEFT)) {
            return drawableDownLeft;
        }
        if (activeDirections.contains(Direction.DOWN) && activeDirections.contains(Direction.RIGHT)) {
            return drawableDownRight;
        }

        return drawableIdle;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        Drawable drawable = getCurrentDrawable();
        if (drawable == null) {
            return;
        }

        drawable.setBounds(
                getPaddingLeft(),
                getPaddingTop(),
                getWidth() - getPaddingRight(),
                getHeight() - getPaddingBottom());
        drawable.draw(canvas);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        int actionIndex = event.getActionIndex();

        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (activePointerId == -1) {
                    activePointerId = event.getPointerId(actionIndex);
                    updateFromTouch(event.getX(actionIndex), event.getY(actionIndex));
                }
                break;

            case MotionEvent.ACTION_MOVE:
                if (activePointerId != -1) {
                    int pointerIndex = event.findPointerIndex(activePointerId);
                    if (pointerIndex >= 0) {
                        updateFromTouch(event.getX(pointerIndex), event.getY(pointerIndex));
                    }
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
                if (activePointerId != -1 && event.getPointerId(actionIndex) == activePointerId) {
                    releaseAll();
                }
                break;

            case MotionEvent.ACTION_CANCEL:
                releaseAll();
                break;
        }

        return true;
    }
}
