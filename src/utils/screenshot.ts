import {NativeModules, Platform} from 'react-native';

const {ScreenshotModule} = NativeModules;

export const captureScreen = async (): Promise<string> => {
  if (Platform.OS !== 'android' || !ScreenshotModule?.captureScreen) {
    throw new Error('Screenshot is only supported on Android');
  }
  return ScreenshotModule.captureScreen();
};

export default {
  captureScreen,
};
