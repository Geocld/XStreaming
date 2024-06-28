import Token from './base';

export default class StreamingToken extends Token {
  constructor(tokenData) {
    super(tokenData);
    this.data = tokenData;
    this._objectCreateTime = Date.now();
  }

  calculateSecondsLeft(date) {
    const expiresOn = date;
    const currentDate = new Date();
    return Math.floor((expiresOn.getTime() - currentDate.getTime()) / 1000);
  }

  getSecondsValid() {
    if (this._objectCreateTime + this.data.durationInSeconds * 1000) {
      return this.calculateSecondsLeft(
        new Date(this._objectCreateTime + this.data.durationInSeconds * 1000),
      );
    }

    return 0;
  }

  isValid() {
    if (this._objectCreateTime + this.data.durationInSeconds * 1000) {
      const secondsLeft = this.calculateSecondsLeft(
        new Date(this._objectCreateTime + this.data.durationInSeconds * 1000),
      );
      return secondsLeft > 0;
    }

    return false;
  }

  getMarket() {
    return this.data.market;
  }

  getRegions() {
    return this.data.offeringSettings.regions;
  }

  getDefaultRegion() {
    return this.data.offeringSettings.regions.filter(
      region => region.isDefault,
    )[0];
  }

  getEnvironments() {
    return this.data.offeringSettings.clientCloudSettings.Environments;
  }
}
