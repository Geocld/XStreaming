import React from 'react';
import {StyleSheet, View, Platform, TouchableOpacity} from 'react-native';
import {Text, Icon, Card, Button, useTheme} from 'react-native-paper';

type Props = {
  title: string;
  icon: string;
  color: string;
  onPress: () => {};
};

const HomeItem: React.FC<Props> = ({title, icon, color, onPress}) => {
  const theme = useTheme();
  const titleStyle = React.useMemo(() => [styles.title, {color}], [color]);
  const cardStyle = React.useMemo(
    () => [styles.card, theme.dark && styles.cardDark],
    [theme.dark],
  );
  const iconBubbleStyle = React.useMemo(
    () => [styles.iconBubble, theme.dark && styles.iconBubbleDark],
    [theme.dark],
  );
  const tvButtonStyle = React.useMemo(
    () => [styles.tvButton, theme.dark && styles.tvButtonDark],
    [theme.dark],
  );

  const handlePress = () => {
    onPress && onPress();
  };

  if (Platform.isTV) {
    return (
      <View>
        <Card mode="contained" style={cardStyle}>
          <Card.Content style={styles.cardContent}>
            <View style={iconBubbleStyle}>
              <Icon source={icon} color={color} size={40} />
            </View>
            <Button
              mode="elevated"
              style={tvButtonStyle}
              labelStyle={styles.buttonLabel}
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
        <Card mode="contained" style={cardStyle}>
          <Card.Content style={styles.cardContent}>
            <View style={iconBubbleStyle}>
              <Icon source={icon} color={color} size={48} />
            </View>
            <View>
              <Text variant="labelLarge" numberOfLines={1} style={titleStyle}>
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
    borderRadius: 18,
  },
  card: {
    minHeight: 124,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.12,
    shadowRadius: 22,
  },
  cardDark: {
    backgroundColor: 'rgba(18, 20, 32, 0.84)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowOpacity: 0.32,
  },
  cardContent: {
    minHeight: 124,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  iconBubble: {
    width: 58,
    height: 58,
    borderRadius: 18,
    // backgroundColor: 'rgba(255, 255, 255, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconBubbleDark: {
    // backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
  },
  tvButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  tvButtonDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  buttonLabel: {
    marginHorizontal: 0,
    fontWeight: '700',
  },
});

export default HomeItem;
