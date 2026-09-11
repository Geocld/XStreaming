import Xal from './xal';
import TokenStore from './xal/tokenstore';
import {debugFactory} from './utils/debug';
import StreamingToken from './tokens/streamingtoken';
import {
  getStreamToken,
  saveStreamToken,
  clearStreamToken,
  isStreamTokenValid,
} from './store/streamTokenStore';
import {
  getWebToken,
  saveWebToken,
  clearWebToken,
  isWebTokenValid,
} from './store/webTokenStore';

const log = debugFactory('Authentication.ts');

export default class Authentication {
  _xal: Xal;
  _tokenStore: TokenStore;
  _isAuthenticating: boolean = false;
  _authenticationCompleted: any;
  _authenticationFailed: any;

  constructor(authenticationCompleted: any, authenticationFailed: any) {
    this._tokenStore = new TokenStore();
    this._xal = new Xal();
    this._authenticationCompleted = authenticationCompleted;
    this._authenticationFailed = authenticationFailed;
  }

  async checkAuthentication() {
    this._tokenStore.load();
    log.info('[checkAuthentication()] Starting token check...');
    log.info('[checkAuthentication()]:', this._tokenStore.hasValidAuthTokens());

    if (this._tokenStore.hasValidAuthTokens()) {
      log.info('[checkAuthentication()] Tokens are valid.');
      this.startSilentFlow();
      return true;
    }

    if (this._tokenStore.getUserToken() !== undefined) {
      log.info(
        '[checkAuthentication()] Tokens are expired but we have a user token. Lets try to refresh the tokens.',
      );
      this.startSilentFlow();
      return true;
    }

    log.info('[checkAuthentication()] No tokens are present.');
    return false;
  }

  startSilentFlow() {
    if (this._isAuthenticating) {
      log.info('[startSilentFlow()] Authentication is already in progress.');
      return;
    }

    log.info('[startSilentFlow()] Starting silent flow...');
    this._isAuthenticating = true;
    void this.runSilentFlow();
  }

  private async runSilentFlow() {
    try {
      const streamToken = getStreamToken();
      const webToken = getWebToken();
      const xHomeToken = streamToken?.xHomeToken;
      const xCloudToken = streamToken?.xCloudToken;

      if (
        xHomeToken &&
        isStreamTokenValid(xHomeToken) &&
        isWebTokenValid(webToken)
      ) {
        await this._authenticationCompleted(
          {
            xHomeToken: new StreamingToken(xHomeToken.data),
            xCloudToken: xCloudToken
              ? new StreamingToken(xCloudToken.data)
              : xCloudToken,
          },
          webToken,
        );
        return;
      }

      const shouldRefresh =
        Date.now() - this._tokenStore.getTokenUpdateTime() >=
        23 * 60 * 60 * 1000;

      if (shouldRefresh) {
        await this._xal.refreshTokens(this._tokenStore);
        log.info('[startSilentFlow()] Tokens have been refreshed');
      } else {
        log.info('[startSilentFlow()] Skip refreshTokens');
      }

      const streamingTokens = await this._xal.getStreamingToken(
        this._tokenStore,
      );
      const freshWebToken = await this._xal.getWebToken(this._tokenStore);
      saveStreamToken(streamingTokens);
      saveWebToken(freshWebToken);
      await this._authenticationCompleted(streamingTokens, freshWebToken);
    } catch (error: any) {
      log.error('[startSilentFlow()] Authentication failed:', error);
      clearStreamToken();
      clearWebToken();
      this._tokenStore.clear();
      this._authenticationFailed(
        '[startSilentFlow()] Login failed, please login again(登录失败，请重新登录):' +
          (error?.message || String(error)),
        true,
      );
    } finally {
      this._isAuthenticating = false;
    }
  }

  startAuthflow(redirect: any, redirectUri: any) {
    log.info('startAuthflow');
    this._xal
      .authenticateUser(this._tokenStore, redirect, redirectUri)
      .then(result => {
        log.info('[startAuthFlow()] Authenticated user:', result);
        if (!result) {
          throw new Error('Authorization was not completed successfully');
        }
        this.startSilentFlow();
      })
      .catch(error => {
        this._authenticationFailed(
          '[startAuthflow()] Login failed, please login again(登录失败，请重新登录):' +
            (error?.message || String(error)),
          true,
        );
      });
  }
}
