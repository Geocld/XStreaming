import Msal from './xal/msal';
import TokenStore from './xal/tokenstore';
import {debugFactory} from './utils/debug';
import {clearStreamToken} from './store/streamTokenStore';
import {clearWebToken} from './store/webTokenStore';

const log = debugFactory('MsalAuthentication.ts');

export default class MsalAuthentication {
  _msal: Msal;
  _tokenStore: TokenStore;
  _isAuthenticating: boolean = false;
  _authenticationCompleted: any;
  _authenticationFailed: any;
  _authenticationProgress?: (stage: string) => void;

  constructor(
    authenticationCompleted: any,
    authenticationFailed: any,
    authenticationProgress?: (stage: string) => void,
  ) {
    this._tokenStore = new TokenStore();
    this._authenticationProgress = authenticationProgress;
    this._msal = new Msal(
      this._tokenStore,
      stage => this._authenticationProgress?.(stage),
    );
    this._authenticationCompleted = authenticationCompleted;
    this._authenticationFailed = authenticationFailed;
  }

  async checkAuthentication() {
    this._tokenStore.load();
    log.info('[checkAuthentication()] Starting token check...');
    log.info('[checkAuthentication()]:', this._tokenStore.hasValidAuthTokens());

    if (this._tokenStore.hasValidAuthTokens()) {
      const existingToken = this._tokenStore.getUserToken();
      if (existingToken && existingToken.data.scope !== 'XboxLive.signin') {
        log.info(
          '[checkAuthentication()] Deprecating old XAL token scope. Starting auth flow to get new tokens.',
        );
        return false;
      }

      log.info(
        '[checkAuthentication()] Tokens are valid:' +
          this._tokenStore.getUserToken(),
      );
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
    void this.getTokens();
  }

  async getTokens() {
    try {
      this._authenticationProgress?.('Getting streaming credentials...');
      const streamingTokens = await this.getStreamingToken();
      log.info('[getTokens()] Retrieved streaming tokens:' + streamingTokens);

      this._authenticationProgress?.('Getting web credentials...');
      const webToken = await this._msal.getWebToken();
      log.info('[getTokens()] Web token received:' + webToken);
      await this._authenticationCompleted(streamingTokens, webToken);
    } catch (error: any) {
      log.info('[getTokens()] Authentication token request failed:', error);
      clearStreamToken();
      clearWebToken();
      this._tokenStore.clear();
      this._authenticationFailed(
        '[MSAL getTokens()] Login failed, please try again:' +
          (error?.message || String(error)),
        true,
      );
    } finally {
      this._isAuthenticating = false;
    }
  }

  async getStreamingToken() {
    const userToken = this._tokenStore.getUserToken();
    if (!userToken) {
      throw new Error('sisuTokenIsMissing');
    }
    log.info('[getStreamingToken()] Found local token:' + userToken);

    const streamingTokens = await this._msal.getStreamingTokens();

    log.info(
      '[getStreamingToken()] Retrieved streaming tokens:' + streamingTokens,
    );
    return {
      xHomeToken: streamingTokens.xHomeToken,
      xCloudToken: streamingTokens.xCloudToken,
    };
  }

  getMsalDeviceCode() {
    log.info('[getMsalDeviceCode()] Starting get device code');
    this._authenticationProgress?.('Getting authorization code...');
    return this._msal.doDeviceCodeAuth();
  }

  doPollForDeviceCodeAuth(deviceCode: any) {
    this._authenticationProgress?.('Waiting for authorization...');
    this._msal
      .doPollForDeviceCodeAuth(deviceCode)
      .then((token: any) => {
        log.info(
          '[doPollForDeviceCodeAuth()] Devicecode authentication successful:' +
            token,
        );

        this._authenticationProgress?.('Completing login...');
        this.getTokens();
      })
      .catch((error: any) => {
        log.info(
          '[doPollForDeviceCodeAuth()] Error during devicecode polling auth:' +
            error.message,
        );
        clearStreamToken();
        clearWebToken();
        this._tokenStore.clear();
        this._authenticationFailed(
          '[MSAL doPollForDeviceCodeAuth()] Failed to retrieve device code token:' +
            error.message,
          true,
        );
      });
  }
}
