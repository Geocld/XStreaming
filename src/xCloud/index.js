import axios from 'axios';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import {Address6} from 'ip-address';

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

  // FIXME: Sometime connectstate change failed, nextTime should refresh sessionId to make a new connect.
  startSession(consoleId, resolution) {
    log.info('[startSession] consoleId:', consoleId);
    this.isStoped = false;
    let osName = 'android';

    if (resolution === 1080) {
      osName = 'windows';
    } else if (resolution === 1081) {
      // 1080p-HQ, only work in xcloud game
      osName = this.type === 'home' ? 'windows' : 'tizen';
    } else {
      osName = 'android';
    }
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
            clientAppVersion: '24.17.36',
            clientSdkVersion: '10.1.14',
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
            // name: 'tizen', // 1080 hq ?
            // For console streaming
            name: osName,
            ver: '22631.2715',
            platform: 'desktop',
          },
          displayInfo: {
            dimensions: {
              widthInPixels: 1920,
              heightInPixels: 1080,
            },
            pixelDensity: {
              dpiX: 1,
              dpiY: 1,
            },
          },
          browser: {
            browserName: 'chrome',
            browserVersion: '125.0',
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
          // For xCloud streaming
          // osName: resolution === 720 ? 'android' : 'windows',
          osName,
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
                    log.info(
                      '[startSession] /configuration res:',
                      JSON.stringify(result.data),
                    );
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
                // reject('Streaming canceled');
                reject('');
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

  checkIceResponse() {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.host}/v5/sessions/${this.type}/${this.sessionId}/ice`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(iceResponse => {
          const iceResult = iceResponse.data;
          log.info('[checkIceResponse] res:', iceResult);

          if (iceResult === '') {
            setTimeout(() => {
              // Continue check
              this.checkIceResponse()
                .then(state => {
                  resolve(state);
                })
                .catch(error => {
                  reject(error);
                });
            }, 1000);
          } else {
            const exchangeIce = JSON.parse(iceResult.exchangeResponse);
            const computedCandidates = [];

            // Find Teredo Address and extract remote ip
            for (const candidate in exchangeIce) {
              const candidateAddress =
                exchangeIce[candidate].candidate.split(' ');
              if (
                candidateAddress.length > 4 &&
                candidateAddress[4].substr(0, 4) === '2001'
              ) {
                const address = new Address6(candidateAddress[4]);
                const teredo = address.inspectTeredo();

                computedCandidates.push({
                  candidate:
                    'a=candidate:10 1 UDP 1 ' +
                    teredo.client4 +
                    ' 9002 typ host ',
                  messageType: 'iceCandidate',
                  sdpMLineIndex: '0',
                  sdpMid: '0',
                });
                computedCandidates.push({
                  candidate:
                    'a=candidate:11 1 UDP 1 ' +
                    teredo.client4 +
                    ' ' +
                    teredo.udpPort +
                    ' typ host ',
                  messageType: 'iceCandidate',
                  sdpMLineIndex: '0',
                  sdpMid: '0',
                });
              }

              computedCandidates.push(exchangeIce[candidate]);
            }

            const pattern = new RegExp(
              /a=candidate:(?<foundation>\d+) (?<component>\d+) UDP (?<priority>\d+) (?<ip>[^\s]+) (?<port>\d+) (?<the_rest>.*)/,
            );

            const lst = [];
            for (let item of computedCandidates) {
              if (item.candidate === 'a=end-of-candidates') {
                continue;
              }

              const groups = pattern.exec(item.candidate).groups;
              lst.push(groups);
            }

            // PerferIPV6
            const _settings = getSettings();
            if (_settings.ipv6) {
              lst.sort((a, b) => {
                const firstIp = a.ip;
                const secondIp = b.ip;

                return !firstIp.includes(':') && secondIp.includes(':')
                  ? 1
                  : -1;
              });
            }

            const newCandidates = [];
            let foundation = 1;

            const newCandidate = candidate => {
              return {
                candidate: candidate,
                messageType: 'iceCandidate',
                sdpMLineIndex: '0',
                sdpMid: '0',
              };
            };

            lst.forEach(item => {
              item.foundation = foundation;
              item.priority = foundation === 1 ? 2130706431 : 1;

              newCandidates.push(
                newCandidate(
                  `a=candidate:${item.foundation} 1 UDP ${item.priority} ${item.ip} ${item.port} ${item.the_rest}`,
                ),
              );
              ++foundation;
            });

            newCandidates.push(newCandidate('a=end-of-candidates'));

            resolve(newCandidates);
          }
        })
        .catch(e => {
          log.info('[checkIceResponse] error:', e);
          reject(e);
        });
    });
  }

  sendICECandidates(iceCandidates) {
    log.info(
      '[sendICECandidates] iceCandidates:',
      JSON.stringify(iceCandidates),
    );
    return new Promise((resolve, reject) => {
      const postData = {
        messageType: 'iceCandidate',
        candidate: iceCandidates,
      };
      axios
        .post(
          `${this.host}/v5/sessions/${this.type}/${this.sessionId}/ice`,
          JSON.stringify(postData),
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(() => {
          // Check ICE result
          this.checkIceResponse()
            .then(candidates => {
              resolve(candidates);
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
          log.info('Stream stop:', res);
          resolve(res.data);
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  getActiveSessions() {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.host}/v5/sessions/${this.type}/active`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          resolve(res.data);
        })
        .catch(e => {
          log.info('getActiveSessions error: ', e);
          resolve([]);
        });
    });
  }

  getOfficialTitles() {
    return new Promise(resolve => {
      let officialTitles = [];
      axios
        .get('https://cdn.jsdelivr.net/gh/Geocld/XStreaming@main/titles.json', {
          timeout: 30,
        })
        .then(res => {
          if (res.status === 200) {
            officialTitles = res.data.Products;
            console.log('officialTitles:', officialTitles);
          }
          resolve(officialTitles);
        })
        .catch(e => {
          resolve([]);
        });
    });
  }

  getGamePassProducts(titles) {
    return new Promise((resolve, reject) => {
      const productIdQueue = [];
      const v2TitleMap = {};
      if (!Array.isArray(titles)) {
        log.info('[getGamePassProducts] error titles is not a array:', titles);
        resolve([]);
      }
      titles.forEach(title => {
        if (title.details && title.details.productId) {
          productIdQueue.push(title.details.productId);
          v2TitleMap[title.details.productId] = title;
        }
      });

      // Get officialTitles
      this.getOfficialTitles().then(officialTitles => {
        // Fix: v2/titles API can not get full games
        const mergeProductIds = [
          ...new Set([...productIdQueue, ...officialTitles]),
        ];
        axios
          .post(
            'https://catalog.gamepass.com/v3/products?market=US&language=en-US&hydration=RemoteLowJade0',
            {
              Products: mergeProductIds,
            },
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'ms-cv': 0,
                'calling-app-name': 'Xbox Cloud Gaming Web',
                'calling-app-version': '24.17.63',
              },
            },
          )
          .then(res => {
            if (res.data && res.data.Products) {
              const products = res.data.Products;
              const mergedTitles = [];
              for (const key in products) {
                if (v2TitleMap[key]) {
                  mergedTitles.push({
                    productId: key,
                    ...products[key],
                    ...v2TitleMap[key],
                  });
                } else {
                  mergedTitles.push({
                    productId: key,
                    ...products[key],
                  });
                }
              }
              mergedTitles.sort((a, b) =>
                a.ProductTitle.localeCompare(b.ProductTitle),
              );
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
