import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {Text, SegmentedButtons, Appbar, Searchbar} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import {useSelector} from 'react-redux';
import TitleItem from '../components/TitleItem';
import XcloudApi from '../xCloud';
import Empty from '../components/Empty';
// import mockData from '../mock/data';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';

const log = debugFactory('CloudScreen');

function CloudScreen({navigation}) {
  const {t} = useTranslation();
  const streamingTokens = useSelector(state => state.streamingTokens);

  // log.info('streamingTokens:', streamingTokens);

  const [current, setCurrent] = React.useState(0);
  const [numColumns, setNumColumns] = React.useState(2);
  const [currentPage, setCurrentPage] = React.useState(1);

  const [loading, setLoading] = React.useState(false);
  const [loadmoring, setLoadmoring] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [titles, setTitles] = React.useState([]);
  const [newTitles, setNewTitles] = React.useState([]);
  const [titlesMap, setTitlesMap] = React.useState({});
  const [RecentTitles, setRecentNewTitles] = React.useState([]);
  const [keyword, setKeyword] = React.useState('');
  const flatListRef = React.useRef(null);

  const currentTitles = React.useRef([]);
  const totalPage = React.useRef(0);

  React.useEffect(() => {
    if (!streamingTokens.xCloudToken) {
      setIsLimited(true);
    }
    const fetchGames = () => {
      if (streamingTokens.xCloudToken) {
        const _xCloudApi = new XcloudApi(
          streamingTokens.xCloudToken.getDefaultRegion().baseUri,
          streamingTokens.xCloudToken.data.gsToken,
          'cloud',
        );
        setLoading(true);
        _xCloudApi.getTitles().then(res => {
          // log.info('_xCloudApi.getTitles res: ', titles);
          if (res.results) {
            _xCloudApi.getGamePassProducts(res.results).then(_titles => {
              setTitles(_titles);

              const _titleMap = {};
              _titles.forEach(item => {
                if (item.details && item.details.productId) {
                  _titleMap[item.details.productId] = item;
                }
              });
              setTitlesMap(_titleMap);

              // Get new games
              _xCloudApi.getNewTitles().then(newTitleRes => {
                const _newTitles = [];
                newTitleRes.forEach(item => {
                  if (item.id && _titleMap[item.id]) {
                    _newTitles.push(_titleMap[item.id]);
                  }
                });
                setNewTitles(_newTitles);

                // Get recent games
                _xCloudApi.getRecentTitles().then(recentTitleRes => {
                  const results = recentTitleRes.results || [];
                  const _recentTitles = [];
                  results.forEach(item => {
                    if (
                      item.details &&
                      item.details.productId &&
                      _titleMap[item.details.productId]
                    ) {
                      _recentTitles.push(_titleMap[item.details.productId]);
                    }
                  });
                  setRecentNewTitles(_recentTitles);
                  setLoading(false);
                });
              });
            });
          }
        });
      }
    };
    fetchGames();

    const updateLayout = () => {
      const {width, height} = Dimensions.get('window');
      setNumColumns(width > height ? 4 : 2);
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);

    return () => {
      subscription?.remove();
    };
  }, [streamingTokens.xCloudToken, navigation]);

  const handleViewDetail = titleItem => {
    navigation.navigate('TitleDetail', {titleItem});
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  const loadMoreData = () => {
    if (currentPage <= totalPage.current) {
      setLoadmoring(true);
      setCurrentPage(currentPage + 1);
      setTimeout(() => {
        setLoadmoring(false);
      }, 1500);
    } else {
      setLoadmoring(false);
    }
  };

  const footLoading = () => {
    if (loadmoring) {
      return (
        <ActivityIndicator
          size="large"
          color="#0000ff"
          style={styles.loadingIndicator}
        />
      );
    } else {
      return null;
    }
  };

  const handleSelectCategories = val => {
    setCurrent(val);
    setLoading(true);
    setCurrentPage(1);
    scrollToTop();
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  /**
   * 0 - recent
   * 1 - new
   * 2 - all
   */
  switch (current) {
    case 0:
      currentTitles.current = RecentTitles;
      break;
    case 1:
      currentTitles.current = newTitles;
      break;
    case 2:
      currentTitles.current = titles;
      break;
    default:
      currentTitles.current = [];
      break;
  }

  if (keyword.length > 0) {
    currentTitles.current = currentTitles.current.filter(title => {
      return (
        title.catalogDetails &&
        title.catalogDetails.ProductTitle &&
        title.catalogDetails.ProductTitle.toUpperCase().indexOf(
          keyword.toUpperCase(),
        ) > -1
      );
    });
  }

  if (currentTitles.current.length > 0) {
    totalPage.current = Math.ceil(currentTitles.current.length / 20);
  }

  // Show 20 titles per page
  const endIdx = currentPage * 20;
  let showTitles = currentTitles.current.slice(0, endIdx);

  return (
    <>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      {!isLimited && (
        <>
          <View style={styles.gameContainer}>
            <Appbar.Header>
              <Appbar.Content
                title={
                  <SegmentedButtons
                    value={current}
                    onValueChange={handleSelectCategories}
                    buttons={[
                      {
                        value: 0,
                        label: t('Recently'),
                      },
                      {
                        value: 1,
                        label: t('Newest'),
                      },
                      {value: 2, label: t('All')},
                    ]}
                  />
                }
              />
            </Appbar.Header>

            <View style={styles.search}>
              <Searchbar
                placeholder={t('Search')}
                style={{
                  height: 40,
                }}
                inputStyle={{
                  minHeight: 0,
                }}
                onChangeText={val => setKeyword(val)}
                value={keyword}
              />
            </View>

            {!loading && !showTitles.length && <Empty />}

            {showTitles.length > 0 && (
              <>
                <FlatList
                  ref={flatListRef}
                  data={showTitles}
                  numColumns={numColumns}
                  key={numColumns}
                  contentContainerStyle={styles.listContainer}
                  renderItem={({item}) => {
                    return (
                      <View
                        style={
                          numColumns === 2 ? styles.listItemH : styles.listItemV
                        }>
                        <TitleItem
                          titleItem={item}
                          onPress={handleViewDetail}
                        />
                      </View>
                    );
                  }}
                  onEndReached={loadMoreData}
                  onEndReachedThreshold={0.1}
                  ListFooterComponent={footLoading}
                />
              </>
            )}
          </View>
        </>
      )}

      {isLimited && (
        <View style={styles.container}>
          <View>
            <Text style={styles.tips} category="s1">
              {t('NoXGP')}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tips: {
    textAlign: 'center',
    lineHeight: 30,
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
  gameContainer: {
    flex: 1,
  },
  categoryWrap: {
    width: 200,
    padding: 10,
  },
  listContainer: {},
  listItemH: {
    width: '50%',
    justifyContent: 'center',
  },
  listItemV: {
    width: '25%',
    justifyContent: 'center',
  },
  loadingIndicator: {
    padding: 20,
  },
  search: {
    paddingLeft: 10,
    paddingRight: 10,
  },
});

export default CloudScreen;
