import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Searchbar, Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

function SearchScreen({navigation, route}) {
  const {t} = useTranslation();
  const [keyword, setKeyword] = React.useState('');

  React.useEffect(() => {
    if (route.params?.keyword) {
      setKeyword(route.params.keyword);
    }
  }, [route.params?.keyword]);

  const handleConfirm = () => {
    navigation.navigate({
      name: 'Cloud',
      params: {keyword},
      merge: true,
    });
  };

  return (
    <View style={styles.container}>
      <Searchbar
        autoFocus
        placeholder={t('Search')}
        style={{
          marginTop: 30,
          height: 40,
        }}
        inputStyle={{
          minHeight: 0,
        }}
        onChangeText={val => setKeyword(val)}
        value={keyword}
      />
      <View style={styles.buttonsWrap}>
        <Button mode="contained" style={styles.button} onPress={handleConfirm}>
          {t('Confirm')}
        </Button>
        <Button
          mode="outlined"
          style={styles.button}
          onPress={() => navigation.goBack()}>
          {t('Back')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  buttonsWrap: {
    marginTop: 30,
  },
  button: {
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 500,
  },
});

export default SearchScreen;
