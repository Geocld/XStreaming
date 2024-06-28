import Token from './base';

export default class XstsToken extends Token {
  data;

  constructor(data) {
    super(data);
    this.data = data;
  }

  getSecondsValid() {
    return this.calculateSecondsLeft(new Date(this.data.NotAfter));
  }

  isValid() {
    if (this.calculateSecondsLeft(new Date(this.data.NotAfter)) <= 0) {
      return false;
    }

    return true;
  }
}
