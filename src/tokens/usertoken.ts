import Token, {TokenData} from './base';

export interface UserTokenData extends TokenData {
  expires_on: string;
  expires_in?: number;
  refresh_token?: string;
  access_token?: string;
}

export default class UserToken extends Token<UserTokenData> {
  public data: UserTokenData;

  constructor(data: UserTokenData) {
    super(data);
    this.data = data;
  }

  getSecondsValid(): number {
    return this.calculateSecondsLeft(new Date(this.data.expires_on));
  }

  isValid(): boolean {
    return this.calculateSecondsLeft(new Date(this.data.expires_on)) > 0;
  }
}
