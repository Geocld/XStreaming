import React from 'react';
import {StyleSheet, View, Platform, TouchableOpacity} from 'react-native';
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
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.6}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={styles.pressable}>
        <Card style={styles.card}>
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
      </TouchableOpacity>
    );
  }
};

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 8,
  },
  card: {
    elevation: 2,
    borderRadius: 8,
  },
  cardTop: {
    alignContent: 'center',
    alignItems: 'center',
    paddingBottom: 10,
  },
});

export default HomeItem;
