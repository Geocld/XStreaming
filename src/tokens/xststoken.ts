import Token, {TokenData} from './base';

export interface XstsTokenData extends TokenData {
  NotAfter: string;
  Token?: string;
}

export default class XstsToken extends Token<XstsTokenData> {
  public data: XstsTokenData;

  constructor(data: XstsTokenData) {
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
