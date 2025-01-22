import axios from 'axios';
import semver from 'semver';
import pkg from '../../package.json';

const CHECK_URL = 'https://api.github.com/repos/Geocld/XStreaming/releases';

const formatMdString = (md: string) => {
  return md
    .replace(/##\s/g, '')
    .replace(/\r\n---\r\n/g, '\n')
    .replace(/\[([^\]]+)\]$([^)]+)$/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/^-\s/gm, '• ');
};

const updater = () => {
  const {version} = pkg;
  return new Promise(resolve => {
    axios
      .get(CHECK_URL)
      .then(res => {
        if (res.status === 200) {
          const releases = res.data;
          if (releases.length > 0) {
            const latest = releases[0];
            let latestVer = semver.valid(semver.coerce(latest.tag_name));
            const updateText = formatMdString(latest.body);
            if (latestVer && semver.gt(latestVer, version)) {
              // Have new version
              resolve({
                latestVer,
                version,
                updateText,
                url: latest.html_url,
              });
            }
          } else {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      })
      .catch(e => {
        console.log('Check version error:', e);
        resolve(false);
      });
  });
};

export default updater;
