import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, useTheme} from 'react-native-paper';

type Props = {
  titleItem: any;
  onPress: (titleItem: any) => any;
  compact?: boolean;
};

const TitleItem: React.FC<Props> = ({titleItem, onPress, compact = false}) => {
  const theme = useTheme();
  const [loading, setLoading] = React.useState(true);

  const handlePress = () => {
    onPress && onPress(titleItem);
  };

  const renderImage = () => {
    if (!titleItem) {
      return null;
    }
    if (!titleItem.Image_Tile && !titleItem.Image_Poster) {
      return null;
    }
    const url = titleItem.Image_Tile
      ? titleItem.Image_Tile.URL
      : titleItem.Image_Poster.URL;

    if (url) {
      return (
        <Image
          source={{
            uri: 'https:' + url,
          }}
          resizeMode={'cover'}
          onLoad={() => setLoading(false)}
          style={[styles.image, compact && styles.imageCompact]}
        />
      );
    } else {
      return null;
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{color: 'rgba(255,255,255,0.18)'}}
      style={styles.pressable}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator
              size={compact ? 'small' : 'large'}
              color={theme.colors.primary}
            />
          </View>
        )}
        {renderImage()}
        <View
          style={[
            styles.descriptionContainer,
            compact && styles.descriptionContainerCompact,
          ]}>
          <Text
            style={[styles.description, compact && styles.descriptionCompact]}
            numberOfLines={compact ? 1 : 2}
            ellipsizeMode="tail">
            {titleItem.ProductTitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(140, 140, 150, 0.38)',
    borderRadius: 8,
    margin: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardCompact: {
    margin: 5,
    borderColor: 'rgba(140, 140, 150, 0.28)',
  },
  loadingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: 150,
  },
  imageCompact: {
    height: 104,
  },
  descriptionContainer: {
    padding: 10,
  },
  descriptionContainerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  description: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0,
  },
  descriptionCompact: {
    fontSize: 11,
  },
});

export default TitleItem;
