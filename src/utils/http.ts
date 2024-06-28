import axios from 'axios';

export default class Http {
  get(host: string, path: string, headers: any) {
    return new Promise((resolve, reject) => {
      const hostHeaders = {
        // 'Content-Type': 'application/json',
        ...headers,
      };

      axios
        .get(`https://${host}${path}`, {
          headers: hostHeaders,
        })
        .then((res: any) => {
          if (res.status === 200 || res.status === 204) {
            resolve(res.data);
          } else {
            resolve({
              statuscode: res.code,
              headers: res.headers,
              body: res.data,
              message: 'Error fetching ' + host + path,
            });
          }
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  post(host: string, path: string, headers: any, data: any) {
    return new Promise((resolve, reject) => {
      const hostHeaders = {
        // 'Content-Type': 'application/json',
        ...headers,
      };

      if (typeof data === 'object') {
        data = JSON.stringify(data);
      }

      axios
        .post(`https://${host}${path}`, data, {
          headers: hostHeaders,
        })
        .then((res: any) => {
          if (res.status === 200 || res.status === 202) {
            resolve(res.data);
          } else {
            resolve({
              statuscode: res.code,
              headers: res.headers,
              body: res.data,
              message: 'Error fetching ' + host + path,
            });
          }
        })
        .catch(e => {
          reject(e);
        });
    });
  }
}
