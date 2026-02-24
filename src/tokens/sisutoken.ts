import Token, {TokenData} from './base';

interface DisplayClaims {
  xui: Array<{
    uhs: string;
    gtg?: string;
  }>;
}

interface Claim extends TokenData {
  NotAfter: string;
  DisplayClaims: DisplayClaims;
  Token?: string;
}

export interface SisuTokenData extends TokenData {
  TitleToken: Claim;
  UserToken: Claim;
  AuthorizationToken: Claim;
}

export default class SisuToken extends Token<SisuTokenData> {
  public data: SisuTokenData;

  constructor(data: SisuTokenData) {
    super(data);
    this.data = data;
  }

  getSecondsValid(): number {
    const secondsLeftTitle = this.calculateSecondsLeft(
      new Date(this.data.TitleToken.NotAfter),
    );
    const secondsLeftUser = this.calculateSecondsLeft(
      new Date(this.data.UserToken.NotAfter),
    );
    const secondsLeftAuthorization = this.calculateSecondsLeft(
      new Date(this.data.AuthorizationToken.NotAfter),
    );
    return Math.min(
      secondsLeftTitle,
      secondsLeftUser,
      secondsLeftAuthorization,
    );
  }

  isValid(): boolean {
    const secondsLeftTitle = this.calculateSecondsLeft(
      new Date(this.data.TitleToken.NotAfter),
    );
    if (secondsLeftTitle <= 0) {
      return false;
    }

    const secondsLeftUser = this.calculateSecondsLeft(
      new Date(this.data.UserToken.NotAfter),
    );
    if (secondsLeftUser <= 0) {
      return false;
    }

    const secondsLeftAuthorization = this.calculateSecondsLeft(
      new Date(this.data.AuthorizationToken.NotAfter),
    );
    if (secondsLeftAuthorization <= 0) {
      return false;
    }

    return true;
  }

  getUserHash(): string {
    return this.data.UserToken.DisplayClaims.xui[0].uhs;
  }

  getGamertag(): string | false {
    return this.data.AuthorizationToken.DisplayClaims.xui[0].gtg || false;
  }
}
