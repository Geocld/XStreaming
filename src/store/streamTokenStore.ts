import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('streamTokenStore');

const STORE_KEY = 'user.streamToken';

export const saveStreamToken = (token: any) => {
  log.info('saveStreamToken:', token);
  try {
    storage.set(STORE_KEY, JSON.stringify(token));
  } catch (e) {
    storage.set(STORE_KEY, JSON.stringify({}));
  }
};

export const getStreamToken = (): any => {
  let token = storage.getString(STORE_KEY);
  if (!token) {
    return null;
  }
  try {
    const _token = JSON.parse(token) as any;
    return _token;
  } catch {
    return null;
  }
};

export const clearStreamToken = () => {
  storage.set(STORE_KEY, JSON.stringify({}));
};

export const isStreamTokenValid = (token: any) => {
  if (!token) {
    return false;
  }
  const {data, _objectCreateTime} = token;
  if (!data || !data.durationInSeconds) {
    return false;
  }
  return (
    _objectCreateTime + data.durationInSeconds * 1000 - new Date().getTime() >
    60 * 1000
  );
};
