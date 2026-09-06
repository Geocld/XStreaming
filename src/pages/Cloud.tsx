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
  NativeModules,
  BackHandler,
} from 'react-native';
import {Text, Portal, Modal, Card, Icon, Button} from 'react-native-paper';
import axios from 'axios';
import {useSelector, useDispatch} from 'react-redux';
import {useTranslation} from 'react-i18next';

import Spinner from '../components/Spinner';
import XStreamingGameCard from '../components/XStreamingGameCard';
import XboxLogo from '../components/XboxLogo';
import Empty from '../components/Empty';
import XcloudApi from '../xCloud';
import WebApi from '../web';
import TokenStore from '../xal/tokenstore';
import {debugFactory} from '../utils/debug';
import {getXcloudData, saveXcloudData, isxCloudDataValid} from '../store/xcloudStore';
import {getSettings} from '../store/settingStore';
import {getWebToken, isWebTokenValid} from '../store/webTokenStore';
import {storage} from '../store/mmkv';
import {syncRegionSettings} from '../utils/regionSync';

const {UsbRumbleManager, FullScreenManager} = NativeModules;
const log = debugFactory('CloudScreen');

// Microsoft Xbox Cloud Gaming SIGL IDs from xbox.com/play
const SIGL_GAME_PASS = 'af206485-e87d-4624-9007-cb7f6d0cc42e'; // AllGamePassGames
const SIGL_RECENTLY_ADDED = '06323672-b8c8-43cc-b0de-32d5a9834749'; // Recently added
const SIGL_UBISOFT_CLASSICS = '66ec875c-a391-44f5-9a54-a28bd6f976ce'; // Ubisoft+ Classics
const SIGL_STREAM_YOUR_OWN = 'e4c1d680-2c70-45e4-a38d-8a292c68c700'; // Stream your own games
const SIGL_LEAVING_SOON = '31ff2361-2772-4622-849b-f4f1abb4ad1b'; // Leaving soon

// Validator for Game Pass subscription titles (excludes F2P and buy-to-play games)
const isGamePassSubscriptionTitle = (item: any): boolean => {
  if (!item) return false;
  const title = (item.ProductTitle || '').toLowerCase();

  // Exclude Free-to-Play titles
  const f2pTitles = [
    'fortnite', 'warframe', 'roblox', 'destiny 2', 'fall guys',
    'brawlhalla', 'apex legends', 'genshin', 'zenless zone', 'pubg',
  ];
  if (f2pTitles.some(kw => title.includes(kw))) {
    return false;
  }

  // Exclude Buy-to-Play titles
  const nonSubscriptionTitles = [
    'cyberpunk', 'witcher 3', 'hogwarts legacy', "baldur's gate 3",
    'grand theft auto v', 'gta v', 'red dead redemption', 'nba 2k',
    'dying light 2', 'elden ring', 'star wars outlaws', 'avatar: frontiers',
    'final fantasy xvi', 'final fantasy vii', 'dragons dogma 2',
    'suicide squad', 'mortal kombat 1', 'call of duty: modern warfare iii',
    'call of duty: modern warfare ii', 'warhammer 40,000: space marine 2',
    'space marine 2', 'black myth',
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
const isUbisoftTitle = (item: any): boolean => {
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
        if (!item?.id) return;
        const matched =
          titleMap[item.id] ||
          titleMap[item.id.toUpperCase()] ||
          titleMap[item.id.toLowerCase()];
        if (!matched) return;

        const key = matched.titleId || matched.XCloudTitleId || matched.productId;
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

// Account tier detector from cloud titles (Essential, Premium, Ultimate)
const detectAccountTier = (titleResults: any[], hasToken: boolean): string => {
  let detected = hasToken ? 'Ultimate' : 'FREE';
  for (const item of titleResults) {
    const subs = item.details?.userSubscriptions || [];
    const progs = item.details?.userPrograms || [];
    if (subs.includes('XGPULTIMATE') || progs.includes('GPULTIMATE')) {
      return 'Ultimate';
    }
    if (
      subs.includes('XGPPREMIUM') ||
      progs.includes('GPPREMIUM') ||
      subs.includes('XGPSTANDARD') ||
      progs.includes('GPSTANDARD')
    ) {
      detected = 'Premium';
    } else if (
      subs.includes('XGPESSENTIAL') ||
      progs.includes('GPESSENTIAL') ||
      subs.includes('XGPCORE') ||
      progs.includes('GPCORE')
    ) {
      detected = 'Essential';
    }
  }
  return detected;
};

// Build fast lookup map for product and title IDs
const buildTitleLookupMap = (items: any[]): Record<string, any> => {
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
const resolveXboxGamertag = (
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

// Region selection modal component
interface RegionSelectModalProps {
  visible: boolean;
  onDismiss: () => void;
  availableRegions: any[];
  currentRegionName: string;
  onSelectRegion: (name: string) => void;
  screenHeight: number;
  t: (key: string) => string;
}

const RegionSelectModal: React.FC<RegionSelectModalProps> = ({
  visible,
  onDismiss,
  availableRegions,
  currentRegionName,
  onSelectRegion,
  screenHeight,
  t,
}) => (
  <Portal>
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={[styles.dialogContainer, {maxHeight: screenHeight * 0.76}]}>
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
              currentRegionName === reg.name || (!currentRegionName && reg.isDefault);
            return (
              <Pressable
                key={reg.name}
                onPress={() => onSelectRegion(reg.name)}
                style={[styles.regionModalOption, isSelected && styles.modalOptionActive]}>
                <View style={styles.regionOptionLeft}>
                  <Text style={styles.modalRegionFlag}>{info.flag}</Text>
                  <View style={styles.modalRegionInfo}>
                    <Text
                      numberOfLines={1}
                      style={[styles.modalOptionTitle, isSelected && styles.modalOptionTextActive]}>
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
);

// Sort options modal component
interface SortOptionModalProps {
  visible: boolean;
  onDismiss: () => void;
  sortBy: string;
  onSelectSort: (key: any) => void;
  t: (key: string) => string;
}

const SortOptionModal: React.FC<SortOptionModalProps> = ({
  visible,
  onDismiss,
  sortBy,
  onSelectSort,
  t,
}) => {
  const options = [
    {key: 'relevance', label: t('Relevance')},
    {key: 'az', label: 'A - Z'},
    {key: 'za', label: 'Z - A'},
    {key: 'newest', label: t('Newest')},
  ];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.dialogContainer}>
        <Card style={styles.modalCard}>
          <Card.Title
            title={t('Sort: Relevance')}
            titleStyle={styles.modalTitle}
            left={props => <Icon {...props} source="sort-variant" color="#2ed573" size={24} />}
          />
          <Card.Content>
            {options.map(opt => (
              <Pressable
                key={opt.key}
                onPress={() => onSelectSort(opt.key)}
                style={[styles.modalOption, sortBy === opt.key && styles.modalOptionActive]}>
                <Text
                  style={[
                    styles.modalOptionText,
                    sortBy === opt.key && styles.modalOptionTextActive,
                  ]}>
                  {opt.label}
                </Text>
                {sortBy === opt.key && <Icon source="check" size={18} color="#2ed573" />}
              </Pressable>
            ))}
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

// Filter options modal component
interface FilterOptionModalProps {
  visible: boolean;
  onDismiss: () => void;
  filterCategory: string;
  onSelectFilter: (key: any) => void;
  t: (key: string) => string;
}

const FilterOptionModal: React.FC<FilterOptionModalProps> = ({
  visible,
  onDismiss,
  filterCategory,
  onSelectFilter,
  t,
}) => {
  const filterOptions = [
    {key: 'all', label: t('All')},
    {key: 'play_gamepass', label: t('Play with Game Pass')},
    {key: 'new', label: t('Recently Added')},
    {key: 'ubisoft', label: t('Ubisoft+ Classic')},
    {key: 'own', label: t('Stream your own game')},
    {key: 'leaving', label: t('Leaving soon')},
    {key: 'recent', label: t('Recently')},
  ];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.dialogContainer}>
        <Card style={styles.modalCard}>
          <Card.Title
            title={t('Filters')}
            titleStyle={styles.modalTitle}
            left={props => <Icon {...props} source="filter-variant" color="#2ed573" size={24} />}
          />
          <Card.Content>
            {filterOptions.map(opt => (
              <Pressable
                key={opt.key}
                onPress={() => onSelectFilter(opt.key)}
                style={[styles.modalOption, filterCategory === opt.key && styles.modalOptionActive]}>
                <Text
                  style={[
                    styles.modalOptionText,
                    filterCategory === opt.key && styles.modalOptionTextActive,
                  ]}>
                  {opt.label}
                </Text>
                {filterCategory === opt.key && <Icon source="check" size={18} color="#2ed573" />}
              </Pressable>
            ))}
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

// USB connection warning modal component
interface UsbWarningModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

const UsbWarningModal: React.FC<UsbWarningModalProps> = ({
  visible,
  onDismiss,
  onConfirm,
  t,
}) => (
  <Portal>
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={styles.dialogContainer}>
      <Card style={styles.modalCard}>
        <Card.Content>
          <Text style={styles.usbWarningText}>
            {t(
              'It has been detected that you are using the wired connection mode with the Overwrite Android driver. If the USB connection is disconnected during the game, please exit the game and reconnect the controller; otherwise, the controller buttons will become unresponsive',
            )}
          </Text>
          <Button
            mode="contained"
            buttonColor="#2ed573"
            textColor="#000000"
            onPress={onConfirm}>
            {t('Confirm')}
          </Button>
        </Card.Content>
      </Card>
    </Modal>
  </Portal>
);

// Cloud gaming acceleration guide modal
interface TutorialModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({visible, onDismiss}) => (
  <Portal>
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={styles.tutorialModalContainer}>
      <Card style={styles.modalCard}>
        <Card.Content>
          <Text variant="bodyMedium" style={styles.tutorialLeadText}>
            如果你在中国大陆地区，因为云游戏服务器均在海外，云游戏延迟和丢包率高都是正常现象，
            如果你需要使用加速器提升云游戏质量，请按照以下操作顺序加速云游戏。
          </Text>
          <Text variant="bodyMedium" style={styles.tutorialStepText}>
            1. 打开XStreaming，设置 - 云游戏 - 地区选择日本或韩国，选择后记得保存。
          </Text>
          <Text variant="bodyMedium" style={styles.tutorialStepText}>
            2. 进入云游戏栏目，选择游戏直接开始，待连接成功显示游戏画面后，将XStreaming切到后台。
          </Text>
          <Text variant="bodyMedium" style={styles.tutorialStepText}>
            3. 打开加速器，选择加速『XStreaming』，等待加速成功后切回游戏。
          </Text>
        </Card.Content>
      </Card>
    </Modal>
  </Portal>
);

function CloudScreen({navigation, route}: any) {
  const {t, i18n} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();

  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);
  const starTitles = useSelector((state: any) => state.stars || []);
  const profile = useSelector((state: any) => state.profile);

  const currentLanguage = i18n.language;

  // Catalog and loading states
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [showTutorial, setShowTutorial] = React.useState(false);

  const [titles, setTitles] = React.useState<any[]>([]);
  const [titleMap, setTitleMap] = React.useState<Record<string, any>>({});
  const [newTitles, setNewTitles] = React.useState<any[]>([]);
  const [recentTitles, setRecentTitles] = React.useState<any[]>([]);
  const [leavingSoonTitles, setLeavingSoonTitles] = React.useState<any[]>([]);
  const [gamePassTitles, setGamePassTitles] = React.useState<any[]>([]);
  const [ubisoftTitlesData, setUbisoftTitlesData] = React.useState<any[]>([]);
  const [streamYourOwnTitlesData, setStreamYourOwnTitlesData] = React.useState<any[]>([]);

  const [keyword, setKeyword] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);

  // User profile states
  const [fetchedGamertag, setFetchedGamertag] = React.useState<string>(() => {
    return storage.getString('user.gamertag') || '';
  });
  const [gamerpic, setGamerpic] = React.useState<string>(() => {
    return storage.getString('user.gamerpic') || '';
  });
  const [accountTier, setAccountTier] = React.useState<string>(() => {
    const cached = storage.getString('user.account_tier') || '';
    if (cached === 'Core') return 'Essential';
    if (cached === 'Standard') return 'Premium';
    return cached;
  });

  // Server region state
  const [currentRegionName, setCurrentRegionName] = React.useState<string>(() => {
    const settings = getSettings();
    return settings.signaling_cloud_name || '';
  });
  const [showRegionModal, setShowRegionModal] = React.useState(false);

  // Navigation and filter states
  const [activeBottomTab, setActiveBottomTab] = React.useState<'library'>('library');
  const [sortBy, setSortBy] = React.useState<'relevance' | 'az' | 'za' | 'newest'>('relevance');
  const [filterCategory, setFilterCategory] = React.useState<
    'all' | 'play_gamepass' | 'new' | 'ubisoft' | 'own' | 'leaving' | 'recent'
  >('all');
  const [showSortModal, setShowSortModal] = React.useState(false);
  const [showFilterModal, setShowFilterModal] = React.useState(false);

  // USB controller state
  const [showUsbWarnModal, setShowUsbWarnModal] = React.useState(false);
  const [pendingLaunchTitle, setPendingLaunchTitle] = React.useState<any>(null);

  const flatListRef = React.useRef<any>(null);
  const hasFetchedGamesRef = React.useRef(false);

  // Orientation and dimension calculations
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;

  const bottomBarWidth = isLandscape
    ? Math.min(220, screenWidth - 64)
    : Math.min(180, screenWidth - 48);
  const bottomBarLeft = (screenWidth - bottomBarWidth) / 2;
  const bottomBarBottom = isLandscape ? 32 : (Platform.OS === 'android' ? 26 : 28);
  const bottomBarHeight = isLandscape ? 50 : 54;
  const bottomBarRadius = isLandscape ? 25 : 27;

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

  // Resolved user Gamertag
  const gamertag = React.useMemo(() => {
    return resolveXboxGamertag(fetchedGamertag, profile, webToken, streamingTokens);
  }, [fetchedGamertag, profile, webToken, streamingTokens]);

  // Subscription tier label (Essential, Premium, Ultimate)
  const displayTier = React.useMemo(() => {
    if (accountTier === 'Core') return 'Essential';
    if (accountTier === 'Standard') return 'Premium';
    if (accountTier) return accountTier;
    return streamingTokens?.xCloudToken ? 'Ultimate' : 'FREE';
  }, [accountTier, streamingTokens.xCloudToken]);

  // Available server regions
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

  // Current server region info
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

  // Game Pass channel titles
  const playWithGamePassTitles = React.useMemo(() => {
    if (gamePassTitles.length > 0) {
      return gamePassTitles.filter(isGamePassSubscriptionTitle);
    }
    if (titles.length === 0) return [];
    return titles.filter(isGamePassSubscriptionTitle).slice(0, 30);
  }, [gamePassTitles, titles]);

  // Ubisoft+ Classic channel titles
  const ubisoftTitles = React.useMemo(() => {
    if (ubisoftTitlesData.length > 0) {
      return ubisoftTitlesData.filter(isUbisoftTitle);
    }
    return titles.filter(isUbisoftTitle);
  }, [ubisoftTitlesData, titles]);

  // Stream your own games channel titles
  const streamYourOwnTitles = React.useMemo(() => {
    if (streamYourOwnTitlesData.length > 0) {
      return streamYourOwnTitlesData;
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
  }, [streamYourOwnTitlesData, titles]);

  // Leaving soon channel titles
  const leavingSoonList = React.useMemo(() => {
    if (leavingSoonTitles.length > 0) return leavingSoonTitles;
    return titles.length > 15 ? titles.slice(titles.length - 12) : [];
  }, [leavingSoonTitles, titles]);

  // Fetch user profile from WebApi
  const fetchUserProfile = async (token: any) => {
    if (!token || !isWebTokenValid(token)) return;
    try {
      const webApi = new WebApi(token);
      const res = await webApi.getUserProfile();
      if (res?.Gamertag) {
        setFetchedGamertag(res.Gamertag);
        storage.set('user.gamertag', res.Gamertag);
      }
      if (res?.GameDisplayPicRaw) {
        setGamerpic(res.GameDisplayPicRaw);
        storage.set('user.gamerpic', res.GameDisplayPicRaw);
      }
      dispatch({type: 'SET_PROFILE', payload: res});
    } catch (err) {
      log.info('fetchUserProfile error:', err);
    }
  };

  // Fetch full cloud catalog and SIGL channels
  const fetchCatalog = async (silent = false) => {
    if (!streamingTokens.xCloudToken) return;
    if (!silent) setLoading(true);

    try {
      const baseUri = streamingTokens.xCloudToken.getDefaultRegion().baseUri;
      const gsToken = streamingTokens.xCloudToken.data.gsToken;
      const api = new XcloudApi(baseUri, gsToken, 'cloud');

      const titleRes = await api.getTitles();
      if (!titleRes?.results?.length) {
        if (!silent) setLoading(false);
        return;
      }

      // Detect account tier (Essential, Premium, Ultimate)
      const tier = detectAccountTier(titleRes.results, true);
      setAccountTier(tier);
      storage.set('user.account_tier', tier);

      const rawTitles = await api.getGamePassProducts(titleRes.results);
      setTitles(rawTitles);

      const lookupMap = buildTitleLookupMap(rawTitles);
      setTitleMap(lookupMap);

      // Concurrently fetch SIGL collections
      const [gpRes, newRes, ubiRes, ownRes, leaveRes, recentRes] =
        await Promise.allSettled([
          fetchSiglTitles(SIGL_GAME_PASS, lookupMap, isGamePassSubscriptionTitle),
          fetchSiglTitles(SIGL_RECENTLY_ADDED, lookupMap),
          fetchSiglTitles(SIGL_UBISOFT_CLASSICS, lookupMap, isUbisoftTitle),
          fetchSiglTitles(SIGL_STREAM_YOUR_OWN, lookupMap),
          fetchSiglTitles(SIGL_LEAVING_SOON, lookupMap),
          api.getRecentTitles(),
        ]);

      const gpList = (gpRes.status === 'fulfilled' ? gpRes.value : []).filter(
        isGamePassSubscriptionTitle,
      );
      const newList = newRes.status === 'fulfilled' ? newRes.value : [];
      const ubiList = (ubiRes.status === 'fulfilled' ? ubiRes.value : []).filter(
        isUbisoftTitle,
      );
      const ownList = ownRes.status === 'fulfilled' ? ownRes.value : [];
      const leaveList = leaveRes.status === 'fulfilled' ? leaveRes.value : [];

      if (gpList.length > 0) setGamePassTitles(gpList);
      if (newList.length > 0) setNewTitles(newList);
      if (ubiList.length > 0) setUbisoftTitlesData(ubiList);
      if (ownList.length > 0) setStreamYourOwnTitlesData(ownList);
      if (leaveList.length > 0) setLeavingSoonTitles(leaveList);

      const recentList: any[] = [];
      if (recentRes.status === 'fulfilled' && recentRes.value?.results) {
        recentRes.value.results.forEach((item: any) => {
          const pid = item.details?.productId;
          if (pid && (lookupMap[pid] || lookupMap[pid.toUpperCase()])) {
            recentList.push(lookupMap[pid] || lookupMap[pid.toUpperCase()]);
          }
        });
        setRecentTitles(recentList);
      }

      // Update cache
      const cached = getXcloudData();
      saveXcloudData({
        ...cached,
        titles: rawTitles,
        titleMap: lookupMap,
        playWithGamePassTitles: gpList,
        newTitles: newList,
        ubisoftTitles: ubiList,
        streamYourOwnTitles: ownList,
        leavingSoonTitles: leaveList,
        recentTitles: recentList,
      });
    } catch (err) {
      log.info('fetchCatalog error:', err);
    } finally {
      setLoading(false);
      hasFetchedGamesRef.current = true;
    }
  };

  React.useEffect(() => {
    if (typeof route.params?.keyword === 'string') {
      setKeyword(route.params.keyword);
    }
    if (!streamingTokens.xCloudToken) {
      setIsLimited(true);
    }

    const curWebToken = webToken?.data ? webToken : getWebToken();
    fetchUserProfile(curWebToken);

    if (!hasFetchedGamesRef.current) {
      const cacheData = getXcloudData();
      if (cacheData && isxCloudDataValid(cacheData)) {
        log.info('Get xcloud data from cache');
        const {
          titles: _titles,
          titleMap: _titleMap,
          newTitles: _newTitles,
          starTitles: _starTitles,
          recentTitles: _recentTitles,
          playWithGamePassTitles: _gpTitles,
          ubisoftTitles: _ubiTitles,
          streamYourOwnTitles: _ownTitles,
          leavingSoonTitles: _leaveTitles,
        } = cacheData;

        setTitles(_titles || []);
        setTitleMap(_titleMap || {});
        setNewTitles(_newTitles || []);
        setRecentTitles(_recentTitles || []);
        if (_gpTitles) {
          setGamePassTitles(_gpTitles.filter(isGamePassSubscriptionTitle));
        }
        if (_ubiTitles) {
          setUbisoftTitlesData(_ubiTitles.filter(isUbisoftTitle));
        }
        if (_ownTitles) {
          setStreamYourOwnTitlesData(_ownTitles);
        }
        if (_leaveTitles) {
          setLeavingSoonTitles(_leaveTitles);
        }

        dispatch({type: 'SET_STARS', payload: _starTitles || []});
        fetchCatalog(true);
      } else {
        fetchCatalog();
      }
    }
  }, [route.params?.keyword, streamingTokens.xCloudToken, webToken, navigation, dispatch]);

  const handleViewDetail = React.useCallback(
    (titleItem: any) => {
      navigation.navigate('TitleDetail', {titleItem});
    },
    [navigation],
  );

  const handleOpenSearch = () => {
    navigation.navigate('Search', {keyword});
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  // Toggle favorite / bookmark
  const handleToggleStar = (titleItem: any) => {
    if (!titleItem) return;
    const targetId = titleItem.XCloudTitleId || titleItem.titleId;
    if (!targetId) return;

    const cacheData = getXcloudData();
    const newStarTitles = starTitles.includes(targetId)
      ? starTitles.filter((id: string) => id !== targetId)
      : [...starTitles, targetId];

    dispatch({type: 'SET_STARS', payload: newStarTitles});

    if (cacheData) {
      cacheData.starTitles = newStarTitles;
      saveXcloudData(cacheData);
    }
  };

  // Select server region
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

  const executeLaunchStream = React.useCallback(
    (titleItem: any) => {
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
    },
    [navigation, streamingTokens.xCloudToken],
  );

  // Direct game launch handler
  const handleDirectPlay = React.useCallback(
    async (titleItem: any) => {
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
    },
    [executeLaunchStream],
  );

  // Filter and sort titles
  const filteredTitles = React.useMemo(() => {
    let list: any[] = [];
    if (filterCategory === 'recent') {
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
      list = list.filter(item =>
        item.ProductTitle?.toUpperCase().includes(keyword.toUpperCase()),
      );
    }

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
    filterCategory,
    keyword,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredTitles.length / pageSize);
  const pagedTitles = React.useMemo(() => {
    const endIdx = currentPage * pageSize;
    return filteredTitles.slice(0, endIdx);
  }, [filteredTitles, currentPage, pageSize]);

  const loadMoreData = React.useCallback(() => {
    if (currentPage < totalPages) {
      setLoadingMore(true);
      setCurrentPage(prev => prev + 1);
      setTimeout(() => {
        setLoadingMore(false);
      }, 500);
    }
  }, [currentPage, totalPages]);

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

  const handleBackToHome = () => {
    setFilterCategory('all');
    setActiveBottomTab('library');
    setCurrentPage(1);
    scrollToTop();
  };

  // Hardware and gesture back button handling for category view
  React.useEffect(() => {
    const onBackPress = () => {
      if (filterCategory !== 'all') {
        handleBackToHome();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );
    return () => backHandler.remove();
  }, [filterCategory]);

  // Horizontal carousel section
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
      <View key={`${idPrefix}_sec`} style={styles.carouselSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {title}
          </Text>
          {hasMoreThanTen && (
            <Pressable
              onPress={() => handleShowAll(categoryKey)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              android_ripple={{color: 'rgba(46, 213, 115, 0.2)'}}
              style={({pressed}) => [
                styles.showAllHeaderButton,
                pressed && styles.showAllHeaderButtonPressed,
              ]}>
              <Text style={styles.showAllHeaderText}>{t('Show all')}</Text>
              <Icon source="chevron-right" size={13} color="#2ed573" />
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
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          renderItem={({item}) => (
            <XStreamingGameCard
              titleItem={item}
              width={horizontalCardWidth}
              height={horizontalCardHeight}
              onPress={handleViewDetail}
              onPlayPress={handleDirectPlay}
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
                <Text style={styles.showAllCardTitle}>{t('Show all')}</Text>
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

  // Channel carousels header
  const renderCarouselsHeader = React.useCallback(() => {
    if (filterCategory !== 'all' || keyword.length > 0) {
      return null;
    }

    return (
      <View style={styles.carouselsContainer}>
        {/* Jump back in */}
        {renderCarouselSection(t('Jump back in'), recentTitles, 'recent', 'recent')}

        {/* Play with Game Pass */}
        {renderCarouselSection(t('Play with Game Pass'), playWithGamePassTitles, 'play_gamepass', 'gp')}

        {/* Recently added */}
        {renderCarouselSection(t('Recently Added'), newTitles, 'new', 'new')}

        {/* Ubisoft+ Classic */}
        {renderCarouselSection(t('Ubisoft+ Classic'), ubisoftTitles, 'ubisoft', 'ubi')}

        {/* Stream your own game */}
        {renderCarouselSection(t('Stream your own game'), streamYourOwnTitles, 'own', 'own')}

        {/* Leaving soon */}
        {renderCarouselSection(t('Leaving soon'), leavingSoonList, 'leaving', 'leave')}

        {/* All games section divider */}
        <View style={styles.catalogDividerHeader}>
          <Text style={styles.catalogSectionTitle}>{t('All')}</Text>
        </View>
      </View>
    );
  }, [
    filterCategory,
    keyword,
    recentTitles,
    playWithGamePassTitles,
    newTitles,
    ubisoftTitles,
    streamYourOwnTitles,
    leavingSoonList,
    horizontalCardWidth,
    horizontalCardHeight,
    handleViewDetail,
    handleDirectPlay,
    t,
  ]);

  // Grid item renderer
  const renderGridItem = React.useCallback(
    ({item}: {item: any}) => (
      <XStreamingGameCard
        titleItem={item}
        width={cardWidth}
        height={cardHeight}
        onPress={handleViewDetail}
        onPlayPress={handleDirectPlay}
      />
    ),
    [cardWidth, cardHeight, handleViewDetail, handleDirectPlay],
  );

  const itemKeyExtractor = React.useCallback(
    (item: any, index: number) => `${item.titleId || item.XCloudTitleId || index}`,
    [],
  );

  // Sort label display
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

  // Filter label display
  const filterLabel = React.useMemo(() => {
    switch (filterCategory) {
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

  // Bottom navigation tab clicks
  const handleTabPress = (tab: 'library' | 'settings') => {
    if (tab === 'library') {
      setActiveBottomTab('library');
      setFilterCategory('all');
      setCurrentPage(1);
      scrollToTop();
    } else if (tab === 'settings') {
      navigation.navigate('Settings');
    }
  };

  // Footer loading and clearance indicator
  const renderListFooter = () => (
    <View style={styles.footerWrap}>
      {loadingMore && (
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
          {/* Header row with Gamerpic and Server Region shortcut */}
          <View style={[styles.topHeader, isLargeScreen && styles.topHeaderLarge]}>
            <View style={styles.headerMainRow}>
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
                  <View style={styles.subscriptionBadgeWrap}>
                    <View style={styles.subscriptionDot} />
                    <Text style={styles.subscriptionBadge}>{displayTier}</Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => setShowRegionModal(true)}
                android_ripple={{color: 'rgba(255, 255, 255, 0.18)'}}
                style={({pressed}) => [styles.serverButton, pressed && styles.serverButtonPressed]}>
                <Text style={styles.serverFlag}>{currentRegionInfo.flag}</Text>
                <Text style={styles.serverCode}>{currentRegionInfo.code}</Text>
                <Icon source="chevron-down" size={14} color="#8b949e" />
              </Pressable>
            </View>

            {/* Wide Search Bar Button under Profile */}
            <Pressable
              onPress={handleOpenSearch}
              android_ripple={{color: 'rgba(255, 255, 255, 0.12)'}}
              style={({pressed}) => [
                styles.searchBarButton,
                pressed && styles.searchBarButtonPressed,
              ]}>
              <Icon source="magnify" size={20} color={keyword ? '#2ed573' : '#8b949e'} />
              <Text
                style={[styles.searchBarText, keyword.length > 0 && styles.searchBarTextActive]}
                numberOfLines={1}>
                {keyword || t('Find games')}
              </Text>
              {keyword.length > 0 && (
                <Pressable
                  onPress={e => {
                    e?.stopPropagation?.();
                    setKeyword('');
                    navigation.setParams({keyword: ''});
                  }}
                  hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Icon source="close-circle" size={18} color="#8b949e" />
                </Pressable>
              )}
            </Pressable>
          </View>

          {/* Filter row or Category Navigation Bar */}
          {filterCategory !== 'all' ? (
            <View style={[styles.categoryHeaderBar, isLargeScreen && styles.categoryHeaderBarLarge]}>
              <Pressable
                onPress={handleBackToHome}
                android_ripple={{color: 'rgba(46, 213, 115, 0.25)', borderless: true}}
                style={({pressed}) => [
                  styles.categoryBackButton,
                  pressed && styles.categoryBackButtonPressed,
                ]}>
                <Icon source="arrow-left" size={18} color="#2ed573" />
                <Text style={styles.categoryBackText}>{t('Back')}</Text>
              </Pressable>

              <View style={styles.categoryTitleWrap}>
                <Text style={styles.categoryTitleText} numberOfLines={1}>
                  {filterLabel}
                </Text>
                <Text style={styles.categoryCountText}>
                  {`${filteredTitles.length} ${t('available')}`}
                </Text>
              </View>

              <Pressable
                onPress={() => setShowSortModal(true)}
                android_ripple={{color: 'rgba(255, 255, 255, 0.15)'}}
                style={({pressed}) => [
                  styles.pillButton,
                  styles.categorySortButton,
                  pressed && styles.pillPressed,
                ]}>
                <Icon source="sort-variant" size={14} color="#8b949e" style={{marginRight: 4}} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {sortLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.filterRow, isLargeScreen && styles.filterRowLarge]}>
              <Pressable
                onPress={() => setShowSortModal(true)}
                android_ripple={{color: 'rgba(255, 255, 255, 0.15)'}}
                style={({pressed}) => [styles.pillButton, pressed && styles.pillPressed]}>
                <Text style={styles.pillText} numberOfLines={1}>
                  {sortLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowFilterModal(true)}
                android_ripple={{color: 'rgba(255, 255, 255, 0.15)'}}
                style={({pressed}) => [styles.pillButton, pressed && styles.pillPressed]}>
                <Text style={styles.pillText} numberOfLines={1}>
                  {filterLabel}
                </Text>
              </Pressable>

              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {`${filteredTitles.length} ${t('available')}`}
                </Text>
              </View>
            </View>
          )}

          {/* Acceleration guide link */}
          {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
            <Text
              variant="labelSmall"
              style={styles.tutorialText}
              onPress={() => setShowTutorial(true)}>
              🚀 点击查看云游戏加速指引
            </Text>
          )}

          {/* Empty state */}
          {!loading && !filteredTitles.length && (
            <View style={styles.emptyContainer}>
              <Empty />
            </View>
          )}

          {/* Catalog grid */}
          {pagedTitles.length > 0 && (
            <FlatList
              ref={flatListRef}
              data={pagedTitles}
              key={numColumns}
              numColumns={numColumns}
              keyExtractor={itemKeyExtractor}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={[
                styles.gridContentContainer,
                isLargeScreen && styles.gridContentContainerLarge,
              ]}
              ListHeaderComponent={renderCarouselsHeader}
              renderItem={renderGridItem}
              initialNumToRender={isLargeScreen ? 12 : 9}
              maxToRenderPerBatch={isLargeScreen ? 12 : 9}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              onEndReached={loadMoreData}
              onEndReachedThreshold={0.2}
              ListFooterComponent={renderListFooter}
            />
          )}

          {/* Floating bottom navigation bar */}
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
            {/* Library tab */}
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
                  size={isLandscape ? 18 : 20}
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

            {/* Settings tab */}
            <Pressable
              onPress={() => handleTabPress('settings')}
              style={styles.tabItem}>
              <View
                style={[
                  styles.tabIconWrap,
                  isLandscape && styles.tabIconWrapLandscape,
                ]}>
                <Icon source="cog-outline" size={isLandscape ? 18 : 20} color="#8b949e" />
              </View>
              <Text style={[styles.tabLabel, isLandscape && styles.tabLabelLandscape]}>
                {t('Settings')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Limited view state */}
      {isLimited && (
        <View style={styles.limitedContainer}>
          <Text style={styles.tips} variant="bodyLarge">
            {t('NoXGP')}
          </Text>
        </View>
      )}

      {/* Modals */}
      <RegionSelectModal
        visible={showRegionModal}
        onDismiss={() => setShowRegionModal(false)}
        availableRegions={availableRegions}
        currentRegionName={currentRegionName}
        onSelectRegion={handleSelectRegion}
        screenHeight={screenHeight}
        t={t}
      />

      <SortOptionModal
        visible={showSortModal}
        onDismiss={() => setShowSortModal(false)}
        sortBy={sortBy}
        onSelectSort={optKey => {
          setSortBy(optKey);
          setShowSortModal(false);
          setCurrentPage(1);
        }}
        t={t}
      />

      <FilterOptionModal
        visible={showFilterModal}
        onDismiss={() => setShowFilterModal(false)}
        filterCategory={filterCategory}
        onSelectFilter={optKey => {
          setFilterCategory(optKey);
          setShowFilterModal(false);
          setCurrentPage(1);
        }}
        t={t}
      />

      <UsbWarningModal
        visible={showUsbWarnModal}
        onDismiss={() => setShowUsbWarnModal(false)}
        onConfirm={() => {
          setShowUsbWarnModal(false);
          if (pendingLaunchTitle) {
            executeLaunchStream(pendingLaunchTitle);
          }
        }}
        t={t}
      />

      <TutorialModal
        visible={showTutorial}
        onDismiss={() => setShowTutorial(false)}
      />
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
  searchBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b26',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    height: 44,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  searchBarButtonPressed: {
    backgroundColor: '#1e2535',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  searchBarText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  },
  searchBarTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
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
  categoryHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  categoryHeaderBarLarge: {
    paddingHorizontal: 20,
  },
  categoryBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.3)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
    flexShrink: 0,
  },
  categoryBackButtonPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.24)',
  },
  categoryBackText: {
    color: '#2ed573',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  categoryTitleWrap: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  categoryTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  categoryCountText: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 1,
  },
  categorySortButton: {
    marginRight: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
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
    gap: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    flex: 1,
    marginRight: 8,
  },
  showAllHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 213, 115, 0.1)',
    flexShrink: 0,
  },
  showAllHeaderButtonPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.22)',
  },
  showAllHeaderText: {
    color: '#2ed573',
    fontSize: 11,
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
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: 42,
    height: 25,
    borderRadius: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapLandscape: {
    width: 38,
    height: 22,
    borderRadius: 11,
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(46, 213, 115, 0.2)',
  },
  tabLabel: {
    fontSize: 10,
    color: '#8b949e',
    fontWeight: '500',
    marginTop: 1,
  },
  tabLabelLandscape: {
    fontSize: 9,
    marginTop: 0,
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
  usbWarningText: {
    color: '#ffffff',
    marginBottom: 10,
    lineHeight: 20,
  },
  tutorialModalContainer: {
    marginLeft: '8%',
    marginRight: '8%',
  },
  tutorialLeadText: {
    color: '#ffffff',
  },
  tutorialStepText: {
    marginTop: 8,
    color: '#dddddd',
  },
});

export default CloudScreen;
