import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import axios from 'axios';
import {useTranslation} from 'react-i18next';
import Spinner from '../components/Spinner';

function ThanksScreen() {
  const {i18n} = useTranslation();
  const currentLanguage = i18n.language;
  const [loading, setLoading] = React.useState(false);
  const [lists, setLists] = React.useState([]);

  React.useEffect(() => {
    setLoading(true);
    axios
      .get('https://xstreaming-support.pages.dev/supports.json', {
        timeout: 30 * 1000,
      })
      .then(res => {
        setLoading(false);
        if (res && res.data && res.data.lists) {
          setLists(res.data.lists);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Spinner loading={loading} cancelable={true} />
      <View style={styles.block}>
        <View>
          {currentLanguage === 'zh' || currentLanguage === 'zht' ? (
            <Text variant="labelLarge">
              XStreaming做为开源项目始终坚持给大家提供多一种Xbox串流选择，但此项工作绝不是一个人能完成的，
              特别鸣谢下面的朋友在开发期间提供宝贵的帮助和支持(排名不分先后):
            </Text>
          ) : (
            <Text variant="labelLarge">
              XStreaming, as an open-source project, has always been committed
              providing everyone with an alternative option for Xbox streaming.
              However, this endeavor is by no means a one-person effort. A
              special thanks goes out to the following friends for their
              invaluable assistance and support during the development process
              (in no particular order):
            </Text>
          )}

          <View style={{marginTop: 10}}>
            {lists.map(item => {
              return (
                <Text variant="labelMedium" key={item}>
                  {item}
                </Text>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  block: {
    marginBottom: 20,
  },
  title: {
    marginBottom: 10,
  },
});

export default ThanksScreen;
