import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, Icon, ProgressBar} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  item: any;
};

const ArchivementItem: React.FC<Props> = ({item}) => {
  const [loading, setLoading] = React.useState(true);

  let progress = 0;
  if (item.progressState === 'Achieved') {
    progress = 1;
  } else if (
    item.progressState === 'InProgress' &&
    item.progression &&
    item.progression.requirements
  ) {
    progress =
      item.progression.requirements[0].current /
      item.progression.requirements[0].target;
  }

  const sorce = (item.rewards && item.rewards[0] && item.rewards[0].value) || 0;

  return (
    <Pressable>
      <View style={styles.card}>
        {loading && (
          <ActivityIndicator
            style={styles.loadingIndicator}
            size="large"
            color="#107C10"
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
        <View style={styles.footer}>
          {sorce > 0 && (
            <View style={styles.score}>
              <Icon source="alpha-g-circle-outline" color={'#fff'} size={15} />
              <Text variant="labelSmall" style={{marginLeft: 5}}>
                {sorce}
              </Text>
            </View>
          )}
          <View style={styles.percent}>
            <Text variant="labelSmall">{Math.floor(progress * 100) + '%'}</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <ProgressBar progress={progress} />
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
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    flexDirection: 'row',
    paddingLeft: 10,
    paddingRight: 10,
  },
  score: {
    flexDirection: 'row',
  },
  percent: {},
  progressBar: {
    paddingTop: 5,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
  },
});

export default ArchivementItem;
