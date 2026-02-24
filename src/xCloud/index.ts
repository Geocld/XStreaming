import axios from 'axios';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import {Address6} from 'ip-address';
import TokenStore from '../xal/tokenstore';
import Msal from '../xal/msal';
import Xal from '../xal';
import MsalToken from '../tokens/msaltoken';

const log = debugFactory('xCloud/index.js');

type AuthContext = {
  _tokenStore: TokenStore;
  _msal?: Msal;
  _xal?: Xal;
} | null;

export default class XcloudApi {
  private sessionId = '';
  private readonly host: string;
  private readonly gsToken: string;
  private readonly type: 'home' | 'cloud';
  private readonly authContext: AuthContext;
  private isStoped = false;

  constructor(
    host: string,
    gsToken: string,
    type: 'home' | 'cloud',
    authentication?: AuthContext | (() => void),
  ) {
    this.host = host;
    this.gsToken = gsToken;
    this.type = type;
    this.authContext =
      typeof authentication === 'function' ? null : authentication ?? null;
  }

  private requireAuthContext(): NonNullable<AuthContext> {
    if (!this.authContext) {
      throw new Error('Authentication context is required for this operation');
    }
    return this.authContext;
  }

  startSession(consoleId: string, resolution: number): Promise<any> {
    log.info('[startSession] consoleId:', consoleId);
    this.isStoped = false;
    let osName = 'android';

    if (resolution === 1080) {
      osName = 'windows';
    } else if (resolution === 1081) {
      // 1080p-HQ
      osName = 'tizen';
    } else {
      osName = 'android';
    }
    return new Promise<any>((resolve, reject) => {
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
            clientAppVersion: '29.9.35',
            clientSdkVersion: '10.6.8',
            httpEnvironment: 'prod',
            sdkInstallId: '',
          },
        },
        dev: {
          hw: {
            make: 'Microsoft',
            model: 'unknown',
            platformType: 'desktop',
            sdktype: 'web',
          },
          os: {
            // name: 'android', // 720P
            // name: 'windows', // 1080P
            // name: 'tizen', // 1080P(HQ) or 1440P
            // For console streaming
            name: osName,
            ver: '22631.2715',
            platform: 'desktop',
          },
          displayInfo: {
            dimensions: {
              widthInPixels: 4096,
              heightInPixels: 2160,
            },
            pixelDensity: {
              dpiX: 1,
              dpiY: 1,
            },
          },
          browser: {
            browserName: 'edge',
            browserVersion: '140.0.3485.66',
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
  waitState(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
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
            case 'ReadyToConnect': {
              const auth = this.requireAuthContext();
              auth._tokenStore.load();
              const authMethod = auth._tokenStore.getAuthenticationMethod();

              let tokenPromise: Promise<MsalToken>;
              if (authMethod === 'msal' && auth._msal) {
                tokenPromise = auth._msal.getMsalToken();
              } else if (auth._xal) {
                tokenPromise = auth._xal.getMsalToken(auth._tokenStore);
              } else {
                reject(new Error('Authentication provider is missing'));
                return;
              }

              tokenPromise.then((msalToken: MsalToken) => {
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
            }
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
  sendSDPOffer(sdpOffer: {sdp: string}): Promise<any> {
    return new Promise<any>((resolve, reject) => {
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
              if (res.data && res.data.exchangeResponse) {
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
                      if (res2.data && res2.data.exchangeResponse) {
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

  // sendChatSdpOffer
  sendChatSdp(sdpOffer: {sdp: string}): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const body = JSON.stringify({
        messageType: 'offer',
        sdp: sdpOffer.sdp,
        configuration: {
          isMediaStreamsChatRenegotiation: true,
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
              log.info('[sendSChatSdp] res.data:', res.data);
              if (res.data && res.data.exchangeResponse) {
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
                      if (res2.data && res2.data.exchangeResponse) {
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

  checkIceResponse(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
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

          // If result is empty, continue check
          if (!iceResult) {
            setTimeout(() => {
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
            const computedCandidates: any[] = [];

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
              // eslint-disable-next-line prettier/prettier
              /^(?:a=)?candidate:(?<foundation>\d+) (?<component>\d+) (?<protocol>\w+) (?<priority>\d+) (?<ip>[^\s]+) (?<port>\d+) (?<the_rest>.*)/
            );

            const lst: Array<Record<string, any>> = [];
            for (const item of computedCandidates) {
              if (item.candidate === 'a=end-of-candidates') {
                continue;
              }

              const pats = pattern.exec(item.candidate);
              if (pats && pats.groups) {
                const groups = pats.groups;
                lst.push(groups);
              }
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

            const newCandidates: any[] = [];
            let foundation = 1;

            const newCandidate = (candidate: string) => {
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

  sendICECandidates(iceCandidates: any): Promise<any> {
    log.info(
      '[sendICECandidates] iceCandidates:',
      JSON.stringify(iceCandidates),
    );
    return new Promise<any>((resolve, reject) => {
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

  sendMSALAuth(userToken: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
        .then(() => {
          resolve();
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  sendKeepalive(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
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
          reject('[sendKeepalive] error:' + e);
        });
    });
  }

  stopStream(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this.isStoped = true;
      if (!this.sessionId) {
        resolve({});
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

  getActiveSessions(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
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

  getOfficialTitles(): Promise<any[]> {
    return new Promise(resolve => {
      let officialTitles: any[] = [];
      axios
        .get('https://cdn.jsdelivr.net/gh/Geocld/XStreaming@main/titles.json', {
          timeout: 30 * 1000,
        })
        .then(res => {
          if (res.status === 200) {
            officialTitles = res.data.Products;
            // console.log('officialTitles:', officialTitles);
          }
          resolve(officialTitles);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  getGamePassProducts(titles: any[]): Promise<any[]> {
    return new Promise(resolve => {
      const productIdQueue: string[] = [];
      const v2TitleMap: Record<string, any> = {};
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
        this.getCatalogGames(productIdQueue, v2TitleMap).then(titles1 => {
          this.getCatalogGames(officialTitles, v2TitleMap).then(titles2 => {
            let mergedTitles = [...titles1, ...titles2];
            mergedTitles.sort((a, b) =>
              a.ProductTitle.localeCompare(b.ProductTitle),
            );
            mergedTitles = mergedTitles.reduce((acc, current) => {
              const exists = acc.find(
                (item: any) => item.ProductTitle === current.ProductTitle,
              );
              if (!exists) {
                acc.push(current);
              }
              return acc;
            }, []);
            resolve(mergedTitles);
          });
        });
      });
    });
  }

  getCatalogGames(
    prods: string[] = [],
    v2TitleMap: Record<string, any> = {},
  ): Promise<any[]> {
    const _settings = getSettings();
    const lang =
      _settings.preferred_game_language.indexOf('zh') > -1 ? 'zh-TW' : 'en-US';
    return new Promise(resolve => {
      axios
        .post(
          `https://catalog.gamepass.com/v3/products?market=US&language=${lang}&hydration=RemoteLowJade0`,
          {
            Products: [...prods],
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
          console.log('POST catalog.gamepass.com/v3/products success');
          if (res.data && res.data.Products) {
            const products = res.data.Products;
            let mergedTitles: any[] = [];
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
            mergedTitles = mergedTitles.filter(item => {
              return item.titleId || item.XCloudTitleId;
            });
            resolve(mergedTitles);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('getGamePassProducts error:', e);
          // reject(e);
          resolve([]);
        });
    });
  }

  // Get all games of XGPU
  getTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
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
  getNewTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
      axios
        .get(
          'https://catalog.gamepass.com/sigls/v2?id=f13cf6b4-57e6-4459-89df-6aec18cf0538&market=US&language=en-US',
        )
        .then(res => {
          resolve(res.data);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  // Get recently play games of user
  getRecentTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
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
        .catch(() => {
          resolve([]);
        });
    });
  }

  // Get alternate ids
  getAlternateIds(id: string): Promise<any[]> {
    return new Promise(resolve => {
      axios
        .post(
          `${this.host}/v2/titles`,
          {
            alternateIdType: 'productId',
            alternateIds: [id],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(res => {
          console.log('res.data:', res.data);
          resolve(res.data || []);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  getConsoles(): Promise<any[]> {
    return new Promise(resolve => {
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
            clientAppVersion: '26.1.97',
            clientSdkVersion: '10.3.7',
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
            name: 'windows',
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
            browserVersion: '130.0',
          },
        },
      });
      axios
        .get(`${this.host}/v6/servers/home?mr=50`, {
          headers: {
            'Content-Type': 'application/json',
            'X-MS-Device-Info': deviceInfo,
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          log.info('getConsoles res:', res.data);
          if (res.data && res.data.results) {
            resolve(res.data.results);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('xcloudapi getConsoles err:', e);
          resolve([]);
        });
    });
  }
}
