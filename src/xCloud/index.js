import axios from 'axios';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';

const log = debugFactory('xCloud/index.js');

export default class XcloudApi {
  constructor(host, gsToken, type, authentication) {
    this.sessionId = '';
    this.host = host;
    this.gsToken = gsToken;
    this.type = type; // home | cloud
    this.authentication = authentication;
    this.isStoped = false;
  }

  startSession(consoleId, resolution) {
    log.info('[startSession] consoleId:', consoleId);
    this.isStoped = false;
    return new Promise((resolve, reject) => {
      const _settings = getSettings();
      const deviceInfo = JSON.stringify({
        appInfo: {
          env: {
            // clientAppId: 'Microsoft.GamingApp',
            // clientAppType: 'native',
            // clientAppVersion: '2203.1001.4.0',
            // clientSdkVersion: '8.5.2',
            // httpEnvironment: 'prod',
            // sdkInstallId: '',
            clientAppId: 'www.xbox.com',
            clientAppType: 'browser',
            clientAppVersion: '21.1.98',
            clientSdkVersion: '8.5.3',
            httpEnvironment: 'prod',
            sdkInstallId: '',
          },
        },
        dev: {
          hw: {
            make: 'Microsoft',
            // 'model': 'Surface Pro',
            model: 'unknown',
            // 'sdktype': 'native',
            sdktype: 'web',
          },
          os: {
            // name: 'android', // 720P
            // name: 'windows', // 1080P
            name: resolution === 720 ? 'android' : 'windows',
            ver: '22631.2715',
            platform: 'desktop',
          },
          displayInfo: {
            dimensions: {
              widthInPixels: 1920,
              heightInPixels: 1080,
            },
            pixelDensity: {
              dpiX: 2,
              dpiY: 2,
            },
          },
          browser: {
            browserName: 'chrome',
            browserVersion: '119.0',
          },
        },
      });

      const body = JSON.stringify({
        clientSessionId: '',
        titleId: this.type === 'cloud' ? consoleId : '',
        systemUpdateGroup: '',
        settings: {
          nanoVersion: 'V3;WebrtcTransport.dll',
          enableTextToSpeech: false,
          highContrast: 0,
          locale: _settings.preferred_game_language
            ? _settings.preferred_game_language
            : 'en-US',
          useIceConnection: false,
          timezoneOffsetMinutes: 120,
          sdkType: 'web',
          osName: 'windows',
        },
        serverId: this.type === 'home' ? consoleId : '',
        fallbackRegionNames: [],
      });

      axios
        .post(`${this.host}/v5/sessions/${this.type}/play`, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-MS-Device-Info': deviceInfo,
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          if (res.status === 200 || res.status === 202) {
            log.info(
              `[startSession] ${this.host}/v5/sessions/${this.type}/play res:`,
              res.data,
            );
            const sessionId = res.data.sessionPath.split('/')[3];
            this.sessionId = sessionId;

            this.waitState()
              .then(() => {
                axios
                  .get(
                    `${this.host}/v5/sessions/${this.type}/${this.sessionId}/configuration`,
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + this.gsToken,
                      },
                    },
                  )
                  .then(result => {
                    log.info('[startSession] /configuration res:', result.data);
                    resolve(result.data);
                  });
              })
              .catch(error => {
                reject(error);
              });
          }
        })
        .catch(e => {
          log.info('[startSession] error:', e);
          reject(e);
        });
    });
  }

  // Check host streaming status is ready or not
  waitState() {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.host}/v5/sessions/${this.type}/${this.sessionId}/state`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          log.info('[waitState] res:', res.data);
          const _state = res.data;
          switch (_state.state) {
            // Streaming ready
            case 'Provisioned':
              resolve(_state);
              break;
            // Connecting
            case 'WaitingForResources':
            case 'Provisioning':
              if (this.isStoped) {
                // Canceled
                reject('Streaming canceled');
              } else {
                setTimeout(() => {
                  // Continue
                  this.waitState()
                    .then(state => {
                      resolve(state);
                    })
                    .catch(error => {
                      reject(error);
                    });
                }, 1000);
              }
              break;
            case 'ReadyToConnect':
              // Do MSAL Auth
              this.authentication._xal
                .getMsalToken(this.authentication._tokenStore)
                .then(msalToken => {
                  this.sendMSALAuth(msalToken.data.lpt).then(() => {
                    this.waitState()
                      .then(state => {
                        resolve(state);
                      })
                      .catch(error => {
                        reject(error);
                      });
                  });
                });
              break;
            case 'Failed':
              reject('Streaming failed: ' + _state.errorDetails.message);
              break;
            default:
              log.info('unknown state:', _state);
              reject('Streaming failed');
              break;
          }
        })
        .catch(e => {
          log.info('[waitState] error:', e);
          reject(e);
        });
    });
  }

  // sendSDPOffer
  sendSDPOffer(sdpOffer) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        messageType: 'offer',
        sdp: sdpOffer.sdp,
        configuration: {
          chatConfiguration: {
            bytesPerSample: 2,
            expectedClipDurationMs: 20,
            format: {
              codec: 'opus',
              container: 'webm',
            },
            numChannels: 1,
            sampleFrequencyHz: 24000,
          },
          chat: {
            minVersion: 1,
            maxVersion: 1,
          },
          control: {
            minVersion: 1,
            maxVersion: 3,
          },
          input: {
            minVersion: 1,
            maxVersion: 8,
          },
          message: {
            minVersion: 1,
            maxVersion: 1,
          },
        },
      });
      axios
        .post(
          `${this.host}/v5/sessions/${this.type}/${this.sessionId}/sdp`,
          body,
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(() => {
          // The first post for SDP did not return, so a GET request for SDP response needs to be initiated.
          axios
            .get(
              `${this.host}/v5/sessions/${this.type}/${this.sessionId}/sdp`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + this.gsToken,
                },
              },
            )
            .then(res => {
              log.info('[sendSDPOffer] res.data:', res.data);
              if (res.data.exchangeResponse) {
                resolve(res.data);
              } else {
                const checkInterval = setInterval(() => {
                  if (this.isStoped) {
                    clearInterval(checkInterval);
                    return;
                  }
                  axios
                    .get(
                      `${this.host}/v5/sessions/${this.type}/${this.sessionId}/sdp`,
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: 'Bearer ' + this.gsToken,
                        },
                      },
                    )
                    .then(res2 => {
                      if (res2.data.exchangeResponse) {
                        resolve(res2.data);
                        clearInterval(checkInterval);
                      }
                    })
                    .catch(e => {
                      reject(e);
                      clearInterval(checkInterval);
                    });
                }, 1000);
              }
              // resolve(sdpResponse.exchangeResponse);
            });
        });
    });
  }

  sendICECandidates(iceCandidates) {
    log.info('[sendICECandidates] iceCandidates:', iceCandidates);
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        iceCandidates,
      });
      axios
        .post(
          `${this.host}/v5/sessions/${this.type}/${this.sessionId}/ice`,
          body,
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(() => {
          // Check ICE result
          axios
            .get(
              `${this.host}/v5/sessions/${this.type}/${this.sessionId}/ice`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + this.gsToken,
                },
              },
            )
            .then(iceResponse => {
              log.info('[sendICECandidates] iceResponse:', iceResponse.data);

              resolve(iceResponse.data);
            })
            .catch(error => {
              reject(error);
            });
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  sendMSALAuth(userToken) {
    return new Promise((resolve, reject) => {
      axios
        .post(
          `${this.host}/v5/sessions/${this.type}/${this.sessionId}/connect`,
          {
            userToken,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(res => {
          resolve();
        });
    });
  }

  sendKeepalive() {
    return new Promise((resolve, reject) => {
      axios
        .post(
          `${this.host}/v5/sessions/${this.type}/${this.sessionId}/keepalive`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(res => {
          resolve(res.data);
        })
        .catch(e => {
          reject('[sendKeepalive] error:', e);
        });
    });
  }

  stopStream() {
    return new Promise((resolve, reject) => {
      this.isStoped = true;
      if (!this.sessionId) {
        resolve();
        return;
      }
      axios
        .delete(`${this.host}/v5/sessions/${this.type}/${this.sessionId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          log.info('Stream stop:', res.data);
          resolve(res.data);
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  getGamePassProducts(titles) {
    return new Promise((resolve, reject) => {
      const productIdQueue = [];
      if (!Array.isArray(titles)) {
        log.info('[getGamePassProducts] error titles is not a array:', titles);
        resolve([]);
      }
      titles.forEach(title => {
        if (title.details && title.details.productId) {
          productIdQueue.push(title.details.productId);
        }
      });
      axios
        .post(
          `https://catalog.gamepass.com/v3/products?market=US&language=en-US&hydration=RemoteHighSapphire0`,
          {
            Products: productIdQueue,
          },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'ms-cv': 0,
              'calling-app-name': 'Xbox Cloud Gaming Web',
              'calling-app-version': '21.0.0',
            },
          },
        )
        .then(res => {
          if (res.data && res.data.Products) {
            const products = res.data.Products;
            const mergedTitles = [];
            titles.forEach(title => {
              if (
                title.details &&
                title.details.productId &&
                products[title.details.productId]
              ) {
                mergedTitles.push({
                  ...title,
                  catalogDetails: products[title.details.productId],
                });
              }
            });
            resolve(mergedTitles);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          log.info('getGamePassProducts error:', e);
          reject(e);
        });
    });
  }

  // Get all games of XGPU
  getTitles() {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.host}/v2/titles`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          resolve(res.data);
        })
        .catch(e => {
          log.info('getTitles error: ', e);
          resolve([]);
        });
    });
  }

  // Get recently add games of XGPU
  getNewTitles() {
    return new Promise((resolve, reject) => {
      axios
        .get(
          'https://catalog.gamepass.com/sigls/v2?id=f13cf6b4-57e6-4459-89df-6aec18cf0538&market=US&language=en-US',
        )
        .then(res => {
          resolve(res.data);
        })
        .catch(e => {
          resolve([]);
        });
    });
  }

  // Get recently play games of user
  getRecentTitles() {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.host}/v2/titles/mru?mr=25`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          // log.info('getRecentTitles res:', res.data);
          resolve(res.data);
        })
        .catch(e => {
          resolve([]);
        });
    });
  }
}
