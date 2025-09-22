import axios from 'axios';

const CHECK_URL = 'https://xstreaming-support.pages.dev/server.json';

const getServer = () => {
  return new Promise(resolve => {
    axios
      .get(CHECK_URL, {timeout: 10 * 1000})
      .then(res => {
        if (res.status === 200) {
          const data = res.data;
          resolve(data);
        } else {
          resolve(null);
        }
      })
      .catch(e => {
        console.log('Get server error:', e);
        resolve(null);
      });
  });
};

export default getServer;
