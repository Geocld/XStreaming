import Xal from './xal';
import TokenStore from './xal/tokenstore';
import {debugFactory} from './utils/debug';

const log = debugFactory('Authentication.ts');

export default class Authentication {
  _xal: Xal;
  _tokenStore: TokenStore;
  _isAuthenticating: boolean = false;
  _authenticationCompleted: any;

  constructor(authenticationCompleted: any) {
    this._tokenStore = new TokenStore();
    this._xal = new Xal();
    this._authenticationCompleted = authenticationCompleted;
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
        log.info('[checkAuthentication()] Tokens are valid.');
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
    this._isAuthenticating = true;

    // Skip refreshTokens within 1 hour
    if (Date.now() - this._tokenStore.getTokenUpdateTime() < 60 * 60 * 1000) {
      log.info('[startSilentFlow] skip refreshTokens');
      this._xal.getStreamingToken(this._tokenStore).then(streamingTokens => {
        this._xal.getWebToken(this._tokenStore).then(webToken => {
          this._authenticationCompleted(streamingTokens, webToken);
        });
      });
    } else {
      this._xal
        .refreshTokens(this._tokenStore)
        .then(() => {
          log.info('[startSilentFlow()] Tokens have been refreshed');
          this._xal
            .getStreamingToken(this._tokenStore)
            .then(streamingTokens => {
              // log.info('streamingTokens:', streamingTokens);
              this._xal.getWebToken(this._tokenStore).then(webToken => {
                this._authenticationCompleted(streamingTokens, webToken);
              });
            });
        })
        .catch(e => {
          log.info('[startSilentFlow()] refreshTokens error:', e);
          // Clear tokenstore if auth fail
          this._tokenStore.clear();
        });
    }
  }

  startAuthflow(redirect: any, redirectUri: any) {
    log.info('startAuthflow');
    this._xal
      .authenticateUser(this._tokenStore, redirect, redirectUri)
      .then(result => {
        log.info('[startAuthFlow()] Authenticated user:', result);
        this.startSilentFlow();
      });
  }
}
