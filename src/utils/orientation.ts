import Orientation from 'react-native-orientation-locker';

export type ScreenOrientation =
  | 'PORTRAIT'
  | 'PORTRAIT-UPSIDEDOWN'
  | 'LANDSCAPE-LEFT'
  | 'LANDSCAPE-RIGHT'
  | 'UNKNOWN';

export const getCurrentScreenOrientation = (): Promise<ScreenOrientation> =>
  new Promise(resolve => {
    Orientation.getOrientation(orientation => {
      resolve((orientation as ScreenOrientation) || 'UNKNOWN');
    });
  });

export const applyScreenOrientation = (
  orientation: ScreenOrientation | null | undefined,
) => {
  switch (orientation) {
    case 'PORTRAIT':
      Orientation.lockToPortrait();
      break;
    case 'PORTRAIT-UPSIDEDOWN':
      Orientation.lockToPortraitUpsideDown();
      break;
    case 'LANDSCAPE-LEFT':
      Orientation.lockToLandscapeLeft();
      break;
    case 'LANDSCAPE-RIGHT':
      Orientation.lockToLandscapeRight();
      break;
    default:
      Orientation.unlockAllOrientations();
      break;
  }
};
