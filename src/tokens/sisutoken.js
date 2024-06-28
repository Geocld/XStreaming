import Token from './base';

export default class SisuToken extends Token {
  data;

  constructor(data) {
    super(data);
    this.data = data;
  }

  getSecondsValid() {
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

  isValid() {
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

  getUserHash() {
    return this.data.UserToken.DisplayClaims.xui[0].uhs;
  }

  getGamertag() {
    return this.data.AuthorizationToken.DisplayClaims.xui[0].gtg;
  }
}
