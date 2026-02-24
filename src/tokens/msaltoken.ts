import Token, {TokenData} from './base';

export interface MsalTokenData extends TokenData {
  lpt: string;
  refresh_token: string;
  user_id: string;
}

export default class MsalToken extends Token<MsalTokenData> {
  public data: MsalTokenData;

  constructor(data: MsalTokenData) {
    super(data);
    this.data = data;
  }
}
