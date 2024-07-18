import React from 'react';
import {StyleSheet, View, TouchableOpacity, Dimensions} from 'react-native';
import {SvgXml} from 'react-native-svg';
import icons from '../common/virtualgp';
import {ReactNativeJoystick} from '../components/Joystick';

type Props = {
  onPressIn: (name: string) => {};
  onPressOut: (name: string) => {};
  onStickMove: (id: string, position: any) => {};
};

const VirtualGamepad: React.FC<Props> = ({
  onPressIn,
  onPressOut,
  onStickMove,
}) => {
  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  const handleStickMove = (id: string, data: any) => {
    onStickMove && onStickMove(id, data);
  };

  const {width} = Dimensions.get('window');

  const nexusLeft = width * 0.5 - 20;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, styles.lt]}
        onPressIn={() => {
          handlePressIn('LeftTrigger');
        }}
        onPressOut={() => {
          handlePressOut('LeftTrigger');
        }}>
        <SvgXml xml={icons.LeftTrigger} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.rt]}
        onPressIn={() => {
          handlePressIn('RightTrigger');
        }}
        onPressOut={() => {
          handlePressOut('RightTrigger');
        }}>
        <SvgXml xml={icons.RightTrigger} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.lb]}
        onPressIn={() => {
          handlePressIn('LeftShoulder');
        }}
        onPressOut={() => {
          handlePressOut('LeftShoulder');
        }}>
        <SvgXml xml={icons.LeftShoulder} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.rb]}
        onPressIn={() => {
          handlePressIn('RightShoulder');
        }}
        onPressOut={() => {
          handlePressOut('RightShoulder');
        }}>
        <SvgXml xml={icons.RightShoulder} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.a]}
        onPressIn={() => {
          handlePressIn('A');
        }}
        onPressOut={() => {
          handlePressOut('A');
        }}>
        <SvgXml xml={icons.A} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.b]}
        onPressIn={() => {
          handlePressIn('B');
        }}
        onPressOut={() => {
          handlePressOut('B');
        }}>
        <SvgXml xml={icons.B} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.x]}
        onPressIn={() => {
          handlePressIn('X');
        }}
        onPressOut={() => {
          handlePressOut('X');
        }}>
        <SvgXml xml={icons.X} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.y]}
        onPressIn={() => {
          handlePressIn('Y');
        }}
        onPressOut={() => {
          handlePressOut('Y');
        }}>
        <SvgXml xml={icons.Y} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.l3]}
        onPressIn={() => {
          handlePressIn('LeftThumb');
        }}
        onPressOut={() => {
          handlePressOut('LeftThumb');
        }}>
        <SvgXml xml={icons.LeftThumb} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.r3]}
        onPressIn={() => {
          handlePressIn('RightThumb');
        }}
        onPressOut={() => {
          handlePressOut('RightThumb');
        }}>
        <SvgXml xml={icons.RightThumb} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.view, {left: viewLeft}]}
        onPressIn={() => {
          handlePressIn('View');
        }}
        onPressOut={() => {
          handlePressOut('View');
        }}>
        <SvgXml xml={icons.View} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.nexus, {left: nexusLeft}]}
        onPressIn={() => {
          handlePressIn('Nexus');
        }}
        onPressOut={() => {
          handlePressOut('Nexus');
        }}>
        <SvgXml xml={icons.Nexus} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.menu, {left: menuLeft}]}
        onPressIn={() => {
          handlePressIn('Menu');
        }}
        onPressOut={() => {
          handlePressOut('Menu');
        }}>
        <SvgXml xml={icons.Menu} width="40" height="40" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.dpadLeft]}
        onPressIn={() => {
          handlePressIn('DPadLeft');
        }}
        onPressOut={() => {
          handlePressOut('DPadLeft');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadTop]}
        onPressIn={() => {
          handlePressIn('DPadUp');
        }}
        onPressOut={() => {
          handlePressOut('DPadUp');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadRight]}
        onPressIn={() => {
          handlePressIn('DPadRight');
        }}
        onPressOut={() => {
          handlePressOut('DPadRight');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadBottom]}
        onPressIn={() => {
          handlePressIn('DPadDown');
        }}
        onPressOut={() => {
          handlePressOut('DPadDown');
        }}
      />

      <View style={[styles.button, styles.leftJs]}>
        <ReactNativeJoystick
          color="#ffffff"
          radius={50}
          onMove={data => handleStickMove('left', data)}
          onStart={data => handleStickMove('left', data)}
          onStop={data => handleStickMove('left', data)}
        />
      </View>

      <View style={[styles.button, styles.rightJs]}>
        <ReactNativeJoystick
          color="#ffffff"
          radius={50}
          onMove={data => handleStickMove('right', data)}
          onStart={data => handleStickMove('right', data)}
          onStop={data => handleStickMove('right', data)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // backgroundColor: 'rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  button: {
    opacity: 0.5,
    position: 'absolute',
  },
  lt: {
    left: 20,
    top: 40,
  },
  rt: {
    right: 20,
    top: 40,
  },
  lb: {
    left: 20,
    top: 100,
  },
  rb: {
    right: 20,
    top: 100,
  },
  a: {
    bottom: 50,
    right: 70,
  },
  b: {
    bottom: 90,
    right: 30,
  },
  x: {
    bottom: 90,
    right: 110,
  },
  y: {
    bottom: 130,
    right: 70,
  },
  l3: {
    bottom: 50,
    left: 130,
  },
  r3: {
    bottom: 20,
    right: 210,
  },
  view: {
    bottom: 10,
  },
  nexus: {
    bottom: 10,
  },
  menu: {
    bottom: 10,
  },
  leftJs: {
    left: 100,
    bottom: 110,
  },
  rightJs: {
    right: 180,
    bottom: 80,
  },
  dpadLeft: {
    width: 30,
    height: 20,
    borderWidth: 2,
    borderColor: '#fff',
    left: 30,
    bottom: 80,
    borderRightWidth: 0,
  },
  dpadTop: {
    width: 20,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 58,
    bottom: 100,
    borderBottomWidth: 0,
  },
  dpadRight: {
    width: 30,
    height: 20,
    borderWidth: 2,
    borderColor: '#fff',
    left: 76,
    bottom: 80,
    borderLeftWidth: 0,
  },
  dpadBottom: {
    width: 20,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 58,
    bottom: 50,
    borderTopWidth: 0,
  },
});

export default VirtualGamepad;
