import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('xcloudStore');

const STORE_KEY = 'user.xcloud';

// Sample
// const data = {
//   titles: [],
//   titleMap: {},
//   newTitles: [],
//   recentTitles: [],
//   starTitles: [],
//   cacheTime: 1755052925902
// };

export const saveXcloudData = (data: any) => {
  log.info('saveXcloudData');
  if (!data) {
    return;
  }
  const toSave = Object.assign({}, data);
  toSave.cacheTime = new Date().getTime();
  if (toSave.titleMap) {
    delete toSave.titleMap;
  }
  try {
    storage.set(STORE_KEY, JSON.stringify(toSave));
  } catch (e) {
    log.info('saveXcloudData error:', e);
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
  const starTitles = getXcloudData()?.starTitles || [];
  storage.set(STORE_KEY, JSON.stringify({starTitles}));
};

export const isxCloudDataValid = (data: any) => {
  if (!data || !Array.isArray(data.titles) || data.titles.length === 0) {
    return false;
  }
  const {cacheTime} = data;

  if (!cacheTime) {
    return false;
  }

  // Cache 15 days
  return new Date().getTime() - cacheTime < 15 * 24 * 60 * 1000;
};
