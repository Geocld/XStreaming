export const VIRTUAL_MACRO_BUTTON_NAME = 'Macro';

export const VIRTUAL_MACRO_ALLOWED_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LeftShoulder',
  'RightShoulder',
  'LeftTrigger',
  'RightTrigger',
  'View',
  'Menu',
  'LeftThumb',
  'RightThumb',
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
  'Nexus',
] as const;

export type VirtualMacroStep = {
  type: 'buttons' | 'stick';
  buttons: string[];
  stick: 'left' | 'right';
  x: number;
  y: number;
  durationMs: number;
  waitAfterMs: number;
};

export const DEFAULT_VIRTUAL_MACRO_LONG_PRESS_MS = 500;
export const DEFAULT_VIRTUAL_MACRO_LOOP_INTERVAL_MS = 500;
export const DEFAULT_VIRTUAL_MACRO_SHORT_STEPS: VirtualMacroStep[] = [
  {
    type: 'buttons',
    buttons: ['A'],
    stick: 'left',
    x: 0,
    y: 0,
    durationMs: 80,
    waitAfterMs: 0,
  },
];
export const DEFAULT_VIRTUAL_MACRO_LONG_STEPS: VirtualMacroStep[] = [
  {
    type: 'buttons',
    buttons: ['B'],
    stick: 'left',
    x: 0,
    y: 0,
    durationMs: 250,
    waitAfterMs: 0,
  },
];

export const createDefaultMacroLayoutButton = (
  width: number,
  height: number,
) => {
  return {
    name: VIRTUAL_MACRO_BUTTON_NAME,
    x: Math.round(width * 0.5 - 30),
    y: Math.round(height - 130),
    scale: 1,
    show: true,
  };
};

export const ensureMacroLayoutButton = (
  buttons: any[],
  fallbackButton: any,
): any[] => {
  if (!Array.isArray(buttons)) {
    return [fallbackButton];
  }
  if (buttons.some(button => button?.name === VIRTUAL_MACRO_BUTTON_NAME)) {
    return buttons;
  }
  return [...buttons, fallbackButton];
};

export const normalizeMacroLoopIntervalMs = (value: any): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_VIRTUAL_MACRO_LOOP_INTERVAL_MS;
  }
  return Math.max(0, Math.min(10000, Math.round(num)));
};

const normalizeStickAxis = (value: any): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, Number(num.toFixed(2))));
};

export const normalizeMacroStep = (
  step: any,
  fallbackButton = 'A',
): VirtualMacroStep => {
  const stepType = step?.type === 'stick' ? 'stick' : 'buttons';
  const allowed = new Set<string>(VIRTUAL_MACRO_ALLOWED_BUTTONS);
  let buttons: string[] = [];
  if (Array.isArray(step?.buttons)) {
    buttons = step.buttons.filter((button: string) => allowed.has(button));
  } else if (typeof step?.button === 'string' && allowed.has(step.button)) {
    buttons = [step.button];
  }
  if (!buttons.length) {
    buttons = [fallbackButton];
  }

  const durationRaw = Number(step?.durationMs);
  const waitRaw = Number(step?.waitAfterMs);

  return {
    type: stepType,
    buttons: Array.from(new Set(buttons)),
    stick: step?.stick === 'right' ? 'right' : 'left',
    x: normalizeStickAxis(step?.x),
    y: normalizeStickAxis(step?.y),
    durationMs: Number.isFinite(durationRaw)
      ? Math.max(30, Math.min(5000, Math.round(durationRaw)))
      : 80,
    waitAfterMs: Number.isFinite(waitRaw)
      ? Math.max(0, Math.min(3000, Math.round(waitRaw)))
      : 0,
  };
};

export const normalizeMacroSteps = (
  steps: any,
  fallbackSteps: VirtualMacroStep[],
): VirtualMacroStep[] => {
  const fallbackButton = fallbackSteps[0]?.buttons?.[0] || 'A';
  if (!Array.isArray(steps)) {
    return fallbackSteps.map(step => ({...step}));
  }
  if (!steps.length) {
    return [];
  }
  return steps.map(step => normalizeMacroStep(step, fallbackButton));
};

export const normalizeMacroLongPressMs = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_VIRTUAL_MACRO_LONG_PRESS_MS;
  }
  return Math.max(150, Math.min(1500, Math.round(num)));
};
