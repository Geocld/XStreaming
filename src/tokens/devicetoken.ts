import Token, {TokenData} from './base';

export interface DeviceTokenData extends TokenData {
  NotAfter: string;
  Token: string;
}

export default class DeviceToken extends Token<DeviceTokenData> {
  public data: DeviceTokenData;

  constructor(data: DeviceTokenData) {
    super(data);
    this.data = data;
  }

  getSecondsValid(): number {
    return this.calculateSecondsLeft(new Date(this.data.NotAfter));
  }

  isValid(): boolean {
    return this.calculateSecondsLeft(new Date(this.data.NotAfter)) > 0;
  }
}
