import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

type Props = {
  titleItem: any;
  onPress: (titleItem: any) => {};
};

const TitleItem: React.FC<Props> = ({titleItem, onPress}) => {
  const [loading, setLoading] = React.useState(true);
  const {t} = useTranslation();

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
  if (Platform.isTV) {
    return (
      <View>
        <View style={styles.card}>
          {loading && (
            <ActivityIndicator
              style={styles.loadingIndicator}
              size="large"
              color="#107C10"
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

          <Button
            mode="text"
            labelStyle={{marginHorizontal: 0}}
            onPress={handlePress}>
            {t('Start game')}
          </Button>
        </View>
      </View>
    );
  } else {
    return (
      <Pressable onPress={handlePress}>
        <View style={styles.card}>
          {loading && (
            <ActivityIndicator
              style={styles.loadingIndicator}
              size="large"
              color="#107C10"
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
  }
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
