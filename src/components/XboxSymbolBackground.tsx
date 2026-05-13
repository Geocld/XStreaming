import React from 'react';
import {Dimensions, StyleSheet, useWindowDimensions} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

type Props = {
  isLight: boolean;
};

const BACKGROUND_OVERDRAW = 96;

type SymbolItem = {
  kind: 'button' | 'dpad' | 'nexus' | 'stripe';
  x: number;
  y: number;
  size: number;
  rotate: number;
  opacity: number;
  label?: 'A' | 'B' | 'X' | 'Y';
};

const SYMBOLS: SymbolItem[] = [
  {kind: 'nexus', x: 0.12, y: 0.1, size: 58, rotate: -8, opacity: 0.22},
  {
    kind: 'button',
    x: 0.38,
    y: 0.1,
    size: 34,
    rotate: 0,
    opacity: 0.22,
    label: 'Y',
  },
  {kind: 'dpad', x: 0.72, y: 0.11, size: 46, rotate: 8, opacity: 0.2},
  {
    kind: 'button',
    x: 0.9,
    y: 0.16,
    size: 32,
    rotate: 0,
    opacity: 0.2,
    label: 'B',
  },
  {kind: 'stripe', x: 0.18, y: 0.25, size: 110, rotate: -18, opacity: 0.12},
  {
    kind: 'button',
    x: 0.58,
    y: 0.27,
    size: 28,
    rotate: 0,
    opacity: 0.16,
    label: 'A',
  },
  {kind: 'nexus', x: 0.83, y: 0.36, size: 40, rotate: 12, opacity: 0.16},
  {
    kind: 'button',
    x: 0.22,
    y: 0.48,
    size: 38,
    rotate: 0,
    opacity: 0.2,
    label: 'X',
  },
  {kind: 'dpad', x: 0.48, y: 0.52, size: 36, rotate: -10, opacity: 0.15},
  {
    kind: 'button',
    x: 0.77,
    y: 0.58,
    size: 48,
    rotate: 0,
    opacity: 0.22,
    label: 'A',
  },
  {kind: 'stripe', x: 0.92, y: 0.66, size: 132, rotate: 16, opacity: 0.14},
  {
    kind: 'button',
    x: 0.11,
    y: 0.74,
    size: 34,
    rotate: 0,
    opacity: 0.18,
    label: 'B',
  },
  {kind: 'nexus', x: 0.35, y: 0.82, size: 46, rotate: -6, opacity: 0.18},
  {
    kind: 'button',
    x: 0.62,
    y: 0.88,
    size: 30,
    rotate: 0,
    opacity: 0.18,
    label: 'Y',
  },
  {kind: 'dpad', x: 0.88, y: 0.9, size: 42, rotate: 14, opacity: 0.18},
  {
    kind: 'button',
    x: 0.99,
    y: 0.95,
    size: 30,
    rotate: 0,
    opacity: 0.18,
    label: 'Y',
  },
  {kind: 'nexus', x: 0.1, y: 0.99, size: 46, rotate: -6, opacity: 0.18},
];

const usePalette = (isLight: boolean) => {
  if (isLight) {
    return {
      start: '#FCFBFF',
      mid: '#F5F1FF',
      end: '#FFFFFF',
      washA: '#D8CCFF',
      washB: '#F6D9EA',
      washC: '#DDF9F0',
      symbol: '#107C10',
      symbolAlt: '#2E7D32',
      symbolText: '#0B4D10',
      base: '#FCFBFF',
      hazeOpacity: 0.34,
      symbolBoost: 1,
    };
  }

  return {
    start: '#111320',
    mid: '#1D1A32',
    end: '#0D1018',
    washA: '#7662D9',
    washB: '#9D4778',
    washC: '#328E82',
    symbol: '#6EEB83',
    symbolAlt: '#20A64A',
    symbolText: '#B8FFC4',
    base: '#111320',
    hazeOpacity: 0.14,
    symbolBoost: 1.25,
  };
};

const renderButton = (
  item: SymbolItem,
  index: number,
  width: number,
  height: number,
  palette: ReturnType<typeof usePalette>,
) => {
  const x = item.x * width;
  const y = item.y * height;
  const opacity = Math.min(0.36, item.opacity * palette.symbolBoost);

  return (
    <G key={`button-${index}`} opacity={opacity}>
      <Circle
        cx={x}
        cy={y}
        r={item.size / 2}
        stroke={palette.symbol}
        strokeWidth={2.8}
        fill="none"
      />
      <SvgText
        x={x}
        y={y + item.size * 0.17}
        textAnchor="middle"
        fontSize={item.size * 0.58}
        fontWeight="700"
        fill={palette.symbolText}>
        {item.label}
      </SvgText>
    </G>
  );
};

const renderDpad = (
  item: SymbolItem,
  index: number,
  width: number,
  height: number,
  palette: ReturnType<typeof usePalette>,
) => {
  const x = item.x * width;
  const y = item.y * height;
  const size = item.size;
  const arm = size * 0.28;
  const opacity = Math.min(0.34, item.opacity * palette.symbolBoost);

  return (
    <G
      key={`dpad-${index}`}
      opacity={opacity}
      transform={`rotate(${item.rotate} ${x} ${y})`}>
      <Rect
        x={x - arm / 2}
        y={y - size / 2}
        width={arm}
        height={size}
        rx={3}
        fill={palette.symbolAlt}
      />
      <Rect
        x={x - size / 2}
        y={y - arm / 2}
        width={size}
        height={arm}
        rx={3}
        fill={palette.symbolAlt}
      />
    </G>
  );
};

const renderNexus = (
  item: SymbolItem,
  index: number,
  width: number,
  height: number,
  palette: ReturnType<typeof usePalette>,
) => {
  const x = item.x * width;
  const y = item.y * height;
  const size = item.size;
  const opacity = Math.min(0.32, item.opacity * palette.symbolBoost);

  return (
    <G
      key={`nexus-${index}`}
      opacity={opacity}
      transform={`rotate(${item.rotate} ${x} ${y})`}>
      <Circle
        cx={x}
        cy={y}
        r={size / 2}
        stroke={palette.symbol}
        strokeWidth={2.4}
        fill="none"
      />
      <Path
        d={`M ${x - size * 0.26} ${y - size * 0.04}
            C ${x - size * 0.12} ${y - size * 0.24},
              ${x + size * 0.12} ${y - size * 0.24},
              ${x + size * 0.26} ${y - size * 0.04}
            M ${x - size * 0.18} ${y + size * 0.2}
            C ${x - size * 0.06} ${y + size * 0.06},
              ${x + size * 0.06} ${y + size * 0.06},
              ${x + size * 0.18} ${y + size * 0.2}`}
        stroke={palette.symbol}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
};

const renderStripe = (
  item: SymbolItem,
  index: number,
  width: number,
  height: number,
  palette: ReturnType<typeof usePalette>,
) => {
  const x = item.x * width;
  const y = item.y * height;
  const size = item.size;
  const opacity = Math.min(0.2, item.opacity * palette.symbolBoost);

  return (
    <G
      key={`stripe-${index}`}
      opacity={opacity}
      transform={`rotate(${item.rotate} ${x} ${y})`}>
      <Line
        x1={x - size}
        y1={y - size * 0.16}
        x2={x + size}
        y2={y - size * 0.16}
        stroke={palette.symbol}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Line
        x1={x - size * 0.7}
        y1={y + size * 0.16}
        x2={x + size * 0.88}
        y2={y + size * 0.16}
        stroke={palette.symbolAlt}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </G>
  );
};

const renderSymbol = (
  item: SymbolItem,
  index: number,
  width: number,
  height: number,
  palette: ReturnType<typeof usePalette>,
) => {
  if (item.kind === 'button') {
    return renderButton(item, index, width, height, palette);
  }
  if (item.kind === 'dpad') {
    return renderDpad(item, index, width, height, palette);
  }
  if (item.kind === 'nexus') {
    return renderNexus(item, index, width, height, palette);
  }
  return renderStripe(item, index, width, height, palette);
};

const XboxSymbolBackground = ({isLight}: Props) => {
  const windowDimensions = useWindowDimensions();
  const screenDimensions = Dimensions.get('screen');
  const width = Math.max(windowDimensions.width, screenDimensions.width);
  const height =
    Math.max(windowDimensions.height, screenDimensions.height) +
    BACKGROUND_OVERDRAW;
  const palette = usePalette(isLight);

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={styles.background}>
      <Defs>
        <LinearGradient id="xboxBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.start} />
          <Stop offset="0.54" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.end} />
        </LinearGradient>
        <RadialGradient id="xboxHazeA" cx="50%" cy="50%" rx="58%" ry="50%">
          <Stop offset="0" stopColor={palette.washA} stopOpacity="0.86" />
          <Stop offset="0.48" stopColor={palette.washA} stopOpacity="0.32" />
          <Stop offset="1" stopColor={palette.washA} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="xboxHazeB" cx="50%" cy="50%" rx="58%" ry="50%">
          <Stop offset="0" stopColor={palette.washB} stopOpacity="0.58" />
          <Stop offset="0.52" stopColor={palette.washB} stopOpacity="0.18" />
          <Stop offset="1" stopColor={palette.washB} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="xboxHazeC" cx="50%" cy="50%" rx="58%" ry="50%">
          <Stop offset="0" stopColor={palette.washC} stopOpacity="0.42" />
          <Stop offset="0.54" stopColor={palette.washC} stopOpacity="0.13" />
          <Stop offset="1" stopColor={palette.washC} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#xboxBg)" />
      <Ellipse
        cx={width * 0.72}
        cy={height * 0.22}
        rx={width * 0.5}
        ry={height * 0.2}
        fill="url(#xboxHazeA)"
        opacity={palette.hazeOpacity}
        transform={`rotate(-12 ${width * 0.72} ${height * 0.22})`}
      />
      <Ellipse
        cx={width * 0.18}
        cy={height * 0.74}
        rx={width * 0.48}
        ry={height * 0.22}
        fill="url(#xboxHazeB)"
        opacity={palette.hazeOpacity * 0.78}
        transform={`rotate(18 ${width * 0.18} ${height * 0.74})`}
      />
      <Ellipse
        cx={width * 0.58}
        cy={height * 0.62}
        rx={width * 0.34}
        ry={height * 0.18}
        fill="url(#xboxHazeC)"
        opacity={palette.hazeOpacity * 0.62}
        transform={`rotate(10 ${width * 0.58} ${height * 0.62})`}
      />
      {SYMBOLS.map((item, index) =>
        renderSymbol(item, index, width, height, palette),
      )}
    </Svg>
  );
};

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    bottom: -BACKGROUND_OVERDRAW,
  },
});

export default XboxSymbolBackground;
