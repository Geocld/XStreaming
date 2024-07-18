import React, {useState, useRef, useCallback, useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import * as utils from './utils';
import {
  Gesture,
  GestureDetector,
  GestureTouchEvent,
} from 'react-native-gesture-handler';
import {IReactNativeJoystickProps} from './types';

export const ReactNativeJoystick = ({
  onStart,
  onMove,
  onStop,
  color = '#000000',
  radius = 150,
  style,
  ...props
}: IReactNativeJoystickProps) => {
  const wrapperRadius = radius;
  const nippleRadius = wrapperRadius / 2;

  const [x, setX] = useState(wrapperRadius - nippleRadius);
  const [y, setY] = useState(wrapperRadius - nippleRadius);
  const startX = useRef(0);
  const startY = useRef(0);

  const handleTouchMove = useCallback(
    (event: GestureTouchEvent) => {
      const e = event.changedTouches[0];
      const fingerX = e.x;
      const fingerY = e.y;
      let coordinates = {
        x: fingerX - nippleRadius,
        y: fingerY - nippleRadius,
      };

      let distX = fingerX - startX.current;
      if (distX > 0 && distX > wrapperRadius) {
        distX = wrapperRadius;
      }
      if (distX < 0 && Math.abs(distX) > wrapperRadius) {
        distX = -wrapperRadius;
      }

      let distY = fingerY - startY.current;
      if (distY > 0 && distY > wrapperRadius) {
        distY = wrapperRadius;
      }
      if (distY < 0 && Math.abs(distY) > wrapperRadius) {
        distY = -wrapperRadius;
      }

      const angle = utils.calcAngle(
        {x: fingerX, y: fingerY},
        {x: wrapperRadius, y: wrapperRadius},
      );

      let dist = utils.calcDistance(
        {x: wrapperRadius, y: wrapperRadius},
        {x: fingerX, y: fingerY},
      );

      const force = dist / (nippleRadius * 2);

      dist = Math.min(dist, wrapperRadius);
      if (dist === wrapperRadius) {
        coordinates = utils.findCoord(
          {x: wrapperRadius, y: wrapperRadius},
          dist,
          angle,
        );
        coordinates = {
          x: coordinates.x - nippleRadius,
          y: coordinates.y - nippleRadius,
        };
      }

      setX(coordinates.x);
      setY(coordinates.y);

      onMove &&
        onMove({
          dist: {
            x: distX / wrapperRadius,
            y: distY / wrapperRadius,
          },
          position: coordinates,
          angle: {
            radian: utils.degreesToRadians(angle),
            degree: angle,
          },
          force,
          type: 'move',
        });
    },
    [nippleRadius, wrapperRadius, onMove],
  );

  const handleTouchEnd = () => {
    setX(wrapperRadius - nippleRadius);
    setY(wrapperRadius - nippleRadius);
    startX.current = 0;
    startY.current = 0;
    onStop &&
      onStop({
        force: 0,
        dist: {
          x: 0,
          y: 0,
        },
        position: {
          x: 0,
          y: 0,
        },
        angle: {
          radian: 0,
          degree: 0,
        },
        type: 'stop',
      });
  };

  const handleTouchStart = (event: any) => {
    startX.current = event.x;
    startY.current = event.y;

    onStart &&
      onStart({
        force: 0,
        dist: {
          x: 0,
          y: 0,
        },
        position: {
          x: 0,
          y: 0,
        },
        angle: {
          radian: 0,
          degree: 0,
        },
        type: 'start',
      });
  };

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onStart(handleTouchStart)
    .onEnd(handleTouchEnd)
    .onTouchesMove(handleTouchMove);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          width: 2 * radius,
          height: 2 * radius,
          borderRadius: radius,
          backgroundColor: `${color}55`,
          transform: [{rotateX: '180deg'}],
          ...(style && typeof style === 'object' ? style : {}),
        },
        nipple: {
          height: 2 * nippleRadius,
          width: 2 * nippleRadius,
          borderRadius: nippleRadius,
          backgroundColor: `${color}bb`,
          position: 'absolute',
          transform: [
            {
              translateX: x,
            },
            {translateY: y},
          ],
        },
      }),
    [radius, color, nippleRadius, x, y, style],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.wrapper} {...props}>
        <View pointerEvents="none" style={styles.nipple}></View>
      </View>
    </GestureDetector>
  );
};
