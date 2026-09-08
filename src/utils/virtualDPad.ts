export const VIRTUAL_DPAD_BUTTON_NAME = 'DPad';
export const LEGACY_VIRTUAL_DPAD_BUTTON_NAMES = [
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
];

export type VirtualDPadButton = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  show?: boolean;
};

export const createDefaultVirtualDPadButton = (
  x: number,
  y: number,
  width: number,
  height: number,
): VirtualDPadButton => ({
  name: VIRTUAL_DPAD_BUTTON_NAME,
  x,
  y,
  width,
  height,
  scale: 1,
  show: true,
});

export const ensureVirtualDPadLayoutButton = <T extends {name: string}>(
  buttons: T[],
  defaultButton: T,
): T[] => {
  const filtered = buttons.filter(
    item => !LEGACY_VIRTUAL_DPAD_BUTTON_NAMES.includes(item.name),
  );
  if (filtered.some(item => item.name === VIRTUAL_DPAD_BUTTON_NAME)) {
    return filtered;
  }
  return [...filtered, defaultButton];
};
