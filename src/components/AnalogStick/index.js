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
