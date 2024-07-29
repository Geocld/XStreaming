import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import {Layout, Text} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {SvgXml} from 'react-native-svg';
import maping from '../common/svg';

const log = debugFactory('GameMapDetailScreen');

const {GamepadManager} = NativeModules;

function GameMapDetail({navigation, route}) {
  const {t} = useTranslation();

  React.useEffect(() => {
    log.info('TitleDetail button:', route.params?.button);
    GamepadManager.setCurrentScreen('stream');
    const eventEmitter = new NativeEventEmitter();
    const gpDownEventListener = eventEmitter.addListener(
      'onGamepadKeyDown',
      event => {
        console.log('onGamepadKeyDown:', event);
        const keyCode = event.keyCode;
        navigation.navigate('NativeGameMap', {
          button: route.params?.button,
          keyCode,
        });
      },
    );

    const dpDownEventListener = eventEmitter.addListener(
      'onDpadKeyDown',
      event => {
        console.log('onDpadKeyDown:', event);
        const keyCode = event.dpadIdx;
        navigation.navigate('NativeGameMap', {
          button: route.params?.button,
          keyCode,
        });
      },
    );

    // const triggerEventListener = eventEmitter.addListener(
    //   'onTrigger',
    //   event => {
    //     if (event.leftTrigger > 0) {
    //       Alert.alert(
    //         t('Warning'),
    //         `leftTrigger: ${event.leftTrigger}`,
    //       );
    //     }

    //     if (event.rightTrigger > 0) {
    //       Alert.alert(
    //         t('Warning'),
    //         `rightTrigger: ${event.rightTrigger}`,
    //       );
    //     }
    //   },
    // );

    return () => {
      gpDownEventListener && gpDownEventListener.remove();
      dpDownEventListener && dpDownEventListener.remove();
      // triggerEventListener && triggerEventListener.remove();
      GamepadManager.setCurrentScreen('');
    };
  }, [route.params?.button, navigation]);

  const current = route.params?.button;
  console.log('current:', current);

  return (
    <Layout style={styles.container}>
      <ScrollView>
        <Text style={styles.text}>
          {t(
            'Please press the button on the controller, which will be mapped to:',
          )}
        </Text>
        <View style={styles.flex}>
          <SvgXml xml={maping[current]} width="50" height="50" />
        </View>
        <Text style={styles.text}>
          {t('After successful mapping, this pop-up will automatically close')}
        </Text>
      </ScrollView>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    padding: 10,
  },
  text: {
    color: '#333',
    marginTop: 10,
    marginBottom: 10,
  },
  flex: {
    flex: 1,
    alignItems: 'center',
  },
});

export default GameMapDetail;
