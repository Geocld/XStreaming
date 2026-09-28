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
  AppState,
} from 'react-native';
import {
  Text,
  Portal,
  Modal,
  Card,
  Icon,
  Button,
  useTheme,
} from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useIsFocused } from '@react-navigation/native';
import {
  useGamepadNavigation,
  useGamepadActiveState,
  useGamepadConnectedState,
} from '../utils/useGamepadNavigation';

import Spinner from '../components/Spinner';
import XStreamingGameCard from '../components/XStreamingGameCard';
import XboxLogo from '../components/XboxLogo';
import Empty from '../components/Empty';
import SessionReportModal from '../components/SessionReportModal';
import GamepadFooterHints, {
  GamepadHintItem,
} from '../components/GamepadFooterHints';
import XcloudApi from '../xCloud';
import WebApi from '../web';
import StreamingToken from '../tokens/streamingtoken';
import { debugFactory } from '../utils/debug';
import {
  SIGL_GAME_PASS,
  SIGL_RECENTLY_ADDED,
  SIGL_UBISOFT_CLASSICS,
  SIGL_STREAM_YOUR_OWN,
  SIGL_LEAVING_SOON,
  SIGL_STREAM_FREE_WITH_ADS,
  isGamePassSubscriptionTitle,
  isUbisoftTitle,
  isFreeWithAdsTitle,
  fetchSiglTitles,
  getRegionDisplayInfo,
  detectAccountTier,
  detectTokenTier,
  getCachedAccountTier,
  saveCachedAccountTier,
  buildTitleLookupMap,
  resolveXboxGamertag,
} from '../utils/xcloud';
import {
  getXcloudData,
  saveXcloudData,
  isxCloudDataValid,
} from '../store/xcloudStore';
import { getSettings, saveSettings } from '../store/settingStore';
import { getStreamToken, isStreamTokenValid } from '../store/streamTokenStore';
import { getWebToken, isWebTokenValid } from '../store/webTokenStore';
import { storage } from '../store/mmkv';
import { syncRegionSettings } from '../utils/regionSync';

const { UsbRumbleManager, FullScreenManager } = NativeModules;
const log = debugFactory('CloudScreen');

// Region selection modal component
interface RegionSelectModalProps {
  visible: boolean;
  onDismiss: () => void;
  availableRegions: any[];
  currentRegionName: string;
  onSelectRegion: (name: string) => void;
  screenHeight: number;
  t: (key: string) => string;
  isGamepadActive?: boolean;
}

const RegionSelectModal: React.FC<RegionSelectModalProps> = ({
  visible,
  onDismiss,
  currentRegionName,
  availableRegions,
  onSelectRegion,
  screenHeight,
  t,
  isGamepadActive = false,
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [modalFocusedIndex, setModalFocusedIndex] = React.useState<number>(0);

  // Sync focused index to current region when opened
  React.useEffect(() => {
    if (visible && availableRegions.length > 0) {
      const idx = availableRegions.findIndex(
        r =>
          r.name === currentRegionName || (!currentRegionName && r.isDefault),
      );
      const targetIdx = idx >= 0 ? idx : 0;
      setModalFocusedIndex(targetIdx);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, targetIdx * 56 - 56),
          animated: true,
        });
      }, 100);
    }
  }, [visible, currentRegionName, availableRegions]);

  useGamepadNavigation({
    enabled: visible,
    priority: 10,
    onUp: () => {
      setModalFocusedIndex(prev => {
        const next = Math.max(0, prev - 1);
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, next * 56 - 56),
          animated: true,
        });
        return next;
      });
    },
    onDown: () => {
      setModalFocusedIndex(prev => {
        const next = Math.min(availableRegions.length - 1, prev + 1);
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, next * 56 - 56),
          animated: true,
        });
        return next;
      });
    },
    onSelect: () => {
      const selected = availableRegions[modalFocusedIndex];
      if (selected) {
        onSelectRegion(selected.name);
      }
    },
    onBack: () => {
      onDismiss();
    },
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.dialogContainer,
          isLandscape && styles.dialogContainerLandscape,
          { maxHeight: (screenHeight || winH) * (isLandscape ? 0.9 : 0.76) },
        ]}>
        <Card style={[styles.modalCard, isLight && styles.modalCardLight]}>
          <Card.Title
            title={t('Select Cloud Server')}
            titleStyle={[styles.modalTitle, isLight && styles.modalTitleLight]}
            left={props => (
              <Icon {...props} source="earth" color={primary} size={24} />
            )}
          />
          <ScrollView
            ref={scrollViewRef}
            style={{
              maxHeight: (screenHeight || winH) * (isLandscape ? 0.68 : 0.58),
            }}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}>
            {availableRegions.map((reg, idx) => {
              const info = getRegionDisplayInfo(reg.name);
              const isSelected =
                currentRegionName === reg.name ||
                (!currentRegionName && reg.isDefault);
              const isFocused = isGamepadActive && modalFocusedIndex === idx;
              return (
                <Pressable
                  key={reg.name}
                  focusable={true}
                  onPress={() => onSelectRegion(reg.name)}
                  style={({ pressed, focused }: any) => [
                    styles.regionModalOption,
                    isLight && styles.regionModalOptionLight,
                    isSelected && [
                      styles.modalOptionActive,
                      { backgroundColor: primary + '1A' },
                    ],
                    (isFocused || focused) && [
                      styles.modalOptionFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed && styles.modalOptionPressed,
                  ]}>
                  <View style={styles.regionOptionLeft}>
                    <Text style={styles.modalRegionFlag}>{info.flag}</Text>
                    <View style={styles.modalRegionInfo}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.modalOptionTitle,
                          isLight && styles.modalOptionTitleLight,
                          isSelected && { color: primary, fontWeight: '700' },
                        ]}>
                        {info.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.modalRegionCode,
                          isLight && styles.modalRegionCodeLight,
                        ]}>
                        {reg.name}
                      </Text>
                    </View>
                  </View>
                  {isSelected && (
                    <Icon source="check" size={20} color={primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>
      </Modal>
    </Portal>
  );
};

// Sort options modal component
interface SortOptionModalProps {
  visible: boolean;
  onDismiss: () => void;
  sortBy: string;
  onSelectSort: (key: any) => void;
  t: (key: string) => string;
  isGamepadActive?: boolean;
}

const SortOptionModal: React.FC<SortOptionModalProps> = ({
  visible,
  onDismiss,
  sortBy,
  onSelectSort,
  t,
  isGamepadActive = false,
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const options = React.useMemo(
    () => [
      { key: 'relevance', label: t('Relevance') },
      { key: 'az', label: 'A - Z' },
      { key: 'za', label: 'Z - A' },
      { key: 'newest', label: t('Newest') },
    ],
    [t],
  );

  const [modalFocusedIndex, setModalFocusedIndex] = React.useState<number>(0);

  React.useEffect(() => {
    if (visible) {
      const idx = options.findIndex(o => o.key === sortBy);
      setModalFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [visible, sortBy, options]);

  useGamepadNavigation({
    enabled: visible,
    priority: 10,
    onUp: () => {
      setModalFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setModalFocusedIndex(prev => Math.min(options.length - 1, prev + 1));
    },
    onSelect: () => {
      const selected = options[modalFocusedIndex];
      if (selected) {
        onSelectSort(selected.key);
      }
    },
    onBack: () => {
      onDismiss();
    },
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.dialogContainer,
          isLandscape && styles.dialogContainerLandscape,
        ]}>
        <Card style={[styles.modalCard, isLight && styles.modalCardLight]}>
          <Card.Title
            title={t('Sort: Relevance')}
            titleStyle={[styles.modalTitle, isLight && styles.modalTitleLight]}
            left={props => (
              <Icon
                {...props}
                source="sort-variant"
                color={primary}
                size={24}
              />
            )}
          />
          <Card.Content>
            {options.map((opt, idx) => {
              const isFocused = isGamepadActive && modalFocusedIndex === idx;
              return (
                <Pressable
                  key={opt.key}
                  focusable={true}
                  onPress={() => onSelectSort(opt.key)}
                  style={({ pressed, focused }: any) => [
                    styles.modalOption,
                    sortBy === opt.key && [
                      styles.modalOptionActive,
                      { backgroundColor: primary + '1A' },
                    ],
                    (isFocused || focused) && [
                      styles.modalOptionFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed && styles.modalOptionPressed,
                  ]}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      isLight && styles.modalOptionTextLight,
                      sortBy === opt.key && { color: primary, fontWeight: '700' },
                    ]}>
                    {opt.label}
                  </Text>
                  {sortBy === opt.key && (
                    <Icon source="check" size={18} color={primary} />
                  )}
                </Pressable>
              );
            })}
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
  showFreeWithAds?: boolean;
  hideUbisoft?: boolean;
  onSelectFilter: (key: any) => void;
  t: (key: string) => string;
  isGamepadActive?: boolean;
}

const FilterOptionModal: React.FC<FilterOptionModalProps> = ({
  visible,
  onDismiss,
  filterCategory,
  showFreeWithAds = false,
  hideUbisoft = false,
  onSelectFilter,
  t,
  isGamepadActive = false,
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const filterOptions = React.useMemo(() => {
    const opts = [{ key: 'all', label: t('All') }];
    if (showFreeWithAds) {
      opts.push({ key: 'free_ads', label: t('Stream for free with ads') });
    }
    opts.push(
      { key: 'play_gamepass', label: t('Play with Game Pass') },
      { key: 'new', label: t('Recently Added') },
    );
    if (!hideUbisoft) {
      opts.push({ key: 'ubisoft', label: t('Ubisoft+ Classic') });
    }
    opts.push(
      { key: 'own', label: t('Stream your own game') },
      { key: 'leaving', label: t('Leaving soon') },
      { key: 'recent', label: t('Recently') },
    );
    return opts;
  }, [t, showFreeWithAds, hideUbisoft]);

  const [modalFocusedIndex, setModalFocusedIndex] = React.useState<number>(0);

  React.useEffect(() => {
    if (visible) {
      const idx = filterOptions.findIndex(o => o.key === filterCategory);
      setModalFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [visible, filterCategory, filterOptions]);

  useGamepadNavigation({
    enabled: visible,
    priority: 10,
    onUp: () => {
      setModalFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setModalFocusedIndex(prev =>
        Math.min(filterOptions.length - 1, prev + 1),
      );
    },
    onSelect: () => {
      const selected = filterOptions[modalFocusedIndex];
      if (selected) {
        onSelectFilter(selected.key);
      }
    },
    onBack: () => {
      onDismiss();
    },
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.dialogContainer,
          isLandscape && styles.dialogContainerLandscape,
          { maxHeight: winH * (isLandscape ? 0.9 : 0.8) },
        ]}>
        <Card style={[styles.modalCard, isLight && styles.modalCardLight]}>
          <Card.Title
            title={t('Filters')}
            titleStyle={[styles.modalTitle, isLight && styles.modalTitleLight]}
            left={props => (
              <Icon
                {...props}
                source="filter-variant"
                color={primary}
                size={24}
              />
            )}
          />
          <Card.Content>
            {filterOptions.map((opt, idx) => {
              const isFocused = isGamepadActive && modalFocusedIndex === idx;
              return (
                <Pressable
                  key={opt.key}
                  focusable={true}
                  onPress={() => onSelectFilter(opt.key)}
                  style={({ pressed, focused }: any) => [
                    styles.modalOption,
                    filterCategory === opt.key && [
                      styles.modalOptionActive,
                      { backgroundColor: primary + '1A' },
                    ],
                    (isFocused || focused) && [
                      styles.modalOptionFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed && styles.modalOptionPressed,
                  ]}>
                  <Text
                    style={[
                      styles.modalOptionText,
                      isLight && styles.modalOptionTextLight,
                      filterCategory === opt.key && {
                        color: primary,
                        fontWeight: '700',
                      },
                    ]}>
                    {opt.label}
                  </Text>
                  {filterCategory === opt.key && (
                    <Icon source="check" size={18} color={primary} />
                  )}
                </Pressable>
              );
            })}
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
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const onPrimary = theme.colors.onPrimary || '#FFFFFF';
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.dialogContainer,
          isLandscape && styles.dialogContainerLandscape,
        ]}>
        <Card style={[styles.modalCard, isLight && styles.modalCardLight]}>
          <Card.Content>
            <Text
              style={[
                styles.usbWarningText,
                isLight && styles.usbWarningTextLight,
              ]}>
              {t(
                'It has been detected that you are using the wired connection mode with the Overwrite Android driver. If the USB connection is disconnected during the game, please exit the game and reconnect the controller; otherwise, the controller buttons will become unresponsive',
              )}
            </Text>
            <Button
              mode="contained"
              buttonColor={primary}
              textColor={onPrimary}
              onPress={onConfirm}>
              {t('Confirm')}
            </Button>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

// Cloud gaming acceleration guide modal
interface TutorialModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ visible, onDismiss }) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.tutorialModalContainer,
          isLandscape && styles.tutorialModalContainerLandscape,
        ]}>
        <Card style={[styles.modalCard, isLight && styles.modalCardLight]}>
          <Card.Content>
            <Text
              variant="bodyMedium"
              style={[
                styles.tutorialLeadText,
                isLight && styles.tutorialLeadTextLight,
              ]}>
              如果你在中国大陆地区，因为云游戏服务器均在海外，云游戏延迟和丢包率高都是正常现象，
              如果你需要使用加速器提升云游戏质量，请按照以下操作顺序加速云游戏。
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.tutorialStepText,
                isLight && styles.tutorialStepTextLight,
              ]}>
              1. 打开XStreaming，设置 - 云游戏 -
              地区选择日本或韩国，选择后记得保存。
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.tutorialStepText,
                isLight && styles.tutorialStepTextLight,
              ]}>
              2.
              进入云游戏栏目，选择游戏直接开始，待连接成功显示游戏画面后，将XStreaming切到后台。
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.tutorialStepText,
                isLight && styles.tutorialStepTextLight,
              ]}>
              3. 打开加速器，选择加速『XStreaming』，等待加速成功后切回游戏。
            </Text>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

interface CarouselSectionProps {
  title: string;
  subtitle?: string;
  data: any[];
  categoryKey: any;
  idPrefix: string;
  isSectionActive: boolean;
  focusedIndex: number;
  isGamepadActive: boolean;
  horizontalCardWidth: number;
  horizontalCardHeight: number;
  isLandscape: boolean;
  isLight: boolean;
  primary: string;
  onPress: (item: any) => void;
  onPlayPress: (item: any) => void;
  hidePlayButton?: boolean;
  onShowAll: (categoryKey: any) => void;
  sectionRefCallback: (ref: any) => void;
  onMomentumScrollEndCallback: (e: any) => void;
  t: (key: string) => string;
}

const CarouselSection = React.memo<CarouselSectionProps>(
  ({
    title,
    subtitle,
    data,
    categoryKey,
    idPrefix,
    isSectionActive,
    focusedIndex,
    isGamepadActive,
    hidePlayButton = false,
    horizontalCardWidth,
    horizontalCardHeight,
    isLandscape,
    isLight,
    primary,
    onPress,
    onPlayPress,
    onShowAll,
    sectionRefCallback,
    onMomentumScrollEndCallback,
    t,
  }) => {
    if (!data || data.length === 0) return null;
    const maxItems = Platform.isTV ? 6 : 10;
    const hasMoreThanMax = data.length > maxItems;
    const displayData = React.useMemo(
      () => (hasMoreThanMax ? data.slice(0, maxItems) : data),
      [data, hasMoreThanMax, maxItems],
    );

    const renderCard = React.useCallback(
      ({ item, index }: { item: any; index: number }) => (
        <XStreamingGameCard
          titleItem={item}
          width={horizontalCardWidth}
          height={horizontalCardHeight}
          onPress={onPress}
          onPlayPress={onPlayPress}
          style={styles.horizontalCardMargin}
          hasTVPreferredFocus={false}
          isFocused={
            isGamepadActive && isSectionActive && focusedIndex === index
          }
          hidePlayButton={hidePlayButton}
        />
      ),
      [
        horizontalCardWidth,
        horizontalCardHeight,
        onPress,
        onPlayPress,
        isGamepadActive,
        isSectionActive,
        focusedIndex,
        hidePlayButton,
      ],
    );

    const getItemLayout = React.useCallback(
      (_: any, index: number) => ({
        length: horizontalCardWidth + 10,
        offset: (horizontalCardWidth + 10) * index,
        index,
      }),
      [horizontalCardWidth],
    );

    const keyExtractor = React.useCallback(
      (item: any, index: number) =>
        `${idPrefix}_${item.titleId || item.XCloudTitleId || index}`,
      [idPrefix],
    );

    return (
      <View
        style={[
          styles.carouselSection,
          isLandscape && styles.carouselSectionLandscape,
        ]}>
        <View
          style={[
            styles.sectionHeaderRow,
            isLandscape && styles.sectionHeaderRowLandscape,
          ]}>
          <View style={styles.sectionTitleCol}>
            <Text
              style={[
                styles.sectionTitle,
                isLandscape && styles.sectionTitleLandscape,
                isLight && styles.sectionTitleLight,
              ]}
              numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.sectionSubtitle,
                  isLight && styles.sectionSubtitleLight,
                ]}
                numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {hasMoreThanMax && (
            <Pressable
              focusable={true}
              onPress={() => onShowAll(categoryKey)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed, focused }: any) => [
                styles.showAllHeaderButton,
                { backgroundColor: primary + '1A' },
                focused && styles.showAllHeaderButtonFocused,
                pressed && [
                  styles.showAllHeaderButtonPressed,
                  { backgroundColor: primary + '33' },
                ],
              ]}>
              <Text style={[styles.showAllHeaderText, { color: primary }]}>
                {t('Show all')}
              </Text>
              <Icon source="chevron-right" size={13} color={primary} />
            </Pressable>
          )}
        </View>

        <FlatList
          ref={sectionRefCallback}
          horizontal
          data={displayData}
          extraData={`${primary}_${isLight}_${isLandscape}_${isGamepadActive}_${hidePlayButton}_${isSectionActive ? focusedIndex : -1
            }`}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          style={[
            styles.horizontalListWrap,
            isLandscape && styles.horizontalListWrapLandscape,
          ]}
          contentContainerStyle={[
            styles.horizontalListContent,
            isLandscape && styles.horizontalListContentLandscape,
          ]}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumScrollEndCallback}
          initialNumToRender={isLandscape ? 6 : 3}
          maxToRenderPerBatch={isLandscape ? 4 : 2}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          renderItem={renderCard}
          ListFooterComponent={() => {
            if (!hasMoreThanMax) return null;
            const isShowAllCardFocused =
              isGamepadActive &&
              isSectionActive &&
              focusedIndex === displayData.length;
            return (
              <Pressable
                focusable={true}
                onPress={() => onShowAll(categoryKey)}
                style={({ pressed, focused }: any) => [
                  styles.showAllCard,
                  isLight && styles.showAllCardLight,
                  {
                    width: horizontalCardWidth,
                    height: horizontalCardHeight,
                    borderColor: isShowAllCardFocused
                      ? isLight
                        ? primary
                        : '#FFFFFF'
                      : primary + '4D',
                    borderWidth: isShowAllCardFocused ? 2.5 : 1,
                  },
                  (isShowAllCardFocused || focused) && [
                    styles.showAllCardFocused,
                    { borderColor: isLight ? primary : '#FFFFFF' },
                  ],
                  pressed && [
                    styles.showAllCardPressed,
                    { borderColor: primary, backgroundColor: primary + '1A' },
                  ],
                ]}>
                <View
                  style={[
                    styles.showAllIconCircle,
                    {
                      backgroundColor: isShowAllCardFocused
                        ? primary
                        : primary + '1A',
                    },
                  ]}>
                  <Icon
                    source="arrow-right"
                    size={24}
                    color={isShowAllCardFocused ? '#FFFFFF' : primary}
                  />
                </View>
                <Text
                  style={[
                    styles.showAllCardTitle,
                    isLight && styles.showAllCardTitleLight,
                    isShowAllCardFocused && {
                      fontWeight: '700',
                      color: isLight ? primary : '#FFFFFF',
                    },
                  ]}>
                  {t('Show all')}
                </Text>
                <Text style={[styles.showAllCardSubtitle, { color: primary }]}>
                  {`+${data.length - maxItems} ${t('available')}`}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    );
  },
);

function CloudScreen({ navigation, route }: any) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const onPrimary = theme.colors.onPrimary || '#FFFFFF';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const dispatch = useDispatch();

  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);
  const starTitles = useSelector((state: any) => state.stars || []);
  const profile = useSelector((state: any) => state.profile);

  const effectiveXCloudToken = React.useMemo(() => {
    if (streamingTokens?.xCloudToken) {
      return streamingTokens.xCloudToken;
    }
    const saved = getStreamToken();
    if (saved?.xCloudToken && isStreamTokenValid(saved.xCloudToken)) {
      return saved.xCloudToken.getOffering
        ? saved.xCloudToken
        : new StreamingToken(
          saved.xCloudToken.data,
          saved.xCloudToken.offering,
        );
    }
    return undefined;
  }, [streamingTokens?.xCloudToken]);

  const currentLanguage = i18n.language;

  const initialCache = React.useMemo(() => {
    const currentGtg = storage.getString('user.gamertag') || '';
    const cached = getXcloudData(currentGtg);
    return cached && isxCloudDataValid(cached) ? cached : null;
  }, []);

  // Catalog and loading states
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [showTutorial, setShowTutorial] = React.useState(false);

  const [titles, setTitles] = React.useState<any[]>(
    () => initialCache?.titles || [],
  );
  const [titleMap, setTitleMap] = React.useState<Record<string, any>>(() => {
    if (initialCache?.titleMap) return initialCache.titleMap;
    if (initialCache?.titles?.length)
      return buildTitleLookupMap(initialCache.titles);
    return {};
  });
  const [newTitles, setNewTitles] = React.useState<any[]>(
    () => initialCache?.newTitles || [],
  );
  const [recentTitles, setRecentTitles] = React.useState<any[]>(
    () => initialCache?.recentTitles || [],
  );
  const [leavingSoonTitles, setLeavingSoonTitles] = React.useState<any[]>(
    () => initialCache?.leavingSoonTitles || [],
  );
  const [gamePassTitles, setGamePassTitles] = React.useState<any[]>(() => {
    if (initialCache?.playWithGamePassTitles) {
      return initialCache.playWithGamePassTitles.filter(
        isGamePassSubscriptionTitle,
      );
    }
    return [];
  });
  const [ubisoftTitlesData, setUbisoftTitlesData] = React.useState<any[]>(
    () => {
      if (initialCache?.ubisoftTitles) {
        return initialCache.ubisoftTitles.filter(isUbisoftTitle);
      }
      return [];
    },
  );
  const [streamYourOwnTitlesData, setStreamYourOwnTitlesData] = React.useState<
    any[]
  >(() => initialCache?.streamYourOwnTitles || []);
  const [freeWithAdsTitles, setFreeWithAdsTitles] = React.useState<any[]>(
    () => initialCache?.freeWithAdsTitles || [],
  );

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
    const activeToken = effectiveXCloudToken || streamingTokens?.xCloudToken;
    const directTier = detectTokenTier(activeToken);
    if (directTier) return directTier;

    const currentGtg =
      storage.getString('user.gamertag') ||
      '';
    const cached = getCachedAccountTier(currentGtg);
    if (cached === 'Core') return 'Essential';
    if (cached === 'Standard') return 'Premium';
    if (cached === 'FREE' || cached === 'Free') return 'Free';
    if (cached === 'Ultimate' || cached === 'Essential' || cached === 'Premium') {
      return cached;
    }
    return 'Free';
  });

  // Server region state
  const [currentRegionName, setCurrentRegionName] = React.useState<string>(
    () => {
      const settings = getSettings();
      return settings.signaling_cloud_name || '';
    },
  );
  const [showRegionModal, setShowRegionModal] = React.useState(false);

  // Navigation and filter states
  const [sortBy, setSortBy] = React.useState<
    'relevance' | 'az' | 'za' | 'newest'
  >('relevance');
  const [filterCategory, setFilterCategory] = React.useState<
    'all' | 'free_ads' | 'play_gamepass' | 'new' | 'ubisoft' | 'own' | 'leaving' | 'recent'
  >('all');
  const [showSortModal, setShowSortModal] = React.useState(false);
  const [showFilterModal, setShowFilterModal] = React.useState(false);

  // USB controller state
  const [showUsbWarnModal, setShowUsbWarnModal] = React.useState(false);
  const [pendingLaunchTitle, setPendingLaunchTitle] = React.useState<any>(null);

  // Session report modal state
  const [sessionReport, setSessionReport] = React.useState<any>(null);

  React.useEffect(() => {
    if (route.params?.sessionReport) {
      const currentSettings = getSettings();
      const isShowReport =
        String(currentSettings.show_session_report) === 'true';
      if (isShowReport) {
        setSessionReport(route.params.sessionReport);
      }
    }
  }, [route.params?.sessionReport]);

  const handleDismissReport = React.useCallback(() => {
    setSessionReport(null);
    navigation.setParams({ sessionReport: undefined });
  }, [navigation]);

  const handleDoneReport = React.useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) {
        const currentSettings = getSettings();
        saveSettings({ ...currentSettings, show_session_report: false });
      }
      setSessionReport(null);
      navigation.setParams({ sessionReport: undefined });
    },
    [navigation],
  );

  const flatListRef = React.useRef<any>(null);
  const currentScrollOffsetRef = React.useRef<number>(0);
  const hasFetchedGamesRef = React.useRef(!!initialCache);

  // Orientation and dimension calculations
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;

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

  const horizontalCardWidth = isLandscape ? 120 : isLargeScreen ? 140 : 124;
  const horizontalCardHeight = Math.round(horizontalCardWidth * 1.38);
  const pageSize = 12;

  // Unique account identifier for caching and isolation
  const userKey = React.useMemo(() => {
    return (
      webToken?.data?.DisplayClaims?.xui?.[0]?.xid ||
      webToken?.data?.DisplayClaims?.xui?.[0]?.gtg ||
      profile?.Gamertag ||
      profile?.gamertag ||
      fetchedGamertag ||
      storage.getString('user.gamertag') ||
      ''
    );
  }, [webToken, profile, fetchedGamertag]);

  // Fast account switch & token offering sync to prevent stale tier display
  React.useEffect(() => {
    const activeToken = effectiveXCloudToken || streamingTokens?.xCloudToken;
    const directTier = detectTokenTier(activeToken);
    if (directTier) {
      setAccountTier(directTier);
      saveCachedAccountTier(directTier, userKey);
      return;
    }

    if (userKey) {
      const cached = getCachedAccountTier(userKey);
      if (cached) {
        setAccountTier(cached);
        return;
      }
    }
    setAccountTier('Free');
  }, [effectiveXCloudToken, streamingTokens?.xCloudToken, userKey]);

  // Resolved user Gamertag
  const gamertag = React.useMemo(() => {
    return resolveXboxGamertag(
      fetchedGamertag,
      profile,
      webToken,
      streamingTokens,
    );
  }, [fetchedGamertag, profile, webToken, streamingTokens]);

  // Subscription tier label (Free, Essential, Premium, Ultimate)
  const displayTier = React.useMemo(() => {
    const activeToken = effectiveXCloudToken || streamingTokens?.xCloudToken;
    const offering =
      activeToken?.getOffering?.() ||
      activeToken?.offering ||
      (activeToken?.getDefaultRegion?.()?.baseUri?.includes('xgpuwebf2p')
        ? 'xgpuwebf2p'
        : undefined) ||
      (activeToken?.data?.offeringSettings?.regions?.some?.((r: any) =>
        r.baseUri?.includes('xgpuwebf2p'),
      )
        ? 'xgpuwebf2p'
        : undefined) ||
      (activeToken?.data?.offeringSettings?.regions?.some?.((r: any) =>
        r.baseUri?.includes('xgpuweb'),
      )
        ? 'xgpuweb'
        : undefined);

    if (offering === 'xgpuwebf2p') return 'Free';
    if (accountTier === 'Core') return 'Essential';
    if (accountTier === 'Standard') return 'Premium';
    if (accountTier === 'FREE' || accountTier === 'Free') return 'Free';
    if (accountTier === 'Essential' || accountTier === 'Premium')
      return accountTier;
    if (accountTier === 'Ultimate') {
      return 'Ultimate';
    }
    return 'Free';
  }, [accountTier, effectiveXCloudToken, streamingTokens?.xCloudToken]);

  const isFocused = useIsFocused();
  const [previewFeaturesEnabled, setPreviewFeaturesEnabled] =
    React.useState<boolean>(() => {
      const settings = getSettings();
      return Boolean(
        settings.preview_features ||
        storage.getBoolean('user.preview_features') ||
        storage.getBoolean('user.is_insider'),
      );
    });

  React.useEffect(() => {
    if (isFocused) {
      const settings = getSettings();
      const enabled = Boolean(
        settings.preview_features ||
        storage.getBoolean('user.preview_features') ||
        storage.getBoolean('user.is_insider'),
      );
      setPreviewFeaturesEnabled(enabled);
    }
  }, [isFocused]);

  const isFreeTier = React.useMemo(() => {
    return (
      displayTier === 'Free' ||
      accountTier === 'Free' ||
      accountTier === 'FREE'
    );
  }, [displayTier, accountTier]);

  // Stream free with ads is strictly relevant ONLY for Free tier accounts.
  // Tiers above Free (Ultimate, Premium, Essential) must never display this section,
  // even if previewFeaturesEnabled (Xbox Insider) is turned on.
  const showFreeWithAds = React.useMemo(() => {
    return isFreeTier;
  }, [isFreeTier]);

  // Auto-reset category filter if currently on free_ads but user is not on Free tier
  React.useEffect(() => {
    if (!showFreeWithAds && filterCategory === 'free_ads') {
      setFilterCategory('all');
    }
  }, [showFreeWithAds, filterCategory]);

  // Available server regions
  const availableRegions = React.useMemo(() => {
    const activeToken = effectiveXCloudToken || streamingTokens?.xCloudToken;
    const tokenRegions = activeToken?.getRegions?.() || [];
    if (tokenRegions.length > 0) {
      return tokenRegions;
    }
    return [
      { name: 'KoreaCentral', isDefault: true },
      { name: 'JapanEast', isDefault: false },
      { name: 'SoutheastAsia', isDefault: false },
      { name: 'AustraliaEast', isDefault: false },
      { name: 'WestUS2', isDefault: false },
      { name: 'EastUS', isDefault: false },
      { name: 'WestEurope', isDefault: false },
      { name: 'NorthEurope', isDefault: false },
      { name: 'BrazilSouth', isDefault: false },
    ];
  }, [effectiveXCloudToken, streamingTokens]);

  // Current server region info
  const currentRegionInfo = React.useMemo(() => {
    if (currentRegionName) {
      return getRegionDisplayInfo(currentRegionName);
    }
    const activeToken = effectiveXCloudToken || streamingTokens?.xCloudToken;
    const def = activeToken?.getDefaultRegion?.();
    if (def?.name) {
      return getRegionDisplayInfo(def.name);
    }
    return getRegionDisplayInfo('KoreaCentral');
  }, [currentRegionName, effectiveXCloudToken, streamingTokens]);

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

  // Free with ads channel titles (Fortnite, Once Human, Rainbow 6 Siege, Warzone, etc.)
  const freeWithAdsTitlesList = React.useMemo(() => {
    if (freeWithAdsTitles.length > 0) {
      return freeWithAdsTitles;
    }
    return titles.filter(isFreeWithAdsTitle);
  }, [freeWithAdsTitles, titles]);

  // Stream your own games channel titles
  const streamYourOwnTitles = React.useMemo(() => {
    if (streamYourOwnTitlesData.length > 0) {
      return streamYourOwnTitlesData;
    }
    const ownedKeywords = [
      'cyberpunk',
      'witcher',
      'hogwarts',
      "baldur's gate",
      'grand theft auto',
      'gta',
      'red dead',
      'nba 2k',
      'call of duty',
      'final fantasy',
      'dying light',
      'star wars outlaws',
      'avatar',
      'elden ring',
      'warhammer',
      'mortal kombat',
      'destiny',
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
      const res: any = await webApi.getUserProfile();
      if (res?.Gamertag) {
        setFetchedGamertag(res.Gamertag);
        storage.set('user.gamertag', res.Gamertag);
      }
      if (res?.GameDisplayPicRaw) {
        setGamerpic(res.GameDisplayPicRaw);
        storage.set('user.gamerpic', res.GameDisplayPicRaw);
      }
      dispatch({ type: 'SET_PROFILE', payload: res });
    } catch (err) {
      log.info('fetchUserProfile error:', err);
    }
  };

  // Fetch full cloud catalog and SIGL channels
  const fetchCatalog = async (silent = false) => {
    const activeToken = effectiveXCloudToken || streamingTokens.xCloudToken;
    if (!activeToken) return;
    if (!silent) setLoading(true);

    try {
      const baseUri = activeToken.getDefaultRegion().baseUri;
      const gsToken = activeToken.data.gsToken;
      const api = new XcloudApi(baseUri, gsToken, 'cloud');

      const titleRes: any = await api.getTitles();
      if (!titleRes?.results?.length) {
        const fallbackTier = detectAccountTier([], activeToken);
        setAccountTier(fallbackTier);
        saveCachedAccountTier(fallbackTier, userKey);
        if (!silent) setLoading(false);
        return;
      }

      // Immediately detect and apply account tier from titleRes results (< 1ms)
      // Do NOT block tier display on the long api.getGamePassProducts catalog fetch
      let tier = detectAccountTier(titleRes.results, activeToken);
      setAccountTier(tier);
      saveCachedAccountTier(tier, userKey);

      const rawTitles = await api.getGamePassProducts(titleRes.results);
      if (tier === 'Free' && rawTitles && rawTitles.length > 0) {
        const recheckTier = detectAccountTier(rawTitles, activeToken);
        if (recheckTier !== 'Free') {
          tier = recheckTier;
          setAccountTier(tier);
          saveCachedAccountTier(tier, userKey);
        }
      }
      setTitles(rawTitles);

      const lookupMap = buildTitleLookupMap(rawTitles);
      setTitleMap(lookupMap);

      // Concurrently fetch SIGL collections
      const [
        gpRes,
        newRes,
        ubiRes,
        ownRes,
        leaveRes,
        freeAdsRes,
        recentRes,
      ] = await Promise.allSettled([
        fetchSiglTitles(
          SIGL_GAME_PASS,
          lookupMap,
          isGamePassSubscriptionTitle,
        ),
        fetchSiglTitles(SIGL_RECENTLY_ADDED, lookupMap),
        fetchSiglTitles(SIGL_UBISOFT_CLASSICS, lookupMap, isUbisoftTitle),
        fetchSiglTitles(SIGL_STREAM_YOUR_OWN, lookupMap),
        fetchSiglTitles(SIGL_LEAVING_SOON, lookupMap),
        fetchSiglTitles(SIGL_STREAM_FREE_WITH_ADS, lookupMap),
        api.getRecentTitles(),
      ]);

      const gpList = (gpRes.status === 'fulfilled' ? gpRes.value : []).filter(
        isGamePassSubscriptionTitle,
      );
      const newList = newRes.status === 'fulfilled' ? newRes.value : [];
      const ubiList = (
        ubiRes.status === 'fulfilled' ? ubiRes.value : []
      ).filter(isUbisoftTitle);
      const ownList = ownRes.status === 'fulfilled' ? ownRes.value : [];
      const leaveList = leaveRes.status === 'fulfilled' ? leaveRes.value : [];
      const freeAdsList =
        freeAdsRes.status === 'fulfilled' ? freeAdsRes.value : [];
      const fallbackFreeAds = rawTitles.filter(isFreeWithAdsTitle);
      const effectiveFreeAds =
        freeAdsList.length > 0 ? freeAdsList : fallbackFreeAds;

      if (gpList.length > 0) setGamePassTitles(gpList);
      if (newList.length > 0) setNewTitles(newList);
      if (ubiList.length > 0) setUbisoftTitlesData(ubiList);
      if (ownList.length > 0) setStreamYourOwnTitlesData(ownList);
      if (leaveList.length > 0) setLeavingSoonTitles(leaveList);
      if (effectiveFreeAds.length > 0) setFreeWithAdsTitles(effectiveFreeAds);

      const recentList: any[] = [];
      const recentVal: any =
        recentRes.status === 'fulfilled' ? recentRes.value : null;
      if (recentVal?.results) {
        recentVal.results.forEach((item: any) => {
          const pid = item.details?.productId;
          if (pid && (lookupMap[pid] || lookupMap[pid.toUpperCase()])) {
            recentList.push(lookupMap[pid] || lookupMap[pid.toUpperCase()]);
          }
        });
        setRecentTitles(recentList);
      }

      // Update cache
      const cached = getXcloudData(userKey);
      saveXcloudData(
        {
          ...cached,
          titles: rawTitles,
          playWithGamePassTitles: gpList,
          newTitles: newList,
          ubisoftTitles: ubiList,
          streamYourOwnTitles: ownList,
          leavingSoonTitles: leaveList,
          freeWithAdsTitles: effectiveFreeAds,
          recentTitles: recentList,
        },
        userKey,
      );

      // Prefetch top images for instantaneous visual appearance
      const prefetchPool = [
        ...recentList.slice(0, 6),
        ...gpList.slice(0, 6),
        ...leaveList.slice(0, 6),
      ];
      prefetchPool.forEach((item: any) => {
        const raw =
          item?.Image_Poster?.URL ||
          item?.Image_Tile?.URL ||
          item?.details?.posterUrl;
        if (raw && typeof raw === 'string') {
          const full = raw.startsWith('http') ? raw : `https:${raw}`;
          try {
            Image.prefetch(full);
          } catch (ignored) { }
        }
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
    const activeToken = effectiveXCloudToken || streamingTokens.xCloudToken;
    if (!activeToken) {
      setIsLimited(true);
    } else {
      setIsLimited(false);
    }

    const curWebToken = webToken?.data ? webToken : getWebToken();
    fetchUserProfile(curWebToken);

    if (!hasFetchedGamesRef.current) {
      const cacheData = getXcloudData(userKey);
      if (cacheData && isxCloudDataValid(cacheData)) {
        log.info('Get xcloud data from cache');
        const {
          titles: _titles,
          newTitles: _newTitles,
          starTitles: _starTitles,
          recentTitles: _recentTitles,
          playWithGamePassTitles: _gpTitles,
          ubisoftTitles: _ubiTitles,
          streamYourOwnTitles: _ownTitles,
          leavingSoonTitles: _leaveTitles,
          freeWithAdsTitles: _freeAdsTitles,
        } = cacheData;

        setTitles(_titles || []);
        setTitleMap(buildTitleLookupMap(_titles || []));
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
        if (_freeAdsTitles) {
          setFreeWithAdsTitles(_freeAdsTitles);
        }

        dispatch({ type: 'SET_STARS', payload: _starTitles || [] });
        fetchCatalog(true);
      } else {
        fetchCatalog();
      }
    } else if (titles.length > 0) {
      fetchCatalog(true);
    }
  }, [
    route.params?.keyword,
    effectiveXCloudToken,
    streamingTokens.xCloudToken,
    webToken,
    navigation,
    dispatch,
  ]);

  // AppState listener to re-validate or rehydrate cache when returning from another app
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        const cacheData = getXcloudData();
        if (cacheData && isxCloudDataValid(cacheData)) {
          if (titles.length === 0) {
            setTitles(cacheData.titles || []);
            setTitleMap(buildTitleLookupMap(cacheData.titles || []));
            if (cacheData.newTitles) setNewTitles(cacheData.newTitles);
            if (cacheData.recentTitles) setRecentTitles(cacheData.recentTitles);
            if (cacheData.playWithGamePassTitles) {
              setGamePassTitles(
                cacheData.playWithGamePassTitles.filter(
                  isGamePassSubscriptionTitle,
                ),
              );
            }
            if (cacheData.ubisoftTitles) {
              setUbisoftTitlesData(
                cacheData.ubisoftTitles.filter(isUbisoftTitle),
              );
            }
            if (cacheData.streamYourOwnTitles) {
              setStreamYourOwnTitlesData(cacheData.streamYourOwnTitles);
            }
            if (cacheData.leavingSoonTitles) {
              setLeavingSoonTitles(cacheData.leavingSoonTitles);
            }
            if (cacheData.freeWithAdsTitles) {
              setFreeWithAdsTitles(cacheData.freeWithAdsTitles);
            }
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [titles.length]);

  const handleViewDetail = React.useCallback(
    (titleItem: any) => {
      navigation.navigate('TitleDetail', {
        titleItem,
        accountTier: displayTier,
      });
    },
    [navigation, displayTier],
  );

  const handleOpenSearch = () => {
    navigation.navigate('Search', { keyword });
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
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

    dispatch({ type: 'SET_STARS', payload: newStarTitles });

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
        `${t('Saved')}: ${regionInfo.flag} ${regionInfo.name} (${newSettings.force_region_ip || 'Auto'
        })`,
        ToastAndroid.SHORT,
      );
    }
  };

  const executeLaunchStream = React.useCallback(
    (titleItem: any) => {
      const settings = getSettings();
      const titleId = titleItem.titleId || titleItem.XCloudTitleId;
      if (!titleId) return;

      const activeToken = effectiveXCloudToken || streamingTokens.xCloudToken;
      if (!activeToken) return;

      if (settings.render_engine === 'web' && FullScreenManager) {
        FullScreenManager.immersiveMode();
      }

      const isUsbMode = settings.bind_usb_device;
      const usbController = isUsbMode ? 1 : 0;
      const postUrl = `${activeToken.getDefaultRegion().baseUri
        }/v5/sessions/cloud/play`;

      const streamPage =
        settings.render_engine === 'web'
          ? 'Stream'
          : settings.render_engine === 'native'
            ? 'NativeStream'
            : 'NanoStream';

      const gameTitle =
        titleItem?.ProductTitle ||
        titleItem?.titleName ||
        titleItem?.Title ||
        'Xbox Cloud Gaming';

      navigation.navigate(streamPage, {
        sessionId: titleId,
        settings,
        streamType: 'cloud',
        postUrl,
        isUsbMode,
        usbController,
        gameTitle,
        titleItem,
      });
    },
    [navigation, effectiveXCloudToken, streamingTokens.xCloudToken],
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
    if (filterCategory === 'free_ads') {
      list = freeWithAdsTitlesList;
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

  const isScreenFocused = useIsFocused();
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const isGamepadConnected = useGamepadConnectedState();
  const shouldHidePlayButton =
    Platform.isTV || (isGamepadConnected && isGamepadActive);
  const sectionListRefs = React.useRef<Record<string, any>>({});
  const carouselScrollLeftMap = React.useRef<Record<string, number>>({});
  const lastCarouselFocusRef = React.useRef<{
    section: string;
    index: number;
    verticalOffset: number;
    scrollLeft: number;
    isShowAllCard: boolean;
  } | null>(null);
  const [focusedSection, setFocusedSection] = React.useState<string>('recent');
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);
  const [focusedHeaderItem, setFocusedHeaderItem] = React.useState<
    'search' | 'sort' | 'filter' | 'region' | 'settings' | 'back'
  >('search');

  // Available sections list for controller navigation
  const availableSections = React.useMemo(() => {
    const hasMoreGrid = currentPage < totalPages;
    if (filterCategory !== 'all' || keyword.length > 0) {
      return [{ id: 'grid', data: pagedTitles, hasMore: hasMoreGrid }];
    }
    const maxItems = Platform.isTV ? 6 : 10;
    const list: {
      id: string;
      data: any[];
      hasMore: boolean;
      categoryKey?: any;
    }[] = [];
    if (recentTitles.length > 0) {
      list.push({
        id: 'recent',
        data: recentTitles.slice(0, maxItems),
        hasMore: recentTitles.length > maxItems,
        categoryKey: 'recent',
      });
    }
    if (showFreeWithAds && freeWithAdsTitlesList.length > 0) {
      list.push({
        id: 'free_ads',
        data: freeWithAdsTitlesList.slice(0, maxItems),
        hasMore: freeWithAdsTitlesList.length > maxItems,
        categoryKey: 'free_ads',
      });
    }
    if (playWithGamePassTitles.length > 0) {
      list.push({
        id: 'gp',
        data: playWithGamePassTitles.slice(0, maxItems),
        hasMore: playWithGamePassTitles.length > maxItems,
        categoryKey: 'play_gamepass',
      });
    }
    if (newTitles.length > 0) {
      list.push({
        id: 'new',
        data: newTitles.slice(0, maxItems),
        hasMore: newTitles.length > maxItems,
        categoryKey: 'new',
      });
    }
    if (!isFreeTier && ubisoftTitles.length > 0) {
      list.push({
        id: 'ubi',
        data: ubisoftTitles.slice(0, maxItems),
        hasMore: ubisoftTitles.length > maxItems,
        categoryKey: 'ubisoft',
      });
    }
    if (streamYourOwnTitles.length > 0) {
      list.push({
        id: 'own',
        data: streamYourOwnTitles.slice(0, maxItems),
        hasMore: streamYourOwnTitles.length > maxItems,
        categoryKey: 'own',
      });
    }
    if (leavingSoonList.length > 0) {
      list.push({
        id: 'leave',
        data: leavingSoonList.slice(0, maxItems),
        hasMore: leavingSoonList.length > maxItems,
        categoryKey: 'leaving',
      });
    }
    if (pagedTitles.length > 0) {
      list.push({ id: 'grid', data: pagedTitles, hasMore: hasMoreGrid });
    }
    return list;
  }, [
    filterCategory,
    keyword,
    recentTitles,
    showFreeWithAds,
    freeWithAdsTitlesList,
    playWithGamePassTitles,
    newTitles,
    isFreeTier,
    ubisoftTitles,
    streamYourOwnTitles,
    leavingSoonList,
    pagedTitles,
    currentPage,
    totalPages,
  ]);

  // Available header items depending on current view
  const headerItems = React.useMemo(() => {
    if (filterCategory !== 'all') {
      return ['back', 'search', 'sort', 'region', 'settings'] as const;
    }
    return ['search', 'sort', 'filter', 'region', 'settings'] as const;
  }, [filterCategory]);

  // Keep focus state valid when categories or lists change
  React.useEffect(() => {
    if (focusedSection === 'header') return;
    if (availableSections.length > 0) {
      const currentExists = availableSections.some(
        s => s.id === focusedSection,
      );
      if (!currentExists) {
        setFocusedSection(availableSections[0].id);
        setFocusedIndex(0);
      }
    }
  }, [availableSections, focusedSection]);

  // Priority section for initial Android TV remote focus
  const preferredFocusSection = React.useMemo(() => {
    if (recentTitles.length > 0) return 'recent';
    if (showFreeWithAds && freeWithAdsTitlesList.length > 0) return 'free_ads';
    if (playWithGamePassTitles.length > 0) return 'gp';
    if (newTitles.length > 0) return 'new';
    if (!isFreeTier && ubisoftTitles.length > 0) return 'ubi';
    if (streamYourOwnTitles.length > 0) return 'own';
    if (leavingSoonList.length > 0) return 'leave';
    return 'grid';
  }, [
    recentTitles.length,
    showFreeWithAds,
    freeWithAdsTitlesList.length,
    playWithGamePassTitles.length,
    newTitles.length,
    isFreeTier,
    ubisoftTitles.length,
    streamYourOwnTitles.length,
    leavingSoonList.length,
  ]);

  const visibleCardsCount = isLandscape ? 5 : isLargeScreen ? 3 : 2;
  const secHeight = isLandscape ? 225 : 255;

  const handleShowAll = React.useCallback(
    (categoryKey: any) => {
      if (filterCategory === 'all') {
        const targetSec = availableSections.find(
          s => s.categoryKey === categoryKey,
        );
        const isCurrentSec = targetSec && focusedSection === targetSec.id;

        const savedSection = isCurrentSec
          ? focusedSection
          : targetSec
            ? targetSec.id
            : focusedSection !== 'header' && focusedSection !== 'grid'
              ? focusedSection
              : 'recent';

        const savedIndex = isCurrentSec ? focusedIndex : 0;
        const curSec = availableSections.find(s => s.id === savedSection);
        const isShowAllCard = !!(
          curSec &&
          curSec.hasMore &&
          savedIndex === curSec.data.length
        );

        const curSecIdx = availableSections.findIndex(
          s => s.id === savedSection,
        );
        const verticalOffset =
          currentScrollOffsetRef.current > 0
            ? currentScrollOffsetRef.current
            : curSecIdx >= 0
              ? curSecIdx * secHeight
              : 0;
        const scrollLeft = carouselScrollLeftMap.current[savedSection] || 0;

        lastCarouselFocusRef.current = {
          section: savedSection,
          index: savedIndex,
          verticalOffset,
          scrollLeft,
          isShowAllCard,
        };
      }

      setFilterCategory(categoryKey);
      setCurrentPage(1);
      scrollToTop();
    },
    [
      availableSections,
      filterCategory,
      focusedIndex,
      focusedSection,
      secHeight,
    ],
  );

  const handleBackToHome = React.useCallback(() => {
    const saved = lastCarouselFocusRef.current;
    lastCarouselFocusRef.current = null;

    setFilterCategory('all');
    setCurrentPage(1);

    if (saved) {
      setFocusedSection(saved.section);
      setFocusedIndex(saved.index);

      const restoreScroll = () => {
        if (typeof saved.verticalOffset === 'number') {
          flatListRef.current?.scrollToOffset?.({
            offset: saved.verticalOffset,
            animated: false,
          });
        }

        const secRef = sectionListRefs.current[saved.section];
        if (secRef) {
          if (saved.isShowAllCard) {
            try {
              secRef.scrollToEnd?.({ animated: false });
            } catch (e) { }
          } else {
            const leftOffset =
              (saved.scrollLeft ||
                Math.max(0, saved.index - visibleCardsCount + 1)) *
              (horizontalCardWidth + 10);
            try {
              secRef.scrollToOffset?.({
                offset: leftOffset,
                animated: false,
              });
            } catch (e) { }
          }
        }
      };

      setTimeout(restoreScroll, 40);
      setTimeout(restoreScroll, 160);
      setTimeout(restoreScroll, 300);
    } else {
      scrollToTop();
      setFocusedSection(availableSections[0]?.id || 'recent');
      setFocusedIndex(0);
    }
  }, [availableSections, horizontalCardWidth, visibleCardsCount]);

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
  }, [filterCategory, handleBackToHome]);

  const navigateHeader = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (isLandscape) {
      const curIdx = headerItems.indexOf(focusedHeaderItem as any);
      if (direction === 'left') {
        if (curIdx > 0) {
          setFocusedHeaderItem(headerItems[curIdx - 1]);
        }
      } else if (direction === 'right') {
        if (curIdx < headerItems.length - 1) {
          setFocusedHeaderItem(headerItems[curIdx + 1]);
        }
      } else if (direction === 'down') {
        if (availableSections.length > 0) {
          setFocusedSection(availableSections[0].id);
          setFocusedIndex(0);
        }
      }
      return;
    }

    // Portrait 2D navigation
    if (direction === 'left') {
      if (focusedHeaderItem === 'settings') setFocusedHeaderItem('region');
      else if (focusedHeaderItem === 'filter') setFocusedHeaderItem('sort');
      else if (focusedHeaderItem === 'sort' && filterCategory !== 'all')
        setFocusedHeaderItem('back');
    } else if (direction === 'right') {
      if (focusedHeaderItem === 'region') setFocusedHeaderItem('settings');
      else if (focusedHeaderItem === 'sort' && filterCategory === 'all')
        setFocusedHeaderItem('filter');
      else if (focusedHeaderItem === 'back') setFocusedHeaderItem('sort');
    } else if (direction === 'up') {
      if (
        focusedHeaderItem === 'sort' ||
        focusedHeaderItem === 'filter' ||
        focusedHeaderItem === 'back'
      ) {
        setFocusedHeaderItem('search');
      } else if (focusedHeaderItem === 'search') {
        setFocusedHeaderItem('region');
      }
    } else if (direction === 'down') {
      if (focusedHeaderItem === 'region' || focusedHeaderItem === 'settings') {
        setFocusedHeaderItem('search');
      } else if (focusedHeaderItem === 'search') {
        setFocusedHeaderItem(filterCategory !== 'all' ? 'back' : 'sort');
      } else {
        // Drop down into games catalog
        if (availableSections.length > 0) {
          setFocusedSection(availableSections[0].id);
          setFocusedIndex(0);
        }
      }
    }
  };

  // Event-driven Gamepad & Remote Navigation Engine
  useGamepadNavigation({
    enabled:
      isScreenFocused &&
      !showFilterModal &&
      !showSortModal &&
      !showRegionModal &&
      !showTutorial &&
      !sessionReport,
    onRight: () => {
      if (focusedSection === 'header') {
        navigateHeader('right');
        return;
      }

      const curSec = availableSections.find(s => s.id === focusedSection);
      if (!curSec || !curSec.data.length) return;

      if (focusedSection === 'grid') {
        if (focusedIndex < curSec.data.length - 1) {
          const nextIdx = focusedIndex + 1;
          setFocusedIndex(nextIdx);
          const nextRow = Math.floor(nextIdx / numColumns);
          const currentRow = Math.floor(focusedIndex / numColumns);
          if (nextRow !== currentRow) {
            const carouselsCount = availableSections.filter(
              s => s.id !== 'grid',
            ).length;
            const offset =
              carouselsCount * secHeight + nextRow * (cardHeight + 10);
            flatListRef.current?.scrollToOffset?.({
              offset,
              animated: true,
            });
          }
        }
      } else {
        // Horizontal carousel: max index is curSec.data.length if curSec.hasMore (the "Show all" card)
        const maxFocusIdx = curSec.hasMore
          ? curSec.data.length
          : curSec.data.length - 1;
        if (focusedIndex < maxFocusIdx) {
          const nextIdx = focusedIndex + 1;
          setFocusedIndex(nextIdx);

          if (nextIdx === curSec.data.length) {
            try {
              sectionListRefs.current[focusedSection]?.scrollToEnd?.({
                animated: true,
              });
            } catch (e) { }
          } else {
            const currentLeft =
              carouselScrollLeftMap.current[focusedSection] || 0;
            if (nextIdx >= currentLeft + visibleCardsCount) {
              const newLeft = nextIdx - visibleCardsCount + 1;
              carouselScrollLeftMap.current[focusedSection] = newLeft;
              try {
                sectionListRefs.current[focusedSection]?.scrollToOffset?.({
                  offset: newLeft * (horizontalCardWidth + 10),
                  animated: true,
                });
              } catch (e) { }
            }
          }
        }
      }
    },
    onLeft: () => {
      if (focusedSection === 'header') {
        navigateHeader('left');
        return;
      }

      if (focusedIndex > 0) {
        const prevIdx = focusedIndex - 1;
        setFocusedIndex(prevIdx);

        if (focusedSection === 'grid') {
          const prevRow = Math.floor(prevIdx / numColumns);
          const currentRow = Math.floor(focusedIndex / numColumns);
          if (prevRow !== currentRow) {
            const carouselsCount = availableSections.filter(
              s => s.id !== 'grid',
            ).length;
            const offset =
              carouselsCount * secHeight + prevRow * (cardHeight + 10);
            flatListRef.current?.scrollToOffset?.({
              offset,
              animated: true,
            });
          }
        } else {
          const currentLeft =
            carouselScrollLeftMap.current[focusedSection] || 0;
          if (prevIdx < currentLeft) {
            const newLeft = prevIdx;
            carouselScrollLeftMap.current[focusedSection] = newLeft;
            try {
              sectionListRefs.current[focusedSection]?.scrollToOffset?.({
                offset: newLeft * (horizontalCardWidth + 10),
                animated: true,
              });
            } catch (e) { }
          }
        }
      }
    },
    onDown: () => {
      if (focusedSection === 'header') {
        navigateHeader('down');
        return;
      }

      const curSecIdx = availableSections.findIndex(
        s => s.id === focusedSection,
      );
      if (curSecIdx < 0) return;

      const viewportH = isLandscape ? screenHeight - 70 : screenHeight - 120;
      const currentScrollY = currentScrollOffsetRef.current || 0;

      if (focusedSection === 'grid') {
        const curSec = availableSections[curSecIdx];
        const nextGridIdx = focusedIndex + numColumns;
        if (nextGridIdx < curSec.data.length) {
          setFocusedIndex(nextGridIdx);
          const nextRow = Math.floor(nextGridIdx / numColumns);
          const carouselsCount = availableSections.filter(
            s => s.id !== 'grid',
          ).length;
          const rowTop =
            carouselsCount * secHeight + nextRow * (cardHeight + 10);
          const rowBottom = rowTop + cardHeight + 10;
          if (rowBottom > currentScrollY + viewportH) {
            flatListRef.current?.scrollToOffset?.({
              offset: rowBottom - viewportH + 20,
              animated: true,
            });
          } else if (rowTop < currentScrollY) {
            flatListRef.current?.scrollToOffset?.({
              offset: Math.max(0, rowTop - 20),
              animated: true,
            });
          }
        } else if (curSec.hasMore && focusedIndex < curSec.data.length) {
          setFocusedIndex(curSec.data.length);
          flatListRef.current?.scrollToEnd?.({ animated: true });
        }
      } else {
        if (curSecIdx < availableSections.length - 1) {
          const nextSec = availableSections[curSecIdx + 1];
          setFocusedSection(nextSec.id);
          const maxIdx = nextSec.hasMore
            ? nextSec.data.length
            : nextSec.data.length - 1;
          const nextIdx = Math.min(focusedIndex, maxIdx);
          setFocusedIndex(nextIdx);

          if (nextSec.id === 'grid') {
            const carouselsCount = availableSections.filter(
              s => s.id !== 'grid',
            ).length;
            const gridTop = carouselsCount * secHeight;
            if (
              gridTop + (cardHeight + 10) > currentScrollY + viewportH ||
              gridTop < currentScrollY
            ) {
              flatListRef.current?.scrollToOffset?.({
                offset: Math.max(0, gridTop - 20),
                animated: true,
              });
            }
          } else {
            const targetSecTop = (curSecIdx + 1) * secHeight;
            const targetSecBottom = targetSecTop + secHeight;
            if (targetSecBottom > currentScrollY + viewportH) {
              flatListRef.current?.scrollToOffset?.({
                offset: targetSecBottom - viewportH + 20,
                animated: true,
              });
            } else if (targetSecTop < currentScrollY) {
              flatListRef.current?.scrollToOffset?.({
                offset: Math.max(0, targetSecTop - 20),
                animated: true,
              });
            }

            const nextSecLeft = carouselScrollLeftMap.current[nextSec.id] || 0;
            if (nextIdx < nextSecLeft) {
              carouselScrollLeftMap.current[nextSec.id] = nextIdx;
              try {
                sectionListRefs.current[nextSec.id]?.scrollToOffset?.({
                  offset: nextIdx * (horizontalCardWidth + 10),
                  animated: false,
                });
              } catch (e) { }
            } else if (nextIdx >= nextSecLeft + visibleCardsCount) {
              const newLeft = nextIdx - visibleCardsCount + 1;
              carouselScrollLeftMap.current[nextSec.id] = newLeft;
              try {
                sectionListRefs.current[nextSec.id]?.scrollToOffset?.({
                  offset: newLeft * (horizontalCardWidth + 10),
                  animated: false,
                });
              } catch (e) { }
            }
          }
        }
      }
    },
    onUp: () => {
      if (focusedSection === 'header') {
        navigateHeader('up');
        return;
      }

      const curSecIdx = availableSections.findIndex(
        s => s.id === focusedSection,
      );
      if (curSecIdx < 0) return;

      const viewportH = isLandscape ? screenHeight - 70 : screenHeight - 120;
      const currentScrollY = currentScrollOffsetRef.current || 0;

      if (focusedSection === 'grid') {
        const curSec = availableSections[curSecIdx];
        if (curSec && focusedIndex === curSec.data.length) {
          const lastRowStart =
            Math.floor((curSec.data.length - 1) / numColumns) * numColumns;
          const targetCol = Math.min(
            curSec.data.length - 1,
            lastRowStart + (numColumns > 1 ? 1 : 0),
          );
          setFocusedIndex(Math.max(0, targetCol));
          return;
        }
        if (focusedIndex >= numColumns) {
          const prevGridIdx = focusedIndex - numColumns;
          setFocusedIndex(prevGridIdx);
          const prevRow = Math.floor(prevGridIdx / numColumns);
          const carouselsCount = availableSections.filter(
            s => s.id !== 'grid',
          ).length;
          const rowTop =
            carouselsCount * secHeight + prevRow * (cardHeight + 10);
          if (rowTop < currentScrollY) {
            flatListRef.current?.scrollToOffset?.({
              offset: Math.max(0, rowTop - 20),
              animated: true,
            });
          }
        } else {
          // At top row of grid
          if (curSecIdx > 0) {
            const prevSec = availableSections[curSecIdx - 1];
            setFocusedSection(prevSec.id);
            const maxIdx = prevSec.hasMore
              ? prevSec.data.length
              : prevSec.data.length - 1;
            const nextIdx = Math.min(focusedIndex, maxIdx);
            setFocusedIndex(nextIdx);
            const targetSecTop = (curSecIdx - 1) * secHeight;
            const targetSecBottom = targetSecTop + secHeight;
            if (targetSecTop < currentScrollY) {
              flatListRef.current?.scrollToOffset?.({
                offset: Math.max(0, targetSecTop - 20),
                animated: true,
              });
            } else if (targetSecBottom > currentScrollY + viewportH) {
              flatListRef.current?.scrollToOffset?.({
                offset: targetSecBottom - viewportH + 20,
                animated: true,
              });
            }
          } else {
            // No sections above: move up to header
            setFocusedSection('header');
            setFocusedHeaderItem(
              filterCategory !== 'all'
                ? 'back'
                : isLandscape
                  ? 'search'
                  : 'sort',
            );
            flatListRef.current?.scrollToOffset?.({
              offset: 0,
              animated: true,
            });
          }
        }
      } else {
        if (curSecIdx > 0) {
          const prevSec = availableSections[curSecIdx - 1];
          setFocusedSection(prevSec.id);
          const maxIdx = prevSec.hasMore
            ? prevSec.data.length
            : prevSec.data.length - 1;
          const nextIdx = Math.min(focusedIndex, maxIdx);
          setFocusedIndex(nextIdx);
          const targetSecTop = (curSecIdx - 1) * secHeight;
          const targetSecBottom = targetSecTop + secHeight;
          if (targetSecTop < currentScrollY) {
            flatListRef.current?.scrollToOffset?.({
              offset: Math.max(0, targetSecTop - 20),
              animated: true,
            });
          } else if (targetSecBottom > currentScrollY + viewportH) {
            flatListRef.current?.scrollToOffset?.({
              offset: targetSecBottom - viewportH + 20,
              animated: true,
            });
          }

          const prevSecLeft = carouselScrollLeftMap.current[prevSec.id] || 0;
          if (nextIdx < prevSecLeft) {
            carouselScrollLeftMap.current[prevSec.id] = nextIdx;
            try {
              sectionListRefs.current[prevSec.id]?.scrollToOffset?.({
                offset: nextIdx * (horizontalCardWidth + 10),
                animated: false,
              });
            } catch (e) { }
          } else if (nextIdx >= prevSecLeft + visibleCardsCount) {
            const newLeft = nextIdx - visibleCardsCount + 1;
            carouselScrollLeftMap.current[prevSec.id] = newLeft;
            try {
              sectionListRefs.current[prevSec.id]?.scrollToOffset?.({
                offset: newLeft * (horizontalCardWidth + 10),
                animated: false,
              });
            } catch (e) { }
          }
        } else {
          // Top carousel: move up to header
          setFocusedSection('header');
          setFocusedHeaderItem(
            filterCategory !== 'all' ? 'back' : isLandscape ? 'search' : 'sort',
          );
          flatListRef.current?.scrollToOffset?.({
            offset: 0,
            animated: true,
          });
        }
      }
    },
    onSelect: () => {
      if (focusedSection === 'header') {
        switch (focusedHeaderItem) {
          case 'search':
            handleOpenSearch();
            break;
          case 'sort':
            setShowSortModal(true);
            break;
          case 'filter':
            setShowFilterModal(true);
            break;
          case 'region':
            setShowRegionModal(true);
            break;
          case 'settings':
            navigation.navigate('Settings');
            break;
          case 'back':
            handleBackToHome();
            break;
        }
        return;
      }

      const curSec = availableSections.find(s => s.id === focusedSection);
      if (!curSec) return;

      if (curSec.hasMore && focusedIndex === curSec.data.length) {
        handleShowAll(curSec.categoryKey);
        return;
      }

      if (!curSec.data[focusedIndex]) return;
      handleViewDetail(curSec.data[focusedIndex]);
    },
    onActionX: () => {
      const curSec = availableSections.find(s => s.id === focusedSection);
      if (!curSec || !curSec.data[focusedIndex]) return;
      handleDirectPlay(curSec.data[focusedIndex]);
    },
    onActionY: () => {
      if (focusedSection === 'header' || focusedSection === 'grid') {
        setShowSortModal(true);
        return;
      }
      const curSec = availableSections.find(s => s.id === focusedSection);
      if (curSec && curSec.hasMore && curSec.categoryKey) {
        handleShowAll(curSec.categoryKey);
      }
    },
    onBack: () => {
      if (filterCategory !== 'all') {
        handleBackToHome();
      } else {
        navigation.goBack();
      }
    },
  });

  const setSectionRef = React.useCallback(
    (idPrefix: string) => (ref: any) => {
      sectionListRefs.current[idPrefix] = ref;
    },
    [],
  );

  const onMomentumScrollEnd = React.useCallback(
    (idPrefix: string) => (e: any) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const leftIdx = Math.max(
        0,
        Math.floor(offsetX / (horizontalCardWidth + 10)),
      );
      carouselScrollLeftMap.current[idPrefix] = leftIdx;
    },
    [horizontalCardWidth],
  );

  const carouselsHeader = React.useMemo(() => {
    if (filterCategory !== 'all' || keyword.length > 0) {
      return null;
    }

    return (
      <View style={styles.carouselsContainer}>
        <CarouselSection
          title={t('Jump back in')}
          data={recentTitles}
          categoryKey="recent"
          idPrefix="recent"
          isSectionActive={isGamepadActive && focusedSection === 'recent'}
          focusedIndex={focusedSection === 'recent' ? focusedIndex : -1}
          isGamepadActive={isGamepadActive}
          hidePlayButton={shouldHidePlayButton}
          horizontalCardWidth={horizontalCardWidth}
          horizontalCardHeight={horizontalCardHeight}
          isLandscape={isLandscape}
          isLight={isLight}
          primary={primary}
          onPress={handleViewDetail}
          onPlayPress={handleDirectPlay}
          onShowAll={handleShowAll}
          sectionRefCallback={setSectionRef('recent')}
          onMomentumScrollEndCallback={onMomentumScrollEnd('recent')}
          t={t}
        />
        {showFreeWithAds && freeWithAdsTitlesList.length > 0 && (
          <CarouselSection
            title={t('Stream for free with ads')}
            subtitle={t('StreamForFreeWithAdsDesc')}
            data={freeWithAdsTitlesList}
            categoryKey="free_ads"
            idPrefix="free_ads"
            isSectionActive={isGamepadActive && focusedSection === 'free_ads'}
            focusedIndex={focusedSection === 'free_ads' ? focusedIndex : -1}
            isGamepadActive={isGamepadActive}
            hidePlayButton={shouldHidePlayButton}
            horizontalCardWidth={horizontalCardWidth}
            horizontalCardHeight={horizontalCardHeight}
            isLandscape={isLandscape}
            isLight={isLight}
            primary={primary}
            onPress={handleViewDetail}
            onPlayPress={handleDirectPlay}
            onShowAll={handleShowAll}
            sectionRefCallback={setSectionRef('free_ads')}
            onMomentumScrollEndCallback={onMomentumScrollEnd('free_ads')}
            t={t}
          />
        )}
        <CarouselSection
          title={t('Play with Game Pass')}
          data={playWithGamePassTitles}
          categoryKey="play_gamepass"
          idPrefix="gp"
          isSectionActive={isGamepadActive && focusedSection === 'gp'}
          focusedIndex={focusedSection === 'gp' ? focusedIndex : -1}
          isGamepadActive={isGamepadActive}
          hidePlayButton={shouldHidePlayButton}
          horizontalCardWidth={horizontalCardWidth}
          horizontalCardHeight={horizontalCardHeight}
          isLandscape={isLandscape}
          isLight={isLight}
          primary={primary}
          onPress={handleViewDetail}
          onPlayPress={handleDirectPlay}
          onShowAll={handleShowAll}
          sectionRefCallback={setSectionRef('gp')}
          onMomentumScrollEndCallback={onMomentumScrollEnd('gp')}
          t={t}
        />
        <CarouselSection
          title={t('Recently Added')}
          data={newTitles}
          categoryKey="new"
          idPrefix="new"
          isSectionActive={isGamepadActive && focusedSection === 'new'}
          focusedIndex={focusedSection === 'new' ? focusedIndex : -1}
          isGamepadActive={isGamepadActive}
          hidePlayButton={shouldHidePlayButton}
          horizontalCardWidth={horizontalCardWidth}
          horizontalCardHeight={horizontalCardHeight}
          isLandscape={isLandscape}
          isLight={isLight}
          primary={primary}
          onPress={handleViewDetail}
          onPlayPress={handleDirectPlay}
          onShowAll={handleShowAll}
          sectionRefCallback={setSectionRef('new')}
          onMomentumScrollEndCallback={onMomentumScrollEnd('new')}
          t={t}
        />
        {!isFreeTier && (
          <CarouselSection
            title={t('Ubisoft+ Classic')}
            data={ubisoftTitles}
            categoryKey="ubisoft"
            idPrefix="ubi"
            isSectionActive={isGamepadActive && focusedSection === 'ubi'}
            focusedIndex={focusedSection === 'ubi' ? focusedIndex : -1}
            isGamepadActive={isGamepadActive}
            hidePlayButton={shouldHidePlayButton}
            horizontalCardWidth={horizontalCardWidth}
            horizontalCardHeight={horizontalCardHeight}
            isLandscape={isLandscape}
            isLight={isLight}
            primary={primary}
            onPress={handleViewDetail}
            onPlayPress={handleDirectPlay}
            onShowAll={handleShowAll}
            sectionRefCallback={setSectionRef('ubi')}
            onMomentumScrollEndCallback={onMomentumScrollEnd('ubi')}
            t={t}
          />
        )}
        <CarouselSection
          title={t('Stream your own game')}
          data={streamYourOwnTitles}
          categoryKey="own"
          idPrefix="own"
          isSectionActive={isGamepadActive && focusedSection === 'own'}
          focusedIndex={focusedSection === 'own' ? focusedIndex : -1}
          isGamepadActive={isGamepadActive}
          hidePlayButton={shouldHidePlayButton}
          horizontalCardWidth={horizontalCardWidth}
          horizontalCardHeight={horizontalCardHeight}
          isLandscape={isLandscape}
          isLight={isLight}
          primary={primary}
          onPress={handleViewDetail}
          onPlayPress={handleDirectPlay}
          onShowAll={handleShowAll}
          sectionRefCallback={setSectionRef('own')}
          onMomentumScrollEndCallback={onMomentumScrollEnd('own')}
          t={t}
        />
        <CarouselSection
          title={t('Leaving soon')}
          data={leavingSoonList}
          categoryKey="leaving"
          idPrefix="leave"
          isSectionActive={isGamepadActive && focusedSection === 'leave'}
          focusedIndex={focusedSection === 'leave' ? focusedIndex : -1}
          isGamepadActive={isGamepadActive}
          hidePlayButton={shouldHidePlayButton}
          horizontalCardWidth={horizontalCardWidth}
          horizontalCardHeight={horizontalCardHeight}
          isLandscape={isLandscape}
          isLight={isLight}
          primary={primary}
          onPress={handleViewDetail}
          onPlayPress={handleDirectPlay}
          onShowAll={handleShowAll}
          sectionRefCallback={setSectionRef('leave')}
          onMomentumScrollEndCallback={onMomentumScrollEnd('leave')}
          t={t}
        />
        <View style={styles.catalogDividerHeader}>
          <Text
            style={[
              styles.catalogSectionTitle,
              isLight && styles.catalogSectionTitleLight,
            ]}>
            {t('All')}
          </Text>
        </View>
      </View>
    );
  }, [
    filterCategory,
    keyword,
    recentTitles,
    showFreeWithAds,
    freeWithAdsTitlesList,
    playWithGamePassTitles,
    newTitles,
    isFreeTier,
    ubisoftTitles,
    streamYourOwnTitles,
    leavingSoonList,
    horizontalCardWidth,
    horizontalCardHeight,
    primary,
    isLight,
    isLandscape,
    isGamepadActive,
    shouldHidePlayButton,
    focusedSection,
    focusedIndex,
    handleViewDetail,
    handleDirectPlay,
    handleShowAll,
    setSectionRef,
    onMomentumScrollEnd,
    t,
  ]);

  // Grid item renderer with stabilized focus index
  const focusedGridIndex =
    isGamepadActive && focusedSection === 'grid' ? focusedIndex : -1;
  const renderGridItem = React.useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <XStreamingGameCard
        titleItem={item}
        width={cardWidth}
        height={cardHeight}
        onPress={handleViewDetail}
        onPlayPress={handleDirectPlay}
        hasTVPreferredFocus={false}
        isFocused={focusedGridIndex === index}
        hidePlayButton={shouldHidePlayButton}
      />
    ),
    [
      cardWidth,
      cardHeight,
      handleViewDetail,
      handleDirectPlay,
      focusedGridIndex,
      shouldHidePlayButton,
    ],
  );

  const itemKeyExtractor = React.useCallback(
    (item: any, index: number) =>
      item.productId || item.titleId || item.XCloudTitleId || `grid_${index}`,
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
      case 'free_ads':
        return t('Stream for free with ads');
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

  // Footer loading indicator & Load more button
  const renderListFooter = () => {
    if (!pagedTitles.length) return null;

    const hasMore = currentPage < totalPages;
    const isLoadMoreFocused =
      isGamepadActive &&
      focusedSection === 'grid' &&
      focusedIndex === pagedTitles.length;

    return (
      <View style={styles.footerWrap}>
        {hasMore ? (
          <Pressable
            focusable={true}
            onPress={loadMoreData}
            style={({ pressed, focused }: any) => [
              styles.loadMoreButton,
              isLight && styles.loadMoreButtonLight,
              {
                backgroundColor: isLight
                  ? 'rgba(0, 0, 0, 0.05)'
                  : 'rgba(255, 255, 255, 0.08)',
                borderColor: primary + '55',
              },
              (isLoadMoreFocused || focused) && [
                styles.loadMoreButtonFocused,
                { borderColor: isLight ? primary : '#FFFFFF' },
              ],
              pressed && { opacity: 0.7 },
            ]}>
            {loadingMore ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <View style={styles.loadMoreContent}>
                <Icon source="chevron-down" size={20} color={primary} />
                <Text
                  style={[
                    styles.loadMoreText,
                    { color: isLight ? '#1F2937' : '#FFFFFF' },
                  ]}>
                  {t('Load more')}
                </Text>
                <Text
                  style={[
                    styles.loadMoreCountText,
                    { color: isLight ? '#6B7280' : '#9CA3AF' },
                  ]}>
                  {`(${pagedTitles.length} / ${filteredTitles.length})`}
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          filteredTitles.length > 12 && (
            <Text
              style={[
                styles.allLoadedText,
                { color: isLight ? '#6B7280' : '#9CA3AF' },
              ]}>
              {`${filteredTitles.length} ${t('Game available')}`}
            </Text>
          )
        )}
      </View>
    );
  };

  const isRegionFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'region';
  const isSettingsFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'settings';
  const isSearchFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'search';
  const isSortFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'sort';
  const isFilterFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'filter';
  const isBackFocused =
    isGamepadActive &&
    focusedSection === 'header' &&
    focusedHeaderItem === 'back';

  // Contextual hints for gamepad HUD
  const gamepadHints: GamepadHintItem[] = React.useMemo(() => {
    if (showRegionModal || showSortModal || showFilterModal) {
      return [
        { button: 'A', label: t('Select') },
        { button: 'B', label: t('Back') },
      ];
    }

    if (showTutorial || showUsbWarnModal) {
      return [
        { button: 'A', label: t('Confirm') || 'OK' },
        { button: 'B', label: t('Back') },
      ];
    }

    if (focusedSection === 'header') {
      return [
        {
          button: 'A',
          label: focusedHeaderItem === 'back' ? t('Back') : t('Select'),
        },
        { button: 'B', label: t('Back') },
      ];
    }

    if (availableSections.length === 1 && availableSections[0].id === 'grid') {
      return [
        { button: 'A', label: t('Details') },
        { button: 'X', label: t('Direct Play') },
        { button: 'Y', label: t('Sort') },
        { button: 'B', label: t('Back') },
      ];
    }

    const curSec = availableSections.find(s => s.id === focusedSection);
    if (curSec) {
      const isShowAllCardFocused =
        curSec.hasMore && focusedIndex === curSec.data.length;
      if (isShowAllCardFocused) {
        return [
          { button: 'A', label: t('Show all') },
          { button: 'B', label: t('Back') },
        ];
      }
      if (curSec.hasMore && curSec.categoryKey) {
        return [
          { button: 'A', label: t('Details') },
          { button: 'X', label: t('Direct Play') },
          { button: 'Y', label: t('Show all') },
          { button: 'B', label: t('Back') },
        ];
      }
      return [
        { button: 'A', label: t('Details') },
        { button: 'X', label: t('Direct Play') },
        { button: 'B', label: t('Back') },
      ];
    }

    return [
      { button: 'A', label: t('Select') },
      { button: 'B', label: t('Back') },
    ];
  }, [
    showRegionModal,
    showSortModal,
    showFilterModal,
    showTutorial,
    showUsbWarnModal,
    focusedSection,
    focusedHeaderItem,
    availableSections,
    focusedIndex,
    t,
  ]);

  return (
    <View
      style={styles.rootContainer}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <StatusBar
        barStyle={isLight ? 'dark-content' : 'light-content'}
        backgroundColor={isLight ? '#FCFBFF' : '#111320'}
        translucent={true}
      />
      <Spinner loading={loading} text={t('Loading...')} />

      {!isLimited && (
        <View style={styles.mainContainer}>
          {/* Header row with Gamerpic, Server Region shortcut and Settings */}
          <View
            style={[
              styles.topHeader,
              isLargeScreen && styles.topHeaderLarge,
              isLandscape && styles.topHeaderLandscape,
            ]}>
            <View
              style={[
                styles.headerMainRow,
                isLandscape && styles.headerMainRowLandscape,
              ]}>
              <View style={styles.profileRow}>
                {gamerpic ? (
                  <Image
                    source={{ uri: gamerpic }}
                    style={[
                      styles.gamerpicImage,
                      isLandscape && styles.gamerpicImageLandscape,
                      isLight && styles.gamerpicImageLight,
                    ]}
                  />
                ) : (
                  <XboxLogo
                    size={isLandscape ? 30 : 38}
                    color={
                      displayTier === 'Free'
                        ? isLight
                          ? '#6B7280'
                          : '#8b949e'
                        : primary
                    }
                  />
                )}
                <View style={styles.profileInfo}>
                  <Text
                    style={[
                      styles.gamertagText,
                      isLandscape && styles.gamertagTextLandscape,
                      isLight && styles.gamertagTextLight,
                    ]}
                    numberOfLines={1}>
                    {gamertag}
                  </Text>
                  <View
                    style={[
                      styles.subscriptionBadgeWrap,
                      isLandscape && styles.subscriptionBadgeWrapLandscape,
                      displayTier !== 'Free'
                        ? {
                          backgroundColor: primary + '1A',
                          borderColor: primary + '40',
                        }
                        : isLight
                          ? styles.subscriptionBadgeWrapFreeLight
                          : styles.subscriptionBadgeWrapFree,
                    ]}>
                    <View
                      style={[
                        styles.subscriptionDot,
                        displayTier !== 'Free'
                          ? { backgroundColor: primary }
                          : isLight
                            ? styles.subscriptionDotFreeLight
                            : styles.subscriptionDotFree,
                      ]}
                    />
                    <Text
                      style={[
                        styles.subscriptionBadge,
                        isLandscape && styles.subscriptionBadgeLandscape,
                        displayTier !== 'Free'
                          ? { color: primary }
                          : isLight
                            ? styles.subscriptionBadgeFreeLight
                            : styles.subscriptionBadgeFree,
                      ]}>
                      {displayTier}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.headerRightActions}>
                <Pressable
                  focusable={true}
                  onPress={() => setShowRegionModal(true)}
                  style={({ pressed, focused }: any) => [
                    styles.serverButton,
                    isLandscape && styles.serverButtonLandscape,
                    isLight && styles.serverButtonLight,
                    (isRegionFocused || focused) && [
                      styles.headerButtonFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed &&
                    (isLight
                      ? styles.serverButtonPressedLight
                      : styles.serverButtonPressed),
                  ]}>
                  <Text style={styles.serverFlag}>
                    {currentRegionInfo.flag}
                  </Text>
                  <Text
                    style={[
                      styles.serverCode,
                      isLight && styles.serverCodeLight,
                    ]}>
                    {currentRegionInfo.code}
                  </Text>
                  <Icon
                    source="chevron-down"
                    size={14}
                    color={isLight ? '#4B5563' : '#8b949e'}
                  />
                </Pressable>

                <Pressable
                  focusable={true}
                  onPress={() => navigation.navigate('Settings')}
                  accessibilityLabel={t('Settings')}
                  accessibilityRole="button"
                  style={({ pressed, focused }: any) => [
                    styles.settingsIconButton,
                    isLandscape && styles.settingsIconButtonLandscape,
                    isLight && styles.settingsIconButtonLight,
                    (isSettingsFocused || focused) && [
                      styles.headerButtonFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed &&
                    (isLight
                      ? styles.settingsIconButtonPressedLight
                      : styles.settingsIconButtonPressed),
                  ]}>
                  <Icon
                    source="cog-outline"
                    size={19}
                    color={isLight ? '#111827' : '#FFFFFF'}
                  />
                </Pressable>
              </View>
            </View>

            {/* Search Bar Row - in landscape integrates sort/filter/count */}
            <View
              style={[
                styles.searchRow,
                isLandscape && styles.searchRowLandscape,
              ]}>
              <Pressable
                focusable={true}
                onPress={handleOpenSearch}
                style={({ pressed, focused }: any) => [
                  styles.searchBarButton,
                  isLandscape && styles.searchBarButtonLandscape,
                  isLight && styles.searchBarButtonLight,
                  (isSearchFocused || focused) && [
                    styles.searchBarButtonFocused,
                    { borderColor: isLight ? primary : '#FFFFFF' },
                  ],
                  pressed &&
                  (isLight
                    ? styles.searchBarButtonPressedLight
                    : styles.searchBarButtonPressed),
                ]}>
                <Icon
                  source="magnify"
                  size={20}
                  color={keyword ? primary : isLight ? '#6B7280' : '#8b949e'}
                />
                <Text
                  style={[
                    styles.searchBarText,
                    isLandscape && styles.searchBarTextLandscape,
                    isLight && styles.searchBarTextLight,
                    keyword.length > 0 &&
                    (isLight
                      ? styles.searchBarTextActiveLight
                      : styles.searchBarTextActive),
                  ]}
                  numberOfLines={1}>
                  {keyword || t('Find games')}
                </Text>
                {keyword.length > 0 && (
                  <Pressable
                    onPress={e => {
                      e?.stopPropagation?.();
                      setKeyword('');
                      navigation.setParams({ keyword: '' });
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon
                      source="close-circle"
                      size={18}
                      color={isLight ? '#6B7280' : '#8b949e'}
                    />
                  </Pressable>
                )}
              </Pressable>

              {isLandscape && filterCategory === 'all' && (
                <View style={styles.landscapeControlsRow}>
                  <Pressable
                    focusable={true}
                    onPress={() => setShowSortModal(true)}
                    accessibilityLabel={sortLabel}
                    accessibilityRole="button"
                    style={({ pressed, focused }: any) => [
                      styles.iconPillButton,
                      isLight && styles.iconPillButtonLight,
                      sortBy !== 'relevance' && [
                        styles.iconPillButtonActive,
                        {
                          borderColor: primary + '66',
                          backgroundColor: primary + '1A',
                        },
                      ],
                      (isSortFocused || focused) && [
                        styles.pillButtonFocused,
                        { borderColor: isLight ? primary : '#FFFFFF' },
                      ],
                      pressed &&
                      (isLight
                        ? styles.iconPillButtonPressedLight
                        : styles.iconPillButtonPressed),
                    ]}>
                    <Icon
                      source="sort-variant"
                      size={18}
                      color={
                        sortBy !== 'relevance'
                          ? primary
                          : isLight
                            ? '#374151'
                            : '#FFFFFF'
                      }
                    />
                  </Pressable>

                  <Pressable
                    focusable={true}
                    onPress={() => setShowFilterModal(true)}
                    accessibilityLabel={filterLabel}
                    accessibilityRole="button"
                    style={({ pressed, focused }: any) => [
                      styles.iconPillButton,
                      isLight && styles.iconPillButtonLight,
                      filterCategory !== 'all' && [
                        styles.iconPillButtonActive,
                        {
                          borderColor: primary + '66',
                          backgroundColor: primary + '1A',
                        },
                      ],
                      (isFilterFocused || focused) && [
                        styles.pillButtonFocused,
                        { borderColor: isLight ? primary : '#FFFFFF' },
                      ],
                      pressed &&
                      (isLight
                        ? styles.iconPillButtonPressedLight
                        : styles.iconPillButtonPressed),
                    ]}>
                    <Icon
                      source="filter-variant"
                      size={18}
                      color={
                        filterCategory !== 'all'
                          ? primary
                          : isLight
                            ? '#374151'
                            : '#FFFFFF'
                      }
                    />
                  </Pressable>

                  <View
                    style={[
                      styles.countPill,
                      isLight && styles.countPillLight,
                    ]}>
                    <Text
                      style={[
                        styles.countText,
                        isLight && styles.countTextLight,
                      ]}>
                      {`${filteredTitles.length} ${t('Game available')}`}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Filter row or Category Navigation Bar */}
          {filterCategory !== 'all' ? (
            <View
              style={[
                styles.categoryHeaderBar,
                isLargeScreen && styles.categoryHeaderBarLarge,
                isLandscape && styles.categoryHeaderBarLandscape,
              ]}>
              <Pressable
                focusable={true}
                onPress={handleBackToHome}
                style={({ pressed, focused }: any) => [
                  styles.categoryBackButton,
                  {
                    backgroundColor: primary + '1A',
                    borderColor: primary + '40',
                  },
                  (isBackFocused || focused) && [
                    styles.categoryBackButtonFocused,
                    { borderColor: isLight ? primary : '#FFFFFF' },
                  ],
                  pressed && [
                    styles.categoryBackButtonPressed,
                    { backgroundColor: primary + '33' },
                  ],
                ]}>
                <Icon source="arrow-left" size={18} color={primary} />
                <Text style={[styles.categoryBackText, { color: primary }]}>
                  {t('Back')}
                </Text>
              </Pressable>

              <View style={styles.categoryTitleWrap}>
                <Text
                  style={[
                    styles.categoryTitleText,
                    isLight && styles.categoryTitleTextLight,
                  ]}
                  numberOfLines={1}>
                  {filterLabel}
                </Text>
                <Text
                  style={[
                    styles.categoryCountText,
                    isLight && styles.categoryCountTextLight,
                  ]}>
                  {`${filteredTitles.length} ${t('Game available')}`}
                </Text>
              </View>

              <Pressable
                focusable={true}
                onPress={() => setShowSortModal(true)}
                accessibilityLabel={sortLabel}
                accessibilityRole="button"
                style={({ pressed, focused }: any) => [
                  styles.iconPillButton,
                  isLight && styles.iconPillButtonLight,
                  styles.categorySortIconBtn,
                  sortBy !== 'relevance' && [
                    styles.iconPillButtonActive,
                    {
                      borderColor: primary + '66',
                      backgroundColor: primary + '1A',
                    },
                  ],
                  (isSortFocused || focused) && [
                    styles.pillButtonFocused,
                    { borderColor: isLight ? primary : '#FFFFFF' },
                  ],
                  pressed &&
                  (isLight
                    ? styles.iconPillButtonPressedLight
                    : styles.iconPillButtonPressed),
                ]}>
                <Icon
                  source="sort-variant"
                  size={18}
                  color={
                    sortBy !== 'relevance'
                      ? primary
                      : isLight
                        ? '#374151'
                        : '#FFFFFF'
                  }
                />
              </Pressable>
            </View>
          ) : (
            !isLandscape && (
              <View
                style={[
                  styles.filterRow,
                  isLargeScreen && styles.filterRowLarge,
                ]}>
                <Pressable
                  focusable={true}
                  onPress={() => setShowSortModal(true)}
                  accessibilityLabel={sortLabel}
                  accessibilityRole="button"
                  style={({ pressed, focused }: any) => [
                    styles.iconPillButton,
                    isLight && styles.iconPillButtonLight,
                    sortBy !== 'relevance' && [
                      styles.iconPillButtonActive,
                      {
                        borderColor: primary + '66',
                        backgroundColor: primary + '1A',
                      },
                    ],
                    (isSortFocused || focused) && [
                      styles.pillButtonFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed &&
                    (isLight
                      ? styles.iconPillButtonPressedLight
                      : styles.iconPillButtonPressed),
                  ]}>
                  <Icon
                    source="sort-variant"
                    size={18}
                    color={
                      sortBy !== 'relevance'
                        ? primary
                        : isLight
                          ? '#374151'
                          : '#FFFFFF'
                    }
                  />
                </Pressable>

                <Pressable
                  focusable={true}
                  onPress={() => setShowFilterModal(true)}
                  accessibilityLabel={filterLabel}
                  accessibilityRole="button"
                  style={({ pressed, focused }: any) => [
                    styles.iconPillButton,
                    isLight && styles.iconPillButtonLight,
                    filterCategory !== 'all' && [
                      styles.iconPillButtonActive,
                      {
                        borderColor: primary + '66',
                        backgroundColor: primary + '1A',
                      },
                    ],
                    (isFilterFocused || focused) && [
                      styles.pillButtonFocused,
                      { borderColor: isLight ? primary : '#FFFFFF' },
                    ],
                    pressed &&
                    (isLight
                      ? styles.iconPillButtonPressedLight
                      : styles.iconPillButtonPressed),
                  ]}>
                  <Icon
                    source="filter-variant"
                    size={18}
                    color={
                      filterCategory !== 'all'
                        ? primary
                        : isLight
                          ? '#374151'
                          : '#FFFFFF'
                    }
                  />
                </Pressable>

                <View
                  style={[styles.countPill, isLight && styles.countPillLight]}>
                  <Text
                    style={[
                      styles.countText,
                      isLight && styles.countTextLight,
                    ]}>
                    {`${filteredTitles.length} ${t('Game available')}`}
                  </Text>
                </View>
              </View>
            )
          )}

          {/* Acceleration guide link */}
          {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
            <Text
              variant="labelSmall"
              style={[styles.tutorialText, { color: primary }]}
              onPress={() => setShowTutorial(true)}>
              🚀 点击查看云游戏加速指引
            </Text>
          )}

          {/* Loading state for initial catalog */}
          {/* {loading && !filteredTitles.length && (
            <View style={[styles.emptyContainer, {paddingVertical: 60}]}>
              <ActivityIndicator size="large" color={primary} />
            </View>
          )} */}

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
              onScroll={e => {
                currentScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={48}
              extraData={`${primary}_${isLight}_${isLandscape}_${isGamepadActive}_${shouldHidePlayButton}_${focusedSection === 'grid' ? focusedIndex : ''}_${currentPage}_${loadingMore}`}
              numColumns={numColumns}
              keyExtractor={itemKeyExtractor}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={[
                styles.gridContentContainer,
                isLargeScreen && styles.gridContentContainerLarge,
                (isGamepadActive || Platform.isTV) && { paddingBottom: 64 },
              ]}
              ListHeaderComponent={carouselsHeader}
              renderItem={renderGridItem}
              initialNumToRender={Platform.isTV ? 6 : isLandscape ? 8 : 6}
              maxToRenderPerBatch={Platform.isTV ? 4 : isLandscape ? 6 : 4}
              windowSize={Platform.isTV ? 3 : 5}
              removeClippedSubviews={Platform.OS === 'android'}
              onScrollToIndexFailed={info => {
                try {
                  const offset =
                    (info as any).offset ?? info.index * (cardHeight + 10);
                  flatListRef.current?.scrollToOffset({
                    offset,
                    animated: true,
                  });
                } catch (e) { }
              }}
              ListFooterComponent={renderListFooter}
            />
          )}
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
        isGamepadActive={isGamepadActive}
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
        isGamepadActive={isGamepadActive}
      />

      <FilterOptionModal
        visible={showFilterModal}
        onDismiss={() => setShowFilterModal(false)}
        filterCategory={filterCategory}
        showFreeWithAds={showFreeWithAds}
        hideUbisoft={isFreeTier}
        onSelectFilter={optKey => {
          setFilterCategory(optKey);
          setShowFilterModal(false);
          setCurrentPage(1);
        }}
        t={t}
        isGamepadActive={isGamepadActive}
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

      <SessionReportModal
        visible={!!sessionReport}
        report={sessionReport}
        onDismiss={handleDismissReport}
        onDone={handleDoneReport}
      />

      <GamepadFooterHints
        visible={isGamepadActive || Platform.isTV}
        hints={gamepadHints}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: 'transparent',
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
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 14,
    paddingBottom: 10,
  },
  topHeaderLarge: {
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 16,
    paddingBottom: 12,
  },
  topHeaderLandscape: {
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 4 : 10,
    paddingBottom: 6,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMainRowLandscape: {
    marginBottom: 0,
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#161922',
  },
  gamerpicImageLandscape: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  gamerpicImageLight: {
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  headerButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ scale: 1.08 }],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  searchBarButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    transform: [{ scale: 1.02 }],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  pillButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ scale: 1.08 }],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  categoryBackButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: [{ scale: 1.06 }],
    elevation: 8,
  },
  showAllHeaderButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: [{ scale: 1.06 }],
    elevation: 6,
  },
  showAllCardFocused: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    transform: [{ scale: 1.06 }],
    elevation: 12,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  modalOptionFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    transform: [{ scale: 1.02 }],
  },
  modalOptionPressed: {
    opacity: 0.8,
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
  gamertagTextLandscape: {
    fontSize: 15,
  },
  gamertagTextLight: {
    color: '#111827',
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
  subscriptionBadgeWrapLandscape: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    marginTop: 2,
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
  subscriptionBadgeLandscape: {
    fontSize: 10,
  },
  gamerpicImageFree: {
    borderColor: '#8b949e',
  },
  subscriptionBadgeWrapFree: {
    backgroundColor: 'rgba(139, 148, 158, 0.12)',
    borderColor: 'rgba(139, 148, 158, 0.25)',
  },
  subscriptionBadgeWrapFreeLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  subscriptionDotFree: {
    backgroundColor: '#8b949e',
  },
  subscriptionDotFreeLight: {
    backgroundColor: '#6B7280',
  },
  subscriptionBadgeFree: {
    color: '#8b949e',
  },
  subscriptionBadgeFreeLight: {
    color: '#6B7280',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ scale: 1 }],
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  serverButtonLandscape: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  serverButtonLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  serverButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ scale: 0.96 }],
  },
  serverButtonPressedLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    transform: [{ scale: 0.96 }],
  },
  settingsIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    transform: [{ scale: 1 }],
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  settingsIconButtonLandscape: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  settingsIconButtonLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  settingsIconButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ scale: 0.94 }],
  },
  settingsIconButtonPressedLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    transform: [{ scale: 0.94 }],
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
  serverCodeLight: {
    color: '#111827',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchRowLandscape: {
    marginTop: 6,
  },
  searchBarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ scale: 1 }],
    backgroundColor: '#161b26',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    height: 44,
    paddingHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
  },
  searchBarButtonLandscape: {
    marginTop: 0,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flex: 1,
  },
  searchBarButtonLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  searchBarButtonPressed: {
    backgroundColor: '#1e2535',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    transform: [{ scale: 0.985 }],
  },
  searchBarButtonPressedLight: {
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(0, 0, 0, 0.18)',
    transform: [{ scale: 0.985 }],
  },
  searchBarText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  },
  searchBarTextLandscape: {
    fontSize: 13,
  },
  searchBarTextLight: {
    color: '#6B7280',
  },
  searchBarTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchBarTextActiveLight: {
    color: '#111827',
  },
  landscapeControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 8,
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
  categoryHeaderBarLandscape: {
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
  categoryBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ scale: 1 }],
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.3)',
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 10,
    marginRight: 10,
    flexShrink: 0,
    overflow: 'hidden',
  },
  categoryBackButtonPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.26)',
    transform: [{ scale: 0.96 }],
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
  categoryTitleTextLight: {
    color: '#111827',
  },
  categoryCountText: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 1,
  },
  categoryCountTextLight: {
    color: '#6B7280',
  },
  categorySortIconBtn: {
    marginRight: 0,
    flexShrink: 0,
  },
  iconPillButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    transform: [{ scale: 1 }],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconPillButtonLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  iconPillButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ scale: 0.94 }],
  },
  iconPillButtonPressedLight: {
    backgroundColor: '#F3F4F6',
    transform: [{ scale: 0.94 }],
  },
  iconPillButtonActive: {
    borderColor: 'rgba(46, 213, 115, 0.4)',
    backgroundColor: 'rgba(46, 213, 115, 0.14)',
  },
  countPill: {
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countPillLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  countText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '500',
  },
  countTextLight: {
    color: '#6B7280',
  },
  carouselsContainer: {
    paddingBottom: 6,
  },
  carouselSection: {
    marginBottom: 22,
  },
  carouselSectionLandscape: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  sectionHeaderRowLandscape: {
    marginBottom: 6,
  },
  sectionTitleCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#8b949e',
    marginTop: 2,
  },
  sectionSubtitleLight: {
    color: '#6B7280',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionTitleLandscape: {
    fontSize: 14,
  },
  sectionTitleLight: {
    color: '#111827',
  },
  showAllHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ scale: 1 }],
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 213, 115, 0.1)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  showAllHeaderButtonPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.25)',
    transform: [{ scale: 0.96 }],
  },
  showAllHeaderText: {
    color: '#2ed573',
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
  showAllCard: {
    borderRadius: 10,
    transform: [{ scale: 1 }],
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(46, 213, 115, 0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginRight: 10,
    overflow: 'hidden',
  },
  showAllCardLight: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  showAllCardPressed: {
    backgroundColor: 'rgba(46, 213, 115, 0.12)',
    borderColor: '#2ed573',
    transform: [{ scale: 0.97 }],
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
  showAllCardTitleLight: {
    color: '#111827',
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
  horizontalListWrapLandscape: {
    marginHorizontal: -20,
  },
  horizontalListContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  horizontalListContentLandscape: {
    paddingHorizontal: 20,
    paddingVertical: 8,
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
  catalogSectionTitleLight: {
    color: '#111827',
  },
  gridContentContainer: {
    paddingHorizontal: 14,
    paddingBottom: 36,
  },
  gridContentContainerLarge: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  footerWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 18,
    alignSelf: 'center',
    minWidth: 200,
  },
  loadMoreButtonLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  loadMoreButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
    transform: [{ scale: 1.04 }],
    elevation: 6,
  },
  loadMoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
    marginRight: 6,
  },
  loadMoreCountText: {
    fontSize: 12,
    fontWeight: '500',
  },
  allLoadedText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
    fontWeight: '500',
  },
  loadingIndicator: {
    paddingVertical: 14,
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
  dialogContainer: {
    marginHorizontal: '8%',
  },
  dialogContainerLandscape: {
    marginHorizontal: 'auto',
    maxWidth: 480,
    width: '90%',
    alignSelf: 'center',
  },
  modalCard: {
    backgroundColor: '#161922',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  modalCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalTitleLight: {
    color: '#111827',
  },
  modalScrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  regionModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    transform: [{ scale: 1 }],
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 52,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  regionModalOptionLight: {
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
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
  modalOptionTitleLight: {
    color: '#111827',
  },
  modalRegionCode: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  modalRegionCodeLight: {
    color: '#6B7280',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    transform: [{ scale: 1 }],
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
  modalOptionTextLight: {
    color: '#111827',
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
  usbWarningTextLight: {
    color: '#111827',
  },
  tutorialModalContainer: {
    marginLeft: '8%',
    marginRight: '8%',
  },
  tutorialModalContainerLandscape: {
    marginHorizontal: 'auto',
    maxWidth: 520,
    width: '90%',
    alignSelf: 'center',
  },
  tutorialLeadText: {
    color: '#ffffff',
  },
  tutorialLeadTextLight: {
    color: '#111827',
  },
  tutorialStepText: {
    marginTop: 8,
    color: '#dddddd',
  },
  tutorialStepTextLight: {
    color: '#374151',
  },
});

export default CloudScreen;
