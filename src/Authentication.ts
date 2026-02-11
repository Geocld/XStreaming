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

    // Get stream token from cache
    const _streamToken = getStreamToken();
    const _webToken = getWebToken();

    if (
      _streamToken &&
      (_streamToken.xHomeToken || _streamToken.xCloudToken) &&
      _webToken
    ) {
      const {xHomeToken, xCloudToken} = _streamToken;

      // console.log('[startSilentFlow] xHomeToken:', xHomeToken);
      // console.log(
      //   '[startSilentFlow] isStreamTokenValid(xHomeToken):',
      //   isStreamTokenValid(xHomeToken),
      // );
      // console.log('[startSilentFlow] xCloudToken:', xCloudToken);
      // console.log(
      //   '[startSilentFlow] isStreamTokenValid(xCloudToken):',
      //   isStreamTokenValid(xCloudToken),
      // );
      // // console.log('_webToken:', _webToken);
      // console.log(
      //   '[startSilentFlow] isWebTokenValid(_webToken):',
      //   isWebTokenValid(_webToken),
      // );

      if (xHomeToken || xCloudToken) {
        if (
          xHomeToken &&
          isStreamTokenValid(xHomeToken) &&
          isWebTokenValid(_webToken)
        ) {
          // Use cache directly
          this._authenticationCompleted(
            {
              xHomeToken: xHomeToken
                ? new StreamingToken(xHomeToken.data)
                : xHomeToken,
              xCloudToken: xCloudToken
                ? new StreamingToken(xCloudToken.data)
                : xCloudToken,
            },
            _webToken,
          );
        } else if (
          xCloudToken &&
          isStreamTokenValid(xCloudToken) &&
          isWebTokenValid(_webToken)
        ) {
          // Use cache directly
          this._authenticationCompleted(
            {
              xHomeToken: xHomeToken
                ? new StreamingToken(xHomeToken.data)
                : xHomeToken,
              xCloudToken: xCloudToken
                ? new StreamingToken(xCloudToken.data)
                : xCloudToken,
            },
            _webToken,
          );
        } else {
          // Skip refreshTokens within 23 hour
          if (
            Date.now() - this._tokenStore.getTokenUpdateTime() <
            23 * 60 * 60 * 1000
          ) {
            log.info('[startSilentFlow] skip refreshTokens - branch1');

            // Get new streaming token
            this._xal
              .getStreamingToken(this._tokenStore)
              .then(streamingTokens => {
                // console.log('streamingTokens:', JSON.stringify(streamingTokens));
                this._xal.getWebToken(this._tokenStore).then(webToken => {
                  saveStreamToken(streamingTokens);
                  saveWebToken(webToken);
                  this._authenticationCompleted(streamingTokens, webToken);
                });
              })
              .catch(e => {
                clearStreamToken();
                clearWebToken();
                this._tokenStore.clear();
                this._authenticationFailed(
                  '[getStreamingToken()] Login failed, please login again(登录失败，请重新登录):' +
                    e.message,
                );
              });
          } else {
            this._xal
              .refreshTokens(this._tokenStore)
              .then(() => {
                log.info(
                  '[startSilentFlow()] Tokens have been refreshed - branch1',
                );
                this._xal
                  .getStreamingToken(this._tokenStore)
                  .then(streamingTokens => {
                    // log.info('streamingTokens:', streamingTokens);
                    this._xal.getWebToken(this._tokenStore).then(webToken => {
                      saveStreamToken(streamingTokens);
                      saveWebToken(webToken);
                      this._authenticationCompleted(streamingTokens, webToken);
                    });
                  })
                  .catch(e => {
                    clearStreamToken();
                    clearWebToken();
                    this._tokenStore.clear();
                    this._authenticationFailed(
                      '[getStreamingToken()] Login failed, please login again(登录失败，请重新登录):' +
                        e.message,
                    );
                  });
              })
              .catch(e => {
                log.info('[startSilentFlow()] refreshTokens error:', e);
                // Clear tokenstore if auth fail
                clearStreamToken();
                clearWebToken();
                this._tokenStore.clear();
                this._authenticationFailed(
                  '[startSilentFlow() - 145] refreshTokens error:' + e.message,
                );
              });
          }
        }
      }
    } else {
      // Skip refreshTokens within 23 hour
      if (
        Date.now() - this._tokenStore.getTokenUpdateTime() <
        23 * 60 * 60 * 1000
      ) {
        log.info('[startSilentFlow] skip refreshTokens');
        this._xal
          .getStreamingToken(this._tokenStore)
          .then(streamingTokens => {
            // console.log('streamingTokens:', JSON.stringify(streamingTokens));
            this._xal.getWebToken(this._tokenStore).then(webToken => {
              saveStreamToken(streamingTokens);
              saveWebToken(webToken);
              this._authenticationCompleted(streamingTokens, webToken);
            });
          })
          .catch(e => {
            clearStreamToken();
            clearWebToken();
            this._tokenStore.clear();
            this._authenticationFailed(
              '[getStreamingToken()] Login failed, please login again(登录失败，请重新登录):' +
                e.message,
            );
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
                  saveStreamToken(streamingTokens);
                  saveWebToken(webToken);
                  this._authenticationCompleted(streamingTokens, webToken);
                });
              })
              .catch(e => {
                clearStreamToken();
                clearWebToken();
                this._tokenStore.clear();
                this._authenticationFailed(
                  '[getStreamingToken()] Login failed, please login again(登录失败，请重新登录):' +
                    e.message,
                );
              });
          })
          .catch(e => {
            log.info('[startSilentFlow()] refreshTokens error:', e);
            // Clear tokenstore if auth fail
            clearStreamToken();
            clearWebToken();
            this._tokenStore.clear();
            this._authenticationFailed(
              '[startSilentFlow() - 189] refreshTokens error:' + e.message,
            );
          });
      }
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
