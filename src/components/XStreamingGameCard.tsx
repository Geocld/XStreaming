import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
  Text,
} from 'react-native';
import {Icon} from 'react-native-paper';

interface Props {
  titleItem: any;
  onPress: (titleItem: any) => void;
  onPlayPress?: (titleItem: any) => void;
  onBookmarkPress?: (titleItem: any) => void;
  isStarred?: boolean;
  width?: number;
  height?: number;
  style?: any;
}

const XStreamingGameCard: React.FC<Props> = ({
  titleItem,
  onPress,
  onPlayPress,
  onBookmarkPress,
  isStarred = false,
  width,
  height,
  style,
}) => {
  const [imageLoading, setImageLoading] = React.useState(true);
  const [imageError, setImageError] = React.useState(false);

  const handlePressCard = () => {
    onPress && onPress(titleItem);
  };

  const handlePressPlay = (e: any) => {
    e?.stopPropagation?.();
    if (onPlayPress) {
      onPlayPress(titleItem);
    } else {
      onPress && onPress(titleItem);
    }
  };

  const handlePressBookmark = (e: any) => {
    e?.stopPropagation?.();
    onBookmarkPress && onBookmarkPress(titleItem);
  };

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

  return (
    <View style={[styles.outerWrapper, customCardStyle, style]}>
      <Pressable
        onPress={handlePressCard}
        android_ripple={{color: 'rgba(255, 255, 255, 0.12)'}}
        style={({pressed}) => [styles.cardPressable, pressed && styles.cardPressed]}>
        {/* Background poster image */}
        {posterUrl && !imageError ? (
          <Image
            source={{uri: posterUrl}}
            style={styles.posterImage}
            resizeMode="cover"
            onLoadEnd={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageError(true);
            }}
          />
        ) : (
          <View style={styles.fallbackContainer}>
            <Icon source="controller" size={36} color="rgba(255, 255, 255, 0.35)" />
            <Text numberOfLines={2} style={styles.fallbackText}>
              {titleItem?.ProductTitle || ''}
            </Text>
          </View>
        )}

        {/* Loading spinner */}
        {imageLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#2ed573" />
          </View>
        )}

        {/* Action buttons overlay at the bottom */}
        <View style={styles.actionOverlay} pointerEvents="box-none">
          {/* Bookmark Button */}
          <Pressable
            onPress={handlePressBookmark}
            hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
            android_ripple={{color: 'rgba(255, 255, 255, 0.25)', borderless: true}}
            style={({pressed}) => [
              styles.bookmarkButton,
              isStarred && styles.bookmarkButtonActive,
              pressed && styles.actionButtonPressed,
            ]}>
            <Icon
              source={isStarred ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isStarred ? '#2ed573' : '#FFFFFF'}
            />
          </Pressable>

          {/* Quick Play Button */}
          <Pressable
            onPress={handlePressPlay}
            hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
            android_ripple={{color: 'rgba(0, 0, 0, 0.2)', borderless: true}}
            style={({pressed}) => [
              styles.playButton,
              pressed && styles.actionButtonPressed,
            ]}>
            <Icon source="play" size={22} color="#000000" />
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
  cardPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#161922',
    position: 'relative',
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
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 20, 26, 0.4)',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#181b24',
  },
  fallbackText: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookmarkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 17, 23, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  bookmarkButtonActive: {
    borderColor: 'rgba(46, 213, 115, 0.6)',
    backgroundColor: 'rgba(15, 17, 23, 0.85)',
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
  },
  actionButtonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.92}],
  },
});

export default React.memo(XStreamingGameCard);
