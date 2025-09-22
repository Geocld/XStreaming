import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('serverStore');

const STORE_KEY = 'user.turnServers';

export const saveServerData = (data: any) => {
  log.info('saveServerData:', data);
  try {
    storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    storage.set(STORE_KEY, JSON.stringify({}));
  }
};

export const getServerData = (): any => {
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

export const clearServerData = () => {
  storage.set(STORE_KEY, JSON.stringify({}));
};
