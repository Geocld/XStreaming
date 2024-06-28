import XstsToken from '../tokens/xststoken';
import Http from '../utils/http';
import {debugFactory} from '../utils/debug';

const log = debugFactory('web/index.ts');

export default class WebApi {
  webToken: XstsToken;

  constructor(webToken: XstsToken) {
    this.webToken = webToken;
  }

  getConsoles() {
    const http = new Http();
    return new Promise((resolve, reject) => {
      http
        .get(
          'xccs.xboxlive.com',
          '/lists/devices?queryCurrentDevice=false&includeStorageDevices=true',
          {
            Authorization:
              'XBL3.0 x=' +
              this.webToken.data.DisplayClaims.xui[0].uhs +
              ';' +
              this.webToken.data.Token,
            'Accept-Language': 'en-US',
            'x-xbl-contract-version': '2',
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
        )
        .then((res: any) => {
          log.info(
            '[getConsoles] /lists/devices response:',
            JSON.stringify(res),
          );
          if (res.result) {
            resolve(res.result);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  getUserProfile() {
    const http = new Http();
    return new Promise((resolve, reject) => {
      http
        .get(
          'profile.xboxlive.com',
          '/users/me/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag',
          {
            Authorization:
              'XBL3.0 x=' +
              this.webToken.data.DisplayClaims.xui[0].uhs +
              ';' +
              this.webToken.data.Token,
            'Accept-Language': 'en-US',
            'x-xbl-contract-version': '3',
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
        )
        .then((res: any) => {
          log.info(
            '[getUserProfile] /users/me/profile response:',
            JSON.stringify(res),
          );
          if (res.profileUsers) {
            const infos: any = {};
            res.profileUsers[0].settings.forEach((item: any) => {
              infos[item.id] = item.value;
            });
            resolve(infos);
          } else {
            resolve({});
          }
        })
        .catch(e => {
          reject(e);
        });
    });
  }
}