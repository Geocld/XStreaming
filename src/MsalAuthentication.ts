import Msal from './xal/msal';
import TokenStore from './xal/tokenstore';
import {debugFactory} from './utils/debug';

const log = debugFactory('MsalAuthentication.ts');

export default class MsalAuthentication {
  _msal: Msal;
  _tokenStore: TokenStore;
  _isAuthenticating: boolean = false;
  _authenticationCompleted: any;
  _authenticationFailed: any;

  constructor(authenticationCompleted: any, authenticationFailed: any) {
    this._tokenStore = new TokenStore();
    this._msal = new Msal(this._tokenStore);
    this._authenticationCompleted = authenticationCompleted;
    this._authenticationFailed = authenticationFailed;
  }

  checkAuthentication() {
    return new Promise(resolve => {
      this._tokenStore.load();
      log.info('[checkAuthentication()] Starting token check...');
      log.info(
        '[checkAuthentication()]:',
        this._tokenStore.hasValidAuthTokens(),
      );
      if (this._tokenStore.hasValidAuthTokens()) {
        // Deprecate xal token.
        if (
          this._tokenStore.getUserToken() !== undefined &&
          this._tokenStore.getUserToken().data.scope !== 'XboxLive.signin'
        ) {
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

        resolve(true);
      } else {
        if (this._tokenStore.getUserToken() !== undefined) {
          log.info(
            '[checkAuthentication()] Tokens are expired but we have a user token. Lets try to refresh the tokens.',
          );
          this.startSilentFlow();

          resolve(true);
        } else {
          log.info('[checkAuthentication()] No tokens are present.');
          resolve(false);
        }
      }
    });
  }

  startSilentFlow() {
    log.info('[startSilentFlow()] Starting silent flow...');
    this.getTokens();
  }

  getTokens() {
    this.getStreamingToken()
      .then(streamingTokens => {
        log.info('[getTokens()] Retrieved streaming tokens:' + streamingTokens);

        this._msal
          .getWebToken()
          .then(webToken => {
            log.info('[getTokens()] Web token received:' + webToken);

            // Notify authentication completed
            this._authenticationCompleted(streamingTokens, webToken);
          })
          .catch(error => {
            log.info('[getTokens()] Failed to retrieve web tokens:' + error);
            this._authenticationFailed(
              '[getTokens()] Failed to retrieve web token:' + error.message,
            );
          });
      })
      .catch(err => {
        log.info('[getTokens()] Failed to retrieve streaming tokens:' + err);
        this._authenticationFailed(
          '[getTokens()] Failed to retrieve streaming tokens:' + err.message,
        );
      });
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
    return this._msal.doDeviceCodeAuth();
  }

  doPollForDeviceCodeAuth(deviceCode: any) {
    this._msal
      .doPollForDeviceCodeAuth(deviceCode)
      .then((token: any) => {
        log.info(
          '[doPollForDeviceCodeAuth()] Devicecode authentication successful:' +
            token,
        );

        this.getTokens();
      })
      .catch((error: any) => {
        log.info(
          '[doPollForDeviceCodeAuth()] Error during devicecode polling auth:' +
            error.message,
        );
        this._authenticationFailed(
          '[doPollForDeviceCodeAuth()] Failed to retrieve device code token:' +
            error.message,
        );
      });
  }
}
