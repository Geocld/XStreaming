import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('xcloudStore');

const STORE_KEY = 'user.xcloud';

// Sample
// const data = {
//   titles: [],
//   titleMap: {},
//   newTitles: [],
//   orgTitles: [],
//   recentTitles: [],
//   cacheTime: 1755052925902
// };

export const saveXcloudData = (data: any) => {
  log.info('saveXcloudData');
  data.cacheTime = new Date().getTime();
  try {
    storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    storage.set(STORE_KEY, JSON.stringify({}));
  }
};

export const getXcloudData = (): any => {
  let data = storage.getString(STORE_KEY);
  if (!data) {
    return null;
  }
  try {
    const _data = JSON.parse(data) as any;
    return _data;
  } catch {
    return null;
  }
};

export const clearXcloudData = () => {
  storage.set(STORE_KEY, JSON.stringify({}));
};

export const isxCloudDataValid = (data: any) => {
  if (!data) {
    return false;
  }
  const {cacheTime} = data;

  if (!cacheTime) {
    return false;
  }

  // Cache 7 days
  return new Date().getTime() - cacheTime < 7 * 24 * 60 * 1000;
};
