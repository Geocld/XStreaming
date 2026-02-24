import {storage} from '../store/mmkv';
import SisuToken, {SisuTokenData} from '../tokens/sisutoken';
import UserToken, {UserTokenData} from '../tokens/usertoken';

const STORE_KEY = 'user.tokenstore';

export type AuthenticationMethod = 'xal' | 'msal' | 'none';

export default class TokenStore {
  private _userToken?: UserToken;
  private _sisuToken?: SisuToken;
  private _tokenUpdateTime = 0;

  load(): boolean {
    let tokens = '{}';
    try {
      const stored = storage.getString(STORE_KEY);
      tokens = stored ?? '{}';
    } catch {
      tokens = '{}';
    }
    this.loadJson(tokens);

    return true;
  }

  loadJson(json: string): boolean {
    const jsonData = JSON.parse(json) as {
      userToken?: UserTokenData;
      sisuToken?: SisuTokenData;
      tokenUpdateTime?: number;
    };

    if (jsonData.userToken) {
      this._userToken = new UserToken(jsonData.userToken);
    }

    if (jsonData.sisuToken) {
      this._sisuToken = new SisuToken(jsonData.sisuToken);
    }

    this._tokenUpdateTime = jsonData.tokenUpdateTime ?? 0;

    return true;
  }

  setUserToken(userToken: UserToken): void {
    const expireDate = new Date();
    const expiresIn = userToken.data.expires_in ?? 0;
    expireDate.setSeconds(expireDate.getSeconds() + expiresIn);

    this._userToken = new UserToken({
      ...userToken.data,
      expires_on: expireDate.toISOString(),
    });
  }

  getUserToken(): UserToken | undefined {
    return this._userToken;
  }

  setSisuToken(sisuToken: SisuToken): void {
    this._sisuToken = new SisuToken(sisuToken.data);
  }

  getSisuToken(): SisuToken | undefined {
    return this._sisuToken;
  }

  getTokenUpdateTime(): number {
    return this._tokenUpdateTime;
  }

  save(): void {
    const data = JSON.stringify({
      userToken: this._userToken?.data,
      sisuToken: this._sisuToken?.data,
      tokenUpdateTime: Date.now(),
    });

    storage.set(STORE_KEY, data);
  }

  clear(): void {
    try {
      storage.delete(STORE_KEY);
    } catch (e) {
      console.log('clear error: ', e);
    }

    this._userToken = undefined;
    this._sisuToken = undefined;
  }

  clearTokenUpdateTime(): void {
    const data = JSON.stringify({
      userToken: this._userToken?.data,
      sisuToken: this._sisuToken?.data,
      tokenUpdateTime: 0,
    });

    storage.set(STORE_KEY, data);
    this._tokenUpdateTime = 0;
  }

  hasValidAuthTokens(): boolean {
    if (!this._userToken || !this._userToken.isValid()) {
      return false;
    }

    if (!this._sisuToken || !this._sisuToken.isValid()) {
      return false;
    }

    return true;
  }

  getAuthenticationMethod(): AuthenticationMethod {
    if (this._sisuToken) {
      return 'xal';
    } else if (this._userToken) {
      return 'msal';
    }
    return 'none';
  }
}
