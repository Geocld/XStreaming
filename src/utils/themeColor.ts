export const DEFAULT_THEME_PRIMARY_COLOR = '#107C10';

export const THEME_PRIMARY_PRESET_COLORS = [
  DEFAULT_THEME_PRIMARY_COLOR,
  '#1B5E20',
  '#2E7D32',
  '#43A047',
  '#689F38',
  '#7CB342',
  '#00695C',
  '#1565C0',
  '#1976D2',
  '#283593',
  '#3949AB',
  '#0277BD',
  '#0288D1',
  '#0097A7',
  '#00838F',
  '#00796B',
  '#00897B',
  '#26A69A',
  '#5E35B1',
  '#6A1B9A',
  '#8E24AA',
  '#AD1457',
  '#C2185B',
  '#D81B60',
  '#C62828',
  '#E53935',
  '#EF6C00',
  '#FB8C00',
  '#F9A825',
  '#FF8F00',
  '#6D4C41',
  '#455A64',
  '#546E7A',
  '#37474F',
  '#2F3E46',
  '#5D4037',
];

type Rgb = {
  r: number;
  g: number;
  b: number;
};

const clamp = (value: number, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));

const rgbStringToRgb = (color: string): Rgb | null => {
  const matched = color
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!matched) {
    return null;
  }
  return {
    r: clamp(parseInt(matched[1], 10)),
    g: clamp(parseInt(matched[2], 10)),
    b: clamp(parseInt(matched[3], 10)),
  };
};

const hexToRgb = (hexColor: string): Rgb => {
  const normalized = normalizeHexColor(hexColor);
  const clean = normalized.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return {r, g, b};
};

const rgbToHex = ({r, g, b}: Rgb): string =>
  `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();

const toRgb = (color: string): Rgb => {
  const rgb = rgbStringToRgb(color);
  if (rgb) {
    return rgb;
  }
  return hexToRgb(color);
};

const mixColor = (sourceColor: string, targetColor: string, ratio: number) => {
  const from = toRgb(sourceColor);
  const to = toRgb(targetColor);
  const p = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: Math.round(from.r + (to.r - from.r) * p),
    g: Math.round(from.g + (to.g - from.g) * p),
    b: Math.round(from.b + (to.b - from.b) * p),
  });
};

export const normalizeHexColor = (
  color: string | undefined,
  fallback = DEFAULT_THEME_PRIMARY_COLOR,
) => {
  if (!color || typeof color !== 'string') {
    return fallback;
  }
  const input = color.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(input)) {
    const expanded = input
      .split('')
      .map(ch => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(input)) {
    return `#${input.toUpperCase()}`;
  }
  return fallback;
};

export const shiftColor = (hexColor: string, amount: number) => {
  const normalized = normalizeHexColor(hexColor);
  if (amount >= 0) {
    return mixColor(normalized, '#FFFFFF', amount);
  }
  return mixColor(normalized, '#000000', -amount);
};

export const getContrastTextColor = (
  hexColor: string,
  light = '#FFFFFF',
  dark = '#101010',
) => {
  const {r, g, b} = hexToRgb(normalizeHexColor(hexColor));
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? dark : light;
};

export const applyPrimaryColorToPaperTheme = (
  baseTheme: any,
  mode: 'light' | 'dark',
  primaryColor: string,
) => {
  const seed = normalizeHexColor(primaryColor);
  const surface =
    baseTheme.colors?.surface || (mode === 'light' ? '#FCFDF6' : '#1A1C18');
  const onSurface =
    baseTheme.colors?.onSurface || (mode === 'light' ? '#1A1C18' : '#E2E3DD');

  if (mode === 'light') {
    const lightPrimary = seed;
    const primaryContainer = shiftColor(seed, 0.68);
    const secondary = shiftColor(seed, -0.18);
    const secondaryContainer = mixColor(surface, seed, 0.2);
    const tertiary = shiftColor(seed, -0.32);
    const tertiaryContainer = mixColor(surface, seed, 0.26);
    const surfaceVariant = mixColor(surface, seed, 0.1);
    const outline = mixColor(onSurface, seed, 0.35);

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: lightPrimary,
        onPrimary: getContrastTextColor(lightPrimary),
        primaryContainer,
        onPrimaryContainer: getContrastTextColor(primaryContainer),
        secondary,
        onSecondary: getContrastTextColor(secondary),
        secondaryContainer,
        onSecondaryContainer: getContrastTextColor(secondaryContainer),
        tertiary,
        onTertiary: getContrastTextColor(tertiary),
        tertiaryContainer,
        onTertiaryContainer: getContrastTextColor(tertiaryContainer),
        surfaceVariant,
        outline,
        inversePrimary: shiftColor(seed, 0.28),
        elevation: {
          ...baseTheme.colors?.elevation,
          level0: 'transparent',
          level1: mixColor(surface, seed, 0.05),
          level2: mixColor(surface, seed, 0.08),
          level3: mixColor(surface, seed, 0.11),
          level4: mixColor(surface, seed, 0.13),
          level5: mixColor(surface, seed, 0.16),
        },
      },
    };
  }

  const darkPrimary = shiftColor(seed, 0.25);
  const primaryContainer = shiftColor(seed, -0.45);
  const secondary = shiftColor(seed, 0.38);
  const secondaryContainer = mixColor(surface, seed, 0.24);
  const tertiary = shiftColor(seed, 0.5);
  const tertiaryContainer = mixColor(surface, seed, 0.3);
  const surfaceVariant = mixColor(surface, seed, 0.16);
  const outline = mixColor(onSurface, seed, 0.42);

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: darkPrimary,
      onPrimary: getContrastTextColor(darkPrimary),
      primaryContainer,
      onPrimaryContainer: getContrastTextColor(primaryContainer),
      secondary,
      onSecondary: getContrastTextColor(secondary),
      secondaryContainer,
      onSecondaryContainer: getContrastTextColor(secondaryContainer),
      tertiary,
      onTertiary: getContrastTextColor(tertiary),
      tertiaryContainer,
      onTertiaryContainer: getContrastTextColor(tertiaryContainer),
      surfaceVariant,
      outline,
      inversePrimary: seed,
      elevation: {
        ...baseTheme.colors?.elevation,
        level0: 'transparent',
        level1: mixColor(surface, seed, 0.1),
        level2: mixColor(surface, seed, 0.14),
        level3: mixColor(surface, seed, 0.18),
        level4: mixColor(surface, seed, 0.22),
        level5: mixColor(surface, seed, 0.26),
      },
    },
  };
};

export const colorizeMacroIconXml = (xml: string, primaryColor: string) => {
  const normalizedPrimary = normalizeHexColor(primaryColor);
  const innerPrimary = shiftColor(normalizedPrimary, -0.25);
  return xml
    .replace(/__PRIMARY__/g, normalizedPrimary)
    .replace(/__PRIMARY_DARK__/g, innerPrimary);
};
