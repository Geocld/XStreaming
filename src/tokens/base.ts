export type TokenData = Record<string, any>;

export default class Token<T extends TokenData = TokenData> {
  public data: T;

  constructor(data: T) {
    this.data = data;
  }

  protected calculateSecondsLeft(date: Date): number {
    const expiresOn = date;
    const currentDate = new Date();
    return Math.floor((expiresOn.getTime() - currentDate.getTime()) / 1000);
  }

  getSecondsValid(): number {
    console.log('Warning: getSecondsValid not implemented');
    return 0;
  }

  isValid(): boolean {
    console.log('Warning: isValid not implemented');
    return false;
  }

  getUserHash(): string | false {
    if ('UserToken' in this.data) {
      return this.data.UserToken.DisplayClaims.xui[0].uhs;
    }

    return false;
  }

  getGamertag(): string | false {
    if ('AuthorizationToken' in this.data) {
      return this.data.AuthorizationToken.DisplayClaims.xui[0].gtg;
    }

    return false;
  }
}
