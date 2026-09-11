import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Text,
  Platform,
} from 'react-native';
import {Icon, useTheme} from 'react-native-paper';
import {useGamepadConnectedState} from '../utils/useGamepadNavigation';

interface Props {
  titleItem: any;
  onPress: (titleItem: any) => void;
  onPlayPress?: (titleItem: any) => void;
  onBookmarkPress?: (titleItem: any) => void;
  isStarred?: boolean;
  width?: number;
  height?: number;
  style?: any;
  hasTVPreferredFocus?: boolean;
  isFocused?: boolean;
  hidePlayButton?: boolean;
}

// Comprehensive resolver for Xbox Game Pass catalog, SIGL, v2, and mock image structures
const resolvePosterUrls = (titleItem: any): {primary: string | null; fallback: string | null} => {
  if (!titleItem) return {primary: null, fallback: null};

  const formatUrl = (u: any): string | null => {
    if (!u || typeof u !== 'string') return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('http') ? trimmed : `https:${trimmed}`;
  };

  const primaryRaw =
    titleItem.Image_Poster?.URL ||
    titleItem.image_urls?.poster ||
    titleItem.details?.posterUrl ||
    titleItem.posterUrl ||
    (Array.isArray(titleItem.Images)
      ? titleItem.Images.find((img: any) => img?.ImagePurpose === 'Poster')?.URL
      : null);

  const fallbackRaw =
    titleItem.Image_Tile?.URL ||
    titleItem.image_urls?.box_art ||
    titleItem.image_urls?.square_art ||
    titleItem.image_urls?.hero ||
    titleItem.Image_Hero?.URL ||
    titleItem.Image_Box?.URL ||
    titleItem.details?.boxArt?.url ||
    titleItem.imageUrl ||
    (Array.isArray(titleItem.Images)
      ? titleItem.Images.find((img: any) => img?.ImagePurpose === 'BoxArt' || img?.ImagePurpose === 'Tile')?.URL
      : null);

  const primary = formatUrl(primaryRaw);
  const fallback = formatUrl(fallbackRaw);

  return {
    primary,
    fallback: fallback !== primary ? fallback : null,
  };
};

const XStreamingGameCard: React.FC<Props> = ({
  titleItem,
  onPress,
  onPlayPress,
  width,
  height,
  style,
  hasTVPreferredFocus,
  isFocused: propFocused = false,
  hidePlayButton,
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primaryColor = theme.colors.primary;
  const playIconColor = theme.colors.onPrimary || '#FFFFFF';

  const isGamepadConnected = useGamepadConnectedState();
  const shouldHidePlay =
    hidePlayButton !== undefined
      ? hidePlayButton
      : (Platform.isTV || (isGamepadConnected && propFocused));

  const {primary: primaryUrl, fallback: fallbackUrl} = React.useMemo(
    () => resolvePosterUrls(titleItem),
    [titleItem],
  );

  const [useFallback, setUseFallback] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [internalFocused, setInternalFocused] = React.useState(false);
  const retryTimerRef = React.useRef<any>(null);

  // Reset image error states if title or image URLs change
  React.useEffect(() => {
    setUseFallback(false);
    setImageFailed(false);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [primaryUrl, fallbackUrl, titleItem?.productId, titleItem?.XCloudTitleId, titleItem?.titleId]);

  React.useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const activeUrl = !useFallback ? (primaryUrl || fallbackUrl) : (fallbackUrl || primaryUrl);

  const handleImageError = React.useCallback(() => {
    if (!useFallback && fallbackUrl) {
      setUseFallback(true);
    } else {
      setImageFailed(true);
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          setImageFailed(false);
          setUseFallback(false);
        }, 3000);
      }
    }
  }, [useFallback, fallbackUrl]);

  const activeFocused = propFocused || internalFocused;

  const onPressRef = React.useRef(onPress);
  onPressRef.current = onPress;
  const onPlayPressRef = React.useRef(onPlayPress);
  onPlayPressRef.current = onPlayPress;

  const handlePressCard = React.useCallback(() => {
    onPressRef.current && onPressRef.current(titleItem);
  }, [titleItem]);

  const handlePressPlay = React.useCallback((e: any) => {
    e?.stopPropagation?.();
    if (onPlayPressRef.current) {
      onPlayPressRef.current(titleItem);
    } else {
      onPressRef.current && onPressRef.current(titleItem);
    }
  }, [titleItem]);

  const customCardStyle = React.useMemo(() => {
    const s: any = {};
    if (width) s.width = width;
    if (height) s.height = height;
    return s;
  }, [width, height]);

  const isCardActive = activeFocused || internalFocused;
  const gameTitle = titleItem?.ProductTitle || titleItem?.title || '';

  return (
    <View
      style={[
        styles.outerWrapper,
        customCardStyle,
        isCardActive && styles.outerWrapperFocused,
        style,
      ]}>
      <Pressable
        focusable={true}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={() => setInternalFocused(true)}
        onBlur={() => setInternalFocused(false)}
        onPress={handlePressCard}
        style={({pressed, focused}: any) => {
          const cardActive = isCardActive || focused;
          return [
            styles.cardPressable,
            isLight && styles.cardPressableLight,
            cardActive && styles.cardFocused,
            cardActive && isLight && styles.cardFocusedLight,
            pressed && styles.cardPressed,
          ];
        }}>
        {/* Background poster image with caching & auto-retry */}
        {activeUrl && !imageFailed ? (
          <Image
            source={{
              uri: activeUrl,
              cache: 'force-cache',
            }}
            style={[styles.posterImage, isLight && styles.posterImageLight]}
            resizeMode="cover"
            fadeDuration={0}
            progressiveRenderingEnabled={true}
            onError={handleImageError}
          />
        ) : (
          <View style={[styles.fallbackContainer, isLight && styles.fallbackContainerLight]}>
            <Icon
              source="gamepad-variant"
              size={36}
              color={isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.35)'}
            />
            <Text
              numberOfLines={2}
              style={[styles.fallbackText, isLight && styles.fallbackTextLight]}>
              {gameTitle}
            </Text>
          </View>
        )}

        {/* Action button overlay at the bottom - hidden when gamepad connected for clean poster look */}
        {!shouldHidePlay && (
          <View style={styles.actionOverlay} pointerEvents="box-none">
            <Pressable
              onPress={handlePressPlay}
              focusable={false}
              hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
              style={({pressed}) => [
                styles.playButton,
                {backgroundColor: primaryColor},
                pressed && styles.actionButtonPressed,
              ]}>
              <Icon source="play" size={22} color={playIconColor} />
            </Pressable>
          </View>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'relative',
  },
  outerWrapperFocused: {
    zIndex: 99,
  },
  cardPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    transform: [{scale: 1}],
    overflow: 'hidden',
    backgroundColor: '#161922',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardPressableLight: {
    backgroundColor: '#E5E7EB',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  cardFocused: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  cardFocusedLight: {
    borderColor: '#107C10',
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{scale: 0.98}],
  },
  posterImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#1a1d26',
  },
  posterImageLight: {
    backgroundColor: '#E5E7EB',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#181b24',
  },
  fallbackContainerLight: {
    backgroundColor: '#F3F4F6',
  },
  fallbackText: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  fallbackTextLight: {
    color: '#111827',
  },
  actionOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2ed573',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2, // Optical center alignment for play triangle
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  actionButtonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.92}],
  },
});

export default React.memo(XStreamingGameCard, (prev, next) => {
  const prevId = prev.titleItem?.productId || prev.titleItem?.XCloudTitleId || prev.titleItem?.titleId;
  const nextId = next.titleItem?.productId || next.titleItem?.XCloudTitleId || next.titleItem?.titleId;
  if (prevId !== nextId) return false;

  if (prev.isFocused !== next.isFocused) return false;
  if (prev.hasTVPreferredFocus !== next.hasTVPreferredFocus) return false;
  if (prev.hidePlayButton !== next.hidePlayButton) return false;
  if (prev.width !== next.width || prev.height !== next.height || prev.style !== next.style) return false;

  const prevImg =
    prev.titleItem?.Image_Poster?.URL ||
    prev.titleItem?.Image_Tile?.URL ||
    prev.titleItem?.details?.posterUrl ||
    prev.titleItem?.image_urls?.poster;
  const nextImg =
    next.titleItem?.Image_Poster?.URL ||
    next.titleItem?.Image_Tile?.URL ||
    next.titleItem?.details?.posterUrl ||
    next.titleItem?.image_urls?.poster;
  if (prevImg !== nextImg) return false;

  return true;
});
