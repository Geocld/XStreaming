import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  item: any;
};

const ArchivementItem: React.FC<Props> = ({item}) => {
  const [loading, setLoading] = React.useState(true);

  return (
    <Pressable>
      <View style={styles.card}>
        {loading && (
          <ActivityIndicator
            style={styles.loadingIndicator}
            size="large"
            color="#0000ff"
          />
        )}
        {item.progressState !== 'Achieved' && (
          <View style={styles.maskLock}>
            <Ionicons name="lock-closed-outline" size={40} color={'#ffffff'} />
          </View>
        )}

        <Image
          source={{
            uri: item.mediaAssets[0].url,
          }}
          resizeMode={'cover'}
          onLoad={() => setLoading(false)}
          style={styles.image}
        />
        <View style={styles.descriptionContainer}>
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {item.name}
          </Text>
          <Text
            style={styles.description}
            numberOfLines={2}
            ellipsizeMode="tail">
            {item.description}
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
    position: 'relative',
  },
  maskLock: {
    borderRadius: 10,
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 9,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  title: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 12,
    marginTop: 8,
  },
});

export default ArchivementItem;
