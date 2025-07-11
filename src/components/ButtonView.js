import React from 'react';
import {requireNativeComponent, ViewPropTypes} from 'react-native';
import PropTypes from 'prop-types';

const RNButtonView = requireNativeComponent('ButtonView');

class ButtonView extends React.Component {
  _onPressIn = () => {
    this.props.onPressIn?.();
  };

  _onPressOut = () => {
    this.props.onPressOut?.();
  };

  render() {
    return (
      <RNButtonView
        {...this.props}
        onPressIn={this._onPressIn}
        onPressOut={this._onPressOut}
      />
    );
  }
}

ButtonView.defaultProps = {
  pressed: false,
};

export default ButtonView;
