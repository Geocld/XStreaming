import {NativeModules} from 'react-native';
import axios from 'axios';
import UserToken from '../tokens/usertoken';
import SisuToken from '../tokens/sisutoken';
import DeviceToken from '../tokens/devicetoken';
import XstsToken from '../tokens/xststoken';
import MsalToken from '../tokens/msaltoken';
import StreamingToken from '../tokens/streamingtoken';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import 'react-native-url-polyfill/auto';

const log = debugFactory('xal/index.js');

const {XalManager} = NativeModules;

export default class Xal {
  keys;
  jwtKeys;
  codeChallange;

  _webToken;
  _xhomeToken;
  _xcloudToken;

  _app = {
    AppId: '000000004c20a908', //'000000004c12ae6f', // 0000000048183522 = working, but minecraft --<<< 000000004c12ae6f works, xbox app
    TitleId: '328178078', //'328178078', // 1016898439 = working
    RedirectUri: 'ms-xal-000000004c20a908://auth',
  };

  constructor() {
    XalManager.init && XalManager.init();
  }

  getDeviceTokenHack() {
    console.log('getDeviceTokenHack...');
    return new Promise((resolve, reject) => {
      this.getDeviceToken()
        .then(deviceToken => {
          console.log('getDeviceToken success:', deviceToken);
          resolve(deviceToken);
        })
        .catch(error => {
          if (error.statuscode === 400) {
            console.log('device token get error, retry...');
            return this.getDeviceTokenHack().then(resolve).catch(reject);
          } else {
            console.log('getDeviceTokenHack failed:', error);
            reject(error);
          }
        });
    });
  }

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
        ...{
          'x-xbl-contract-version': '1',
          'Cache-Control': 'no-store, must-revalidate, no-cache',
        },
        Signature: signature,
      };

      // log.info('headers:', headers);
      // log.info('body:', body);

      axios
        .post('https://device.auth.xboxlive.com/device/authenticate', body, {
          headers,
        })
        .then(res => {
          resolve(new DeviceToken(res.data));
        })
        .catch(e => {
          log.error('[getDeviceToken] error:', e);
          reject(e);
        });
    });
  }

  getCodeChallange() {
    return new Promise(resolve => {
      if (this.codeChallange === undefined) {
        this.codeChallange = XalManager.getCodeChallange();
      }

      resolve(this.codeChallange);
    });
  }

  getRandomState() {
    const state = XalManager?.getRandomState() || '';
    return state;
  }

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
        ...{
          'x-xbl-contract-version': '1',
          'Cache-Control': 'no-store, must-revalidate, no-cache',
        },
        Signature: signature,
      };

      axios
        .post('https://sisu.xboxlive.com/authenticate', body, {
          headers,
        })
        .then(res => {
          // log.info('doSisuAuthentication data:', res.data);
          // log.info('doSisuAuthentication header:', res.headers);
          resolve({
            SessionId: res.headers['x-sessionid'],
            ...res.data,
          });
        })
        .catch(e => {
          console.log('error:', e);
          log.error('[doSisuAuthentication] error:', e);
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
      // const error_description = url.searchParams.get('error_description');
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
    // log.info('[authenticateUserUsingCode] redirectObject:', redirectObject);
    // log.info('[authenticateUserUsingCode] code:', code);
    // log.info('[authenticateUserUsingCode] state:', state);
    if (state !== redirectObject.state) {
      // log.info('Authentication failed: State mismatch')
      return false;
    }

    try {
      const codeChallange = await this.getCodeChallange();
      const userToken = await this.exchangeCodeForToken(
        code,
        codeChallange.verifier,
      );

      tokenStore.setUserToken(userToken);
      tokenStore.save();

      return true;
    } catch (e) {
      return false;
    }
  }

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

      // log.info('[exchangeCodeForToken] headers:', headers);
      // log.info('[exchangeCodeForToken] body:', body);

      axios
        .post('https://login.live.com/oauth20_token.srf', body, {
          headers,
        })
        .then(res => {
          // log.info('exchangeCodeForToken data:', res.data);
          log.info('[exchangeCodeForToken] res:', res.data);
          resolve(new UserToken(res.data));
        })
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
        .then(res => {
          // log.info('exchangeCodeForToken data:', res.data);
          // log.info('refreshUserToken res:', res.data);
          resolve(new UserToken(res.data));
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  doXstsAuthorization(sisuToken, relyingParty) {
    return new Promise((resolve, reject) => {
      const payload = {
        Properties: {
          SandboxId: 'RETAIL',
          // DeviceToken: sisuToken.data.DeviceToken,
          // TitleToken: sisuToken.data.TitleToken.Token,
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
        ...{
          'x-xbl-contract-version': '1',
          'Cache-Control': 'no-store, must-revalidate, no-cache',
        },
        Signature: signature,
      };

      // log.info('[doXstsAuthorization] headers:', headers)
      // log.info('[doXstsAuthorization] body:', payload)

      axios
        .post('https://xsts.auth.xboxlive.com/xsts/authorize', body, {
          headers,
        })
        .then(res => {
          // log.info('doSisuAuthorization res:', res.data);
          resolve(new XstsToken(res.data));
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  // 获取sisu授权
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
        ...(SessionId ? {SessionId: SessionId} : {}),
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

      // log.info('[doSisuAuthorization] headers:', headers);
      // log.info('[doSisuAuthorization] body:', body);

      axios
        .post('https://sisu.xboxlive.com/authorize', body, {
          headers,
        })
        .then(res => {
          // log.info('doSisuAuthorization res:', res.data);
          resolve(new SisuToken(res.data));
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  // Token retrieval helpers
  async refreshTokens(tokenStore) {
    const curUserToken = tokenStore.getUserToken();
    // log.info('tokenStore:', tokenStore);
    // log.info('[refreshTokens] curUserToken:', curUserToken);
    if (curUserToken === undefined) {
      tokenStore.clear && tokenStore.clear();
      throw new Error('User token is missing. Please authenticate first');
    }

    try {
      const userToken = await this.refreshUserToken(curUserToken);
      const deviceToken = await this.getDeviceTokenHack();
      const sisuToken = await this.doSisuAuthorization(userToken, deviceToken);

      tokenStore.setUserToken(userToken);
      tokenStore.setSisuToken(sisuToken);
      tokenStore.save();

      return {userToken, deviceToken, sisuToken};
    } catch (error) {
      log.error('[refreshTokens] err:', error);
      throw new Error(
        '[refreshTokens] Failed to refresh tokens: ' + JSON.stringify(error),
      );
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
        .then(res => {
          // log.info('exchangeCodeForToken data:', res.data);
          log.info(
            '[exchangeRefreshTokenForXcloudTransferToken] res:',
            res.data,
          );
          resolve(new MsalToken(res.data));
        })
        .catch(e => {
          log.error('[exchangeRefreshTokenForXcloudTransferToken] error:', e);
          reject(e);
        });
    });
  }

  async getMsalToken(tokenStore) {
    const userToken = tokenStore.getUserToken();
    if (userToken === undefined)
      throw new Error('User token is missing. Please authenticate first');

    return await this.exchangeRefreshTokenForXcloudTransferToken(userToken);
  }

  async getWebToken(tokenStore) {
    const sisuToken = tokenStore.getSisuToken();
    if (sisuToken === undefined)
      throw new Error('Sisu token is missing. Please authenticate first');

    if (
      this._webToken === undefined ||
      this._webToken.getSecondsValid() <= 60
    ) {
      const token = await this.doXstsAuthorization(
        sisuToken,
        'http://xboxlive.com',
      );
      this._webToken = token;

      return token;
    } else {
      return this._webToken;
    }
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

      // log.info(`[getStreamToken]-${offering} headers:`, headers);
      // log.info(`[getStreamToken]-${offering} body:`, payload);

      axios
        .post(
          `https://${offering}.gssv-play-prod.xboxlive.com/v2/login/user`,
          body,
          {
            headers,
          },
        )
        .then(res => {
          // log.info('[getStreamToken] res:', res.data);
          resolve(new StreamingToken(res.data));
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  async getStreamingToken(tokenStore) {
    const sisuToken = tokenStore.getSisuToken();
    if (sisuToken === undefined)
      throw new Error('Sisu token is missing. Please authenticate first');

    const xstsToken = await this.doXstsAuthorization(
      sisuToken,
      'http://gssv.xboxlive.com/',
    );

    if (
      this._xhomeToken === undefined ||
      this._xhomeToken.getSecondsValid() <= 60
    ) {
      this._xhomeToken = await this.getStreamToken(xstsToken, 'xhome');
    }

    if (
      this._xcloudToken === undefined ||
      this._xcloudToken.getSecondsValid() <= 60
    ) {
      try {
        this._xcloudToken = await this.getStreamToken(xstsToken, 'xgpuweb');
      } catch (error) {
        log.error('[getStreamingToken] xgpuweb error:', error);
        try {
          this._xcloudToken = await this.getStreamToken(
            xstsToken,
            'xgpuwebf2p',
          );
        } catch (e) {
          log.error('[getStreamingToken] xgpuwebf2p error:', error);
        }
      }
    }

    return {xHomeToken: this._xhomeToken, xCloudToken: this._xcloudToken};
  }
}
