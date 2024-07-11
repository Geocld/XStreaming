import React from 'react';
import {StyleSheet, View, FlatList, Dimensions} from 'react-native';
import {
  Layout,
  Text,
  IndexPath,
  Select,
  SelectItem,
} from '@ui-kitten/components';
import Spinner from 'react-native-loading-spinner-overlay';
import Pagination from '@cherry-soft/react-native-basic-pagination';
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
  const selectLists = [t('Recent Games'), t('Recently added'), t('All Games')];

  const streamingTokens = useSelector(state => state.streamingTokens);

  // log.info('streamingTokens:', streamingTokens);

  const [numColumns, setNumColumns] = React.useState(2);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedIndex, setSelectedIndex] = React.useState(new IndexPath(0));
  const [selectedText, setSelectedText] = React.useState(
    selectLists[selectedIndex.row],
  );
  const [loading, setLoading] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [titles, setTitles] = React.useState([]);
  const [newTitles, setNewTitles] = React.useState([]);
  const [titlesMap, setTitlesMap] = React.useState({});
  const [RecentTitles, setRecentNewTitles] = React.useState([]);
  const flatListRef = React.useRef(null);

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

  const handleSelectCategories = indexPath => {
    setLoading(true);
    setSelectedIndex(indexPath);
    setSelectedText(selectLists[indexPath.row]);
    setCurrentPage(1);
    scrollToTop();
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  const handleChangePage = page => {
    setCurrentPage(page);
    scrollToTop();
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  let currentTitles = [];
  /**
   * 0 - recent
   * 1 - new
   * 2 - all
   */
  switch (selectedIndex.row) {
    case 0:
      currentTitles = RecentTitles;
      break;
    case 1:
      currentTitles = newTitles;
      break;
    case 2:
      currentTitles = titles;
      break;
    default:
      currentTitles = [];
      break;
  }

  // Show 20 titles per page
  const startIdx = (currentPage - 1) * 20;
  const endIdx = currentPage * 20;
  const showTitles = currentTitles.slice(startIdx, endIdx);

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
          <Layout style={styles.gameContainer}>
            <View style={styles.categoryWrap}>
              <Select
                value={selectedText}
                selectedIndex={selectedIndex}
                onSelect={handleSelectCategories}>
                {selectLists.map(select => {
                  return <SelectItem title={select} key={select} />;
                })}
              </Select>
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
                />
                {!loading && currentTitles.length > 20 && (
                  <Pagination
                    totalItems={currentTitles.length}
                    pageSize={20}
                    currentPage={currentPage}
                    onPageChange={handleChangePage}
                  />
                )}
              </>
            )}
          </Layout>
        </>
      )}

      {isLimited && (
        <Layout style={styles.container}>
          <View>
            <Text style={styles.tips} category="s1">
              {t('NoXGP')}
            </Text>
          </View>
        </Layout>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  tips: {
    textAlign: 'center',
    color: '#666666',
    lineHeight: 30,
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
  gameContainer: {
    flex: 1,
  },
  categoryWrap: {
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
});

export default CloudScreen;
