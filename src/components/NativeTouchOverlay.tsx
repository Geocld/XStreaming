import React from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeTouchEvent,
  StyleSheet,
  View,
} from 'react-native';
import type {PointerWireData} from '../webrtc/Channel/Input';

const STREAM_ASPECT_RATIO = 16 / 9;

type VideoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeTouchOverlayProps = {
  enabled: boolean;
  videoFormat?: string;
  onPointerInput?: (event: PointerWireData) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const resolveVideoRect = (
  width: number,
  height: number,
  videoFormat?: string,
): VideoRect => {
  if (width <= 0 || height <= 0) {
    return {x: 0, y: 0, width: 1, height: 1};
  }

  if (videoFormat === 'Zoom') {
    return {x: 0, y: 0, width, height};
  }

  const containerAspect = width / height;

  if (containerAspect > STREAM_ASPECT_RATIO) {
    const fittedWidth = height * STREAM_ASPECT_RATIO;
    return {
      x: (width - fittedWidth) / 2,
      y: 0,
      width: fittedWidth,
      height,
    };
  }

  const fittedHeight = width / STREAM_ASPECT_RATIO;
  return {
    x: 0,
    y: (height - fittedHeight) / 2,
    width,
    height: fittedHeight,
  };
};

const NativeTouchOverlay = ({
  enabled,
  videoFormat,
  onPointerInput,
}: NativeTouchOverlayProps) => {
  const [layout, setLayout] = React.useState({width: 0, height: 0});
  const activePointersRef = React.useRef(new Set<number>());

  React.useEffect(() => {
    if (!enabled) {
      activePointersRef.current.clear();
    }
  }, [enabled]);

  const videoRect = React.useMemo(
    () => resolveVideoRect(layout.width, layout.height, videoFormat),
    [layout.height, layout.width, videoFormat],
  );

  const buildPointerEvent = React.useCallback(
    (
      touch: NativeTouchEvent,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
    ): PointerWireData | null => {
      if (!enabled || !onPointerInput) {
        return null;
      }

      const pointerId = Math.max(0, Math.floor(Number(touch.identifier ?? 0)));
      const localX = Number(touch.locationX ?? 0);
      const localY = Number(touch.locationY ?? 0);

      const clampedX = clamp(
        localX,
        videoRect.x,
        videoRect.x + videoRect.width,
      );
      const clampedY = clamp(
        localY,
        videoRect.y,
        videoRect.y + videoRect.height,
      );

      const normalizedX = clamp(
        (clampedX - videoRect.x) / Math.max(1, videoRect.width),
        0,
        1,
      );
      const normalizedY = clamp(
        (clampedY - videoRect.y) / Math.max(1, videoRect.height),
        0,
        1,
      );

      const isInside =
        localX >= videoRect.x &&
        localX <= videoRect.x + videoRect.width &&
        localY >= videoRect.y &&
        localY <= videoRect.y + videoRect.height;

      if (type === 'pointerdown' && !isInside) {
        return null;
      }

      const touchAny = touch as any;
      const rawWidth = Number(touchAny.radiusX || 0) * 2;
      const rawHeight = Number(touchAny.radiusY || 0) * 2;
      const fallbackDiameter =
        1 / Math.max(1, Math.max(videoRect.width, videoRect.height));

      const width = clamp(
        rawWidth > 0
          ? rawWidth / Math.max(1, videoRect.width)
          : fallbackDiameter,
        0,
        1,
      );
      const height = clamp(
        rawHeight > 0
          ? rawHeight / Math.max(1, videoRect.height)
          : fallbackDiameter,
        0,
        1,
      );

      const pressure =
        typeof touch.force === 'number' && touch.force > 0
          ? clamp(touch.force, 0, 1)
          : type === 'pointerup'
          ? 0
          : 1;

      return {
        height,
        pressure,
        twist: 0,
        width,
        pointerId,
        x: normalizedX,
        y: normalizedY,
        type,
        clientHeight: 1,
        clientWidth: 1,
      };
    },
    [enabled, onPointerInput, videoRect],
  );

  const emitChangedTouches = React.useCallback(
    (
      event: GestureResponderEvent,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
    ) => {
      if (!enabled || !onPointerInput) {
        return;
      }

      const changedTouches =
        (event.nativeEvent.changedTouches as Array<NativeTouchEvent>) || [];

      for (const touch of changedTouches) {
        const pointerId = Math.max(
          0,
          Math.floor(Number(touch.identifier ?? 0)),
        );
        const isActive = activePointersRef.current.has(pointerId);

        if (type === 'pointerdown') {
          const pointerEvent = buildPointerEvent(touch, 'pointerdown');
          if (!pointerEvent) {
            continue;
          }
          activePointersRef.current.add(pointerId);
          onPointerInput(pointerEvent);
          continue;
        }

        if (!isActive) {
          continue;
        }

        const pointerEvent = buildPointerEvent(touch, type);
        if (pointerEvent) {
          onPointerInput(pointerEvent);
        }

        if (type === 'pointerup') {
          activePointersRef.current.delete(pointerId);
        }
      }
    },
    [buildPointerEvent, enabled, onPointerInput],
  );

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setLayout({width, height});
  }, []);

  const onTouchStart = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointerdown');
    },
    [emitChangedTouches],
  );

  const onTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointermove');
    },
    [emitChangedTouches],
  );

  const onTouchEnd = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointerup');
    },
    [emitChangedTouches],
  );

  return (
    <View
      style={styles.overlay}
      pointerEvents={enabled ? 'auto' : 'none'}
      onLayout={onLayout}
      onStartShouldSetResponder={() => enabled}
      onMoveShouldSetResponder={() => enabled}
      onResponderTerminationRequest={() => false}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default NativeTouchOverlay;
