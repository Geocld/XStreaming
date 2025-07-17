import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text} from 'react-native-paper';

type Props = {
  titleItem: any;
  onPress: (titleItem: any) => {};
};

const TitleItem: React.FC<Props> = ({titleItem, onPress}) => {
  const [loading, setLoading] = React.useState(true);

  const handlePress = () => {
    onPress && onPress(titleItem);
  };

  const renderImage = () => {
    if (!titleItem) {
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
          style={styles.image}
        />
      );
    } else {
      return null;
    }
  };

  return (
    <Pressable onPress={handlePress}>
      <View style={styles.card}>
        {loading && (
          <ActivityIndicator
            style={styles.loadingIndicator}
            size="large"
            color="#0000ff"
          />
        )}
        {renderImage()}
        <View style={styles.descriptionContainer}>
          <Text
            style={styles.description}
            numberOfLines={2}
            ellipsizeMode="tail">
            {titleItem.ProductTitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#666666',
    borderRadius: 10,
    margin: 10,
  },
  loadingIndicator: {
    position: 'absolute',
    zIndex: 1,
  },
  image: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  descriptionContainer: {
    padding: 10,
  },
  description: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default TitleItem;
