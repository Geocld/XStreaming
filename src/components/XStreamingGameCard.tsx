import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Text,
} from 'react-native';
import {Icon, useTheme} from 'react-native-paper';

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
}

const XStreamingGameCard: React.FC<Props> = ({
  titleItem,
  onPress,
  onPlayPress,
  width,
  height,
  style,
  hasTVPreferredFocus,
  isFocused: propFocused = false,
}) => {
  const theme = useTheme();
  const isLight = !theme.dark;
  const primaryColor = theme.colors.primary;
  const playIconColor = theme.colors.onPrimary || '#FFFFFF';

  const [imageError, setImageError] = React.useState(false);
  const [internalFocused, setInternalFocused] = React.useState(false);
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

  const posterUrl = React.useMemo(() => {
    if (!titleItem) {
      return null;
    }
    const rawUrl =
      titleItem.Image_Poster?.URL ||
      titleItem.Image_Tile?.URL ||
      titleItem.details?.posterUrl;
    if (!rawUrl) {
      return null;
    }
    return rawUrl.startsWith('http') ? rawUrl : `https:${rawUrl}`;
  }, [titleItem]);

  const customCardStyle = React.useMemo(() => {
    const s: any = {};
    if (width) {
      s.width = width;
    }
    if (height) {
      s.height = height;
    }
    return s;
  }, [width, height]);

  const isCardActive = activeFocused || internalFocused;

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
        {/* Background poster image */}
        {posterUrl && !imageError ? (
          <Image
            source={{uri: posterUrl}}
            style={[styles.posterImage, isLight && styles.posterImageLight]}
            resizeMode="cover"
            fadeDuration={100}
            onError={() => {
              setImageError(true);
            }}
          />
        ) : (
          <View style={[styles.fallbackContainer, isLight && styles.fallbackContainerLight]}>
            <Icon
              source="controller"
              size={36}
              color={isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.35)'}
            />
            <Text
              numberOfLines={2}
              style={[styles.fallbackText, isLight && styles.fallbackTextLight]}>
              {titleItem?.ProductTitle || ''}
            </Text>
          </View>
        )}

        {/* Action button overlay at the bottom */}
        <View style={styles.actionOverlay} pointerEvents="box-none">
          {/* Quick Play Button */}
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
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  outerWrapperFocused: {
    zIndex: 99,
    overflow: 'visible',
  },
  cardPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#161922',
    position: 'relative',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cardPressableLight: {
    backgroundColor: '#E5E7EB',
  },
  cardFocused: {
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.06}],
    elevation: 14,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.75,
    shadowRadius: 12,
  },
  cardFocusedLight: {
    borderColor: '#107C10',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{scale: 0.985}],
  },
  posterImage: {
    width: '100%',
    height: '100%',
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
  const prevId = prev.titleItem?.XCloudTitleId || prev.titleItem?.titleId;
  const nextId = next.titleItem?.XCloudTitleId || next.titleItem?.titleId;
  return (
    prevId === nextId &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.style === next.style &&
    prev.hasTVPreferredFocus === next.hasTVPreferredFocus &&
    prev.isFocused === next.isFocused
  );
});
