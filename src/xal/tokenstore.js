import {storage} from '../store/mmkv';
import SisuToken from '../tokens/sisutoken';
import UserToken from '../tokens/usertoken';

const STORE_KEY = 'user.tokenstore';

export default class TokenStore {
  _userToken;
  _sisuToken;
  _tokenUpdateTime;

  load() {
    let tokens = '{}';
    try {
      tokens = storage.getString(STORE_KEY);
      if (!tokens) {
        tokens = '{}';
      }
    } catch {}
    this.loadJson(tokens);

    return true;
  }

  loadJson(json) {
    const jsonData = JSON.parse(json);

    if (jsonData.userToken) {
      this._userToken = new UserToken(jsonData.userToken);
    }

    if (jsonData.sisuToken) {
      this._sisuToken = new SisuToken(jsonData.sisuToken);
    }

    if (jsonData.tokenUpdateTime) {
      this._tokenUpdateTime = jsonData.tokenUpdateTime;
    } else {
      this._tokenUpdateTime = 0;
    }

    return true;
  }

  setUserToken(userToken) {
    const expireDate = new Date();
    expireDate.setSeconds(expireDate.getSeconds() + userToken.data.expires_in);

    this._userToken = new UserToken({
      ...userToken.data,
      expires_on: expireDate.toISOString(),
    });
  }

  getUserToken() {
    return this._userToken;
  }

  setSisuToken(sisuToken) {
    this._sisuToken = new SisuToken(sisuToken.data);
  }

  getSisuToken() {
    return this._sisuToken;
  }

  getTokenUpdateTime() {
    return this._tokenUpdateTime;
  }

  save() {
    const data = JSON.stringify({
      userToken: this._userToken?.data,
      sisuToken: this._sisuToken?.data,
      tokenUpdateTime: Date.now(),
    });

    storage.set(STORE_KEY, data);
  }

  clear() {
    try {
      storage.delete(STORE_KEY);
    } catch (e) {
      console.log('clear error: ', e);
    }

    this._userToken = undefined;
    this._sisuToken = undefined;
  }

  hasValidAuthTokens() {
    if (this._userToken) {
      if (!this._userToken.isValid()) {
        return false;
      }
    } else {
      return false;
    }

    if (this._sisuToken) {
      if (!this._userToken.isValid()) {
        return false;
      }
    } else {
      return false;
    }

    return true;
  }
}
