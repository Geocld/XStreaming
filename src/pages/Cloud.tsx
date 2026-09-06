import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  Platform,
  Pressable,
  useWindowDimensions,
  StatusBar,
  Image,
  ToastAndroid,
  ScrollView,
} from 'react-native';
import {Text, Portal, Modal, Card, Icon, Button} from 'react-native-paper';
import axios from 'axios';
import Spinner from '../components/Spinner';
import {useSelector, useDispatch} from 'react-redux';
import XStreamingGameCard from '../components/XStreamingGameCard';
import XboxLogo from '../components/XboxLogo';
import XcloudApi from '../xCloud';
import Empty from '../components/Empty';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import {
  getXcloudData,
  saveXcloudData,
  isxCloudDataValid,
} from '../store/xcloudStore';
import {getSettings, saveSettings} from '../store/settingStore';
import {getWebToken, isWebTokenValid} from '../store/webTokenStore';
import {storage} from '../store/mmkv';
import TokenStore from '../xal/tokenstore';
import WebApi from '../web';
import {syncRegionSettings, getRegionIpForCloudName} from '../utils/regionSync';
import {NativeModules} from 'react-native';

const {UsbRumbleManager, FullScreenManager} = NativeModules;
const log = debugFactory('CloudScreen');

const warnTitles: any = [];
const webviewTitles: any = [];

// Official Microsoft Xbox Cloud Gaming SIGL IDs (reverse-engineered from xbox.com/play)
const SIGL_GAME_PASS = 'af206485-e87d-4624-9007-cb7f6d0cc42e'; // Play with Game Pass (AllGamePassGames)
const SIGL_RECENTLY_ADDED = '06323672-b8c8-43cc-b0de-32d5a9834749'; // Recently added
const SIGL_UBISOFT_CLASSICS = '66ec875c-a391-44f5-9a54-a28bd6f976ce'; // Ubisoft+ Classics (Nakatomi)
const SIGL_STREAM_YOUR_OWN = 'e4c1d680-2c70-45e4-a38d-8a292c68c700'; // Stream your own games (FresnoSYOG)
const SIGL_LEAVING_SOON = '31ff2361-2772-4622-849b-f4f1abb4ad1b'; // Leaving soon

// Strict validator for authentic Game Pass subscription titles (excludes Free-to-Play like Fortnite and Buy-to-play / owned games like Cyberpunk, GTA, etc.)
const isGamePassSubscriptionTitle = (item: any): boolean => {
  if (!item) return false;
  const title = (item.ProductTitle || '').toLowerCase();

  // Exclude Free-to-Play games that do not require Game Pass
  if (
    title.includes('fortnite') ||
    title.includes('warframe') ||
    title.includes('roblox') ||
    title.includes('destiny 2') ||
    title.includes('fall guys') ||
    title.includes('brawlhalla') ||
    title.includes('apex legends') ||
    title.includes('genshin') ||
    title.includes('zenless zone') ||
    title.includes('pubg')
  ) {
    return false;
  }

  // Exclude Buy-to-play / owned-only games (Stream Your Own Games)
  const nonGamePassKeywords = [
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
  if (nonGamePassKeywords.some(kw => title.includes(kw))) {
    return false;
  }

  // If item details explicitly list programs, ensure it has a Game Pass / EA Play program
  const progs = item.details?.programs || [];
  const userProgs = item.details?.userPrograms || [];
  const userSubs = item.details?.userSubscriptions || [];
  const allPrograms = [...progs, ...userProgs, ...userSubs].map((p: string) =>
    String(p).toUpperCase(),
  );
  if (allPrograms.length > 0) {
    const hasGp = allPrograms.some(
      p =>
        p.includes('GP') ||
        p.includes('GAMEPASS') ||
        p.includes('ULTIMATE') ||
        p.includes('CORE') ||
        p.includes('STANDARD') ||
        p.includes('EA'),
    );
    if (!hasGp) {
      return false;
    }
  }

  return true;
};

// Strict validator for authentic Ubisoft+ Classic games (strictly excludes unreleased games like Assassin's Creed Shadows)
const isUbisoftTitle = (item: any): boolean => {
  if (!item) return false;
  const title = (item.ProductTitle || '').toLowerCase();
  // Specifically exclude Assassin's Creed Shadows
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

// Fetch products from official Microsoft catalog SIGL endpoint and match with active cloud title map
const fetchSiglTitles = async (
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
        if (item.id) {
          const matched =
            titleMap[item.id] ||
            titleMap[item.id.toUpperCase()] ||
            titleMap[item.id.toLowerCase()];
          if (matched) {
            const key =
              matched.titleId || matched.XCloudTitleId || matched.productId;
            if (key && !seen.has(key)) {
              if (!filterFn || filterFn(matched)) {
                seen.add(key);
                list.push(matched);
              }
            }
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

const getRegionDisplayInfo = (regionName: string) => {
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

function CloudScreen({navigation, route}: any) {
  const {t, i18n} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();

  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);
  const starTitles = useSelector((state: any) => state.stars || []);
  const profile = useSelector((state: any) => state.profile);

  const currentLanguage = i18n.language;

  const [loading, setLoading] = React.useState(false);
  const [loadmoring, setLoadmoring] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [showToturial, setShowToturial] = React.useState(false);
  const [titles, setTitles] = React.useState<any[]>([]);
  const [newTitles, setNewTitles] = React.useState<any[]>([]);
  const [_titlesMap, setTitlesMap] = React.useState<Record<string, any>>({});
  const [recentTitles, setRecentTitles] = React.useState<any[]>([]);
  const [leavingSoonTitles, setLeavingSoonTitles] = React.useState<any[]>([]);
  const [playWithGamePassTitlesState, setPlayWithGamePassTitlesState] = React.useState<any[]>([]);
  const [ubisoftTitlesState, setUbisoftTitlesState] = React.useState<any[]>([]);
  const [streamYourOwnTitlesState, setStreamYourOwnTitlesState] = React.useState<any[]>([]);
  const [keyword, setKeyword] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);

  // Dynamic Gamertag State
  const [fetchedGamertag, setFetchedGamertag] = React.useState<string>(() => {
    return storage.getString('user.gamertag') || '';
  });

  // Dynamic Gamerpic State (Xbox profile picture)
  const [gamerpic, setGamerpic] = React.useState<string>(() => {
    return storage.getString('user.gamerpic') || '';
  });

  // Real Account Tier (auto-detected, non-modifiable)
  const [accountTier, setAccountTier] = React.useState<string>(() => {
    return storage.getString('user.account_tier') || '';
  });

  // Server Region State
  const [currentRegionName, setCurrentRegionName] = React.useState<string>(() => {
    const settings = getSettings();
    return settings.signaling_cloud_name || '';
  });
  const [showRegionModal, setShowRegionModal] = React.useState(false);

  // Navigation & Filter states: 'library' (all games), 'favorites' (starred games)
  const [activeBottomTab, setActiveBottomTab] = React.useState<'library' | 'favorites'>('library');
  const [sortBy, setSortBy] = React.useState<'relevance' | 'az' | 'za' | 'newest'>('relevance');
  const [filterCategory, setFilterCategory] = React.useState<
    'all' | 'play_gamepass' | 'new' | 'ubisoft' | 'own' | 'leaving' | 'recent' | 'favorites'
  >('all');
  const [showSortModal, setShowSortModal] = React.useState(false);
  const [showFilterModal, setShowFilterModal] = React.useState(false);

  // USB warning state
  const [showUsbWarnModal, setShowUsbWarnModal] = React.useState(false);
  const [pendingLaunchTitle, setPendingLaunchTitle] = React.useState<any>(null);

  const flatListRef = React.useRef<any>(null);
  const isFetchGame = React.useRef(false);

  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;

  // Floating bottom navigation bar layout calculations
  const bottomBarWidth = isLandscape
    ? Math.min(480, screenWidth - 64)
    : screenWidth - 32;
  const bottomBarLeft = (screenWidth - bottomBarWidth) / 2;
  const bottomBarBottom = isLandscape ? 28 : (Platform.OS === 'android' ? 14 : 24);
  const bottomBarHeight = isLandscape ? 56 : 64;
  const bottomBarRadius = isLandscape ? 28 : 32;

  // Unified padding constant across the entire screen for pixel-perfect left alignment
  const PADDING_H = isLargeScreen ? 20 : 14;
  const GAP = 10;
  const numColumns = React.useMemo(() => {
    if (isLargeScreen) {
      return Math.max(4, Math.min(8, Math.floor(screenWidth / 135)));
    }
    return 3;
  }, [isLargeScreen, screenWidth]);

  const cardWidth = React.useMemo(() => {
    return Math.floor(
      (screenWidth - PADDING_H * 2 - GAP * (numColumns - 1)) / numColumns,
    );
  }, [screenWidth, PADDING_H, GAP, numColumns]);

  const cardHeight = React.useMemo(() => {
    return Math.round(cardWidth * 1.38);
  }, [cardWidth]);

  const horizontalCardWidth = isLargeScreen ? 140 : 124;
  const horizontalCardHeight = Math.round(horizontalCardWidth * 1.38);
  const pageSize = isLargeScreen ? 36 : 24;

  // Resolve Real Xbox Gamertag
  const gamertag = React.useMemo(() => {
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
  }, [fetchedGamertag, profile, webToken, streamingTokens]);

  // Subscription Tier Display (detected purely from account)
  const displayTier = React.useMemo(() => {
    if (accountTier) return accountTier;
    return streamingTokens?.xCloudToken ? 'Ultimate' : 'FREE';
  }, [accountTier, streamingTokens.xCloudToken]);

  // Available xCloud server regions
  const availableRegions = React.useMemo(() => {
    const tokenRegions = streamingTokens?.xCloudToken?.getRegions?.() || [];
    if (tokenRegions.length > 0) {
      return tokenRegions;
    }
    return [
      {name: 'KoreaCentral', isDefault: true},
      {name: 'JapanEast', isDefault: false},
      {name: 'SoutheastAsia', isDefault: false},
      {name: 'AustraliaEast', isDefault: false},
      {name: 'WestUS2', isDefault: false},
      {name: 'EastUS', isDefault: false},
      {name: 'WestEurope', isDefault: false},
      {name: 'NorthEurope', isDefault: false},
      {name: 'BrazilSouth', isDefault: false},
    ];
  }, [streamingTokens]);

  // Active region info
  const currentRegionInfo = React.useMemo(() => {
    if (currentRegionName) {
      return getRegionDisplayInfo(currentRegionName);
    }
    const def = streamingTokens?.xCloudToken?.getDefaultRegion?.();
    if (def?.name) {
      return getRegionDisplayInfo(def.name);
    }
    return getRegionDisplayInfo('KoreaCentral');
  }, [currentRegionName, streamingTokens]);

  // 1. Play with Game Pass (Official AllGamePassGames SIGL from xbox.com/play - strictly subscription titles only)
  const playWithGamePassTitles = React.useMemo(() => {
    if (playWithGamePassTitlesState.length > 0) {
      return playWithGamePassTitlesState.filter(isGamePassSubscriptionTitle);
    }
    if (titles.length === 0) return [];
    return titles.filter(isGamePassSubscriptionTitle).slice(0, 30);
  }, [playWithGamePassTitlesState, titles]);

  // 2. Ubisoft+ Classic Collection (Official Nakatomi SIGL from xbox.com/play - strictly excluding Assassin's Creed Shadows)
  const ubisoftTitles = React.useMemo(() => {
    if (ubisoftTitlesState.length > 0) {
      return ubisoftTitlesState.filter(isUbisoftTitle);
    }
    return titles.filter(isUbisoftTitle);
  }, [ubisoftTitlesState, titles]);

  // 3. Stream your own game (Official FresnoSYOG SIGL from xbox.com/play)
  const streamYourOwnTitles = React.useMemo(() => {
    if (streamYourOwnTitlesState.length > 0) {
      return streamYourOwnTitlesState;
    }
    const ownedKeywords = [
      'cyberpunk', 'witcher', 'hogwarts', "baldur's gate",
      'grand theft auto', 'gta', 'red dead', 'nba 2k', 'call of duty',
      'final fantasy', 'dying light', 'star wars outlaws', 'avatar',
      'elden ring', 'warhammer', 'mortal kombat', 'destiny',
    ];
    const found = titles.filter(item => {
      const title = (item.ProductTitle || '').toLowerCase();
      const details = item.details || {};
      return (
        details.isFreeInStore ||
        details.hasEntitlement ||
        ownedKeywords.some(kw => title.includes(kw))
      );
    });
    return found.length >= 4 ? found : titles.slice(8, 22);
  }, [streamYourOwnTitlesState, titles]);

  // 4. Leaving soon titles (Official CloudLeavingSoon SIGL from xbox.com/play)
  const leavingSoonList = React.useMemo(() => {
    if (leavingSoonTitles.length > 0) return leavingSoonTitles;
    return titles.length > 15 ? titles.slice(titles.length - 12) : [];
  }, [leavingSoonTitles, titles]);

  // Fetch games & live user profile
  React.useEffect(() => {
    if (typeof route.params?.keyword === 'string') {
      setKeyword(route.params.keyword);
    }
    if (!streamingTokens.xCloudToken) {
      setIsLimited(true);
    }

    // Fetch user profile from WebApi if available to guarantee real gamertag and gamerpic
    const curWebToken = webToken?.data ? webToken : getWebToken();
    if (curWebToken && isWebTokenValid(curWebToken)) {
      try {
        const webApi = new WebApi(curWebToken);
        webApi
          .getUserProfile()
          .then((res: any) => {
            if (res?.Gamertag) {
              setFetchedGamertag(res.Gamertag);
              storage.set('user.gamertag', res.Gamertag);
            }
            if (res?.GameDisplayPicRaw) {
              setGamerpic(res.GameDisplayPicRaw);
              storage.set('user.gamerpic', res.GameDisplayPicRaw);
            }
            dispatch({type: 'SET_PROFILE', payload: res});
          })
          .catch(err => {
            log.info('getUserProfile error:', err);
          });
      } catch (e) {
        log.info('WebApi init error:', e);
      }
    }

    const fetchGames = (silent = false) => {
      if (silent) {
        log.info('Fetch games silent');
      }
      if (streamingTokens.xCloudToken) {
        const _xCloudApi = new XcloudApi(
          streamingTokens.xCloudToken.getDefaultRegion().baseUri,
          streamingTokens.xCloudToken.data.gsToken,
          'cloud',
        );

        !silent && setLoading(true);
        _xCloudApi.getTitles().then((res: any) => {
          if (res.results && res.results.length > 0) {
            // Auto-detect authentic account subscription tier
            let detected = streamingTokens.xCloudToken ? 'Ultimate' : 'FREE';
            for (const item of res.results) {
              const subs = item.details?.userSubscriptions || [];
              const progs = item.details?.userPrograms || [];
              if (subs.includes('XGPULTIMATE') || progs.includes('GPULTIMATE')) {
                detected = 'Ultimate';
                break;
              } else if (subs.includes('XGPCORE') || progs.includes('GPCORE')) {
                detected = 'Core';
              } else if (subs.includes('XGPSTANDARD') || progs.includes('GPSTANDARD')) {
                detected = 'Standard';
              }
            }
            setAccountTier(detected);
            storage.set('user.account_tier', detected);

            _xCloudApi.getGamePassProducts(res.results).then((_titles: any) => {
              setTitles(_titles);

              const _titleMap: Record<string, any> = {};
              _titles.forEach((item: any) => {
                if (item.productId) {
                  _titleMap[item.productId] = item;
                  _titleMap[item.productId.toUpperCase()] = item;
                  _titleMap[item.productId.toLowerCase()] = item;
                }
                if (item.details?.productId) {
                  _titleMap[item.details.productId] = item;
                  _titleMap[item.details.productId.toUpperCase()] = item;
                  _titleMap[item.details.productId.toLowerCase()] = item;
                }
                if (item.titleId) {
                  _titleMap[item.titleId] = item;
                  _titleMap[item.titleId.toUpperCase()] = item;
                }
                if (item.XCloudTitleId) {
                  _titleMap[item.XCloudTitleId] = item;
                  _titleMap[item.XCloudTitleId.toUpperCase()] = item;
                }
              });
              setTitlesMap(_titleMap);

              // Concurrently fetch all official Microsoft Xbox Cloud Gaming channels directly from catalog endpoints
              Promise.allSettled([
                fetchSiglTitles(SIGL_GAME_PASS, _titleMap, isGamePassSubscriptionTitle),
                fetchSiglTitles(SIGL_RECENTLY_ADDED, _titleMap),
                fetchSiglTitles(SIGL_UBISOFT_CLASSICS, _titleMap, isUbisoftTitle),
                fetchSiglTitles(SIGL_STREAM_YOUR_OWN, _titleMap),
                fetchSiglTitles(SIGL_LEAVING_SOON, _titleMap),
                _xCloudApi.getRecentTitles(),
              ]).then(([popRes, newRes, ubiRes, ownRes, leaveRes, recentRes]) => {
                const _popTitles = (
                  popRes.status === 'fulfilled' ? popRes.value : []
                ).filter(isGamePassSubscriptionTitle);
                const _newTitles =
                  newRes.status === 'fulfilled' ? newRes.value : [];
                const _ubiTitles = (
                  ubiRes.status === 'fulfilled' ? ubiRes.value : []
                ).filter(isUbisoftTitle);
                const _ownTitles =
                  ownRes.status === 'fulfilled' ? ownRes.value : [];
                const _leaveTitles =
                  leaveRes.status === 'fulfilled' ? leaveRes.value : [];

                if (_popTitles.length > 0) {
                  setPlayWithGamePassTitlesState(_popTitles);
                }
                if (_newTitles.length > 0) {
                  setNewTitles(_newTitles);
                }
                if (_ubiTitles.length > 0) {
                  setUbisoftTitlesState(_ubiTitles);
                }
                if (_ownTitles.length > 0) {
                  setStreamYourOwnTitlesState(_ownTitles);
                }
                if (_leaveTitles.length > 0) {
                  setLeavingSoonTitles(_leaveTitles);
                }

                const _recentTitles: any[] = [];
                if (recentRes.status === 'fulfilled' && recentRes.value?.results) {
                  recentRes.value.results.forEach((item: any) => {
                    const pid = item.details?.productId;
                    if (pid && (_titleMap[pid] || _titleMap[pid.toUpperCase()])) {
                      _recentTitles.push(
                        _titleMap[pid] || _titleMap[pid.toUpperCase()],
                      );
                    }
                  });
                  setRecentTitles(_recentTitles);
                }

                setLoading(false);
                isFetchGame.current = true;

                // Update cache with all official Microsoft channels
                const cacheData = getXcloudData();
                saveXcloudData({
                  ...cacheData,
                  titles: _titles,
                  titleMap: _titleMap,
                  playWithGamePassTitles: _popTitles,
                  newTitles: _newTitles,
                  ubisoftTitles: _ubiTitles,
                  streamYourOwnTitles: _ownTitles,
                  leavingSoonTitles: _leaveTitles,
                  recentTitles: _recentTitles,
                });
              });
            });
          }
        });
      }
    };

    if (!isFetchGame.current) {
      const cacheData = getXcloudData();
      if (cacheData && isxCloudDataValid(cacheData)) {
        log.info('Get xcloud data from cache');
        const {
          titles: _titles,
          titleMap: _titleMap,
          newTitles: _newTitles,
          starTitles: _starTitles,
          recentTitles: _recentTitles,
          playWithGamePassTitles: _playWithGamePassTitles,
          ubisoftTitles: _ubisoftTitles,
          streamYourOwnTitles: _streamYourOwnTitles,
          leavingSoonTitles: _leavingSoonTitles,
        } = cacheData;

        setTitles(_titles || []);
        setTitlesMap(_titleMap || {});
        setNewTitles(_newTitles || []);
        setRecentTitles(_recentTitles || []);
        if (_playWithGamePassTitles) {
          setPlayWithGamePassTitlesState(
            _playWithGamePassTitles.filter(isGamePassSubscriptionTitle),
          );
        }
        if (_ubisoftTitles) {
          setUbisoftTitlesState(_ubisoftTitles.filter(isUbisoftTitle));
        }
        if (_streamYourOwnTitles) {
          setStreamYourOwnTitlesState(_streamYourOwnTitles);
        }
        if (_leavingSoonTitles) {
          setLeavingSoonTitles(_leavingSoonTitles);
        }

        dispatch({
          type: 'SET_STARS',
          payload: _starTitles || [],
        });

        fetchGames(true);
      } else {
        fetchGames();
      }
    }
  }, [route.params?.keyword, streamingTokens.xCloudToken, webToken, navigation, dispatch]);

  const handleViewDetail = (titleItem: any) => {
    navigation.navigate('TitleDetail', {titleItem});
  };

  const handleOpenSearch = () => {
    navigation.navigate('Search', {keyword});
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  // Toggle favorite / star
  const handleToggleStar = (titleItem: any) => {
    if (!titleItem) return;
    const targetId = titleItem.XCloudTitleId || titleItem.titleId;
    if (!targetId) return;

    const cacheData = getXcloudData();
    const newStarTitles = starTitles.includes(targetId)
      ? starTitles.filter((id: string) => id !== targetId)
      : [...starTitles, targetId];

    dispatch({
      type: 'SET_STARS',
      payload: newStarTitles,
    });

    if (cacheData) {
      cacheData.starTitles = newStarTitles;
      saveXcloudData(cacheData);
    }
  };

  // Handle Server Region Selection: automatically syncs signaling_cloud_name & force_region_ip
  const handleSelectRegion = (regionName: string) => {
    const newSettings = syncRegionSettings(regionName, 'cloud');
    setCurrentRegionName(regionName);
    setShowRegionModal(false);
    if (Platform.OS === 'android') {
      const regionInfo = getRegionDisplayInfo(regionName);
      ToastAndroid.show(
        `${t('Saved')}: ${regionInfo.flag} ${regionInfo.name} (${newSettings.force_region_ip || 'Auto'})`,
        ToastAndroid.SHORT,
      );
    }
  };

  // Quick Direct Play
  const handleDirectPlay = async (titleItem: any) => {
    if (!titleItem) return;
    const settings = getSettings();
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    if (isUsbMode) {
      setPendingLaunchTitle(titleItem);
      setShowUsbWarnModal(true);
    } else {
      executeLaunchStream(titleItem);
    }
  };

  const executeLaunchStream = (titleItem: any) => {
    const settings = getSettings();
    const titleId = titleItem.titleId || titleItem.XCloudTitleId;
    if (!titleId) return;

    if (settings.render_engine === 'web' && FullScreenManager) {
      FullScreenManager.immersiveMode();
    }

    const isUsbMode = settings.bind_usb_device;
    const usbController = isUsbMode ? 1 : 0;
    const postUrl = `${streamingTokens.xCloudToken.getDefaultRegion().baseUri}/v5/sessions/cloud/play`;

    const streamPage =
      settings.render_engine === 'web'
        ? 'Stream'
        : settings.render_engine === 'native'
        ? 'NativeStream'
        : 'NanoStream';

    navigation.navigate(streamPage, {
      sessionId: titleId,
      settings,
      streamType: 'cloud',
      postUrl,
      isUsbMode,
      usbController,
    });
  };

  // Filtered and Sorted Titles
  const filteredTitles = React.useMemo(() => {
    let list: any[] = [];
    if (activeBottomTab === 'favorites' || filterCategory === 'favorites') {
      list = titles.filter(item => {
        const id = item.XCloudTitleId || item.titleId;
        return starTitles.includes(id);
      });
    } else if (filterCategory === 'recent') {
      list = recentTitles;
    } else if (filterCategory === 'new') {
      list = newTitles;
    } else if (filterCategory === 'play_gamepass') {
      list = playWithGamePassTitles;
    } else if (filterCategory === 'ubisoft') {
      list = ubisoftTitles;
    } else if (filterCategory === 'own') {
      list = streamYourOwnTitles;
    } else if (filterCategory === 'leaving') {
      list = leavingSoonList;
    } else {
      list = titles;
    }

    if (keyword.length > 0) {
      list = list.filter(item => {
        return item.ProductTitle?.toUpperCase().includes(keyword.toUpperCase());
      });
    }

    // Apply sorting
    if (sortBy === 'az') {
      list = [...list].sort((a, b) =>
        (a.ProductTitle || '').localeCompare(b.ProductTitle || ''),
      );
    } else if (sortBy === 'za') {
      list = [...list].sort((a, b) =>
        (b.ProductTitle || '').localeCompare(a.ProductTitle || ''),
      );
    } else if (sortBy === 'newest') {
      list = [...list].reverse();
    }

    return list;
  }, [
    titles,
    recentTitles,
    newTitles,
    playWithGamePassTitles,
    ubisoftTitles,
    streamYourOwnTitles,
    leavingSoonList,
    starTitles,
    activeBottomTab,
    filterCategory,
    keyword,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredTitles.length / pageSize);
  const endIdx = currentPage * pageSize;
  const pagedTitles = filteredTitles.slice(0, endIdx);

  const loadMoreData = () => {
    if (currentPage < totalPages) {
      setLoadmoring(true);
      setCurrentPage(prev => prev + 1);
      setTimeout(() => {
        setLoadmoring(false);
      }, 800);
    }
  };

  // Check if title is starred
  const isItemStarred = (item: any) => {
    const id = item.XCloudTitleId || item.titleId;
    return starTitles.includes(id);
  };

  const handleShowAll = (categoryKey: any) => {
    setFilterCategory(categoryKey);
    setActiveBottomTab('library');
    setCurrentPage(1);
    scrollToTop();
  };

  // Reusable horizontal carousel section with 10-item limit and "Tampilkan semua" button
  const renderCarouselSection = (
    title: string,
    data: any[],
    categoryKey: any,
    idPrefix: string,
  ) => {
    if (!data || data.length === 0) return null;
    const hasMoreThanTen = data.length > 10;
    const displayData = hasMoreThanTen ? data.slice(0, 10) : data;

    return (
      <View style={styles.carouselSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hasMoreThanTen && (
            <Pressable
              onPress={() => handleShowAll(categoryKey)}
              android_ripple={{color: 'rgba(46, 213, 115, 0.2)'}}
              style={({pressed}) => [
                styles.showAllHeaderButton,
                pressed && styles.showAllHeaderButtonPressed,
              ]}>
              <Text style={styles.showAllHeaderText}>{t('Tampilkan semua')}</Text>
              <Icon source="chevron-right" size={15} color="#2ed573" />
            </Pressable>
          )}
        </View>

        <FlatList
          horizontal
          data={displayData}
          keyExtractor={(item, index) =>
            `${idPrefix}_${item.titleId || item.XCloudTitleId || index}`
          }
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalListWrap}
          contentContainerStyle={styles.horizontalListContent}
          renderItem={({item}) => (
            <XStreamingGameCard
              titleItem={item}
              width={horizontalCardWidth}
              height={horizontalCardHeight}
              isStarred={isItemStarred(item)}
              onPress={handleViewDetail}
              onPlayPress={handleDirectPlay}
              onBookmarkPress={handleToggleStar}
              style={styles.horizontalCardMargin}
            />
          )}
          ListFooterComponent={() =>
            hasMoreThanTen ? (
              <Pressable
                onPress={() => handleShowAll(categoryKey)}
                android_ripple={{color: 'rgba(46, 213, 115, 0.2)'}}
                style={({pressed}) => [
                  styles.showAllCard,
                  {
                    width: horizontalCardWidth,
                    height: horizontalCardHeight,
                  },
                  pressed && styles.showAllCardPressed,
                ]}>
                <View style={styles.showAllIconCircle}>
                  <Icon source="arrow-right" size={24} color="#2ed573" />
                </View>
                <Text style={styles.showAllCardTitle}>{t('Tampilkan semua')}</Text>
                <Text style={styles.showAllCardSubtitle}>
                  {`+${data.length - 10} ${t('available')}`}
                </Text>
              </Pressable>
            ) : null
          }
        />
      </View>
    );
  };

  // Render Horizontal Channels based on Xbox Cloud Gaming on Xbox.com
  const renderCarouselsHeader = () => {
    if (activeBottomTab === 'favorites' || filterCategory !== 'all' || keyword.length > 0) {
      return null;
    }

    return (
      <View style={styles.carouselsContainer}>
        {/* 1. Jump back in (Terakhir dimainkan - if user has played games) */}
        {renderCarouselSection(t('Jump back in'), recentTitles, 'recent', 'recent')}

        {/* 2. Play with Game Pass (Game Pass subscription titles only) */}
        {renderCarouselSection(t('Play with Game Pass'), playWithGamePassTitles, 'play_gamepass', 'gp')}

        {/* 3. Recently Added */}
        {renderCarouselSection(t('Recently Added'), newTitles, 'new', 'new')}

        {/* 4. Ubisoft+ Classic */}
        {renderCarouselSection(t('Ubisoft+ Classic'), ubisoftTitles, 'ubisoft', 'ubi')}

        {/* 5. Stream your own game */}
        {renderCarouselSection(t('Stream your own game'), streamYourOwnTitles, 'own', 'own')}

        {/* 6. Leaving soon */}
        {renderCarouselSection(t('Leaving soon'), leavingSoonList, 'leaving', 'leave')}

        {/* 7. Tab "Semua" placed at the bottom, perfectly aligned flush with items above */}
        <View style={styles.catalogDividerHeader}>
          <Text style={styles.catalogSectionTitle}>{t('All')}</Text>
        </View>
      </View>
    );
  };

  // Render Sort Label
  const sortLabel = React.useMemo(() => {
    switch (sortBy) {
      case 'az':
        return 'Sort: A - Z';
      case 'za':
        return 'Sort: Z - A';
      case 'newest':
        return `Sort: ${t('Newest')}`;
      default:
        return t('Sort: Relevance');
    }
  }, [sortBy, t]);

  // Render Filter Label
  const filterLabel = React.useMemo(() => {
    switch (filterCategory) {
      case 'favorites':
        return t('Favorites');
      case 'new':
        return t('Recently Added');
      case 'play_gamepass':
        return t('Play with Game Pass');
      case 'ubisoft':
        return t('Ubisoft+ Classic');
      case 'own':
        return t('Stream your own game');
      case 'leaving':
        return t('Leaving soon');
      case 'recent':
        return t('Recently');
      default:
        return t('Filters');
    }
  }, [filterCategory, t]);

  // Bottom navigation tab click handlers
  const handleTabPress = (tab: 'library' | 'search' | 'favorites' | 'settings') => {
    if (tab === 'library') {
      setActiveBottomTab('library');
      setFilterCategory('all');
      setCurrentPage(1);
      scrollToTop();
    } else if (tab === 'search') {
      handleOpenSearch();
    } else if (tab === 'favorites') {
      setActiveBottomTab('favorites');
      setFilterCategory('favorites');
      setCurrentPage(1);
      scrollToTop();
    } else if (tab === 'settings') {
      navigation.navigate('Settings');
    }
  };

  // Footer component with bottom clearance spacer
  const renderListFooter = () => (
    <View style={styles.footerWrap}>
      {loadmoring && (
        <ActivityIndicator
          size="small"
          color="#2ed573"
          style={styles.loadingIndicator}
        />
      )}
      <View style={styles.bottomClearanceSpacer} />
    </View>
  );

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1117" translucent={false} />
      <Spinner loading={loading} text={t('Loading...')} />

      {!isLimited && (
        <View style={styles.mainContainer}>
          {/* Top Profile / Brand Header with Xbox Gamerpic & Server Shortcut */}
          <View style={[styles.topHeader, isLargeScreen && styles.topHeaderLarge]}>
            <View style={styles.headerMainRow}>
              {/* Profile Info (Left) */}
              <View style={styles.profileRow}>
                {gamerpic ? (
                  <Image source={{uri: gamerpic}} style={styles.gamerpicImage} />
                ) : (
                  <XboxLogo size={38} color="#2ed573" />
                )}
                <View style={styles.profileInfo}>
                  <Text style={styles.gamertagText} numberOfLines={1}>
                    {gamertag}
                  </Text>
                  {/* Account Tier Badge (purely from account, non-clickable) */}
                  <View style={styles.subscriptionBadgeWrap}>
                    <View style={styles.subscriptionDot} />
                    <Text style={styles.subscriptionBadge}>{displayTier}</Text>
                  </View>
                </View>
              </View>

              {/* Server Region Shortcut Button (Top Right) */}
              <Pressable
                onPress={() => setShowRegionModal(true)}
                android_ripple={{color: 'rgba(255, 255, 255, 0.18)'}}
                style={({pressed}) => [styles.serverButton, pressed && styles.serverButtonPressed]}>
                <Text style={styles.serverFlag}>{currentRegionInfo.flag}</Text>
                <Text style={styles.serverCode}>{currentRegionInfo.code}</Text>
                <Icon source="chevron-down" size={14} color="#8b949e" />
              </Pressable>
            </View>
          </View>

          {/* Filter & Sort Chips Row */}
          <View style={[styles.filterRow, isLargeScreen && styles.filterRowLarge]}>
            {/* Sort Pill */}
            <Pressable
              onPress={() => setShowSortModal(true)}
              android_ripple={{color: 'rgba(255, 255, 255, 0.15)'}}
              style={({pressed}) => [styles.pillButton, pressed && styles.pillPressed]}>
              <Text style={styles.pillText} numberOfLines={1}>
                {sortLabel}
              </Text>
            </Pressable>

            {/* Filter Pill */}
            <Pressable
              onPress={() => setShowFilterModal(true)}
              android_ripple={{color: 'rgba(255, 255, 255, 0.15)'}}
              style={({pressed}) => [styles.pillButton, pressed && styles.pillPressed]}>
              <Text style={styles.pillText} numberOfLines={1}>
                {filterLabel}
              </Text>
            </Pressable>

            {/* Count Pill */}
            <View style={styles.countPill}>
              <Text style={styles.countText}>
                {`${filteredTitles.length} ${t('available')}`}
              </Text>
            </View>
          </View>

          {/* Accelerate tutorial link (if Chinese) */}
          {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
            <Text
              variant="labelSmall"
              style={styles.tutorialText}
              onPress={() => setShowToturial(true)}>
              🚀 点击查看云游戏加速指引
            </Text>
          )}

          {/* Empty State */}
          {!loading && !filteredTitles.length && (
            <View style={styles.emptyContainer}>
              <Empty />
            </View>
          )}

          {/* 3-Column Portrait Catalog Grid */}
          {pagedTitles.length > 0 && (
            <FlatList
              ref={flatListRef}
              data={pagedTitles}
              key={numColumns}
              numColumns={numColumns}
              keyExtractor={(item, index) => `${item.titleId || item.XCloudTitleId || index}`}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={[
                styles.gridContentContainer,
                isLargeScreen && styles.gridContentContainerLarge,
              ]}
              ListHeaderComponent={renderCarouselsHeader}
              renderItem={({item}) => (
                <XStreamingGameCard
                  titleItem={item}
                  width={cardWidth}
                  height={cardHeight}
                  isStarred={isItemStarred(item)}
                  onPress={handleViewDetail}
                  onPlayPress={handleDirectPlay}
                  onBookmarkPress={handleToggleStar}
                />
              )}
              onEndReached={loadMoreData}
              onEndReachedThreshold={0.15}
              ListFooterComponent={renderListFooter}
            />
          )}

          {/* Floating Pill Bottom Navigation Bar */}
          <View
            style={[
              styles.floatingBottomBar,
              {
                width: bottomBarWidth,
                left: bottomBarLeft,
                bottom: bottomBarBottom,
                height: bottomBarHeight,
                borderRadius: bottomBarRadius,
              },
            ]}>
            {/* Pustaka (Library / Catalog) Tab */}
            <Pressable
              onPress={() => handleTabPress('library')}
              style={styles.tabItem}>
              <View
                style={[
                  styles.tabIconWrap,
                  isLandscape && styles.tabIconWrapLandscape,
                  activeBottomTab === 'library' && styles.tabIconWrapActive,
                ]}>
                <Icon
                  source={activeBottomTab === 'library' ? 'view-grid' : 'view-grid-outline'}
                  size={isLandscape ? 20 : 22}
                  color={activeBottomTab === 'library' ? '#2ed573' : '#8b949e'}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isLandscape && styles.tabLabelLandscape,
                  activeBottomTab === 'library' && styles.tabLabelActive,
                ]}>
                {t('Library')}
              </Text>
            </Pressable>

            {/* Cari (Search) Tab */}
            <Pressable
              onPress={() => handleTabPress('search')}
              style={styles.tabItem}>
              <View
                style={[
                  styles.tabIconWrap,
                  isLandscape && styles.tabIconWrapLandscape,
                ]}>
                <Icon source="magnify" size={isLandscape ? 20 : 22} color="#8b949e" />
              </View>
              <Text style={[styles.tabLabel, isLandscape && styles.tabLabelLandscape]}>
                {t('Search')}
              </Text>
            </Pressable>

            {/* Favorit (Favorites) Tab */}
            <Pressable
              onPress={() => handleTabPress('favorites')}
              style={styles.tabItem}>
              <View
                style={[
                  styles.tabIconWrap,
                  isLandscape && styles.tabIconWrapLandscape,
                  activeBottomTab === 'favorites' && styles.tabIconWrapActive,
                ]}>
                <Icon
                  source={activeBottomTab === 'favorites' ? 'bookmark' : 'bookmark-outline'}
                  size={isLandscape ? 20 : 22}
                  color={activeBottomTab === 'favorites' ? '#2ed573' : '#8b949e'}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isLandscape && styles.tabLabelLandscape,
                  activeBottomTab === 'favorites' && styles.tabLabelActive,
                ]}>
                {t('Favorites')}
              </Text>
            </Pressable>

            {/* Pengaturan (Settings) Tab */}
            <Pressable
              onPress={() => handleTabPress('settings')}
              style={styles.tabItem}>
              <View
                style={[
                  styles.tabIconWrap,
                  isLandscape && styles.tabIconWrapLandscape,
                ]}>
                <Icon source="cog-outline" size={isLandscape ? 20 : 22} color="#8b949e" />
              </View>
              <Text style={[styles.tabLabel, isLandscape && styles.tabLabelLandscape]}>
                {t('Settings')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Limited Gamepass State */}
      {isLimited && (
        <View style={styles.limitedContainer}>
          <Text style={styles.tips} variant="bodyLarge">
            {t('NoXGP')}
          </Text>
        </View>
      )}

      {/* Server Region Selection Modal with Smooth ScrollView & Fixed Spacing */}
      <Portal>
        <Modal
          visible={showRegionModal}
          onDismiss={() => setShowRegionModal(false)}
          contentContainerStyle={[
            styles.dialogContainer,
            {maxHeight: screenHeight * 0.76},
          ]}>
          <Card style={styles.modalCard}>
            <Card.Title
              title={t('Select Cloud Server')}
              titleStyle={styles.modalTitle}
              left={props => <Icon {...props} source="earth" color="#2ed573" size={24} />}
            />
            <ScrollView
              style={{maxHeight: screenHeight * 0.58}}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}>
              {availableRegions.map(reg => {
                const info = getRegionDisplayInfo(reg.name);
                const isSelected =
                  currentRegionName === reg.name ||
                  (!currentRegionName && reg.isDefault);
                return (
                  <Pressable
                    key={reg.name}
                    onPress={() => handleSelectRegion(reg.name)}
                    style={[
                      styles.regionModalOption,
                      isSelected && styles.modalOptionActive,
                    ]}>
                    <View style={styles.regionOptionLeft}>
                      <Text style={styles.modalRegionFlag}>{info.flag}</Text>
                      <View style={styles.modalRegionInfo}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.modalOptionTitle,
                            isSelected && styles.modalOptionTextActive,
                          ]}>
                          {info.name}
                        </Text>
                        <Text numberOfLines={1} style={styles.modalRegionCode}>
                          {reg.name}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Icon source="check" size={20} color="#2ed573" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Card>
        </Modal>
      </Portal>

      {/* Sort Dialog Modal */}
      <Portal>
        <Modal
          visible={showSortModal}
          onDismiss={() => setShowSortModal(false)}
          contentContainerStyle={styles.dialogContainer}>
          <Card style={styles.modalCard}>
            <Card.Title
              title={t('Sort: Relevance')}
              titleStyle={styles.modalTitle}
              left={props => <Icon {...props} source="sort-variant" color="#2ed573" size={24} />}
            />
            <Card.Content>
              {[
                {key: 'relevance', label: t('Relevance')},
                {key: 'az', label: 'A - Z'},
                {key: 'za', label: 'Z - A'},
                {key: 'newest', label: t('Newest')},
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setSortBy(opt.key as any);
                    setShowSortModal(false);
                    setCurrentPage(1);
                  }}
                  style={[styles.modalOption, sortBy === opt.key && styles.modalOptionActive]}>
                  <Text style={[styles.modalOptionText, sortBy === opt.key && styles.modalOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {sortBy === opt.key && <Icon source="check" size={18} color="#2ed573" />}
                </Pressable>
              ))}
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      {/* Filter Dialog Modal with xbox.com/play Channel Filters */}
      <Portal>
        <Modal
          visible={showFilterModal}
          onDismiss={() => setShowFilterModal(false)}
          contentContainerStyle={styles.dialogContainer}>
          <Card style={styles.modalCard}>
            <Card.Title
              title={t('Filters')}
              titleStyle={styles.modalTitle}
              left={props => <Icon {...props} source="filter-variant" color="#2ed573" size={24} />}
            />
            <Card.Content>
              {[
                {key: 'all', label: t('All')},
                {key: 'play_gamepass', label: t('Play with Game Pass')},
                {key: 'new', label: t('Recently Added')},
                {key: 'ubisoft', label: t('Ubisoft+ Classic')},
                {key: 'own', label: t('Stream your own game')},
                {key: 'leaving', label: t('Leaving soon')},
                {key: 'recent', label: t('Recently')},
                {key: 'favorites', label: t('Favorites')},
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setFilterCategory(opt.key as any);
                    if (opt.key === 'favorites') {
                      setActiveBottomTab('favorites');
                    } else if (opt.key === 'all') {
                      setActiveBottomTab('library');
                    }
                    setShowFilterModal(false);
                    setCurrentPage(1);
                  }}
                  style={[styles.modalOption, filterCategory === opt.key && styles.modalOptionActive]}>
                  <Text style={[styles.modalOptionText, filterCategory === opt.key && styles.modalOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {filterCategory === opt.key && <Icon source="check" size={18} color="#2ed573" />}
                </Pressable>
              ))}
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      {/* USB Warning Modal */}
      <Portal>
        <Modal
          visible={showUsbWarnModal}
          onDismiss={() => setShowUsbWarnModal(false)}
          contentContainerStyle={styles.dialogContainer}>
          <Card style={styles.modalCard}>
            <Card.Content>
              <Text style={{color: '#ffffff', marginBottom: 10, lineHeight: 20}}>
                {t(
                  'It has been detected that you are using the wired connection mode with the Overwrite Android driver. If the USB connection is disconnected during the game, please exit the game and reconnect the controller; otherwise, the controller buttons will become unresponsive',
                )}
              </Text>
              <Button
                mode="contained"
                buttonColor="#2ed573"
                textColor="#000000"
                onPress={() => {
                  setShowUsbWarnModal(false);
                  if (pendingLaunchTitle) {
                    executeLaunchStream(pendingLaunchTitle);
                  }
                }}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      {/* Tutorial Modal */}
      <Portal>
        <Modal
          visible={showToturial}
          onDismiss={() => setShowToturial(false)}
          contentContainerStyle={{marginLeft: '8%', marginRight: '8%'}}>
          <Card style={styles.modalCard}>
            <Card.Content>
              <Text variant="bodyMedium" style={{color: '#ffffff'}}>
                如果你在中国大陆地区，因为云游戏服务器均在海外，云游戏延迟和丢包率高都是正常现象，
                如果你需要使用加速器提升云游戏质量，请按照以下操作顺序加速云游戏。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 10, color: '#dddddd'}}>
                1. 打开XStreaming，设置 - 云游戏 - 地区选择日本或韩国，选择后记得保存。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 8, color: '#dddddd'}}>
                2. 进入云游戏栏目，选择游戏直接开始，待连接成功显示游戏画面后，将XStreaming切到后台。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 8, color: '#dddddd'}}>
                3. 打开加速器，选择加速『XStreaming』，等待加速成功后切回游戏。
              </Text>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  mainContainer: {
    flex: 1,
  },
  limitedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tips: {
    textAlign: 'center',
    lineHeight: 30,
    color: '#8b949e',
  },
  topHeader: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 14,
    paddingBottom: 10,
  },
  topHeaderLarge: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  gamerpicImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#2ed573',
    backgroundColor: '#161922',
  },
  profileInfo: {
    marginLeft: 12,
    justifyContent: 'center',
    flexShrink: 1,
  },
  gamertagText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subscriptionBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.25)',
  },
  subscriptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ed573',
    marginRight: 5,
  },
  subscriptionBadge: {
    color: '#2ed573',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  serverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  serverButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  serverFlag: {
    fontSize: 14,
    marginRight: 4,
  },
  serverCode: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  filterRowLarge: {
    paddingHorizontal: 20,
  },
  pillButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  countPill: {
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '500',
  },
  carouselsContainer: {
    paddingBottom: 6,
  },
  carouselSection: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  showAllHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 213, 115, 0.1)',
  },
  showAllHeaderButtonPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.22)',
  },
  showAllHeaderText: {
    color: '#2ed573',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 2,
  },
  showAllCard: {
    borderRadius: 10,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginRight: 10,
  },
  showAllCardPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.08)',
    borderColor: '#2ed573',
  },
  showAllIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  showAllCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  showAllCardSubtitle: {
    color: '#2ed573',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  horizontalListWrap: {
    marginHorizontal: -14,
  },
  horizontalListContent: {
    paddingHorizontal: 14,
  },
  horizontalCardMargin: {
    marginRight: 10,
  },
  catalogDividerHeader: {
    marginTop: 10,
    marginBottom: 8,
  },
  catalogSectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginHorizontal: 0,
    letterSpacing: 0.2,
  },
  gridContentContainer: {
    paddingHorizontal: 14,
    paddingBottom: 160,
  },
  gridContentContainerLarge: {
    paddingHorizontal: 20,
    paddingBottom: 160,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  footerWrap: {
    alignItems: 'center',
  },
  loadingIndicator: {
    paddingVertical: 14,
  },
  bottomClearanceSpacer: {
    height: 50,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialText: {
    textAlign: 'center',
    color: '#2ed573',
    paddingBottom: 8,
  },
  // Floating Pill Bottom Navigation Bar
  floatingBottomBar: {
    position: 'absolute',
    backgroundColor: '#141824',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 10,
    zIndex: 99,
  },
  floatingBottomBarLarge: {},
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: 50,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapLandscape: {
    width: 44,
    height: 26,
    borderRadius: 13,
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(46, 213, 115, 0.2)',
  },
  tabLabel: {
    fontSize: 11,
    color: '#8b949e',
    fontWeight: '500',
    marginTop: 2,
  },
  tabLabelLandscape: {
    fontSize: 10,
    marginTop: 1,
  },
  tabLabelActive: {
    color: '#2ed573',
    fontWeight: '700',
  },
  dialogContainer: {
    marginHorizontal: '8%',
  },
  modalCard: {
    backgroundColor: '#161922',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalScrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  regionModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 52,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  regionOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  modalRegionFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  modalRegionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  modalOptionTitle: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  modalRegionCode: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionActive: {
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
  },
  modalOptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  modalOptionTextActive: {
    color: '#2ed573',
    fontWeight: '700',
  },
});

export default CloudScreen;
