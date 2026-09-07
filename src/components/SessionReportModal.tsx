import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import {Portal, Modal, Icon} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {SessionReportData} from '../utils/sessionStatsTracker';

export interface SessionReportModalProps {
  visible: boolean;
  report: SessionReportData | null;
  onDismiss: () => void;
  onDone: (dontShowAgain: boolean) => void;
}

const SessionReportModal: React.FC<SessionReportModalProps> = ({
  visible,
  report,
  onDismiss,
  onDone,
}) => {
  const {t} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setDontShowAgain(false);
    }
  }, [visible]);

  if (!report) {
    return null;
  }

  const isLandscape = screenWidth > screenHeight;
  const modalWidth = isLandscape
    ? Math.min(460, screenWidth - 48)
    : Math.min(380, screenWidth - 32);

  const handleDonePress = () => {
    onDone(dontShowAgain);
  };

  const getLatencyColor = (rtt: number) => {
    if (rtt <= 40) return '#2ed573';
    if (rtt <= 70) return '#ffa502';
    return '#ff4757';
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalOverlay, {maxHeight: screenHeight * 0.92}]}>
        <View style={[styles.cardContainer, {width: modalWidth}]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {/* Header Title */}
            <Text style={styles.headerTitle}>{t('Session report')}</Text>

            {/* Score Highlight Card */}
            <View
              style={[
                styles.scoreCard,
                {borderColor: `${report.qualityColor}40`, backgroundColor: `${report.qualityColor}12`},
              ]}>
              <View style={styles.scoreLeftCol}>
                <Text style={styles.gameTitleText} numberOfLines={1}>
                  {report.gameTitle}
                </Text>
                <Text style={styles.durationText}>{report.durationFormatted}</Text>
              </View>
              <View style={styles.scoreRightCol}>
                <Text style={[styles.scoreNumber, {color: report.qualityColor}]}>
                  {`${report.score}/100`}
                </Text>
                <Text style={[styles.scoreRatingText, {color: report.qualityColor}]}>
                  {t(report.qualityText)}
                </Text>
              </View>
            </View>

            {/* Connection Section */}
            <Text style={styles.sectionHeader}>{t('Connection')}</Text>

            {/* 2-Column Grid */}
            <View style={styles.gridContainer}>
              {/* Row 1: Total Download & Total Upload */}
              <View style={styles.gridRow}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Total Download')}</Text>
                  <Text style={styles.metricValue}>{report.totalDownloadFormatted}</Text>
                  <Text style={styles.metricSub}>{t('Data received')}</Text>
                </View>

                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Total Upload')}</Text>
                  <Text style={styles.metricValue}>{report.totalUploadFormatted}</Text>
                  <Text style={styles.metricSub}>{t('Data sent')}</Text>
                </View>
              </View>

              {/* Row 2: Latency & Stream speed */}
              <View style={styles.gridRow}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Latency')}</Text>
                  <Text style={[styles.metricValue, {color: getLatencyColor(report.latencyAvg)}]}>
                    {`${report.latencyAvg} ms avg`}
                  </Text>
                  <Text style={styles.metricSub}>{`${report.latencyPeak} ms peak`}</Text>
                </View>

                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Stream speed')}</Text>
                  <Text style={styles.metricValue}>{`${report.bitrateAvg} Mbps`}</Text>
                  <Text style={styles.metricSub}>{`${report.bitratePeak} Mbps peak`}</Text>
                </View>
              </View>

              {/* Row 3: Packet loss & Jitter */}
              <View style={styles.gridRow}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Packet loss')}</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      report.packetLossAvg > 1 && {color: '#ff4757'},
                    ]}>
                    {`${report.packetLossAvg.toFixed(2)}%`}
                  </Text>
                  <Text style={styles.metricSub}>{t(report.packetLossStatus)}</Text>
                </View>

                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Jitter')}</Text>
                  <Text style={styles.metricValue}>{`${report.jitterAvg} ms`}</Text>
                  <Text style={styles.metricSub}>{t('Timing variation')}</Text>
                </View>
              </View>

              {/* Row 4: Frame rate & Decode */}
              <View style={styles.gridRow}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Frame rate')}</Text>
                  <Text style={styles.metricValue}>{`${report.fpsAvg} / ${report.fpsTarget}`}</Text>
                  <Text style={styles.metricSub}>{t('Average / target FPS')}</Text>
                </View>

                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>{t('Decode')}</Text>
                  <Text style={styles.metricValue}>{`${report.decodeAvg} ms`}</Text>
                  <Text style={styles.metricSub}>{t('Per video frame')}</Text>
                </View>
              </View>
            </View>

            {/* Network Details */}
            {!!report.networkInfo && (
              <View style={styles.infoRow}>
                <Text style={styles.infoMutedText}>
                  {`${t('Network')}: ${report.networkInfo}`}
                </Text>
              </View>
            )}

            {/* Delivered Profile */}
            <View style={styles.profileSection}>
              <Text style={styles.profileLabel}>{t('Delivered profile')}</Text>
              <Text style={styles.profileValue}>
                {`${report.resolution} • ${report.codec}`}
              </Text>
            </View>

            {/* Footer Action Bar */}
            <View style={styles.footerRow}>
              {/* Checkbox: Don't show this again */}
              <Pressable
                onPress={() => setDontShowAgain(!dontShowAgain)}
                style={styles.checkboxContainer}
                android_ripple={{color: 'rgba(255, 255, 255, 0.1)', borderless: true}}>
                <View
                  style={[
                    styles.checkboxBox,
                    dontShowAgain && styles.checkboxBoxChecked,
                  ]}>
                  {dontShowAgain && (
                    <Icon source="check" size={14} color="#0d1117" />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  {t("Don't show this again")}
                </Text>
              </Pressable>

              {/* Done Button */}
              <Pressable
                onPress={handleDonePress}
                style={({pressed}) => [
                  styles.doneButton,
                  pressed && styles.doneButtonPressed,
                ]}>
                <Text style={styles.doneButtonText}>{t('Done')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    backgroundColor: '#161922',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  scrollContent: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginBottom: 16,
  },
  scoreCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  scoreLeftCol: {
    flex: 1,
    marginRight: 12,
  },
  gameTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  durationText: {
    fontSize: 12,
    color: '#8b949e',
    fontWeight: '500',
    marginTop: 4,
  },
  scoreRightCol: {
    alignItems: 'flex-end',
  },
  scoreNumber: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scoreRatingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b949e',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridContainer: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricTile: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    fontSize: 11,
    color: '#8b949e',
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  metricSub: {
    fontSize: 11,
    color: '#8b949e',
    marginTop: 2,
  },
  infoRow: {
    marginTop: 14,
  },
  infoMutedText: {
    fontSize: 12,
    color: '#8b949e',
    fontWeight: '500',
  },
  profileSection: {
    marginTop: 10,
  },
  profileLabel: {
    fontSize: 12,
    color: '#8b949e',
    fontWeight: '500',
    marginBottom: 2,
  },
  profileValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: 20,
    gap: 14,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#8b949e',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxBoxChecked: {
    backgroundColor: '#2ed573',
    borderColor: '#2ed573',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#8b949e',
    fontWeight: '500',
  },
  doneButton: {
    backgroundColor: '#2ed573',
    borderRadius: 20,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2ed573',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonPressed: {
    backgroundColor: '#26af5f',
    opacity: 0.9,
  },
  doneButtonText: {
    color: '#0d1117',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default SessionReportModal;
