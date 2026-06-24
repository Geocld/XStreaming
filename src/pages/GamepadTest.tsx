import React from 'react';
import {NativeModules, ScrollView, StyleSheet, View} from 'react-native';
import {Button, Text, useTheme} from 'react-native-paper';
import {useFocusEffect} from '@react-navigation/native';
import {useTranslation} from 'react-i18next';
import GamepadTestView from '../components/GamepadTestView';
import {getSettings} from '../store/settingStore';

const {GamepadManager} = NativeModules;

const BUTTONS = [
  ['A', 1],
  ['B', 2],
  ['X', 4],
  ['Y', 8],
  ['Left', 16],
  ['Right', 32],
  ['Up', 64],
  ['Down', 128],
  ['LB', 256],
  ['RB', 512],
  ['LS', 1024],
  ['RS', 2048],
  ['Menu', 4096],
  ['View', 8192],
  ['Nexus', 32768],
];

const initialState = {
  active: false,
  status: 'idle',
  name: '',
  buttons: 0,
  leftX: 0,
  leftY: 0,
  rightX: 0,
  rightY: 0,
  l2: 0,
  r2: 0,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const axisFromI16 = (value: number) => clamp(value / 32767, -1, 1);

function normalizeNativeEvent(nativeEvent: any) {
  if (nativeEvent?.kernel === 'sdl') {
    try {
      const snapshot = JSON.parse(nativeEvent.snapshot || '{}');
      return {
        active: !!snapshot.active,
        status: snapshot.status || 'unknown',
        name: snapshot.name || '',
        buttons: Number(snapshot.buttons) || 0,
        leftX: axisFromI16(Number(snapshot.leftX) || 0),
        leftY: axisFromI16(Number(snapshot.leftY) || 0),
        rightX: axisFromI16(Number(snapshot.rightX) || 0),
        rightY: axisFromI16(Number(snapshot.rightY) || 0),
        l2: clamp((Number(snapshot.l2) || 0) / 255, 0, 1),
        r2: clamp((Number(snapshot.r2) || 0) / 255, 0, 1),
      };
    } catch {
      return {...initialState, status: 'parse_failed'};
    }
  }

  return {
    active: true,
    status: nativeEvent?.status || 'android',
    name: '',
    buttons: Number(nativeEvent?.buttons) || 0,
    leftX: clamp(Number(nativeEvent?.leftX) || 0, -1, 1),
    leftY: clamp(Number(nativeEvent?.leftY) || 0, -1, 1),
    rightX: clamp(Number(nativeEvent?.rightX) || 0, -1, 1),
    rightY: clamp(Number(nativeEvent?.rightY) || 0, -1, 1),
    l2: clamp(Number(nativeEvent?.l2) || 0, 0, 1),
    r2: clamp(Number(nativeEvent?.r2) || 0, 0, 1),
  };
}

function AxisRow({label, value}: {label: string; value: number}) {
  const theme = useTheme();
  const percent = ((clamp(value, -1, 1) + 1) / 2) * 100;
  return (
    <View style={styles.axisRow}>
      <Text style={styles.axisLabel}>{label}</Text>
      <View
        style={[
          styles.axisTrack,
          {backgroundColor: theme.colors.surfaceVariant},
        ]}>
        <View
          style={[styles.axisCenter, {backgroundColor: theme.colors.outline}]}
        />
        <View
          style={[
            styles.axisNeedle,
            {left: `${percent}%`, backgroundColor: theme.colors.primary},
          ]}
        />
      </View>
      <Text style={styles.axisValue}>{value.toFixed(2)}</Text>
    </View>
  );
}

function TriggerRow({label, value}: {label: string; value: number}) {
  const theme = useTheme();
  return (
    <View style={styles.triggerRow}>
      <Text style={styles.axisLabel}>{label}</Text>
      <View
        style={[
          styles.triggerTrack,
          {backgroundColor: theme.colors.surfaceVariant},
        ]}>
        <View
          style={[
            styles.triggerFill,
            {
              width: `${clamp(value, 0, 1) * 100}%`,
              backgroundColor: theme.colors.primary,
            },
          ]}
        />
      </View>
      <Text style={styles.axisValue}>{value.toFixed(2)}</Text>
    </View>
  );
}

function GamepadTestScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const [settings, setSettings] = React.useState<any>(getSettings());
  const [kernel, setKernel] = React.useState<'android' | 'sdl'>(
    getSettings().gamepad_kernal === 'SDL' ? 'sdl' : 'android',
  );
  const [state, setState] = React.useState(initialState);

  useFocusEffect(
    React.useCallback(() => {
      const nextSettings = getSettings();
      setSettings(nextSettings);
      setKernel(nextSettings.gamepad_kernal === 'SDL' ? 'sdl' : 'android');
    }, []),
  );

  const handleState = React.useCallback((event: any) => {
    setState(normalizeNativeEvent(event.nativeEvent));
  }, []);

  const rumble = React.useCallback(() => {
    GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);
    setTimeout(() => {
      GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
    }, 1000);
  }, []);

  const pressed = (mask: number) => Math.floor(state.buttons / mask) % 2 === 1;

  return (
    <View style={styles.container}>
      <GamepadTestView
        style={styles.nativeInput}
        kernel={kernel}
        deadZone={settings.dead_zone ?? 0.13}
        edgeCompensation={settings.edge_compensation ?? 0}
        shortTrigger={!!settings.short_trigger}
        swapDpad={false}
        onState={handleState}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text variant="titleMedium">{t('GamepadTestTitle')}</Text>
            <Text style={styles.kernelText}>
              {t('GamepadKernelTitle')}:{' '}
              {kernel === 'sdl' ? t('SDL') : t('Default')}
            </Text>
          </View>
          <Button mode="contained" onPress={rumble}>
            {t('GamepadTestRumble')}
          </Button>
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium">{t('GamepadTestButtons')}</Text>
          <View style={styles.buttonGrid}>
            {BUTTONS.map(([label, mask]) => (
              <View
                key={label as string}
                style={[
                  styles.buttonPill,
                  {
                    backgroundColor: pressed(mask as number)
                      ? theme.colors.primary
                      : theme.colors.surfaceVariant,
                  },
                ]}>
                <Text
                  style={{
                    color: pressed(mask as number)
                      ? theme.colors.onPrimary
                      : theme.colors.onSurface,
                  }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium">{t('GamepadTestSticks')}</Text>
          <AxisRow label="LX" value={state.leftX} />
          <AxisRow label="LY" value={state.leftY} />
          <AxisRow label="RX" value={state.rightX} />
          <AxisRow label="RY" value={state.rightY} />
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium">{t('GamepadTestTriggers')}</Text>
          <TriggerRow label="LT" value={state.l2} />
          <TriggerRow label="RT" value={state.r2} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  nativeInput: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  kernelText: {
    marginTop: 4,
    fontSize: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  section: {
    gap: 10,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonPill: {
    minWidth: 76,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  axisLabel: {
    width: 34,
  },
  axisValue: {
    width: 48,
    textAlign: 'right',
  },
  axisTrack: {
    flex: 1,
    height: 18,
    borderRadius: 4,
    overflow: 'hidden',
  },
  axisCenter: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: '100%',
  },
  axisNeedle: {
    position: 'absolute',
    width: 4,
    height: '100%',
    marginLeft: -2,
  },
  triggerTrack: {
    flex: 1,
    height: 18,
    borderRadius: 4,
    overflow: 'hidden',
  },
  triggerFill: {
    height: '100%',
  },
});

export default GamepadTestScreen;
