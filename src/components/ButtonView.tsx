import React from 'react';
import {requireNativeComponent, ViewProps} from 'react-native';

type RNButtonViewProps = ViewProps & {
  onPressIn?: () => void;
  onPressOut?: () => void;
};

const RNButtonView = requireNativeComponent<RNButtonViewProps>('ButtonView');

interface ButtonViewProps extends RNButtonViewProps {
  buttonName: string;
}

const ButtonView: React.FC<ButtonViewProps> = props => {
  const {onPressIn, onPressOut, ...rest} = props;

  const handlePressIn = React.useCallback(() => {
    onPressIn?.();
  }, [onPressIn]);

  const handlePressOut = React.useCallback(() => {
    onPressOut?.();
  }, [onPressOut]);

  return (
    <RNButtonView
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    />
  );
};

export default ButtonView;
