import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const {GameRecorderModule} = NativeModules;
const eventEmitter =
  Platform.OS === 'android' && GameRecorderModule
    ? new NativeEventEmitter(GameRecorderModule)
    : null;

export const startRecording = async (
  width = 1920,
  height = 1080,
  customPath?: string,
): Promise<string> => {
  if (Platform.OS !== 'android' || !GameRecorderModule?.startRecording) {
    throw new Error('Recording is only supported on Android');
  }
  return GameRecorderModule.startRecording(width, height, customPath || null);
};

export const stopRecording = async (): Promise<string> => {
  if (Platform.OS !== 'android' || !GameRecorderModule?.stopRecording) {
    throw new Error('Recording is only supported on Android');
  }
  return GameRecorderModule.stopRecording();
};

export const isRecording = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !GameRecorderModule?.isRecording) {
    return false;
  }
  return GameRecorderModule.isRecording();
};

export const getCurrentFilePath = async (): Promise<string | null> => {
  if (Platform.OS !== 'android' || !GameRecorderModule?.getCurrentFilePath) {
    return null;
  }
  return GameRecorderModule.getCurrentFilePath();
};

export const addRecordingListener = (
  event: 'onRecordingStarted' | 'onRecordingStopped' | 'onRecordingError',
  callback: (data: any) => void,
) => {
  if (!eventEmitter) {
    return {remove: () => {}};
  }
  return eventEmitter.addListener(event, callback);
};

export default {
  startRecording,
  stopRecording,
  isRecording,
  getCurrentFilePath,
  addRecordingListener,
};
