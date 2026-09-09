import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export type NavAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'x'
  | 'y';

export interface GamepadNavHandlers {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onSelect?: () => void;
  onBack?: () => void;
  onActionX?: () => void;
  onActionY?: () => void;
  enabled?: boolean;
  priority?: number;
}

interface HandlerEntry {
  id: number;
  handlersRef: React.MutableRefObject<GamepadNavHandlers>;
  priority: number;
}

let nextHandlerId = 1;
const handlerStack: HandlerEntry[] = [];
let isGlobalListenerAttached = false;
let lastGlobalAction: string | null = null;
let lastGlobalTime: number = 0;

function ensureGlobalNavigationListener() {
  if (isGlobalListenerAttached) return;
  isGlobalListenerAttached = true;

  DeviceEventEmitter.addListener(
    'onMenuNavigation',
    (data: { action?: NavAction }) => {
      if (!data || !data.action) return;

      const now = Date.now();
      if (data.action === lastGlobalAction && now - lastGlobalTime < 110) {
        return;
      }
      if (now - lastGlobalTime < 40) {
        return;
      }
      lastGlobalAction = data.action;
      lastGlobalTime = now;

      // Find all currently enabled handlers and sort by priority DESC, then stack order DESC
      const activeEntries = handlerStack
        .filter(entry => entry.handlersRef.current && entry.handlersRef.current.enabled !== false)
        .sort((a, b) => {
          const pDiff = (b.handlersRef.current.priority ?? b.priority) - (a.handlersRef.current.priority ?? a.priority);
          if (pDiff !== 0) return pDiff;
          return b.id - a.id;
        });

      if (activeEntries.length === 0) return;

      const topEntry = activeEntries[0];
      const handlers = topEntry.handlersRef.current;

      switch (data.action) {
        case 'up':
          handlers.onUp?.();
          break;
        case 'down':
          handlers.onDown?.();
          break;
        case 'left':
          handlers.onLeft?.();
          break;
        case 'right':
          handlers.onRight?.();
          break;
        case 'select':
          handlers.onSelect?.();
          break;
        case 'back':
          handlers.onBack?.();
          break;
        case 'x':
          handlers.onActionX?.();
          break;
        case 'y':
          handlers.onActionY?.();
          break;
      }
    },
  );
}

export function useGamepadActiveState(initialValue?: boolean) {
  const [isGamepadActive, setIsGamepadActive] = useState<boolean>(() => {
    if (Platform.isTV) return true;
    if (typeof initialValue === 'boolean') return initialValue;
    return false;
  });

  useEffect(() => {
    // Check initial connection status on mount
    if (NativeModules.GamepadManager?.hasGameController) {
      NativeModules.GamepadManager.hasGameController()
        .then((has: boolean) => {
          if (has) {
            setIsGamepadActive(true);
          }
        })
        .catch(() => {});
    }

    // Listen to physical connection changes
    const devSub = DeviceEventEmitter.addListener(
      'onGamepadConnectionChange',
      (data: { hasGamepad?: boolean }) => {
        if (data && typeof data.hasGamepad === 'boolean') {
          if (!data.hasGamepad && !Platform.isTV) {
            setIsGamepadActive(false);
          } else if (data.hasGamepad) {
            setIsGamepadActive(true);
          }
        }
      },
    );

    // Any navigation action from controller / remote activates gamepad mode
    const navSub = DeviceEventEmitter.addListener('onMenuNavigation', () => {
      setIsGamepadActive(true);
    });

    return () => {
      devSub.remove();
      navSub.remove();
    };
  }, []);

  return [isGamepadActive, setIsGamepadActive] as const;
}

export function useGamepadNavigation(handlers: GamepadNavHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    ensureGlobalNavigationListener();

    const entryId = nextHandlerId++;
    const entry: HandlerEntry = {
      id: entryId,
      handlersRef,
      priority: handlers.priority ?? 0,
    };

    handlerStack.push(entry);

    return () => {
      const idx = handlerStack.findIndex(e => e.id === entryId);
      if (idx >= 0) {
        handlerStack.splice(idx, 1);
      }
    };
  }, []);
}
