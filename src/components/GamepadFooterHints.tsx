import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Platform,
} from 'react-native';
import {Icon, useTheme} from 'react-native-paper';

export interface GamepadHintItem {
  button: 'A' | 'B' | 'X' | 'Y' | 'DPAD' | 'L1' | 'R1' | 'MENU';
  label: string;
}

export interface GamepadFooterHintsProps {
  visible?: boolean;
  hints: GamepadHintItem[];
}

const BUTTON_CONFIG: Record<
  string,
  {
    bg: string;
    text: string;
    icon?: string;
    shape?: 'circle' | 'square';
  }
> = {
  A: {bg: '#107C10', text: '#FFFFFF', shape: 'circle'},
  B: {bg: '#E81123', text: '#FFFFFF', shape: 'circle'},
  X: {bg: '#0078D7', text: '#FFFFFF', shape: 'circle'},
  Y: {bg: '#FFB900', text: '#111320', shape: 'circle'},
  DPAD: {bg: 'rgba(255, 255, 255, 0.18)', text: '#FFFFFF', icon: 'arrow-all', shape: 'square'},
  L1: {bg: 'rgba(255, 255, 255, 0.22)', text: '#FFFFFF', shape: 'square'},
  R1: {bg: 'rgba(255, 255, 255, 0.22)', text: '#FFFFFF', shape: 'square'},
  MENU: {bg: 'rgba(255, 255, 255, 0.22)', text: '#FFFFFF', icon: 'menu', shape: 'square'},
};

const GamepadFooterHints: React.FC<GamepadFooterHintsProps> = ({
  visible = true,
  hints,
}) => {
  const theme = useTheme();
  const isLight = theme.dark === false;
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;

  if (!visible || !hints || hints.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.overlayWrapper,
        Platform.isTV
          ? styles.overlayTV
          : isLandscape
          ? styles.overlayLandscape
          : styles.overlayPortrait,
      ]}>
      <View
        style={[
          styles.verticalCard,
          isLight ? styles.verticalCardLight : styles.verticalCardDark,
        ]}>
        {hints.map((hint, index) => {
          const cfg = BUTTON_CONFIG[hint.button] || {
            bg: 'rgba(255, 255, 255, 0.2)',
            text: '#FFFFFF',
            shape: 'circle',
          };
          const isDpad = hint.button === 'DPAD';
          const badgeBg =
            isLight && isDpad ? 'rgba(0, 0, 0, 0.1)' : cfg.bg;
          const badgeTextColor =
            isLight && isDpad ? '#1F2937' : cfg.text;

          return (
            <View key={`${hint.button}_${index}`} style={styles.hintRow}>
              <View
                style={[
                  styles.badge,
                  cfg.shape === 'circle' ? styles.badgeCircle : styles.badgeSquare,
                  {backgroundColor: badgeBg},
                ]}>
                {cfg.icon ? (
                  <Icon
                    source={cfg.icon}
                    size={13}
                    color={badgeTextColor}
                  />
                ) : (
                  <Text
                    style={[
                      styles.badgeText,
                      {color: badgeTextColor},
                    ]}>
                    {hint.button}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.hintLabel,
                  isLight ? styles.hintLabelLight : styles.hintLabelDark,
                ]}
                numberOfLines={1}>
                {hint.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayWrapper: {
    position: 'absolute',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    zIndex: 9999,
  },
  overlayPortrait: {
    bottom: 20,
    right: 14,
  },
  overlayLandscape: {
    bottom: 14,
    right: 18,
  },
  overlayTV: {
    bottom: 24,
    right: 28,
  },
  verticalCard: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  verticalCardDark: {
    backgroundColor: 'rgba(17, 19, 32, 0.90)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  verticalCardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowOpacity: 0.15,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCircle: {
    borderRadius: 9,
  },
  badgeSquare: {
    borderRadius: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
  },
  hintLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hintLabelDark: {
    color: '#F3F4F6',
  },
  hintLabelLight: {
    color: '#1F2937',
  },
});

export default React.memo(GamepadFooterHints);
