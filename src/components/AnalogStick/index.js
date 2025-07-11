import React, {useCallback} from 'react';
import {requireNativeComponent} from 'react-native';

const RNAnalogStick = requireNativeComponent('AnalogStickView');

const AnalogStick = ({
  radius = 150,
  handleRadius = 100,
  onStickChange,
  ...props
}) => {
  const handleAnalogStickChange = useCallback(
    event => {
      // 优先使用 onStickChange，如果没有则使用 onAnalogStickChan
      if (onStickChange) {
        onStickChange(event.nativeEvent);
      }
    },
    [onStickChange],
  );

  return (
    <RNAnalogStick
      {...props}
      radius={radius}
      handleRadius={handleRadius}
      onAnalogStickChange={handleAnalogStickChange}
    />
  );
};

export default AnalogStick;
