package com.xstreaming.touchcontrols;

import android.view.MotionEvent;

public class TouchTracker {
    private Vector currentPosition;
    private int pointerId = -1;
    private PositionChangedCallback positionChangedCallback;

    public interface PositionChangedCallback {
        void onPositionChanged(Vector position);
    }

    public void setPositionChangedCallback(PositionChangedCallback callback) {
        this.positionChangedCallback = callback;
    }

    public Vector getCurrentPosition() {
        return currentPosition;
    }

    private void setCurrentPosition(Vector value) {
        this.currentPosition = value;
        if (positionChangedCallback != null) {
            positionChangedCallback.onPositionChanged(currentPosition);
        }
    }

    public void touchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                if (pointerId == -1) {
                    pointerId = event.getPointerId(event.getActionIndex());
                    setCurrentPosition(new Vector(event.getX(event.getActionIndex()), event.getY(event.getActionIndex())));
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
                if (pointerId != -1) {
                    if (event.getPointerId(event.getActionIndex()) == pointerId) {
                        pointerId = -1;
                        setCurrentPosition(null);
                    }
                }
                break;

            case MotionEvent.ACTION_MOVE:
                if (pointerId != -1) {
                    int pointerIndex = event.findPointerIndex(pointerId);
                    if (pointerIndex >= 0) {
                        setCurrentPosition(new Vector(event.getX(pointerIndex), event.getY(pointerIndex)));
                    }
                }
                break;
        }
    }
}
