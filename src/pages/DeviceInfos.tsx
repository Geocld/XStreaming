import React from 'react';
import {StyleSheet, View, ScrollView, NativeModules} from 'react-native';
import {Button, Text, Card, Divider, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

const {FullScreenManager, GamepadManager} = NativeModules;

function DeviceInfosScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const isDark = theme.dark;

  const [infos, setInfos] = React.useState<any>(null);
  const [rumbing, setRumbing] = React.useState(false);
  const rumblingRef = React.useRef(false);

  React.useEffect(() => {
    const _infos = FullScreenManager.getDeviceInfos();
    setInfos(_infos);

    return () => {
      GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
    };
  }, []);

  const cardStyle = {
    backgroundColor: isDark
      ? 'rgba(18, 20, 32, 0.84)'
      : 'rgba(255, 255, 255, 0.68)',
    borderColor: isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(255, 255, 255, 0.56)',
  };

  const mutedColor = isDark
    ? 'rgba(255,255,255,0.6)'
    : 'rgba(0,0,0,0.5)';

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.contentContainer}>
      <Card mode="contained" style={[styles.card, cardStyle]}>
        <Card.Content>
          <Text
            variant="titleLarge"
            style={{color: theme.colors.primary, marginBottom: 12}}>
            {t('ControllerRumble')}
          </Text>
          <View style={styles.btnWrap}>
            <Button
              mode="contained"
              compact
              onPress={() => {
                GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);
                setTimeout(() => {
                  GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
                }, 1000);
              }}>
              {t('Rumble1s')}
            </Button>
            <Button
              mode="contained"
              compact
              onPress={() => {
                if (rumblingRef.current) {
                  GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
                  rumblingRef.current = false;
                  setRumbing(false);
                } else {
                  rumblingRef.current = true;
                  setRumbing(true);
                  GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);
                }
              }}>
              {rumbing ? t('Stop rumble') : t('ControllerRumble')}
            </Button>
            <Button
              mode="contained"
              compact
              onPress={() => {
                const _infos = FullScreenManager.getDeviceInfos();
                setInfos(_infos);
              }}>
              {t('Refresh')}
            </Button>
          </View>
        </Card.Content>
      </Card>

      {infos && (
        <Card mode="contained" style={[styles.card, cardStyle]}>
          <Card.Content>
            <Text
              variant="titleLarge"
              style={{color: theme.colors.primary, marginBottom: 12}}>
              {t('Device')}
            </Text>
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('Model')}
              </Text>
              <Text variant="bodyMedium">
                {infos.factor + ' ' + infos.model}
              </Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('Android Version')}
              </Text>
              <Text variant="bodyMedium">{infos.androidVer}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('API Version')}
              </Text>
              <Text variant="bodyMedium">{infos.apiVer}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('Kernel Version')}
              </Text>
              <Text variant="bodyMedium">{infos.kernelVer}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('Webview Version')}
              </Text>
              <Text variant="bodyMedium">{infos.webviewVer}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text variant="labelMedium" style={{color: mutedColor}}>
                {t('Device rumble')}
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color: infos.devVibrator ? '#36B728' : '#dc2626',
                }}>
                {infos.devVibrator ? t('supported') : t('unsupported')}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {infos && infos.devs.length > 0 && (
        <Card mode="contained" style={[styles.card, cardStyle]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleLarge"
                style={{color: theme.colors.primary}}>
                {t('Controllers')}
              </Text>
              <View style={styles.badge}>
                <Text variant="labelSmall" style={{color: '#fff'}}>
                  {infos.devs.length}
                </Text>
              </View>
            </View>
            {infos.devs.map((dev, idx) => (
              <View key={idx}>
                {idx > 0 && <Divider style={styles.divider} />}
                <View style={styles.deviceCard}>
                  <Text
                    variant="titleMedium"
                    style={{marginBottom: 4}}
                    numberOfLines={1}>
                    {dev.name}
                  </Text>
                  <View style={styles.deviceRow}>
                    <Text variant="labelMedium" style={{color: mutedColor}}>
                      {t('Rumble')}
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: dev.rumble ? '#36B728' : '#dc2626',
                      }}>
                      {dev.rumble ? t('supported') : t('unsupported')}
                    </Text>
                  </View>
                  <View style={styles.deviceRow}>
                    <Text variant="labelMedium" style={{color: mutedColor}}>
                      {t('Sensor')}
                    </Text>
                    <Text variant="bodyMedium">{t(dev.sensor)}</Text>
                  </View>
                  <View style={styles.deviceRow}>
                    <Text variant="labelMedium" style={{color: mutedColor}}>
                      {t('Details')}
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={styles.detailsText}
                      numberOfLines={3}>
                      {dev.details}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    borderRadius: 18,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowRadius: 22,
    shadowOpacity: 0.12,
    borderWidth: 1,
  },
  btnWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  divider: {
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#107C10',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 10,
  },
  deviceCard: {
    paddingVertical: 12,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  detailsText: {
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
});

export default DeviceInfosScreen;
