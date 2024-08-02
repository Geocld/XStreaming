import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Avatar, Text, Icon} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

type Props = {
  profile: any;
};

const Profile: React.FC<Props> = ({profile}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.container}>
      <Avatar.Image
        style={styles.avatar}
        size={64}
        source={{uri: profile.GameDisplayPicRaw}}
      />
      <View>
        <View>
          <Text style={styles.text} variant="titleMedium">
            {profile.GameDisplayName}
          </Text>
        </View>
        <View style={styles.sorce}>
          <Icon source="alpha-g-circle-outline" color={'#fff'} size={20} />
          <Text style={styles.gamerscore}>{profile.Gamerscore}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#107C10',
    marginBottom: 20,
    borderRadius: 5,
  },
  avatar: {
    marginRight: 10,
  },
  text: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  gamerscore: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  sorce: {
    flexDirection: 'row',
  },
});

export default Profile;
