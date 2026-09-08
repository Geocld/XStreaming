import React from 'react';
import {requireNativeComponent, ViewProps} from 'react-native';

type NativeDPadViewProps = ViewProps & {
  onPressIn?: (event: {
    nativeEvent: {
      direction?: string;
      directions?: string[];
    };
  }) => void;
  onPressOut?: (event: {
    nativeEvent: {
      direction?: string;
      directions?: string[];
    };
  }) => void;
};

const RNDPadView = requireNativeComponent<NativeDPadViewProps>('DPadView');

type DPadViewProps = ViewProps & {
  onPressIn?: (name: string | string[]) => void;
  onPressOut?: (name: string | string[]) => void;
};

const DPadView: React.FC<DPadViewProps> = ({
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const handlePressIn = React.useCallback(
    (event: any) => {
      const directions = event?.nativeEvent?.directions;
      if (Array.isArray(directions) && directions.length > 0) {
        onPressIn?.(directions);
        return;
      }

      const direction = event?.nativeEvent?.direction;
      if (direction) {
        onPressIn?.(direction);
      }
    },
    [onPressIn],
  );

  const handlePressOut = React.useCallback(
    (event: any) => {
      const directions = event?.nativeEvent?.directions;
      if (Array.isArray(directions) && directions.length > 0) {
        onPressOut?.(directions);
        return;
      }

      const direction = event?.nativeEvent?.direction;
      if (direction) {
        onPressOut?.(direction);
      }
    },
    [onPressOut],
  );

  return (
    <RNDPadView
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    />
  );
};

export default DPadView;
