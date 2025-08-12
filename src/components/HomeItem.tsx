import React from 'react';
import {StyleSheet, View, Pressable, Platform} from 'react-native';
import {Text, Icon, Card, Button} from 'react-native-paper';

type Props = {
  title: string;
  icon: string;
  color: string;
  onPress: () => {};
};

const HomeItem: React.FC<Props> = ({title, icon, color, onPress}) => {
  const handlePress = () => {
    onPress && onPress();
  };

  if (Platform.isTV) {
    return (
      <View>
        <Card>
          <Card.Content>
            <View style={styles.cardTop}>
              <Icon source={icon} color={color} size={40} />
            </View>
            <Button
              mode="elevated"
              labelStyle={{marginHorizontal: 0}}
              textColor={color}
              onPress={handlePress}>
              {title}
            </Button>
          </Card.Content>
        </Card>
      </View>
    );
  } else {
    return (
      <Pressable onPress={handlePress}>
        <Card>
          <Card.Content>
            <View style={styles.cardTop}>
              <Icon source={icon} color={color} size={40} />
            </View>
            <View>
              <Text variant="labelLarge" style={{color, textAlign: 'center'}}>
                {title}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </Pressable>
    );
  }
};

const styles = StyleSheet.create({
  cardTop: {
    alignContent: 'center',
    alignItems: 'center',
    paddingBottom: 10,
  },
});

export default HomeItem;
