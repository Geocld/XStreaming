import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  NativeModules,
  ToastAndroid,
} from 'react-native';
import {Button, RadioButton, Text, Divider} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Slider from '@react-native-community/slider';
import {getSettings, saveSettings} from '../store/settingStore';

const {UsbRumbleManager} = NativeModules;

function Ds5SettingsScreen({navigation, route}) {
  const {t} = useTranslation();

  const [mode, setMode] = React.useState('0');
  const [startPos, setStartPos] = React.useState(0);
  const [endPos, setEndPos] = React.useState(0);
  const [force, setForce] = React.useState(0);
  const [frequency, setFrequency] = React.useState(0);
  const [settings, setSettings] = React.useState({});

  const modeRef = React.useRef('0');
  const startPosRef = React.useRef(0);
  const endPosRef = React.useRef(0);
  const forceRef = React.useRef(0);
  const frequencyRef = React.useRef(0);

  React.useEffect(() => {
    const _settings = getSettings();
    console.log('Get localSettings:', _settings);
    console.log('type:', route.params?.type);
    setSettings(_settings);

    let triggerType = _settings.left_trigger_type;
    let triggerEffects = _settings.left_trigger_effects;
    if (route.params?.type !== 'left') {
      triggerType = _settings.right_trigger_type;
      triggerEffects = _settings.right_trigger_effects;
    }
    if (triggerType === 0) {
      setMode('0');

      modeRef.current = '0';
    } else if (triggerType === 1) {
      setMode('1');
      setStartPos(triggerEffects[0] || 40);
      setForce(triggerEffects[1] || 230);

      modeRef.current = '1';
      startPosRef.current = triggerEffects[0] || 40;
      forceRef.current = triggerEffects[1] || 230;
    } else if (triggerType === 2) {
      setMode('2');
      setStartPos(triggerEffects[0] || 15);
      setEndPos(triggerEffects[1] || 100);
      setForce(triggerEffects[2] || 255);

      modeRef.current = '2';
      startPosRef.current = triggerEffects[0] || 15;
      endPosRef.current = triggerEffects[1] || 100;
      forceRef.current = triggerEffects[2] || 255;
    } else if (triggerType === 6) {
      setMode('3');
      setStartPos(triggerEffects[0] || 20);
      setForce(triggerEffects[1] || 200);
      setFrequency(triggerEffects[2] || 10);

      modeRef.current = '3';
      startPosRef.current = triggerEffects[0] || 20;
      forceRef.current = triggerEffects[1] || 200;
      frequencyRef.current = triggerEffects[2] || 10;
    }

    UsbRumbleManager.setDsController(
      16,
      124,
      16,
      0,
      0,
      0,
      0,
      0,
      _settings.left_trigger_type,
      _settings.left_trigger_effects,
      _settings.right_trigger_type,
      _settings.right_trigger_effects,
    );
  }, [navigation, route.params?.type]);

  const handleSave = () => {
    let triggerType = 0;
    let triggerEffects = [];
    if (+modeRef.current === 1) {
      triggerType = 1;
      triggerEffects = [startPosRef.current, forceRef.current];
    } else if (+modeRef.current === 2) {
      triggerType = 2;
      triggerEffects = [
        startPosRef.current,
        endPosRef.current,
        forceRef.current,
      ];
    } else if (+modeRef.current === 3) {
      triggerType = 6;
      triggerEffects = [
        startPosRef.current,
        forceRef.current,
        frequencyRef.current,
      ];
    }
    if (route.params?.type === 'left') {
      settings.left_trigger_type = triggerType;
      settings.left_trigger_effects = triggerEffects;
    } else {
      settings.right_trigger_type = triggerType;
      settings.right_trigger_effects = triggerEffects;
    }
    setSettings(settings);
    saveSettings(settings);
    ToastAndroid.show(t('Saved'), ToastAndroid.SHORT);
    navigation.goBack();
  };

  const handleSetMode = val => {
    setMode(val);
    modeRef.current = val;
    if (+val === 1) {
      setStartPos(40);
      setForce(230);

      startPosRef.current = 40;
      forceRef.current = 230;
    } else if (+val === 2) {
      setStartPos(15);
      setEndPos(100);
      setForce(255);

      startPosRef.current = 15;
      endPosRef.current = 100;
      forceRef.current = 255;
    } else if (+val === 3) {
      setStartPos(20);
      setForce(200);
      setFrequency(10);

      startPosRef.current = 20;
      forceRef.current = 200;
      frequencyRef.current = 10;
    }
    setTimeout(() => {
      handleSetTrigger();
    }, 100);
  };

  const handleSetTrigger = () => {
    let triggerType = 0;
    let triggerEffects = [];
    if (+modeRef.current === 1) {
      triggerType = 1;
      triggerEffects = [startPosRef.current, forceRef.current];
    } else if (+modeRef.current === 2) {
      triggerType = 2;
      triggerEffects = [
        startPosRef.current,
        endPosRef.current,
        forceRef.current,
      ];
    } else if (+modeRef.current === 3) {
      triggerType = 6;
      triggerEffects = [
        startPosRef.current,
        forceRef.current,
        frequencyRef.current,
      ];
    }

    if (route.params?.type === 'left') {
      UsbRumbleManager.setDsController(
        16,
        124,
        16,
        0,
        0,
        0,
        0,
        0,
        triggerType,
        triggerEffects,
        settings.right_trigger_type,
        settings.right_trigger_effects,
      );
    } else {
      UsbRumbleManager.setDsController(
        16,
        124,
        16,
        0,
        0,
        0,
        0,
        0,
        settings.left_trigger_type,
        settings.left_trigger_effects,
        triggerType,
        triggerEffects,
      );
    }
  };

  const resetTriggers = () => {
    UsbRumbleManager.setDsController(
      16,
      124,
      16,
      0,
      0,
      0,
      0,
      0,
      settings.left_trigger_type,
      settings.left_trigger_effects,
      settings.right_trigger_type,
      settings.right_trigger_effects,
    );
  };

  const renderOptions = () => {
    return (
      <>
        <View>
          <RadioButton.Group onValueChange={handleSetMode} value={mode}>
            <RadioButton.Item label={t('Off')} value="0" />
            <RadioButton.Item label={t('Resistance')} value="1" />
            <RadioButton.Item label={t('Trigger')} value="2" />
            <RadioButton.Item label={t('Automatic Trigger')} value="3" />
          </RadioButton.Group>
        </View>

        {mode > 0 ? (
          <View>
            <Text style={styles.sliderTitle}>start_pos</Text>
            <Slider
              style={styles.slider}
              value={startPos}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={val => {
                setStartPos(val);
                setTimeout(() => {
                  handleSetTrigger();
                }, 100);
              }}
              lowerLimit={0}
              minimumTrackTintColor="#107C10"
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {+mode === 2 ? (
          <View>
            <Text style={styles.sliderTitle}>end_pos</Text>
            <Slider
              style={styles.slider}
              value={endPos}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={val => {
                setEndPos(val);
                setTimeout(() => {
                  handleSetTrigger();
                }, 100);
              }}
              lowerLimit={0}
              minimumTrackTintColor="#107C10"
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {mode > 0 ? (
          <View>
            <Text style={styles.sliderTitle}>force</Text>
            <Slider
              style={styles.slider}
              value={force}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={val => {
                setForce(val);
                setTimeout(() => {
                  handleSetTrigger();
                }, 100);
              }}
              lowerLimit={0}
              minimumTrackTintColor="#107C10"
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}

        {+mode === 3 ? (
          <View>
            <Text style={styles.sliderTitle}>frequency</Text>
            <Slider
              style={styles.slider}
              value={frequency}
              minimumValue={0}
              maximumValue={255}
              step={1}
              onValueChange={val => {
                setFrequency(val);
                setTimeout(() => {
                  handleSetTrigger();
                }, 100);
              }}
              lowerLimit={0}
              minimumTrackTintColor="#107C10"
              maximumTrackTintColor="grey"
            />
          </View>
        ) : null}
      </>
    );
  };

  const title =
    route.params?.type === 'left'
      ? t('DualSense_adaptive_trigger_left')
      : t('DualSense_adaptive_trigger_right');
  const description =
    route.params?.type === 'left'
      ? t('DualSense_adaptive_trigger_left_desc')
      : t('DualSense_adaptive_trigger_right_desc');

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.tips}>
          <Text>{title}</Text>
        </View>

        <View style={styles.tips}>
          <Text>Tips: {description}</Text>
        </View>

        <Divider />

        {renderOptions()}
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="contained" style={styles.button} onPress={handleSave}>
          {t('Save')}
        </Button>
        <Button
          mode="outlined"
          style={styles.button}
          onPress={() => {
            navigation.goBack();
            resetTriggers();
          }}>
          {t('Back')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tips: {
    padding: 10,
  },
  scrollView: {
    marginBottom: 120,
  },
  sliderTitle: {
    padding: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 20,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default Ds5SettingsScreen;
