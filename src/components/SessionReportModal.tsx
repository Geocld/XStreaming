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
import {Portal, Modal, Icon, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Svg, {Path, Circle, Text as SvgText} from 'react-native-svg';
import {SessionReportData} from '../utils/sessionStatsTracker';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';

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
  const theme = useTheme();
  const isDark = theme.dark;
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const [isGamepadActive] = useGamepadActiveState();
  const [focusedBtn, setFocusedBtn] = React.useState<'done' | 'checkbox'>('done');

  React.useEffect(() => {
    if (visible) {
      setDontShowAgain(false);
      setFocusedBtn('done');
    }
  }, [visible]);

  useGamepadNavigation({
    enabled: visible && !!report,
    priority: 30,
    onUp: () => {
      setFocusedBtn('checkbox');
    },
    onDown: () => {
      setFocusedBtn('done');
    },
    onLeft: () => {
      setFocusedBtn('checkbox');
    },
    onRight: () => {
      setFocusedBtn('done');
    },
    onSelect: () => {
      if (focusedBtn === 'checkbox') {
        setDontShowAgain(prev => !prev);
      } else {
        onDone(dontShowAgain);
      }
    },
    onBack: () => {
      onDismiss();
    },
  });

  const colors = React.useMemo(() => {
    return {
      cardBg: isDark ? '#121622' : '#FFFFFF',
      cardBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      cardShadow: isDark ? '#000000' : 'rgba(0, 0, 0, 0.16)',
      headerText: isDark ? '#FFFFFF' : '#111827',
      subCardBg: isDark ? '#161a25' : '#F4F6F8',
      subCardBorder: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      cardHeaderTitle: isDark ? '#8b94a5' : '#4B5563',
      labelColor: isDark ? '#8e98a8' : '#6B7280',
      valueColor: isDark ? '#FFFFFF' : '#111827',
      subInfoColor: isDark ? '#717b8c' : '#9CA3AF',
      iconColor: isDark ? '#8e98a8' : '#6B7280',
      checkboxBorder: isDark ? '#606a7c' : '#9CA3AF',
      checkboxLabel: isDark ? '#8e98a8' : '#374151',
      gaugeInnerBg: isDark ? '#151923' : '#FFFFFF',
      gaugeInnerStroke: isDark
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.10)',
      scoreTextColor: isDark ? '#FFFFFF' : '#111827',
      netInfoLabel: isDark ? '#8e98a8' : '#6B7280',
      netInfoValue: isDark ? '#FFFFFF' : '#111827',
      doneButtonBg: isDark ? '#27c96a' : (theme.colors.primary || '#107C10'),
      doneButtonText: '#FFFFFF',
      doneButtonFocusedBorder: isDark ? '#FFFFFF' : '#111827',
      hintTextColor: isDark ? '#8e98a8' : '#6B7280',
      hintKeyBg: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.09)',
      hintKeyText: isDark ? '#FFFFFF' : '#111827',
      speedArcTrack: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
      speedArcActive: isDark ? '#FFFFFF' : '#111827',
      fpsBadgeBorder: isDark
        ? 'rgba(255, 255, 255, 0.25)'
        : 'rgba(0, 0, 0, 0.20)',
      fpsBadgeText: isDark ? '#8e98a8' : '#4B5563',
      heroOverlay: isDark ? 'rgba(10, 14, 23, 0.65)' : 'rgba(15, 23, 42, 0.55)',
    };
  }, [isDark, theme.colors.primary]);

  if (!report) {
    return null;
  }

  const aspectRatio = screenWidth / Math.max(1, screenHeight);
  const isWideScreen =
    Platform.isTV ||
    aspectRatio >= 1.45 ||
    (screenWidth > screenHeight && screenWidth >= 640);

  const modalWidth = isWideScreen
    ? Math.min(880, screenWidth - 36)
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

  // Render Network Performance Metrics rows
  const renderNetworkPerformanceMetrics = (isCompact: boolean) => (
    <>
      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text
            style={[styles.metricLabelText, {color: colors.labelColor}]}
            numberOfLines={1}>
            {t('Data Received (Total):')}
          </Text>
          <Icon source="download" size={13} color={colors.iconColor} />
        </View>
        <Text style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
          {report.totalDownloadFormatted}
        </Text>
      </View>

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text
            style={[styles.metricLabelText, {color: colors.labelColor}]}
            numberOfLines={1}>
            {t('Data Sent (Total):')}
          </Text>
          <Icon source="upload" size={13} color={colors.iconColor} />
        </View>
        <Text style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
          {report.totalUploadFormatted}
        </Text>
      </View>

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabelText, {color: colors.labelColor}]}>
            {t('Average Latency:')}
          </Text>
          <Icon source="antenna" size={13} color={colors.iconColor} />
        </View>
        <View style={styles.metricSplitRow}>
          <View>
            <Text style={[styles.metricPrimaryValue, {color: latencyColor}]}>
              {`${report.latencyAvg} ms`}
            </Text>
            <Text
              style={[styles.metricSubInfoText, {color: colors.subInfoColor}]}>
              {`Peak ${report.latencyPeak} ms`}
            </Text>
          </View>
          <Svg width={32} height={14} viewBox="0 0 36 16">
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

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabelText, {color: colors.labelColor}]}>
            {t('Average Stream Speed:')}
          </Text>
          <Icon source="speedometer" size={13} color={colors.iconColor} />
        </View>
        <View style={styles.metricSplitRow}>
          <View>
            <Text
              style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
              {`${report.bitrateAvg} Mbps`}
            </Text>
            <Text
              style={[styles.metricSubInfoText, {color: colors.subInfoColor}]}>
              {`Peak ${report.bitratePeak} Mbps`}
            </Text>
          </View>
          <Svg width={24} height={16} viewBox="0 0 28 18">
            <Path
              d="M 3 15 A 11 11 0 1 1 25 15"
              stroke={colors.speedArcTrack}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 3 15 A 11 11 0 0 1 18 4"
              stroke={colors.speedArcActive}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </View>
      </View>
    </>
  );

  // Render Session Stability Metrics rows
  const renderSessionStabilityMetrics = (isCompact: boolean) => (
    <>
      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabelText, {color: colors.labelColor}]}>
            {t('Packet Loss:')}
          </Text>
          <Icon source="wifi-off" size={13} color={colors.iconColor} />
        </View>
        <View style={styles.metricSplitRow}>
          <Text style={[styles.metricPrimaryValue, {color: packetLossColor}]}>
            {`${report.packetLossAvg.toFixed(2)}%`}
          </Text>
          <View style={styles.metricBadgeRow}>
            <Text
              style={[
                styles.metricBadgeText,
                {color: packetLossColor},
              ]}>
              {t(report.packetLossStatus.toUpperCase())}
            </Text>
            <Icon
              source="arrow-down-drop-circle"
              size={13}
              color={packetLossColor}
            />
          </View>
        </View>
      </View>

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabelText, {color: colors.labelColor}]}>
            {t('Jitter (Variation):')}
          </Text>
          <Icon source="tilde" size={13} color={colors.iconColor} />
        </View>
        <View style={styles.metricSplitRow}>
          <View>
            <Text
              style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
              {`${report.jitterAvg} ms`}
            </Text>
            <Text style={[styles.metricBadgeText, {color: jitterStatusColor}]}>
              {t(jitterStatusText)}
            </Text>
          </View>
          <Svg width={32} height={12} viewBox="0 0 36 14">
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

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text
            style={[styles.metricLabelText, {color: colors.labelColor}]}
            numberOfLines={1}>
            {t('Average Frame Rate:')}
          </Text>
          <View
            style={[
              styles.miniFpsBadge,
              {borderColor: colors.fpsBadgeBorder},
            ]}>
            <Text
              style={[styles.miniFpsBadgeText, {color: colors.fpsBadgeText}]}>
              FPS
            </Text>
          </View>
        </View>
        <Text style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
          {`${report.fpsAvg} FPS`}
        </Text>
      </View>

      <View
        style={[
          styles.metricRowContainer,
          isCompact && styles.metricRowContainerCompact,
        ]}>
        <View style={styles.metricLabelRow}>
          <Text style={[styles.metricLabelText, {color: colors.labelColor}]}>
            {t('Video Decode Time:')}
          </Text>
          <Icon source="filmstrip" size={13} color={colors.iconColor} />
        </View>
        <Text style={[styles.metricPrimaryValue, {color: colors.valueColor}]}>
          {`${report.decodeAvg} ms`}
        </Text>
        <Text style={[styles.metricSubInfoText, {color: colors.subInfoColor}]}>
          {t('Per video frame')}
        </Text>
      </View>
    </>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalOverlay,
          {maxHeight: screenHeight * 0.94},
        ]}>
        <View
          style={[
            styles.cardContainer,
            {
              width: modalWidth,
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
              shadowColor: colors.cardShadow,
            },
          ]}>
          {isWideScreen ? (
            /* ========================================================================= */
            /* 16:9 / ANDROID TV / WIDESCREEN DASHBOARD LAYOUT                          */
            /* ========================================================================= */
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.wideScrollContent}>
              {/* Header Bar */}
              <View style={styles.wideHeaderRow}>
                <Text
                  style={[styles.headerTitleWide, {color: colors.headerText}]}>
                  {t('Session report')}
                </Text>

                <View style={styles.wideHeaderRight}>
                  <View style={styles.qualityRatingRowWide}>
                    <Text
                      style={[
                        styles.qualityLabelPrefix,
                        {color: colors.labelColor},
                      ]}>
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

                  <View
                    style={[
                      styles.scorePillBadge,
                      {
                        borderColor: report.qualityColor + '70',
                        backgroundColor: report.qualityColor + '18',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.scorePillText,
                        {color: report.qualityColor},
                      ]}>
                      {`${report.score} / 100`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 3-Column Dashboard Body */}
              <View style={styles.wideColumnsRow}>
                {/* Column 1: Hero Poster & Network Information */}
                <View style={styles.wideColLeft}>
                  <View
                    style={[
                      styles.wideHeroCard,
                      {borderColor: colors.subCardBorder},
                    ]}>
                    {!!report.gamePoster ? (
                      <Image
                        source={{uri: report.gamePoster}}
                        style={StyleSheet.absoluteFillObject}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.heroPosterFallback} />
                    )}
                    <View
                      style={[
                        styles.heroOverlay,
                        {backgroundColor: colors.heroOverlay},
                      ]}
                    />

                    <View style={styles.wideHeroContent}>
                      <Text
                        style={styles.heroGameTitleWide}
                        numberOfLines={2}
                        adjustsFontSizeToFit={true}
                        minimumFontScale={0.8}>
                        {report.gameTitle.toUpperCase()}
                      </Text>

                      <View style={styles.gaugeWrapperCompact}>
                        <Svg width={54} height={54} viewBox="0 0 68 68">
                          <Path
                            d={trackPath}
                            stroke={`${report.qualityColor}30`}
                            strokeWidth={5}
                            strokeLinecap="round"
                            fill="none"
                          />
                          <Path
                            d={progressPath}
                            stroke={report.qualityColor}
                            strokeWidth={5}
                            strokeLinecap="round"
                            fill="none"
                          />
                          <Circle
                            cx={gaugeCx}
                            cy={gaugeCy}
                            r={17}
                            fill={colors.gaugeInnerBg}
                            stroke={colors.gaugeInnerStroke}
                            strokeWidth={1}
                          />
                          <SvgText
                            x={gaugeCx}
                            y={gaugeCy + 6}
                            fill={colors.scoreTextColor}
                            fontSize="16"
                            fontWeight="900"
                            textAnchor="middle">
                            {report.score}
                          </SvgText>
                        </Svg>
                      </View>
                    </View>
                  </View>

                  {/* Network Information Card */}
                  <View
                    style={[
                      styles.wideNetInfoCard,
                      {
                        backgroundColor: colors.subCardBg,
                        borderColor: colors.subCardBorder,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.cardHeaderTitle,
                        {color: colors.cardHeaderTitle, marginBottom: 4},
                      ]}>
                      {t('Network Information')}
                    </Text>

                    <View style={styles.netInfoLine}>
                      <Text
                        style={[
                          styles.netInfoLabel,
                          {color: colors.netInfoLabel},
                        ]}>
                        {`${t('Network Type:')} `}
                      </Text>
                      <Text
                        style={[
                          styles.netInfoValue,
                          {color: colors.netInfoValue},
                        ]}
                        numberOfLines={1}>
                        {report.networkType || 'Wi-Fi (5 GHz)'}
                      </Text>
                    </View>

                    <View style={styles.netInfoLine}>
                      <Text
                        style={[
                          styles.netInfoLabel,
                          {color: colors.netInfoLabel},
                        ]}>
                        {`${t('VIDEO PROFILE:')} `}
                      </Text>
                      <Text
                        style={[
                          styles.netInfoValue,
                          {color: colors.netInfoValue},
                        ]}
                        numberOfLines={1}>
                        {cleanVideoProfile}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Column 2: Network Performance */}
                <View
                  style={[
                    styles.wideMetricCard,
                    {
                      backgroundColor: colors.subCardBg,
                      borderColor: colors.subCardBorder,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      {color: colors.cardHeaderTitle},
                    ]}
                    numberOfLines={1}>
                    {t('NETWORK PERFORMANCE')}
                  </Text>
                  {renderNetworkPerformanceMetrics(true)}
                </View>

                {/* Column 3: Session Stability */}
                <View
                  style={[
                    styles.wideMetricCard,
                    {
                      backgroundColor: colors.subCardBg,
                      borderColor: colors.subCardBorder,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      {color: colors.cardHeaderTitle},
                    ]}
                    numberOfLines={1}>
                    {t('SESSION STABILITY')}
                  </Text>
                  {renderSessionStabilityMetrics(true)}
                </View>
              </View>

              {/* Horizontal Footer Bar */}
              <View style={styles.wideFooterRow}>
                <Pressable
                  onPress={() => setDontShowAgain(!dontShowAgain)}
                  style={({pressed}) => [
                    styles.checkboxWrapper,
                    focusedBtn === 'checkbox' &&
                      (isGamepadActive || Platform.isTV) &&
                      styles.checkboxWrapperFocused,
                    pressed && {opacity: 0.7},
                  ]}>
                  <View
                    style={[
                      styles.checkboxBox,
                      {borderColor: colors.checkboxBorder},
                      dontShowAgain && styles.checkboxBoxChecked,
                    ]}>
                    {dontShowAgain && (
                      <Icon source="check" size={14} color="#FFFFFF" />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.checkboxLabel,
                      {color: colors.checkboxLabel},
                    ]}>
                    {t("Don't show this again")}
                  </Text>
                </Pressable>

                <View style={styles.wideFooterRight}>
                  {(isGamepadActive || Platform.isTV) && (
                    <View style={styles.modalGamepadHintsWide}>
                      <Text
                        style={[
                          styles.modalGamepadHintText,
                          {color: colors.hintTextColor},
                        ]}>
                        <Text
                          style={[
                            styles.hintKeyBadge,
                            {
                              backgroundColor: colors.hintKeyBg,
                              color: colors.hintKeyText,
                            },
                          ]}>
                          A
                        </Text>{' '}
                        {focusedBtn === 'checkbox' ? t('Toggle') : t('Done')}
                        {'   '}
                        <Text
                          style={[
                            styles.hintKeyBadge,
                            {
                              backgroundColor: colors.hintKeyBg,
                              color: colors.hintKeyText,
                            },
                          ]}>
                          B
                        </Text>{' '}
                        {t('Close')}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={handleDonePress}
                    style={({pressed}) => [
                      styles.donePillButtonWide,
                      {backgroundColor: colors.doneButtonBg},
                      focusedBtn === 'done' &&
                        (isGamepadActive || Platform.isTV) && [
                          styles.donePillButtonFocused,
                          {borderColor: colors.doneButtonFocusedBorder},
                        ],
                      pressed && styles.donePillButtonPressed,
                    ]}>
                    <Text
                      style={[
                        styles.donePillButtonText,
                        {color: colors.doneButtonText},
                      ]}>
                      {t('Done')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ========================================================================= */
            /* PORTRAIT MOBILE LAYOUT                                                   */
            /* ========================================================================= */
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}>
              <Text
                style={[styles.headerTitle, {color: colors.headerText}]}>
                {t('Session report')}
              </Text>

              <View
                style={[
                  styles.heroCard,
                  {borderColor: colors.subCardBorder},
                ]}>
                {!!report.gamePoster ? (
                  <Image
                    source={{uri: report.gamePoster}}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.heroPosterFallback} />
                )}

                <View
                  style={[
                    styles.heroOverlay,
                    {backgroundColor: colors.heroOverlay},
                  ]}
                />

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
                      <Text
                        style={[
                          styles.qualityLabelPrefix,
                          {color: colors.labelColor},
                        ]}>
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
                        fill={colors.gaugeInnerBg}
                        stroke={colors.gaugeInnerStroke}
                        strokeWidth={1}
                      />
                      <SvgText
                        x={gaugeCx}
                        y={gaugeCy + 6}
                        fill={colors.scoreTextColor}
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
                <View
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: colors.subCardBg,
                      borderColor: colors.subCardBorder,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      {color: colors.cardHeaderTitle},
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}>
                    {t('NETWORK PERFORMANCE')}
                  </Text>
                  {renderNetworkPerformanceMetrics(false)}
                </View>

                <View
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: colors.subCardBg,
                      borderColor: colors.subCardBorder,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      {color: colors.cardHeaderTitle},
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}>
                    {t('SESSION STABILITY')}
                  </Text>
                  {renderSessionStabilityMetrics(false)}
                </View>
              </View>

              <View
                style={[
                  styles.netInfoCard,
                  {
                    backgroundColor: colors.subCardBg,
                    borderColor: colors.subCardBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.netInfoCardTitle,
                    {color: colors.cardHeaderTitle},
                  ]}>
                  {t('Network Information')}
                </Text>

                <View style={styles.netInfoLine}>
                  <Text
                    style={[
                      styles.netInfoLabel,
                      {color: colors.netInfoLabel},
                    ]}>
                    {`${t('Network Type:')} `}
                  </Text>
                  <Text
                    style={[
                      styles.netInfoValue,
                      {color: colors.netInfoValue},
                    ]}>
                    {report.networkType || 'Wi-Fi (5 GHz)'}
                  </Text>
                </View>

                <View style={styles.netInfoLine}>
                  <Text
                    style={[
                      styles.netInfoLabel,
                      {color: colors.netInfoLabel},
                    ]}>
                    {`${t('VIDEO PROFILE:')} `}
                  </Text>
                  <Text
                    style={[
                      styles.netInfoValue,
                      {color: colors.netInfoValue},
                    ]}>
                    {cleanVideoProfile}
                  </Text>
                </View>
              </View>

              <View style={styles.footerContainer}>
                <Pressable
                  onPress={() => setDontShowAgain(!dontShowAgain)}
                  style={({pressed}) => [
                    styles.checkboxWrapper,
                    focusedBtn === 'checkbox' &&
                      (isGamepadActive || Platform.isTV) &&
                      styles.checkboxWrapperFocused,
                    pressed && {opacity: 0.7},
                  ]}>
                  <View
                    style={[
                      styles.checkboxBox,
                      {borderColor: colors.checkboxBorder},
                      dontShowAgain && styles.checkboxBoxChecked,
                    ]}>
                    {dontShowAgain && (
                      <Icon source="check" size={14} color="#FFFFFF" />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.checkboxLabel,
                      {color: colors.checkboxLabel},
                    ]}>
                    {t("Don't show this again")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleDonePress}
                  style={({pressed}) => [
                    styles.donePillButton,
                    {backgroundColor: colors.doneButtonBg},
                    focusedBtn === 'done' &&
                      (isGamepadActive || Platform.isTV) && [
                        styles.donePillButtonFocused,
                        {borderColor: colors.doneButtonFocusedBorder},
                      ],
                    pressed && styles.donePillButtonPressed,
                  ]}>
                  <Text
                    style={[
                      styles.donePillButtonText,
                      {color: colors.doneButtonText},
                    ]}>
                    {t('Done')}
                  </Text>
                </Pressable>

                {(isGamepadActive || Platform.isTV) && (
                  <View style={styles.modalGamepadHints}>
                    <Text
                      style={[
                        styles.modalGamepadHintText,
                        {color: colors.hintTextColor},
                      ]}>
                      <Text
                        style={[
                          styles.hintKeyBadge,
                          {
                            backgroundColor: colors.hintKeyBg,
                            color: colors.hintKeyText,
                          },
                        ]}>
                        A
                      </Text>{' '}
                      {focusedBtn === 'checkbox' ? t('Toggle') : t('Done')}{'   '}
                      <Text
                        style={[
                          styles.hintKeyBadge,
                          {
                            backgroundColor: colors.hintKeyBg,
                            color: colors.hintKeyText,
                          },
                        ]}>
                        B
                      </Text>{' '}
                      {t('Close')}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
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
    paddingVertical: 5,
    marginBottom: 6,
    justifyContent: 'center',
  },
  metricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  metricLabelText: {
    fontSize: 10.5,
    color: '#8e98a8',
    fontWeight: '500',
    flexShrink: 1,
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
    marginTop: 2,
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
    height: 0,
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
  checkboxWrapperFocused: {
    borderWidth: 2,
    borderColor: '#27c96a',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(39, 201, 106, 0.15)',
  },
  donePillButtonFocused: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.03}],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.7,
  },
  modalGamepadHints: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  modalGamepadHintText: {
    fontSize: 12,
    color: '#8e98a8',
    fontWeight: '600',
  },
  hintKeyBadge: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },

  /* ------------------------------------------------------------------------- */
  /* Widescreen / 16:9 Android TV Dashboard Layout Styles                      */
  /* ------------------------------------------------------------------------- */
  wideScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
  },
  wideHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitleWide: {
    fontFamily: Platform.select({
      android: 'serif',
      ios: 'Georgia',
      default: undefined,
    }),
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  wideHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qualityRatingRowWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scorePillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  wideColumnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    alignItems: 'stretch',
  },
  wideColLeft: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  wideHeroCard: {
    position: 'relative',
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  wideHeroContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroGameTitleWide: {
    flex: 1,
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    marginRight: 6,
  },
  gaugeWrapperCompact: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideNetInfoCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  wideMetricCard: {
    flex: 1.15,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  metricRowContainerCompact: {
    paddingVertical: 3,
    marginBottom: 3,
    justifyContent: 'center',
  },
  metricBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wideFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  wideFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modalGamepadHintsWide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donePillButtonWide: {
    paddingHorizontal: 22,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});

export default SessionReportModal;
