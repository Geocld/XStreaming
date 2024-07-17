import webRTCClient from '..';

export default interface Driver {
  setApplication(application: webRTCClient): void;
  start(): void;
  stop(): void;

  pressButtonStart(button: string): void;
  pressButtonEnd(button: string): void;

  // requestStates(): Array<InputFrame>;
  // mapStateLabels(buttons: Array<boolean>, axes: Array<any>): InputFrame;
}
