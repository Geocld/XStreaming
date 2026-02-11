import axios from 'axios';
import UserToken from '../tokens/usertoken';
import MsalToken from '../tokens/msaltoken';
import XstsToken from '../tokens/xststoken';
import StreamingToken from '../tokens/streamingtoken';

class TokenRefreshError {
  name = 'TokenRefreshError';
  message = 'Unknown error';

  constructor(message, error) {
    this.message = message;
    this.error = error;
  }
}

export default class Msal {
  _tokenStore;
  _clientId = '1f907974-e22b-4810-a9de-d9647380c97e';
  _xstsToken;
  _gssvToken;

  constructor(tokenStore) {
    this._tokenStore = tokenStore;
  }

  /**
   * Creates a new device code authentication request.
   */
  doDeviceCodeAuth() {
    const data = new URLSearchParams();
    data.append('client_id', this._clientId);
    data.append('scope', 'xboxlive.signin openid profile offline_access');

    return axios
      .post(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
        data.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )
      .then(response => {
        console.log('Device code auth response:', response.data);
        return response.data;
      })
      .catch(error => {
        throw new Error(`Error during device code auth: ${error.message}`);
      });
  }

  /**
   * Keeps polling for authentication changes. The promise will be fullfilled once the user has authenticated.
   */
  async doPollForDeviceCodeAuth(
    deviceCode,
    timeout = 900 * 1000,
    startTime = Date.now(),
  ) {
    const data = new URLSearchParams();
    data.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
    data.append('client_id', this._clientId);
    data.append('device_code', deviceCode);

    try {
      const response = await axios.post(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        data.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const body = response.data;
      const userToken = new UserToken(body);

      this._tokenStore.clear();
      this._tokenStore.setUserToken(userToken);
      this._tokenStore.save();

      return body;
    } catch (error) {
      if (Date.now() - startTime >= timeout) {
        throw new Error('doPollForDeviceCodeAuth timeout');
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.doPollForDeviceCodeAuth(deviceCode, timeout, startTime);
    }
  }

  async getMsalToken() {
    try {
      await this.getOrRefreshUserToken();

      const refreshToken = this._tokenStore.getUserToken()?.data.refresh_token;

      if (!refreshToken) {
        throw new Error('No refresh token found. Please authenticate first.');
      }

      const data = new URLSearchParams();
      data.append('client_id', this._clientId);
      data.append(
        'scope',
        'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN',
      );
      data.append('grant_type', 'refresh_token');
      data.append('refresh_token', refreshToken);

      const response = await axios.post(
        'https://login.live.com/oauth20_token.srf',
        data.toString(),
        {
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        },
      );

      const body = response.data;

      const msalToken = new MsalToken({
        lpt: body.access_token,
        refresh_token: body.refresh_token,
        user_id: body.user_id,
      });

      return msalToken;
    } catch (error) {
      throw error;
    }
  }

  async doXstsAuthorization(userToken, relyingParty) {
    // Possible relyingParty values:
    // - http://xboxlive.com
    // - http://mp.xboxlive.com/
    // - http://gssv.xboxlive.com/
    // - rp://gswp.xboxlive.com/
    try {
      const payload = {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [userToken],
        },
        RelyingParty: relyingParty,
        TokenType: 'JWT',
      };

      const url = 'https://xsts.auth.xboxlive.com/xsts/authorize';

      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Origin: 'https://www.xbox.com',
        Referer: 'https://www.xbox.com/',
        Accept: '*/*',
        'ms-cv': '0',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };

      const response = await axios.post(url, payload, {headers});

      return new XstsToken(response.data);
    } catch (error) {
      throw error;
    }
  }

  async refreshUserToken() {
    try {
      const refreshToken = this._tokenStore.getUserToken()?.data.refresh_token;

      if (!refreshToken) {
        throw new Error('No refresh token found. Please authenticate first.');
      }

      const payload = {
        client_id: this._clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'xboxlive.signin openid profile offline_access',
      };

      const url =
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
      };
      const body = new URLSearchParams(payload).toString();

      const response = await axios.post(url, body, {headers});

      const userToken = new UserToken(response.data);

      this._tokenStore.setUserToken(userToken);
      this._tokenStore.save();

      return userToken;
    } catch (error) {
      if (error.response?.status === 400) {
        throw new TokenRefreshError('Failed to refresh tokens', error);
      }
      throw error;
    }
  }

  async getOrRefreshUserToken() {
    const userToken = this._tokenStore.getUserToken();

    if (userToken === undefined || userToken.getSecondsValid() <= 60) {
      return (await this.refreshUserToken()).data.access_token;
    }

    return userToken.data.access_token;
  }

  async doXstsAuthentication() {
    try {
      const userToken = await this.getOrRefreshUserToken();
      if (!userToken) {
        throw new Error('No user token found. Please authenticate first.');
      }

      const payload = {
        Properties: {
          AuthMethod: 'RPS',
          RpsTicket: 'd=' + userToken,
          SiteName: 'user.auth.xboxlive.com',
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      };

      const url = 'https://user.auth.xboxlive.com/user/authenticate';
      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Origin: 'https://www.xbox.com',
        Referer: 'https://www.xbox.com/',
      };

      const response = await axios.post(url, payload, {headers});

      this._xstsToken = new XstsToken(response.data);
      return this._xstsToken;
    } catch (error) {
      throw error;
    }
  }

  async getWebToken() {
    if (
      this._xstsToken === undefined ||
      this._xstsToken.getSecondsValid() <= 60
    ) {
      await this.doXstsAuthentication();
    }

    const userToken = this._xstsToken?.data.Token;

    if (userToken === undefined) {
      throw new Error('No user token found. Please authenticate first.');
    }

    const token = await this.doXstsAuthorization(
      userToken,
      'http://xboxlive.com',
    );
    return token;
  }

  async getGssvToken() {
    if (
      this._xstsToken === undefined ||
      this._xstsToken.getSecondsValid() <= 60
    ) {
      await this.doXstsAuthentication();
    }

    const userToken = this._xstsToken?.data.Token;

    if (userToken === undefined) {
      throw new Error('No user token found. Please authenticate first.');
    }

    if (
      this._gssvToken === undefined ||
      this._gssvToken.getSecondsValid() <= 60
    ) {
      const token = await this.doXstsAuthorization(
        userToken,
        'http://gssv.xboxlive.com/',
      );
      this._gssvToken = token;
    }

    return this._gssvToken;
  }

  async getStreamingTokens() {
    const gssvToken = await this.getGssvToken();

    if (gssvToken === undefined) {
      throw new Error('No gssv token found. Please authenticate first.');
    }

    const _xhomeToken = await this.getStreamToken(
      gssvToken.data.Token,
      'xhome',
    );

    let _xcloudToken;
    try {
      _xcloudToken = await this.getStreamToken(gssvToken.data.Token, 'xgpuweb');
    } catch (error) {
      try {
        _xcloudToken = await this.getStreamToken(
          gssvToken.data.Token,
          'xgpuwebf2p',
        );
      } catch (err) {
        console.log(
          'Failed to get xcloud streaming token, probably a non-supported country. Error:',
          err,
        );
      }
    }

    return {xHomeToken: _xhomeToken, xCloudToken: _xcloudToken};
  }

  async getStreamToken(userToken, offering) {
    try {
      const payload = {
        token: userToken,
        offeringId: offering,
      };

      const url = `https://${offering}.gssv-play-prod.xboxlive.com/v2/login/user`;

      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        'x-gssv-client': 'XboxComBrowser',
      };

      const response = await axios.post(url, payload, {headers});

      return new StreamingToken(response.data);
    } catch (error) {
      throw error;
    }
  }
}
