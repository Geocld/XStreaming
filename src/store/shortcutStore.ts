import {storage} from './mmkv';
import {getXcloudData} from './xcloudStore';

const STORE_KEY = 'user.titleShortcuts';

const normalizeId = (value: any) => {
  return typeof value === 'string' ? value.trim() : '';
};

export const getTitleProductId = (titleItem: any) => {
  return normalizeId(
    titleItem?.productId || titleItem?.ProductId || titleItem?.ProductID,
  );
};

export const getTitleStreamingId = (titleItem: any) => {
  return normalizeId(titleItem?.titleId || titleItem?.XCloudTitleId);
};

const readShortcutTitleMap = () => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return {};
  }

  try {
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
};

export const saveTitleShortcutSnapshot = (titleItem: any) => {
  const productId = getTitleProductId(titleItem);
  if (!productId) {
    return;
  }

  const titleMap = readShortcutTitleMap();
  titleMap[productId] = titleItem;
  titleMap[productId.toUpperCase()] = titleItem;
  storage.set(STORE_KEY, JSON.stringify(titleMap));
};

const findTitleInMap = (titleMap: any, productId: string) => {
  if (!titleMap || !productId) {
    return null;
  }

  return titleMap[productId] || titleMap[productId.toUpperCase()] || null;
};

const findTitleInList = (titles: any[], productId: string) => {
  if (!Array.isArray(titles) || !productId) {
    return null;
  }

  const upperProductId = productId.toUpperCase();
  return (
    titles.find(item => {
      const itemProductId = getTitleProductId(item);
      return itemProductId && itemProductId.toUpperCase() === upperProductId;
    }) || null
  );
};

export const findTitleByProductId = (productId: any) => {
  const safeProductId = normalizeId(productId);
  if (!safeProductId) {
    return null;
  }

  const cacheData = getXcloudData();
  const titleFromCache =
    findTitleInMap(cacheData?.titleMap, safeProductId) ||
    findTitleInList(cacheData?.titles, safeProductId);
  if (titleFromCache) {
    return titleFromCache;
  }

  const shortcutTitleMap = readShortcutTitleMap();
  return findTitleInMap(shortcutTitleMap, safeProductId);
};
