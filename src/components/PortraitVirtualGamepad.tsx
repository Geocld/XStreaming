import React from 'react';
import {StyleSheet, View} from 'react-native';
import {IconButton, useTheme} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import {useTranslation} from 'react-i18next';
import PreviewButton from './CustomGamepad/Button';

export type PortraitGamepadControl = {
  name: string;
  kind: 'button' | 'stick';
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  show?: boolean;
  containerWidth?: number;
  containerHeight?: number;
};

type Props = {
  layout?: PortraitGamepadControl[];
  opacity: number;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onLayoutChange: (layout: PortraitGamepadControl[]) => void;
  onResetDefault: () => void;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
  onStickMove: (id: string, data: any) => void;
};

type StickName = 'left' | 'right';
type TouchPoint = {
  identifier: number;
  locationX: number;
  locationY: number;
};

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const control = (
  name: string,
  kind: 'button' | 'stick',
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
): PortraitGamepadControl => ({
  name,
  kind,
  x: clamp(x, 0, Math.max(0, containerWidth - width)),
  y: clamp(y, 0, Math.max(0, containerHeight - height)),
  width,
  height,
  show: true,
  containerWidth,
  containerHeight,
});

export const buildDefaultPortraitGamepadLayout = (
  width: number,
  height: number,
): PortraitGamepadControl[] => {
  const faceLeft = Math.max(0, width - 166);
  const rightStickLeft = Math.max(0, width - 148);
  const stickTop = Math.min(318, Math.max(248, height - 176));
  const dpadTop = 114;
  const systemLeft = width / 2 - 36;

  return [
    control('LeftTrigger', 'button', 12, 8, 58, 52, width, height),
    control('RightTrigger', 'button', width - 70, 8, 58, 52, width, height),
    control('LeftShoulder', 'button', 12, 62, 52, 46, width, height),
    control('RightShoulder', 'button', width - 64, 62, 52, 46, width, height),
    control('DPadUp', 'button', 60, dpadTop, 48, 48, width, height),
    control('DPadLeft', 'button', 16, dpadTop + 44, 48, 48, width, height),
    control('DPadDown', 'button', 60, dpadTop + 88, 48, 48, width, height),
    control('DPadRight', 'button', 104, dpadTop + 44, 48, 48, width, height),
    control('View', 'button', systemLeft, dpadTop + 52, 34, 34, width, height),
    control(
      'Menu',
      'button',
      systemLeft + 38,
      dpadTop + 52,
      34,
      34,
      width,
      height,
    ),
    control(
      'Nexus',
      'button',
      width / 2 - 27,
      dpadTop + 94,
      54,
      54,
      width,
      height,
    ),
    control('Y', 'button', faceLeft + 42, dpadTop, 70, 70, width, height),
    control('X', 'button', faceLeft, dpadTop + 44, 70, 70, width, height),
    control('B', 'button', faceLeft + 84, dpadTop + 44, 70, 70, width, height),
    control('A', 'button', faceLeft + 42, dpadTop + 88, 70, 70, width, height),
    control('LeftThumb', 'button', 70, stickTop - 42, 40, 40, width, height),
    control(
      'RightThumb',
      'button',
      rightStickLeft + 39,
      stickTop - 42,
      40,
      40,
      width,
      height,
    ),
    control('LeftStick', 'stick', 30, stickTop, 118, 118, width, height),
    control(
      'RightStick',
      'stick',
      rightStickLeft,
      stickTop,
      118,
      118,
      width,
      height,
    ),
  ];
};

const normalizeLayout = (
  layout: PortraitGamepadControl[] | undefined,
  width: number,
  height: number,
) => {
  const defaults = buildDefaultPortraitGamepadLayout(width, height);
  if (!layout?.length) {
    return defaults;
  }

  const savedByName = new Map(layout.map(item => [item.name, item]));

  return defaults.map(defaultItem => {
    const saved = savedByName.get(defaultItem.name);
    if (!saved) {
      return defaultItem;
    }

    const savedContainerWidth = saved.containerWidth || width;
    const savedContainerHeight = saved.containerHeight || height;
    const x = (saved.x / savedContainerWidth) * width;
    const y = (saved.y / savedContainerHeight) * height;
    const item = {
      ...defaultItem,
      ...saved,
      x,
      y,
      containerWidth: width,
      containerHeight: height,
    };

    return {
      ...item,
      x: clamp(item.x, 0, Math.max(0, width - item.width)),
      y: clamp(item.y, 0, Math.max(0, height - item.height)),
    };
  });
};

const persistableLayout = (
  items: PortraitGamepadControl[],
  width: number,
  height: number,
) =>
  items.map(item => ({
    ...item,
    x: clamp(item.x, 0, Math.max(0, width - item.width)),
    y: clamp(item.y, 0, Math.max(0, height - item.height)),
    containerWidth: width,
    containerHeight: height,
  }));

const isInsideControl = (item: PortraitGamepadControl, x: number, y: number) =>
  item.show !== false &&
  x >= item.x &&
  x <= item.x + item.width &&
  y >= item.y &&
  y <= item.y + item.height;

const getStickName = (name: string): StickName =>
  name === 'RightStick' ? 'right' : 'left';

const getButtonPreviewScale = (item: PortraitGamepadControl) => {
  if (['A', 'B', 'X', 'Y'].includes(item.name)) {
    return item.width / 100;
  }
  if (item.name.indexOf('DPad') > -1) {
    return item.width / 70;
  }
  return 1;
};

const PortraitVirtualGamepad: React.FC<Props> = ({
  layout,
  opacity,
  editing,
  onEditingChange,
  onLayoutChange,
  onResetDefault,
  onPressIn,
  onPressOut,
  onStickMove,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [size, setSize] = React.useState({width: 0, height: 0});
  const [reloadKey, setReloadKey] = React.useState(0);
  const [stickVisuals, setStickVisuals] = React.useState({
    left: {x: 0, y: 0},
    right: {x: 0, y: 0},
  });
  const activeButtonsRef = React.useRef<Map<number, string>>(new Map());
  const activeSticksRef = React.useRef<Map<StickName, number>>(new Map());
  const controls = React.useMemo(
    () => normalizeLayout(layout, size.width, size.height),
    [layout, size.height, size.width],
  );

  const updateControl = React.useCallback(
    (name: string, patch: Partial<PortraitGamepadControl>) => {
      const next = controls.map(item =>
        item.name === name ? {...item, ...patch} : item,
      );
      onLayoutChange(persistableLayout(next, size.width, size.height));
    },
    [controls, onLayoutChange, size.height, size.width],
  );

  const visibleControls = React.useMemo(
    () => controls.filter(item => item.show !== false),
    [controls],
  );

  const findButtonAt = React.useCallback(
    (x: number, y: number) => {
      for (let i = visibleControls.length - 1; i >= 0; i--) {
        const item = visibleControls[i];
        if (item.kind === 'button' && isInsideControl(item, x, y)) {
          return item;
        }
      }
      return null;
    },
    [visibleControls],
  );

  const findStickAt = React.useCallback(
    (x: number, y: number) => {
      for (let i = visibleControls.length - 1; i >= 0; i--) {
        const item = visibleControls[i];
        if (item.kind === 'stick' && isInsideControl(item, x, y)) {
          return item;
        }
      }
      return null;
    },
    [visibleControls],
  );

  const setStickVisual = React.useCallback(
    (stick: StickName, x: number, y: number) => {
      setStickVisuals(prev => {
        const current = prev[stick];
        if (current.x === x && current.y === y) {
          return prev;
        }
        return {
          ...prev,
          [stick]: {x, y},
        };
      });
    },
    [],
  );

  const resetStick = React.useCallback(
    (stick: StickName) => {
      activeSticksRef.current.delete(stick);
      setStickVisual(stick, 0, 0);
      onStickMove(stick, {x: 0, y: 0});
    },
    [onStickMove, setStickVisual],
  );

  const releaseAllTouches = React.useCallback(() => {
    activeButtonsRef.current.forEach(name => {
      onPressOut(name);
    });
    activeButtonsRef.current.clear();
    resetStick('left');
    resetStick('right');
  }, [onPressOut, resetStick]);

  React.useEffect(() => {
    if (editing) {
      releaseAllTouches();
    }
  }, [editing, releaseAllTouches]);

  React.useEffect(() => releaseAllTouches, [releaseAllTouches]);

  const updateStickFromTouch = React.useCallback(
    (item: PortraitGamepadControl, touch: TouchPoint) => {
      const stick = getStickName(item.name);
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const radius = Math.max(1, Math.min(item.width, item.height) / 2);
      const x = clamp((touch.locationX - centerX) / radius, -1, 1);
      const y = clamp((touch.locationY - centerY) / radius, -1, 1);

      setStickVisual(stick, x, y);
      onStickMove(stick, {x, y});
    },
    [onStickMove, setStickVisual],
  );

  const handleTouchStart = React.useCallback(
    (event: any) => {
      event.nativeEvent.changedTouches.forEach((touch: TouchPoint) => {
        const button = findButtonAt(touch.locationX, touch.locationY);
        if (button) {
          activeButtonsRef.current.set(touch.identifier, button.name);
          onPressIn(button.name);
          return;
        }

        const stick = findStickAt(touch.locationX, touch.locationY);
        if (!stick) {
          return;
        }

        const stickName = getStickName(stick.name);
        if (activeSticksRef.current.has(stickName)) {
          return;
        }
        activeSticksRef.current.set(stickName, touch.identifier);
        updateStickFromTouch(stick, touch);
      });
    },
    [findButtonAt, findStickAt, onPressIn, updateStickFromTouch],
  );

  const handleTouchMove = React.useCallback(
    (event: any) => {
      const touches: TouchPoint[] = event.nativeEvent.touches;
      activeSticksRef.current.forEach((identifier, stickName) => {
        const touch = touches.find(item => item.identifier === identifier);
        const stick = visibleControls.find(
          item =>
            item.kind === 'stick' && getStickName(item.name) === stickName,
        );
        if (!touch || !stick) {
          resetStick(stickName);
          return;
        }
        updateStickFromTouch(stick, touch);
      });
    },
    [resetStick, updateStickFromTouch, visibleControls],
  );

  const handleTouchEnd = React.useCallback(
    (event: any) => {
      event.nativeEvent.changedTouches.forEach((touch: TouchPoint) => {
        const button = activeButtonsRef.current.get(touch.identifier);
        if (button) {
          activeButtonsRef.current.delete(touch.identifier);
          onPressOut(button);
        }

        activeSticksRef.current.forEach((identifier, stickName) => {
          if (identifier === touch.identifier) {
            resetStick(stickName);
          }
        });
      });
    },
    [onPressOut, resetStick],
  );

  const renderPlayControl = (item: PortraitGamepadControl) => {
    if (item.show === false) {
      return null;
    }

    const itemStyle = [
      styles.control,
      {
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        opacity,
      },
    ];

    if (item.kind === 'stick') {
      const stick = getStickName(item.name);
      const visual = stickVisuals[stick];
      const handleSize = Math.max(36, item.width * 0.46);
      const travel = item.width / 2 - handleSize / 2;
      return (
        <View key={item.name} style={itemStyle} pointerEvents="none">
          <View
            style={[
              styles.analogStick,
              {
                width: item.width,
                height: item.height,
                borderRadius: item.width / 2,
              },
            ]}>
            <View
              style={[
                styles.analogStickHandle,
                {
                  width: handleSize,
                  height: handleSize,
                  borderRadius: handleSize / 2,
                  transform: [
                    {translateX: visual.x * travel},
                    {translateY: visual.y * travel},
                  ],
                },
              ]}
            />
          </View>
        </View>
      );
    }

    return (
      <View key={item.name} style={itemStyle} pointerEvents="none">
        <PreviewButton
          name={item.name}
          width={item.width}
          height={item.height}
          scale={getButtonPreviewScale(item)}
        />
      </View>
    );
  };

  const renderEditControl = (item: PortraitGamepadControl) => {
    if (item.show === false) {
      return null;
    }

    return (
      <Draggable
        key={`${item.name}-${reloadKey}`}
        x={item.x}
        y={item.y}
        onDragRelease={(_, __, bounds) => {
          updateControl(item.name, {
            x: bounds.left,
            y: bounds.top,
          });
          setReloadKey(Date.now());
        }}>
        <View
          style={[
            styles.editControl,
            {
              width: item.width,
              height: item.height,
              borderColor: theme.colors.primary,
            },
          ]}>
          {item.kind === 'stick' ? (
            <View
              style={[
                styles.stickPreview,
                {
                  width: item.width,
                  height: item.height,
                  borderRadius: item.width / 2,
                },
              ]}
            />
          ) : (
            <PreviewButton
              name={item.name}
              width={item.width}
              height={item.height}
              scale={1}
            />
          )}
          <IconButton
            icon="close"
            size={14}
            accessibilityLabel={t('Delete')}
            style={styles.deleteButton}
            onPress={() => updateControl(item.name, {show: false})}
          />
        </View>
      </Draggable>
    );
  };

  return (
    <View
      style={styles.container}
      pointerEvents="box-none"
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        setSize(prev =>
          prev.width === width && prev.height === height
            ? prev
            : {width, height},
        );
      }}>
      {size.width > 0 && size.height > 0 && (
        <>
          {!editing && (
            <View
              style={styles.touchLayer}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={releaseAllTouches}
            />
          )}
          {editing
            ? controls.map(renderEditControl)
            : controls.map(renderPlayControl)}

          <View style={styles.toolbar} pointerEvents="box-none">
            {editing ? (
              <View style={styles.toolbarPanel}>
                <IconButton
                  icon="restore"
                  size={22}
                  accessibilityLabel={t('Reset')}
                  onPress={() => {
                    onResetDefault();
                    setReloadKey(Date.now());
                  }}
                />
                <IconButton
                  icon="check"
                  size={22}
                  accessibilityLabel={t('Save')}
                  onPress={() => onEditingChange(false)}
                />
              </View>
            ) : (
              <IconButton
                icon="pencil"
                size={22}
                accessibilityLabel={t('Edit')}
                style={styles.editButton}
                onPress={() => onEditingChange(true)}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  control: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  analogStick: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 59,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
  },
  analogStickHandle: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  toolbar: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toolbarPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(10, 10, 10, 0.78)',
  },
  editButton: {
    backgroundColor: 'rgba(10, 10, 10, 0.68)',
  },
  editControl: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  stickPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  deleteButton: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
});

export default PortraitVirtualGamepad;
