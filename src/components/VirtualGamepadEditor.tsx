import React from 'react';
import {View, StyleSheet, Dimensions, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {
  Portal,
  Modal,
  Card,
  RadioButton,
  Text,
  Divider,
  Button,
  IconButton,
} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GridBackground from './GridBackground';
import GamepadButton from './CustomGamepad/Button';
import {getSettings as getGamepadLayouts} from '../store/gamepadStore';

export type ButtonConfig = {
  name: string;
  x: number;
  y: number;
  scale?: number;
  show?: boolean;
  width?: number;
  height?: number;
};

export interface VirtualGamepadEditorProps {
  visible: boolean;
  profileName: string;
  onSave: (buttons: ButtonConfig[]) => void;
  onCancel: () => void;
}

const buildDefaultButtons = (): ButtonConfig[] => {
  const {width, height} = Dimensions.get('window');
  const nexusLeft = width * 0.5 - 20;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return [
    {name: 'LeftTrigger', x: 30, y: 40, scale: 1, show: true},
    {name: 'RightTrigger', x: width - 40, y: 40, scale: 1, show: true},
    {name: 'LeftShoulder', x: 30, y: 100, scale: 1, show: true},
    {name: 'RightShoulder', x: width - 40, y: 100, scale: 1, show: true},
    {name: 'A', x: width - 90, y: height - 60, scale: 1, show: true},
    {name: 'B', x: width - 40, y: height - 110, scale: 1, show: true},
    {name: 'X', x: width - 140, y: height - 110, scale: 1, show: true},
    {name: 'Y', x: width - 90, y: height - 160, scale: 1, show: true},
    {name: 'LeftThumb', x: 225, y: height - 80, scale: 1, show: true},
    {name: 'RightThumb', x: width - 235, y: height - 70, scale: 1, show: true},
    {name: 'View', x: viewLeft, y: height - 30, scale: 1, show: true},
    {name: 'Nexus', x: nexusLeft, y: height - 30, scale: 1, show: true},
    {name: 'Menu', x: menuLeft, y: height - 30, scale: 1, show: true},
    {name: 'DPadUp', x: 85, y: height - 155, show: true},
    {name: 'DPadLeft', x: 35, y: height - 105, show: true},
    {name: 'DPadDown', x: 85, y: height - 55, show: true},
    {name: 'DPadRight', x: 135, y: height - 105, show: true},
    {name: 'LeftStick', x: 175, y: height - 205, show: true},
    {name: 'RightStick', x: width - 265, y: height - 195, show: true},
  ];
};

const VirtualGamepadEditor: React.FC<VirtualGamepadEditorProps> = ({
  visible,
  profileName,
  onSave,
  onCancel,
}) => {
  const {t} = useTranslation();
  const [buttons, setButtons] = React.useState<ButtonConfig[]>([]);
  const [defaultButtons, setDefaultButtons] = React.useState<ButtonConfig[]>(
    [],
  );
  const [showGrid, setShowGrid] = React.useState(true);
  const [showTips, setShowTips] = React.useState(true);
  const [currentButton, setCurrentButton] = React.useState('');
  const [currentScale, setCurrentScale] = React.useState(1);
  const [currentShow, setCurrentShow] = React.useState(true);
  const [showButtonModal, setShowButtonModal] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(Date.now());

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const defaults = buildDefaultButtons();
    setDefaultButtons(defaults);
    const layouts = getGamepadLayouts();
    const layout = layouts[profileName];
    if (layout && Array.isArray(layout)) {
      setButtons(layout.map(button => ({...button})));
    } else {
      setButtons(defaults.map(button => ({...button})));
    }
    setShowGrid(true);
    setShowTips(true);
    setReloadKey(Date.now());
  }, [visible, profileName]);

  if (!visible) {
    return null;
  }

  const handleDrag = (name: string, x: number, y: number) => {
    const next = buttons.map(button => {
      if (button.name === name) {
        return {...button, x: Math.round(x), y: Math.round(y)};
      }
      return button;
    });
    setButtons(next);
  };

  const handleChangeSize = (scale: number) => {
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, scale} : button,
    );
    setButtons(next);
  };

  const handleChangeShow = (value: boolean) => {
    setCurrentShow(value);
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, show: value} : button,
    );
    setButtons(next);
  };

  const handleReset = () => {
    setButtons(defaultButtons.map(button => ({...button})));
    setReloadKey(Date.now());
  };

  const handleSave = () => {
    onSave(buttons);
  };

  const renderButtonOptions = () => {
    return (
      <Portal>
        <Modal
          visible={showButtonModal}
          onDismiss={() => setShowButtonModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' && (
                  <>
                    <View style={styles.title}>
                      <Text>
                        {t('Size')}: {currentScale}
                      </Text>
                      <Divider style={styles.divider} />
                    </View>
                    <Slider
                      value={currentScale}
                      minimumValue={0.5}
                      maximumValue={4}
                      step={0.1}
                      onValueChange={val => {
                        const _val = Math.round(val * 10) / 10;
                        setCurrentScale(_val);
                        handleChangeSize(_val);
                      }}
                      minimumTrackTintColor="#107C10"
                      maximumTrackTintColor="grey"
                    />
                  </>
                )}

              <View style={styles.title}>
                <Text>{t('ShowTitle')}</Text>
                <Divider style={styles.divider} />
              </View>
              <RadioButton.Group
                onValueChange={val => handleChangeShow(val === 'true')}
                value={currentShow ? 'true' : 'false'}>
                <RadioButton.Item label={t('Show')} value="true" />
                <RadioButton.Item label={t('Hide')} value="false" />
              </RadioButton.Group>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderTipsModal = () => (
    <Portal>
      <Modal
        visible={showTips}
        onDismiss={() => setShowTips(false)}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Content>
            <Text>
              TIPS1:{' '}
              {t(
                'The position of custom virtual buttons may have discrepancies with actual rendering. Please refer to the actual effect for accuracy',
              )}
            </Text>
            <Text>
              TIPS2: {t('Click on an element to set its size and display')}
            </Text>
            <Text>TIPS3: {t('Drag elements to adjust their position')}</Text>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );

  const renderButtons = () => (
    <>
      {buttons.map(button => {
        if (button.name === 'LeftStick' || button.name === 'RightStick') {
          if (!button.show) {
            return null;
          }
          return (
            <Draggable
              x={button.x}
              y={button.y}
              key={button.name + reloadKey}
              renderSize={100}
              renderColor="white"
              isCircle
              onShortPressRelease={() => {
                setCurrentButton(button.name);
                setCurrentScale(1);
                setCurrentShow(button.show ?? true);
                setShowButtonModal(true);
              }}
              onDragRelease={event => {
                handleDrag(
                  button.name,
                  event.nativeEvent.pageX - event.nativeEvent.locationX,
                  event.nativeEvent.pageY - event.nativeEvent.locationY,
                );
                setReloadKey(Date.now());
              }}
            />
          );
        }
        if (!button.show) {
          return null;
        }
        return (
          <Draggable
            x={button.x}
            y={button.y}
            key={button.name + reloadKey}
            onShortPressRelease={() => {
              setCurrentButton(button.name);
              setCurrentScale(button.scale || 1);
              setCurrentShow(button.show ?? true);
              setShowButtonModal(true);
            }}
            onDragRelease={event => {
              handleDrag(
                button.name,
                event.nativeEvent.pageX - event.nativeEvent.locationX,
                event.nativeEvent.pageY - event.nativeEvent.locationY,
              );
              setReloadKey(Date.now());
            }}>
            <GamepadButton
              name={button.name}
              width={button.width ?? 50}
              height={button.height ?? 50}
              scale={button.scale ?? 1}
            />
          </Draggable>
        );
      })}
    </>
  );

  return (
    <Portal>
      <View style={styles.overlay}>
        {renderTipsModal()}
        {renderButtonOptions()}

        {showGrid && <GridBackground gridSize={20} />}

        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.actionButton}>
            {t('Save')}
          </Button>
          <Button
            mode="outlined"
            onPress={handleReset}
            style={styles.actionButton}>
            {t('Reset')}
          </Button>
          <Button mode="text" onPress={onCancel} style={styles.actionButton}>
            {t('Cancel')}
          </Button>
        </View>

        <TouchableOpacity
          style={styles.gridToggle}
          onPress={() => setShowGrid(!showGrid)}>
          <Text style={styles.gridToggleText}>
            {showGrid ? 'Hide Grid' : 'Show Grid'}
          </Text>
        </TouchableOpacity>

        <View style={styles.profileBadge}>
          <Text style={styles.profileText}>
            Profile: {profileName || 'Default'}
          </Text>
          <IconButton
            icon="close"
            onPress={onCancel}
            style={styles.closeButton}
          />
        </View>

        {renderButtons()}
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 999,
  },
  modal: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '25%',
    marginRight: '25%',
  },
  title: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  divider: {
    marginTop: 10,
  },
  actions: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1000,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  gridToggle: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    zIndex: 1000,
  },
  gridToggleText: {
    color: '#fff',
  },
  profileBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  profileText: {
    color: '#fff',
  },
  closeButton: {
    marginLeft: 4,
  },
});

export default VirtualGamepadEditor;
