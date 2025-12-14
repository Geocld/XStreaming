import { NativeModules } from 'react-native';
import axios from 'axios';

import UserToken from '../tokens/usertoken';
import SisuToken from '../tokens/sisutoken';
import DeviceToken from '../tokens/devicetoken';
import XstsToken from '../tokens/xststoken';
import MsalToken from '../tokens/msaltoken';
import StreamingToken from '../tokens/streamingtoken';

import { getSettings } from '../store/settingStore';
import { debugFactory } from '../utils/debug';

import 'react-native-url-polyfill/auto';

const log = debugFactory('xal/index.js');

const { XalManager } = NativeModules;

export default class Xal {
  keys;
  jwtKeys;
  codeChallange;

  _webToken;
  _xhomeToken;
  _xcloudToken;

  _app = {
    AppId: '000000004c20a908',
    TitleId: '328178078',
    RedirectUri: 'ms-xal-000000004c20a908://auth',
  };

  constructor() {
    XalManager.init && XalManager.init();
  }

  // 递归获取设备 token（遇 400 自动重试）
  getDeviceTokenHack() {
    return new Promise((resolve, reject) => {
      this.getDeviceToken()
        .then(resolve)
        .catch(error => {
          if (error.statuscode === 400) {
            log.info('getDeviceToken error, retrying...');
            return this.getDeviceTokenHack().then(resolve).catch(reject);
          }
          reject(error);
        });
    });
  }

  // 获取设备 Token
  getDeviceToken() {
    return new Promise((resolve, reject) => {
      const payload = {
        Properties: {
          AuthMethod: 'ProofOfPossession',
          Id: `{${XalManager.nextUUID()}}`,
          DeviceType: 'Android',
          SerialNumber: `{${XalManager.nextUUID()}}`,
          Version: '15.0',
          ProofKey: {
            use: 'sig',
            alg: 'ES256',
            kty: 'EC',
            crv: 'P-256',
            x: XalManager.getKeyX(),
            y: XalManager.getKeyY(),
          },
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      };

      const body = JSON.stringify(payload);
      const signature = XalManager.sign(
        'https://device.auth.xboxlive.com/device/authenticate',
        '',
        body,
      );
      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        Signature: signature,
      };

      axios
        .post('https://device.auth.xboxlive.com/device/authenticate', body, {
          headers,
        })
        .then(res => resolve(new DeviceToken(res.data)))
        .catch(e => {
          log.error('[getDeviceToken] error:', e);
          reject(e);
        });
    });
  }

  // 获取 Code Challenge
  getCodeChallange() {
    return new Promise(resolve => {
      if (this.codeChallange === undefined) {
        this.codeChallange = XalManager.getCodeChallange();
      }
      resolve(this.codeChallange);
    });
  }

  getRandomState() {
    return XalManager?.getRandomState() || '';
  }

  // Sisu 初始认证（获取 code / session）
  doSisuAuthentication(deviceToken, codeChallange, state) {
    return new Promise((resolve, reject) => {
      const payload = {
        AppId: this._app.AppId,
        TitleId: this._app.TitleId,
        RedirectUri: this._app.RedirectUri,
        DeviceToken: deviceToken.Token,
        Sandbox: 'RETAIL',
        TokenType: 'code',
        Offers: ['service::user.auth.xboxlive.com::MBI_SSL'],
        Query: {
          display: 'android_phone',
          code_challenge: codeChallange.value,
          code_challenge_method: codeChallange.method,
          state: state,
        },
      };

      const body = JSON.stringify(payload);
      const signature = XalManager.sign(
        'https://sisu.xboxlive.com/authenticate',
        '',
        body,
      );
      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        Signature: signature,
      };

      axios
        .post('https://sisu.xboxlive.com/authenticate', body, {
          headers,
        })
        .then(res => {
          resolve({
            SessionId: res.headers['x-sessionid'],
            ...res.data,
          });
        })
        .catch(e => {
          log.error('[doSisuAuthentication] error:', e);
          reject(e);
        });
    });
  }

  async getRedirectUri() {
    const deviceToken = await this.getDeviceTokenHack();
    const codeChallange = await this.getCodeChallange();
    const state = this.getRandomState();
    const sisuAuth = await this.doSisuAuthentication(
      deviceToken,
      codeChallange,
      state,
    );
    return {
      sisuAuth,
      state,
      codeChallange,
    };
  }

  async authenticateUser(tokenStore, redirectObject, redirectUri) {
    const url = new URL(redirectUri);
    const error = url.searchParams.get('error');
    if (error) {
      return false;
    }
    const code = url.searchParams.get('code');
    if (code) {
      const state = url.searchParams.get('state');
      if (state) {
        return this.authenticateUserUsingCode(
          tokenStore,
          redirectObject,
          code,
          state,
        );
      }
    }
    return false;
  }

  async authenticateUserUsingCode(tokenStore, redirectObject, code, state) {
    if (state !== redirectObject.state) {
      return false;
    }
    const codeChallange = await this.getCodeChallange();
    const userToken = await this.exchangeCodeForToken(
      code,
      codeChallange.verifier,
    );
    tokenStore.setUserToken(userToken);
    tokenStore.save();
    return true;
  }

  // Code 换取 User Token
  exchangeCodeForToken(code, codeVerifier) {
    return new Promise((resolve, reject) => {
      const payload = {
        client_id: this._app.AppId,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this._app.RedirectUri,
        scope: 'service::user.auth.xboxlive.com::MBI_SSL',
      };
      const body = new URLSearchParams(payload).toString();
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
      };

      axios
        .post('https://login.live.com/oauth20_token.srf', body, {
          headers,
        })
        .then(res => resolve(new UserToken(res.data)))
        .catch(e => {
          log.error('[exchangeCodeForToken] error:', e);
          reject(e);
        });
    });
  }

  refreshUserToken(userToken) {
    return new Promise((resolve, reject) => {
      const payload = {
        client_id: this._app.AppId,
        grant_type: 'refresh_token',
        refresh_token: userToken.data.refresh_token,
        scope: 'service::user.auth.xboxlive.com::MBI_SSL',
      };
      const body = new URLSearchParams(payload).toString();
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
      };

      axios
        .post('https://login.live.com/oauth20_token.srf', body, {
          headers,
        })
        .then(res => resolve(new UserToken(res.data)))
        .catch(e => reject(e));
    });
  }

  // 修复后的 XSTS 授权（去除废弃字段 DeviceToken / TitleToken）
  doXstsAuthorization(sisuToken, relyingParty) {
    return new Promise((resolve, reject) => {
      const payload = {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [sisuToken.data.UserToken.Token],
        },
        RelyingParty: relyingParty,
        TokenType: 'JWT',
      };

      const body = JSON.stringify(payload);
      const signature = XalManager.sign(
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        '',
        body,
      );
      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        Signature: signature,
      };

      axios
        .post('https://xsts.auth.xboxlive.com/xsts/authorize', body, {
          headers,
        })
        .then(res => resolve(new XstsToken(res.data)))
        .catch(e => reject(e));
    });
  }

  // Sisu 授权（用于刷新等流程）
  doSisuAuthorization(userToken, deviceToken, SessionId) {
    return new Promise((resolve, reject) => {
      const payload = {
        AccessToken: 't=' + userToken.data.access_token,
        AppId: this._app.AppId,
        DeviceToken: deviceToken.data.Token,
        Sandbox: 'RETAIL',
        SiteName: 'user.auth.xboxlive.com',
        UseModernGamertag: true,
        ProofKey: {
          use: 'sig',
          alg: 'ES256',
          kty: 'EC',
          crv: 'P-256',
          x: XalManager.getKeyX(),
          y: XalManager.getKeyY(),
        },
        ...(SessionId ? { SessionId } : {}),
      };

      const body = JSON.stringify(payload);
      const signature = XalManager.sign(
        'https://sisu.xboxlive.com/authorize',
        '',
        body,
      );
      const headers = {
        'x-xbl-contract-version': '1',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        signature: signature,
      };

      axios
        .post('https://sisu.xboxlive.com/authorize', body, {
          headers,
        })
        .then(res => resolve(new SisuToken(res.data)))
        .catch(e => reject(e));
    });
  }

  async refreshTokens(tokenStore) {
    const curUserToken = tokenStore.getUserToken();
    if (curUserToken === undefined) {
      throw new Error('User token is missing. Please authenticate first');
    }

    try {
      const userToken = await this.refreshUserToken(curUserToken);
      const deviceToken = await this.getDeviceTokenHack();
      const sisuToken = await this.doSisuAuthorization(
        userToken,
        deviceToken,
      );

      tokenStore.setUserToken(userToken);
      tokenStore.setSisuToken(sisuToken);
      tokenStore.save();
      return { userToken, deviceToken, sisuToken };
    } catch (error) {
      log.error('[refreshTokens] error:', error);
      throw error;
    }
  }

  exchangeRefreshTokenForXcloudTransferToken(userToken) {
    return new Promise((resolve, reject) => {
      const payload = {
        client_id: this._app.AppId,
        grant_type: 'refresh_token',
        scope:
          'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN',
        refresh_token: userToken.data.refresh_token,
        code: '',
        code_verifier: '',
        redirect_uri: '',
      };

      const body = new URLSearchParams(payload).toString();
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
      };

      axios
        .post('https://login.live.com/oauth20_token.srf', body, {
          headers,
        })
        .then(res => resolve(new MsalToken(res.data)))
        .catch(e => reject(e));
    });
  }

  async getMsalToken(tokenStore) {
    const userToken = tokenStore.getUserToken();
    if (!userToken) throw new Error('User token missing');
    return this.exchangeRefreshTokenForXcloudTransferToken(userToken);
  }

  async getWebToken(tokenStore) {
    const sisuToken = tokenStore.getSisuToken();
    if (!sisuToken) throw new Error('Sisu token missing');

    if (!this._webToken || this._webToken.getSecondsValid() <= 60) {
      this._webToken = await this.doXstsAuthorization(
        sisuToken,
        'http://xboxlive.com',
      );
    }
    return this._webToken;
  }

  getStreamToken(xstsToken, offering) {
    return new Promise((resolve, reject) => {
      const _settings = getSettings();
      const payload = {
        token: xstsToken.data.Token,
        offeringId: offering,
      };

      const body = JSON.stringify(payload);
      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        'x-gssv-client': 'XboxComBrowser',
        'Content-Length': body.length,
      };

      if (_settings.force_region_ip.length > 0) {
        headers['x-forwarded-for'] = _settings.force_region_ip;
      }

      axios
        .post(
          `https://${offering}.gssv-play-prod.xboxlive.com/v2/login/user`,
          body,
          { headers },
        )
        .then(res => resolve(new StreamingToken(res.data)))
        .catch(e => reject(e));
    });
  }

  async getStreamingToken(tokenStore) {
    const sisuToken = tokenStore.getSisuToken();
    if (!sisuToken) throw new Error('Sisu token missing');

    const xstsToken = await this.doXstsAuthorization(
      sisuToken,
      'http://gssv.xboxlive.com/',
    );

    if (!this._xhomeToken || this._xhomeToken.getSecondsValid() <= 60) {
      this._xhomeToken = await this.getStreamToken(xstsToken, 'xhome');
    }

    if (!this._xcloudToken || this._xcloudToken.getSecondsValid() <= 60) {
      try {
        this._xcloudToken = await this.getStreamToken(
          xstsToken,
          'xgpuweb',
        );
      } catch (error) {
        log.error('[getStreamingToken] xgpuweb error:', error);
        try {
          this._xcloudToken = await this.getStreamToken(
            xstsToken,
            'xgpuwebf2p',
          );
        } catch (e) {
          log.error('[getStreamingToken] fallback error:', e);
          throw e;
        }
      }
    }

    return {
      xHomeToken: this._xhomeToken,
      xCloudToken: this._xcloudToken,
    };
  }
}
