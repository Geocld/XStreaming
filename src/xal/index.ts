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
import TokenStore from './tokenstore';

interface CodeChallenge {
  value: string;
  method: string;
  verifier: string;
}

interface AppConfig {
  AppId: string;
  TitleId: string;
  RedirectUri: string;
}

interface XalManagerModule {
  init?: () => void;
  nextUUID: () => string;
  getKeyX: () => string;
  getKeyY: () => string;
  sign: (url: string, headers: string, body: string) => string;
  getCodeChallange: () => CodeChallenge;
  getRandomState?: () => string;
}

const log = debugFactory('xal/index.js');

const {XalManager} = NativeModules as {XalManager: XalManagerModule};

export default class Xal {
  private keys?: unknown;
  private jwtKeys?: unknown;
  private codeChallange?: CodeChallenge;

  private _webToken?: XstsToken;
  private _xhomeToken?: StreamingToken;
  private _xcloudToken?: StreamingToken;

  private readonly _app: AppConfig = {
    AppId: '000000004c20a908', //'000000004c12ae6f', // 0000000048183522 = working, but minecraft --<<< 000000004c12ae6f works, xbox app
    TitleId: '328178078', //'328178078', // 1016898439 = working
    RedirectUri: 'ms-xal-000000004c20a908://auth',
  };

  constructor() {
    XalManager.init && XalManager.init();
  }

  getDeviceTokenHack(): Promise<DeviceToken> {
    console.log('getDeviceTokenHack...');
    return new Promise<DeviceToken>((resolve, reject) => {
      this.getDeviceToken()
        .then(deviceToken => {
          console.log('getDeviceToken success:', deviceToken);
          resolve(deviceToken);
        })
        .catch((error: any) => {
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

  getDeviceToken(): Promise<DeviceToken> {
    return new Promise<DeviceToken>((resolve, reject) => {
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
        .catch((e: any) => {
          log.error('[getDeviceToken] error:', e);
          reject(e);
        });
    });
  }

  getCodeChallange(): Promise<CodeChallenge> {
    return new Promise<CodeChallenge>(resolve => {
      if (this.codeChallange === undefined) {
        this.codeChallange = XalManager.getCodeChallange();
      }

      resolve(this.codeChallange);
    });
  }

  getRandomState(): string {
    const state = XalManager?.getRandomState?.() || '';
    return state;
  }

  doSisuAuthentication(
    deviceToken: DeviceToken,
    codeChallange: CodeChallenge,
    state: string,
  ): Promise<Record<string, any>> {
    return new Promise<Record<string, any>>(resolve => {
      const payload = {
        AppId: this._app.AppId,
        TitleId: this._app.TitleId,
        RedirectUri: this._app.RedirectUri,
        DeviceToken: deviceToken.data.Token,
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
        .catch((e: any) => {
          console.log('error:', e);
          log.error('[doSisuAuthentication] error:', e);
        });
    });
  }

  async getRedirectUri(): Promise<{
    sisuAuth: Record<string, any>;
    state: string;
    codeChallange: CodeChallenge;
  }> {
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

  async authenticateUser(
    tokenStore: TokenStore,
    redirectObject: {state: string},
    redirectUri: string,
  ): Promise<boolean> {
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

  async authenticateUserUsingCode(
    tokenStore: TokenStore,
    redirectObject: {state: string},
    code: string,
    state: string,
  ): Promise<boolean> {
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

  exchangeCodeForToken(code: string, codeVerifier: string): Promise<UserToken> {
    return new Promise<UserToken>((resolve, reject) => {
      const payload: Record<string, string> = {
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
        .catch((e: any) => {
          log.error('[exchangeCodeForToken] error:', e);
          reject(e);
        });
    });
  }

  refreshUserToken(userToken: UserToken): Promise<UserToken> {
    return new Promise<UserToken>((resolve, reject) => {
      const payload: Record<string, string> = {
        client_id: this._app.AppId,
        grant_type: 'refresh_token',
        refresh_token: userToken.data.refresh_token as string,
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
        .catch((e: any) => {
          reject(e);
        });
    });
  }

  doXstsAuthorization(
    sisuToken: SisuToken,
    relyingParty: string,
  ): Promise<XstsToken> {
    return new Promise<XstsToken>((resolve, reject) => {
      const userTokenValue = sisuToken.data.UserToken.Token;
      if (!userTokenValue) {
        reject(new Error('User token is missing. Please authenticate first'));
        return;
      }

      const payload = {
        Properties: {
          SandboxId: 'RETAIL',
          // DeviceToken: sisuToken.data.DeviceToken,
          // TitleToken: sisuToken.data.TitleToken.Token,
          UserTokens: [userTokenValue],
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
        .catch((e: any) => {
          reject(e);
        });
    });
  }

  // 获取sisu授权
  doSisuAuthorization(
    userToken: UserToken,
    deviceToken: DeviceToken,
    SessionId?: string,
  ): Promise<SisuToken> {
    return new Promise<SisuToken>((resolve, reject) => {
      const accessToken = userToken.data.access_token ?? '';
      const deviceTokenValue = deviceToken.data.Token;
      if (!deviceTokenValue) {
        reject(new Error('Device token is missing. Please authenticate first'));
        return;
      }
      const payload = {
        AccessToken: 't=' + accessToken,
        AppId: this._app.AppId,
        DeviceToken: deviceTokenValue,
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
        .catch((e: any) => {
          reject(e);
        });
    });
  }

  // Token retrieval helpers
  async refreshTokens(tokenStore: TokenStore): Promise<{
    userToken: UserToken;
    deviceToken: DeviceToken;
    sisuToken: SisuToken;
  }> {
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
    } catch (error: any) {
      log.error('[refreshTokens] err:', error);
      throw new Error(
        '[refreshTokens] Failed to refresh tokens: ' + JSON.stringify(error),
      );
    }
  }

  exchangeRefreshTokenForXcloudTransferToken(
    userToken: UserToken,
  ): Promise<MsalToken> {
    return new Promise<MsalToken>((resolve, reject) => {
      const refreshToken = userToken.data.refresh_token;
      if (!refreshToken) {
        reject(
          new Error('Refresh token is missing. Please authenticate first'),
        );
        return;
      }

      const payload: Record<string, string> = {
        client_id: this._app.AppId,
        grant_type: 'refresh_token',
        scope:
          'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN',
        refresh_token: refreshToken,
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
        .catch((e: any) => {
          log.error('[exchangeRefreshTokenForXcloudTransferToken] error:', e);
          reject(e);
        });
    });
  }

  async getMsalToken(tokenStore: TokenStore): Promise<MsalToken> {
    const userToken = tokenStore.getUserToken();
    if (userToken === undefined)
      throw new Error('User token is missing. Please authenticate first');

    return await this.exchangeRefreshTokenForXcloudTransferToken(userToken);
  }

  async getWebToken(tokenStore: TokenStore): Promise<XstsToken> {
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

  getStreamToken(
    xstsToken: XstsToken,
    offering: string,
  ): Promise<StreamingToken> {
    return new Promise<StreamingToken>((resolve, reject) => {
      const tokenValue = xstsToken.data.Token;
      if (!tokenValue) {
        reject(new Error('XSTS token is missing. Please authenticate first'));
        return;
      }

      const _settings = getSettings();
      const payload = {
        token: tokenValue,
        offeringId: offering,
      };

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate, no-cache',
        'x-gssv-client': 'XboxComBrowser',
        'Content-Length': body.length.toString(),
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
        .catch((e: any) => {
          reject(e);
        });
    });
  }

  async getStreamingToken(tokenStore: TokenStore): Promise<{
    xHomeToken: StreamingToken;
    xCloudToken?: StreamingToken;
  }> {
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

    const xHomeToken = this._xhomeToken;
    if (!xHomeToken) {
      throw new Error('Failed to acquire xHome streaming token');
    }

    return {xHomeToken, xCloudToken: this._xcloudToken};
  }
}
