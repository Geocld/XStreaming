import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('consolesStore');

const STORE_KEY = 'user.consoles';

// Sample
// const data = {
//   consoles: [],
//   cacheTime: 1755052925902
// };

export const saveConsolesData = (data: any) => {
  log.info('saveConsolesData:', data);
  data.cacheTime = new Date().getTime();
  try {
    storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    storage.set(STORE_KEY, JSON.stringify({}));
  }
};

export const getConsolesData = (): any => {
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

export const clearConsolesData = () => {
  storage.set(STORE_KEY, JSON.stringify({}));
};

export const isConsolesDataValid = (data: any) => {
  if (!data) {
    return false;
  }
  const {cacheTime} = data;

  if (!cacheTime) {
    return false;
  }

  // Cache 15 days
  return new Date().getTime() - cacheTime < 15 * 24 * 60 * 1000;
};
