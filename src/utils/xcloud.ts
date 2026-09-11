import axios from 'axios';

import TokenStore from '../xal/tokenstore';
import {getWebToken} from '../store/webTokenStore';
import {storage} from '../store/mmkv';
import {debugFactory} from './debug';

const log = debugFactory('XCloudUtils');

// Microsoft Xbox Cloud Gaming SIGL IDs from xbox.com/play
export const SIGL_GAME_PASS = 'af206485-e87d-4624-9007-cb7f6d0cc42e'; // AllGamePassGames
export const SIGL_RECENTLY_ADDED = '06323672-b8c8-43cc-b0de-32d5a9834749'; // Recently added
export const SIGL_UBISOFT_CLASSICS = '66ec875c-a391-44f5-9a54-a28bd6f976ce'; // Ubisoft+ Classics
export const SIGL_STREAM_YOUR_OWN = 'e4c1d680-2c70-45e4-a38d-8a292c68c700'; // Stream your own games
export const SIGL_LEAVING_SOON = '31ff2361-2772-4622-849b-f4f1abb4ad1b'; // Leaving soon

// Validator for Game Pass subscription titles (excludes F2P and buy-to-play games)
export const isGamePassSubscriptionTitle = (item: any): boolean => {
  if (!item) return false;
  const title = (item.ProductTitle || '').toLowerCase();

  // Exclude Free-to-Play titles
  const f2pTitles = [
    'fortnite',
    'warframe',
    'roblox',
    'destiny 2',
    'fall guys',
    'brawlhalla',
    'apex legends',
    'genshin',
    'zenless zone',
    'pubg',
  ];
  if (f2pTitles.some(kw => title.includes(kw))) {
    return false;
  }

  // Exclude Buy-to-Play titles
  const nonSubscriptionTitles = [
    'cyberpunk',
    'witcher 3',
    'hogwarts legacy',
    "baldur's gate 3",
    'grand theft auto v',
    'gta v',
    'red dead redemption',
    'nba 2k',
    'dying light 2',
    'elden ring',
    'star wars outlaws',
    'avatar: frontiers',
    'final fantasy xvi',
    'final fantasy vii',
    'dragons dogma 2',
    'suicide squad',
    'mortal kombat 1',
    'call of duty: modern warfare iii',
    'call of duty: modern warfare ii',
    'warhammer 40,000: space marine 2',
    'space marine 2',
    'black myth',
  ];
  if (nonSubscriptionTitles.some(kw => title.includes(kw))) {
    return false;
  }

  // Verify entitlement program if present
  const progs = item.details?.programs || [];
  const userProgs = item.details?.userPrograms || [];
  const userSubs = item.details?.userSubscriptions || [];
  const allPrograms = [...progs, ...userProgs, ...userSubs].map((p: string) =>
    String(p).toUpperCase(),
  );
  if (allPrograms.length > 0) {
    const hasGpProgram = allPrograms.some(
      p =>
        p.includes('GP') ||
        p.includes('GAMEPASS') ||
        p.includes('ULTIMATE') ||
        p.includes('PREMIUM') ||
        p.includes('ESSENTIAL') ||
        p.includes('STANDARD') ||
        p.includes('CORE') ||
        p.includes('EA'),
    );
    if (!hasGpProgram) {
      return false;
    }
  }

  return true;
};

// Validator for authentic Ubisoft+ Classic titles
export const isUbisoftTitle = (item: any): boolean => {
  if (!item) return false;
  const title = (item.ProductTitle || '').toLowerCase();
  if (title.includes('shadows')) {
    return false;
  }
  const pub = (item.PublisherName || '').toLowerCase();
  const dev = (item.DeveloperName || '').toLowerCase();
  return (
    pub.includes('ubisoft') ||
    dev.includes('ubisoft') ||
    title.includes("assassin's creed") ||
    title.includes('far cry') ||
    title.includes('rainbow six') ||
    title.includes('watch dogs') ||
    title.includes('immortals fenyx') ||
    title.includes('for honor') ||
    title.includes('ghost recon') ||
    title.includes('the division') ||
    title.includes('the crew') ||
    title.includes('prince of persia') ||
    title.includes('riders republic') ||
    title.includes('skull and bones') ||
    title.includes('rayman') ||
    title.includes('steep') ||
    title.includes('transference')
  );
};

// Fetch titles from Microsoft SIGL endpoint and match with active cloud title map
export const fetchSiglTitles = async (
  siglId: string,
  titleMap: Record<string, any>,
  filterFn?: (item: any) => boolean,
): Promise<any[]> => {
  try {
    const res = await axios.get(
      `https://catalog.gamepass.com/sigls/v2?id=${siglId}&market=US&language=en-US`,
      {timeout: 10000},
    );
    if (Array.isArray(res.data)) {
      const list: any[] = [];
      const seen = new Set<string>();
      res.data.forEach((item: any) => {
        if (!item?.id) return;
        const matched =
          titleMap[item.id] ||
          titleMap[item.id.toUpperCase()] ||
          titleMap[item.id.toLowerCase()];
        if (!matched) return;

        const key =
          matched.titleId || matched.XCloudTitleId || matched.productId;
        if (key && !seen.has(key)) {
          if (!filterFn || filterFn(matched)) {
            seen.add(key);
            list.push(matched);
          }
        }
      });
      return list;
    }
  } catch (e) {
    log.info(`fetchSiglTitles error for sigl ${siglId}:`, e);
  }
  return [];
};

// Region metadata display helper
export const getRegionDisplayInfo = (regionName: string) => {
  if (!regionName) return {flag: '🌐', code: 'AUTO', name: 'Auto'};
  const lower = regionName.toLowerCase();
  if (lower.includes('koreacentral') || lower.includes('korea')) {
    return {flag: '🇰🇷', code: 'KOR', name: 'Korea Central'};
  }
  if (lower.includes('japaneast') || lower.includes('japan')) {
    return {flag: '🇯🇵', code: 'JPN', name: 'Japan East'};
  }
  if (lower.includes('australiaeast') || lower.includes('australia')) {
    return {flag: '🇦🇺', code: 'AUS', name: 'Australia East'};
  }
  if (lower.includes('southeastasia') || lower.includes('singapore')) {
    return {flag: '🇸🇬', code: 'SGP', name: 'Southeast Asia'};
  }
  if (lower.includes('westus2') || lower.includes('westus')) {
    return {flag: '🇺🇸', code: 'USW', name: 'West US'};
  }
  if (lower.includes('eastus2') || lower.includes('eastus')) {
    return {flag: '🇺🇸', code: 'USE', name: 'East US'};
  }
  if (lower.includes('southcentralus')) {
    return {flag: '🇺🇸', code: 'USSC', name: 'South Central US'};
  }
  if (lower.includes('northcentralus')) {
    return {flag: '🇺🇸', code: 'USNC', name: 'North Central US'};
  }
  if (lower.includes('westeurope')) {
    return {flag: '🇪🇺', code: 'EUW', name: 'West Europe'};
  }
  if (lower.includes('northeurope')) {
    return {flag: '🇪🇺', code: 'EUN', name: 'North Europe'};
  }
  if (lower.includes('brazilsouth') || lower.includes('brazil')) {
    return {flag: '🇧🇷', code: 'BRA', name: 'Brazil South'};
  }
  if (lower.includes('india') || lower.includes('centralindia')) {
    return {flag: '🇮🇳', code: 'IND', name: 'India'};
  }
  if (lower.includes('chile')) {
    return {flag: '🇨🇱', code: 'CHL', name: 'Chile Central'};
  }
  if (lower.includes('mexico')) {
    return {flag: '🇲🇽', code: 'MEX', name: 'Mexico Central'};
  }
  if (lower.includes('uk') || lower.includes('unitedkingdom')) {
    return {flag: '🇬🇧', code: 'UK', name: 'United Kingdom'};
  }
  return {
    flag: '🌐',
    code: regionName.slice(0, 4).toUpperCase(),
    name: regionName,
  };
};

// Account tier detector from cloud titles (Free, Essential, Premium, Ultimate)
export const detectAccountTier = (
  titleResults: any[],
  xCloudToken?: any,
): string => {
  const offering =
    xCloudToken?.getOffering?.() ||
    xCloudToken?.offering ||
    (xCloudToken?.getDefaultRegion?.()?.baseUri?.includes('xgpuwebf2p')
      ? 'xgpuwebf2p'
      : undefined) ||
    (xCloudToken?.data?.offeringSettings?.regions?.some?.((r: any) =>
      r.baseUri?.includes('xgpuwebf2p'),
    )
      ? 'xgpuwebf2p'
      : undefined) ||
    (xCloudToken?.data?.offeringSettings?.regions?.some?.((r: any) =>
      r.baseUri?.includes('xgpuweb'),
    )
      ? 'xgpuweb'
      : undefined);

  // If token is explicitly free-to-play, user has no active Game Pass subscription
  if (offering === 'xgpuwebf2p') {
    return 'Free';
  }

  if (!Array.isArray(titleResults) || titleResults.length === 0) {
    return offering === 'xgpuweb' ? 'Ultimate' : 'Free';
  }

  let detected = 'Free';
  let hasActiveSubscription = false;

  for (const item of titleResults) {
    const rawSubs =
      item.details?.userSubscriptions || item.userSubscriptions || [];
    const rawProgs = item.details?.userPrograms || item.userPrograms || [];

    const subs = (Array.isArray(rawSubs) ? rawSubs : [rawSubs]).map((s: any) =>
      String(s || '').toUpperCase(),
    );
    const progs = (Array.isArray(rawProgs) ? rawProgs : [rawProgs]).map(
      (p: any) => String(p || '').toUpperCase(),
    );

    const all = [...subs, ...progs];

    if (
      all.some(
        s =>
          s.includes('ULTIMATE') ||
          s === 'XGPU' ||
          s === 'GPULTIMATE' ||
          s === 'XGPULTIMATE',
      )
    ) {
      return 'Ultimate';
    }

    if (
      all.some(
        s =>
          s.includes('PREMIUM') ||
          s.includes('STANDARD') ||
          s === 'GPPREMIUM' ||
          s === 'XGPPREMIUM' ||
          s === 'GPSTANDARD' ||
          s === 'XGPSTANDARD',
      )
    ) {
      detected = 'Premium';
      hasActiveSubscription = true;
    } else if (
      !hasActiveSubscription &&
      all.some(
        s =>
          s.includes('ESSENTIAL') ||
          s.includes('CORE') ||
          s === 'GPESSENTIAL' ||
          s === 'XGPESSENTIAL' ||
          s === 'GPCORE' ||
          s === 'XGPCORE',
      )
    ) {
      detected = 'Essential';
      hasActiveSubscription = true;
    }
  }

  if (!hasActiveSubscription) {
    if (offering === 'xgpuweb') {
      return 'Ultimate';
    }
    return 'Free';
  }

  return detected;
};

// Build fast lookup map for product and title IDs
export const buildTitleLookupMap = (items: any[]): Record<string, any> => {
  const map: Record<string, any> = {};
  items.forEach((item: any) => {
    if (item.productId) {
      map[item.productId] = item;
      map[item.productId.toUpperCase()] = item;
      map[item.productId.toLowerCase()] = item;
    }
    if (item.details?.productId) {
      map[item.details.productId] = item;
      map[item.details.productId.toUpperCase()] = item;
      map[item.details.productId.toLowerCase()] = item;
    }
    if (item.titleId) {
      map[item.titleId] = item;
      map[item.titleId.toUpperCase()] = item;
    }
    if (item.XCloudTitleId) {
      map[item.XCloudTitleId] = item;
      map[item.XCloudTitleId.toUpperCase()] = item;
    }
  });
  return map;
};

// Resolve Xbox gamertag across tokens and cache
export const resolveXboxGamertag = (
  fetchedGamertag: string,
  profile: any,
  webToken: any,
  streamingTokens: any,
): string => {
  if (fetchedGamertag) return fetchedGamertag;
  if (profile?.Gamertag) return profile.Gamertag;
  if (profile?.gamertag) return profile.gamertag;

  const cachedGtg = storage.getString('user.gamertag');
  if (cachedGtg) return cachedGtg;

  const curWebToken = webToken?.data ? webToken : getWebToken();
  const webGtg = curWebToken?.data?.DisplayClaims?.xui?.[0]?.gtg;
  if (webGtg) return webGtg;

  try {
    const tokenStore = new TokenStore();
    tokenStore.load();
    const sisu = tokenStore.getSisuToken();
    const sisuGtg =
      sisu?.getGamertag?.() ||
      sisu?.data?.AuthorizationToken?.DisplayClaims?.xui?.[0]?.gtg;
    if (sisuGtg) return sisuGtg;
  } catch {}

  if (streamingTokens?.xHomeToken?.getGamertag) {
    const gt = streamingTokens.xHomeToken.getGamertag();
    if (gt) return gt;
  }
  if (streamingTokens?.xCloudToken?.getGamertag) {
    const gt = streamingTokens.xCloudToken.getGamertag();
    if (gt) return gt;
  }

  return 'Xbox Gamer';
};
