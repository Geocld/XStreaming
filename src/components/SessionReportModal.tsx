import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Platform,
} from 'react-native';
import {Portal, Modal, Icon} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Svg, {Path, Circle, Text as SvgText} from 'react-native-svg';
import {SessionReportData} from '../utils/sessionStatsTracker';

export interface SessionReportModalProps {
  visible: boolean;
  report: SessionReportData | null;
  onDismiss: () => void;
  onDone: (dontShowAgain: boolean) => void;
}

const polarToCartesian = (
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${arcSweep} 1 ${end.x} ${end.y}`;
};

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
    ? Math.min(480, screenWidth - 48)
    : Math.min(380, screenWidth - 28);

  const handleDonePress = () => {
    onDone(dontShowAgain);
  };

  const getLatencyColor = (rtt: number) => {
    if (rtt <= 40) return '#2ecc71';
    if (rtt <= 75) return '#f1c40f';
    return '#ff4757';
  };

  const getPacketLossColor = (loss: number) => {
    if (loss <= 0.5) return '#2ecc71';
    if (loss <= 2) return '#f1c40f';
    return '#ff4757';
  };

  const latencyColor = getLatencyColor(report.latencyAvg);
  const packetLossColor = getPacketLossColor(report.packetLossAvg);

  let jitterStatusText = 'MINIMAL';
  let jitterStatusColor = '#2ecc71';
  if (report.jitterAvg > 15) {
    jitterStatusText = 'HIGH';
    jitterStatusColor = '#ff4757';
  } else if (report.jitterAvg > 6) {
    jitterStatusText = 'MODERATE';
    jitterStatusColor = '#f1c40f';
  }

  const gaugeCx = 34;
  const gaugeCy = 34;
  const gaugeRadius = 24;
  const gaugeTotalAngle = 270;
  const gaugeStartAngle = 135;
  const scoreClamped = Math.max(0, Math.min(100, report.score));
  const progressSweep = Math.max(2, (scoreClamped / 100) * gaugeTotalAngle);
  const gaugeEndAngle = gaugeStartAngle + progressSweep;

  const trackPath = describeArc(
    gaugeCx,
    gaugeCy,
    gaugeRadius,
    gaugeStartAngle,
    gaugeStartAngle + gaugeTotalAngle,
  );
  const progressPath = describeArc(
    gaugeCx,
    gaugeCy,
    gaugeRadius,
    gaugeStartAngle,
    gaugeEndAngle,
  );

  const cleanVideoProfile = (report.videoProfile || '')
    .replace(/\/VIDEO\//i, '/ ')
    .replace(/-4D/i, '')
    .replace(/H\.264/i, 'H264');

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalOverlay,
          {maxHeight: screenHeight * 0.94},
        ]}>
        <View style={[styles.cardContainer, {width: modalWidth}]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <Text style={styles.headerTitle}>{t('Session report')}</Text>

            <View style={styles.heroCard}>
              {!!report.gamePoster ? (
                <Image
                  source={{uri: report.gamePoster}}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.heroPosterFallback} />
              )}

              <View style={styles.heroOverlay} />

              <View style={styles.heroContent}>
                <View style={styles.heroTitleContainer}>
                  <Text
                    style={styles.heroGameTitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}>
                    {report.gameTitle.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.gaugeWrapper}>
                  <View style={styles.qualityRatingRow}>
                    <Text style={styles.qualityLabelPrefix}>
                      {t('SESSION QUALITY:')}{' '}
                    </Text>
                    <Text
                      style={[
                        styles.qualityLabelRating,
                        {color: report.qualityColor},
                      ]}>
                      {t(report.qualityText).toUpperCase()}
                    </Text>
                  </View>

                  <Svg width={68} height={68} viewBox="0 0 68 68">
                    <Path
                      d={trackPath}
                      stroke={`${report.qualityColor}30`}
                      strokeWidth={4.5}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Path
                      d={progressPath}
                      stroke={report.qualityColor}
                      strokeWidth={4.5}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Circle
                      cx={gaugeCx}
                      cy={gaugeCy}
                      r={17}
                      fill="#151923"
                      stroke="rgba(255, 255, 255, 0.12)"
                      strokeWidth={1}
                    />
                    <SvgText
                      x={gaugeCx}
                      y={gaugeCy + 6}
                      fill="#FFFFFF"
                      fontSize="16"
                      fontWeight="900"
                      textAnchor="middle">
                      {report.score}
                    </SvgText>
                  </Svg>
                </View>
              </View>
            </View>

            <View style={styles.metricsTwoColumn}>
              <View style={styles.metricCard}>
                <Text
                  style={styles.cardHeaderTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}>
                  {t('NETWORK PERFORMANCE')}
                </Text>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Data Received (Total):')}
                    </Text>
                    <Icon source="download" size={14} color="#8e98a8" />
                  </View>
                  <Text style={styles.metricPrimaryValue}>
                    {report.totalDownloadFormatted}
                  </Text>
                  <View style={styles.metricSpacer} />
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Data Sent (Total):')}
                    </Text>
                    <Icon source="upload" size={14} color="#8e98a8" />
                  </View>
                  <Text style={styles.metricPrimaryValue}>
                    {report.totalUploadFormatted}
                  </Text>
                  <View style={styles.metricSpacer} />
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Average Latency:')}
                    </Text>
                    <Icon source="antenna" size={14} color="#8e98a8" />
                  </View>
                  <View style={styles.metricSplitRow}>
                    <View>
                      <Text
                        style={[
                          styles.metricPrimaryValue,
                          {color: latencyColor},
                        ]}>
                        {`${report.latencyAvg} ms`}
                      </Text>
                      <Text style={styles.metricSubInfoText}>
                        {`Peak ${report.latencyPeak} ms`}
                      </Text>
                    </View>
                    <Svg width={36} height={16} viewBox="0 0 36 16">
                      <Path
                        d="M 1 12 Q 10 1, 18 10 T 35 6"
                        stroke={latencyColor}
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </Svg>
                  </View>
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Average Stream Speed:')}
                    </Text>
                    <Icon source="speedometer" size={14} color="#8e98a8" />
                  </View>
                  <View style={styles.metricSplitRow}>
                    <View>
                      <Text style={styles.metricPrimaryValue}>
                        {`${report.bitrateAvg} Mbps`}
                      </Text>
                      <Text style={styles.metricSubInfoText}>
                        {`Peak ${report.bitratePeak} Mbps`}
                      </Text>
                    </View>
                    <Svg width={28} height={18} viewBox="0 0 28 18">
                      <Path
                        d="M 3 15 A 11 11 0 1 1 25 15"
                        stroke="rgba(255, 255, 255, 0.2)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                      />
                      <Path
                        d="M 3 15 A 11 11 0 0 1 18 4"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </Svg>
                  </View>
                </View>
              </View>

              <View style={styles.metricCard}>
                <Text
                  style={styles.cardHeaderTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}>
                  {t('SESSION STABILITY')}
                </Text>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Packet Loss:')}
                    </Text>
                    <Icon source="wifi-off" size={14} color="#8e98a8" />
                  </View>
                  <Text
                    style={[
                      styles.metricPrimaryValue,
                      {color: packetLossColor},
                    ]}>
                    {`${report.packetLossAvg.toFixed(2)}%`}
                  </Text>
                  <View style={styles.metricSplitRow}>
                    <Text
                      style={[
                        styles.metricBadgeText,
                        {color: packetLossColor},
                      ]}>
                      {t(report.packetLossStatus.toUpperCase())}
                    </Text>
                    <Icon
                      source="arrow-down-drop-circle"
                      size={14}
                      color={packetLossColor}
                    />
                  </View>
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Jitter (Variation):')}
                    </Text>
                    <Icon source="tilde" size={14} color="#8e98a8" />
                  </View>
                  <Text style={styles.metricPrimaryValue}>
                    {`${report.jitterAvg} ms`}
                  </Text>
                  <View style={styles.metricSplitRow}>
                    <Text
                      style={[
                        styles.metricBadgeText,
                        {color: jitterStatusColor},
                      ]}>
                      {t(jitterStatusText)}
                    </Text>
                    <Svg width={36} height={14} viewBox="0 0 36 14">
                      <Path
                        d="M 1 7 H 9 L 13 2 L 17 12 L 21 4 L 25 9 L 28 7 H 35"
                        stroke={jitterStatusColor}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </Svg>
                  </View>
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Average Frame Rate:')}
                    </Text>
                    <View style={styles.miniFpsBadge}>
                      <Text style={styles.miniFpsBadgeText}>FPS</Text>
                    </View>
                  </View>
                  <Text style={styles.metricPrimaryValue}>
                    {`${report.fpsAvg} FPS`}
                  </Text>
                  <View style={styles.metricSpacer} />
                </View>

                <View style={styles.metricRowContainer}>
                  <View style={styles.metricLabelRow}>
                    <Text style={styles.metricLabelText}>
                      {t('Video Decode Time:')}
                    </Text>
                    <Icon source="filmstrip" size={14} color="#8e98a8" />
                  </View>
                  <Text style={styles.metricPrimaryValue}>
                    {`${report.decodeAvg} ms`}
                  </Text>
                  <Text style={styles.metricSubInfoText}>
                    {t('Per video frame')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.netInfoCard}>
              <Text style={styles.netInfoCardTitle}>
                {t('Network Information')}
              </Text>

              <View style={styles.netInfoLine}>
                <Text style={styles.netInfoLabel}>
                  {`${t('Network Type:')} `}
                </Text>
                <Text style={styles.netInfoValue}>
                  {report.networkType || 'Wi-Fi (5 GHz)'}
                </Text>
              </View>

              <View style={styles.netInfoLine}>
                <Text style={styles.netInfoLabel}>
                  {`${t('VIDEO PROFILE:')} `}
                </Text>
                <Text style={styles.netInfoValue}>{cleanVideoProfile}</Text>
              </View>
            </View>

            <View style={styles.footerContainer}>
              <Pressable
                onPress={() => setDontShowAgain(!dontShowAgain)}
                style={styles.checkboxWrapper}
                android_ripple={{
                  color: 'rgba(255, 255, 255, 0.1)',
                  borderless: true,
                }}>
                <View
                  style={[
                    styles.checkboxBox,
                    dontShowAgain && styles.checkboxBoxChecked,
                  ]}>
                  {dontShowAgain && (
                    <Icon source="check" size={14} color="#0c1219" />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  {t("Don't show this again")}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDonePress}
                style={({pressed}) => [
                  styles.donePillButton,
                  pressed && styles.donePillButtonPressed,
                ]}>
                <Text style={styles.donePillButtonText}>{t('Done')}</Text>
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
    padding: 12,
  },
  cardContainer: {
    backgroundColor: '#121622',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
  },
  headerTitle: {
    fontFamily: Platform.select({
      android: 'serif',
      ios: 'Georgia',
      default: undefined,
    }),
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginBottom: 14,
  },
  heroCard: {
    position: 'relative',
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 10,
    backgroundColor: '#161b28',
  },
  heroPosterFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a2233',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 14, 23, 0.68)',
  },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitleContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGameTitle: {
    fontSize: 13.5,
    fontStyle: 'italic',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 18,
  },
  gaugeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  qualityLabelPrefix: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b0b8c6',
    letterSpacing: 0.5,
  },
  qualityLabelRating: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  metricsTwoColumn: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#161a25',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
  },
  cardHeaderTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8b94a5',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 10,
    height: 16,
  },
  metricRowContainer: {
    height: 52,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  metricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabelText: {
    fontSize: 10.5,
    color: '#8e98a8',
    fontWeight: '500',
  },
  metricPrimaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  metricSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricSubInfoText: {
    fontSize: 10,
    color: '#717b8c',
    fontWeight: '500',
  },
  metricBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  metricSpacer: {
    height: 14,
  },
  miniFpsBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  miniFpsBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#8e98a8',
  },
  netInfoCard: {
    backgroundColor: '#161a25',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    marginBottom: 14,
  },
  netInfoCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8b94a5',
    marginBottom: 8,
  },
  netInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  netInfoLabel: {
    fontSize: 11,
    color: '#8e98a8',
    fontWeight: '500',
  },
  netInfoValue: {
    fontSize: 11.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footerContainer: {
    gap: 12,
  },
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#606a7c',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxBoxChecked: {
    backgroundColor: '#27c96a',
    borderColor: '#27c96a',
  },
  checkboxLabel: {
    fontSize: 12.5,
    color: '#8e98a8',
    fontWeight: '500',
  },
  donePillButton: {
    backgroundColor: '#27c96a',
    borderRadius: 24,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#27c96a',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  donePillButtonPressed: {
    backgroundColor: '#22ad5b',
    opacity: 0.9,
  },
  donePillButtonText: {
    color: '#0e1713',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

export default SessionReportModal;
