import uuid from 'react-native-uuid';
import XstsToken from '../tokens/xststoken';
import Http from '../utils/http';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';

const log = debugFactory('web/index.ts');

export default class WebApi {
  webToken: XstsToken;
  settings: any;

  constructor(webToken: XstsToken) {
    this.webToken = webToken;
    this.settings = getSettings();
  }

  sendCommand(
    consoleId: string,
    commandType: string,
    command: string,
    params?: any,
  ) {
    log.info('[sendCommand]:', consoleId, commandType, command);
    const http = new Http();

    if (params === undefined) {
      params = [];
    }

    console.log('params:', params);

    const postParams = {
      destination: 'Xbox',
      type: commandType,
      command: command,
      sessionId: uuid.v4(),
      sourceId: 'com.microsoft.smartglass',
      parameters: params,
      linkedXboxId: consoleId,
    };

    return new Promise((resolve, reject) => {
      http
        .post(
          'xccs.xboxlive.com',
          '/commands',
          {
            Authorization:
              'XBL3.0 x=' +
              this.webToken.data.DisplayClaims.xui[0].uhs +
              ';' +
              this.webToken.data.Token,
            'Accept-Language': 'en-US',
            skillplatform: 'RemoteManagement',
            'x-xbl-contract-version': '4',
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
          postParams,
        )
        .then((res: any) => {
          log.info('[sendCommand] /commands/ response:', JSON.stringify(res));
          if (res.result) {
            resolve(res.result);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('error:', e);
          reject(e);
        });
    });
  }

  powerOn(consoleId: string) {
    return this.sendCommand(consoleId, 'Power', 'WakeUp');
  }

  powerOff(consoleId: string) {
    return this.sendCommand(consoleId, 'Power', 'TurnOff');
  }

  sendText(consoleId: string, text: string) {
    return this.sendCommand(consoleId, 'Shell', 'InjectString', [
      {
        replacementString: text,
      },
    ]);
  }

  getConsoleStatus(consoleId: string) {
    const http = new Http();
    return new Promise((resolve, reject) => {
      http
        .get('xccs.xboxlive.com', '/consoles/' + consoleId, {
          Authorization:
            'XBL3.0 x=' +
            this.webToken.data.DisplayClaims.xui[0].uhs +
            ';' +
            this.webToken.data.Token,
          'Accept-Language': 'en-US',
          skillplatform: 'RemoteManagement',
          'x-xbl-contract-version': '4',
          'x-xbl-client-name': 'XboxApp',
          'x-xbl-client-type': 'UWA',
          'x-xbl-client-version': '39.39.22001.0',
        })
        .then((res: any) => {
          log.info(
            '[getConsoleStatus] /consoles/ response:',
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

  getUserProfileV2() {
    const http = new Http();
    const xid = this.webToken.data.DisplayClaims.xui[0].xid;
    return new Promise((resolve, reject) => {
      http
        .get(
          'peoplehub.xboxlive.com',
          `/users/me/people/xuids(${xid})/decoration/detail`,
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
            '[getUserProfileV2] /users/me/people response:',
            JSON.stringify(res),
          );
          if (res && res.people && res.people.length) {
            resolve(res.people[0]);
          } else {
            resolve({});
          }
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  getFriends() {
    const http = new Http();
    return new Promise((resolve, reject) => {
      const params = [
        'preferredcolor',
        'detail',
        'multiplayersummary',
        'presencedetail',
      ];
      http
        .get(
          'peoplehub.xboxlive.com',
          '/users/me/people/social/decoration/' + params.join(','),
          {
            Authorization:
              'XBL3.0 x=' +
              this.webToken.data.DisplayClaims.xui[0].uhs +
              ';' +
              this.webToken.data.Token,
            'Accept-Language': this.settings.preferred_game_language
              ? this.settings.preferred_game_language
              : 'en-US',
            'x-xbl-contract-version': 3,
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
        )
        .then((res: any) => {
          // log.info('[getFriends] response:', JSON.stringify(res));
          if (res.people) {
            resolve(res.people);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('[getFriends] error:', e);
          reject(e);
        });
    });
  }

  getHistoryAchivements() {
    const http = new Http();
    return new Promise((resolve, reject) => {
      const uhs = this.webToken.data.DisplayClaims.xui[0].uhs;
      const xid = this.webToken.data.DisplayClaims.xui[0].xid;

      http
        .get(
          'achievements.xboxlive.com',
          `/users/xuid(${xid})/history/titles?orderBy=unlockTime`,
          {
            Authorization: 'XBL3.0 x=' + uhs + ';' + this.webToken.data.Token,
            'Accept-Language': this.settings.preferred_game_language
              ? this.settings.preferred_game_language
              : 'en-US',
            'x-xbl-contract-version': 2,
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
        )
        .then((res: any) => {
          // log.info('[getHistoryAchivements] getHistoryAchivements:', JSON.stringify(res));
          if (res.titles) {
            resolve(res.titles);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('[getHistoryAchivements] error:', e);
          reject(e);
        });
    });
  }

  getAchivementDetail(titleId: string) {
    const http = new Http();
    return new Promise((resolve, reject) => {
      const uhs = this.webToken.data.DisplayClaims.xui[0].uhs;
      const xid = this.webToken.data.DisplayClaims.xui[0].xid;

      http
        .get(
          'achievements.xboxlive.com',
          `/users/xuid(${xid})/achievements?titleId=${titleId}&maxItems=1000`,
          {
            Authorization: 'XBL3.0 x=' + uhs + ';' + this.webToken.data.Token,
            'Accept-Language': this.settings.preferred_game_language
              ? this.settings.preferred_game_language
              : 'en-US',
            'x-xbl-contract-version': 2,
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
        )
        .then((res: any) => {
          // log.info('[getAchivementDetail] getAchivementDetail:', JSON.stringify(res));
          if (res.achievements) {
            resolve(res.achievements);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          // console.log('[getAchivementDetail] error:', e);
          reject(e);
        });
    });
  }
}
