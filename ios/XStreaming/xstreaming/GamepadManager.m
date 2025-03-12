#import "GamepadManager.h"
#import <GameController/GameController.h>
#import <React/RCTLog.h>
#import "Controller.h"

@implementation GamepadManager {
    NSMutableArray *_connectedControllers;
    bool hasListeners;
    NSString *_currentScreen;
    
    Controller *_oscController;
#define EMULATING_SELECT     0x1
#define EMULATING_SPECIAL    0x2
    
    bool _oscEnabled;
    NSMutableDictionary *_controllers;
    char _controllerNumbers;
}

RCT_EXPORT_MODULE();

- (instancetype)init {
    self = [super init];
    if (self) {
        _connectedControllers = [NSMutableArray array];
        [self startObservingGamepads];
        _currentScreen = @"unknown"; //  初始化 currentScreen
    }
    return self;
}

RCT_EXPORT_METHOD(setCurrentScreen:(NSString *)screenName)
{
    _currentScreen = screenName;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onGamepadReport", @"onGamepadKeyDown", @"onGamepadKeyUp", @"onDpadKeyDown", @"onDpadKeyUp", @"onLeftStickMove", @"onRightStickMove", @"onTrigger"];
}

// 添加这个方法来确保在主线程上初始化
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (void)startObservingEvents {
    hasListeners = YES;
}

- (void)stopObservingEvents {
    hasListeners = NO;
}

// 修改 sendEventWithName 的调用方式
- (void)updateGamepadListEvent {
    if (!hasListeners) return;  // 如果没有监听器，不发送事件
    
    NSMutableArray *gamepads = [NSMutableArray array];
    [_connectedControllers removeAllObjects];
    
    for (GCController *controller in [GCController controllers]) {
        NSMutableDictionary *gamepadInfo = [NSMutableDictionary dictionary];
        gamepadInfo[@"name"] = controller.vendorName ?: @"Unknown Gamepad";
        gamepadInfo[@"identifier"] = controller.productCategory ?: @"Unknown Category";
        [gamepads addObject:gamepadInfo];
        [_connectedControllers addObject:controller];
    }
    
    if (self.bridge) {
        [super sendEventWithName:@"onGamepadReport" body:@{@"gamepads": gamepads}];
    }
}

// 同样修改其他发送事件的方法
- (void)sendButtonEvent:(NSString *)buttonName pressed:(BOOL)isPressed {
    if (!hasListeners) return;
    
    if (self.bridge) {
        if (isPressed) {
            [super sendEventWithName:@"onGamepadKeyDown" body:@{@"keyCode": buttonName}];
        } else {
            [super sendEventWithName:@"onGamepadKeyUp" body:@{@"keyCode": buttonName}];
        }
    }
}

- (void)sendDpadEvent:(GCControllerDirectionPad *)dpad {
    if (dpad.up.isPressed) {
        [self sendEventWithName:@"onDpadKeyDown" body:@{@"dpadIdx": @"DPadUp"}];
    } else if (dpad.down.isPressed) {
        [self sendEventWithName:@"onDpadKeyDown" body:@{@"dpadIdx": @"DPadDown"}];
    } else if (dpad.left.isPressed) {
        [self sendEventWithName:@"onDpadKeyDown" body:@{@"dpadIdx": @"DPadLeft"}];
    } else if (dpad.right.isPressed) {
        [self sendEventWithName:@"onDpadKeyDown" body:@{@"dpadIdx": @"DPadRight"}];
    } else {
        // 发送 DpadUp 事件
        [self sendEventWithName:@"onDpadKeyUp" body:@{@"dpadIdx": @"DPadUp"}]; //  这里需要仔细考虑 DpadUp/Down/Left/Right 的 Up 事件如何处理，可能需要更精细的状态管理
        [self sendEventWithName:@"onDpadKeyUp" body:@{@"dpadIdx": @"DPadDown"}];
        [self sendEventWithName:@"onDpadKeyUp" body:@{@"dpadIdx": @"DPadLeft"}];
        [self sendEventWithName:@"onDpadKeyUp" body:@{@"dpadIdx": @"DPadRight"}];
    }
}


- (void)sendLeftStickEvent:(GCControllerDirectionPad *)thumbstick {
    [self sendEventWithName:@"onLeftStickMove" body:@{
        @"axisX": @(thumbstick.xAxis.value),
        @"axisY": @(thumbstick.yAxis.value)
    }];
}

- (void)sendRightStickEvent:(GCControllerDirectionPad *)thumbstick {
    [self sendEventWithName:@"onRightStickMove" body:@{
        @"axisX": @(thumbstick.xAxis.value),
        @"axisY": @(thumbstick.yAxis.value)
    }];
}

- (void)sendLeftTriggerEvent:(GCControllerButtonInput *)trigger {
    [self sendEventWithName:@"onTrigger" body:@{@"leftTrigger": @(trigger.value)}];
}

- (void)sendRightTriggerEvent:(GCControllerButtonInput *)trigger {
    [self sendEventWithName:@"onTrigger" body:@{@"rightTrigger": @(trigger.value)}];
}

- (BOOL)isSupportedGamepad:(GCController *)controller {
    if (controller.extendedGamepad) {
        return YES;
    }
    
    if (@available(iOS 14.0, tvOS 14.0, *)) {
        if (controller.extendedGamepad) {
            return YES;
        }
    }
    
    return NO;
}

-(Controller*) assignController:(GCController*)controller {
    for (int i = 0; i < 4; i++) {
        if (!(_controllerNumbers & (1 << i))) {
            _controllerNumbers |= (1 << i);
            controller.playerIndex = i;
            
            Controller* limeController = [[Controller alloc] init];
            limeController.playerIndex = i;
            limeController.supportedEmulationFlags = EMULATING_SPECIAL | EMULATING_SELECT;
            limeController.gamepad = controller;
            
            NSLog(@"vendor: %@", controller.vendorName);
            
            // If this is player 0, it shares state with the OSC
            limeController.mergedWithController = _oscController;
            _oscController.mergedWithController = limeController;
            
            if (@available(iOS 13.0, tvOS 13.0, *)) {
                if (controller.extendedGamepad != nil &&
                    controller.extendedGamepad.buttonOptions != nil) {
                    // Disable select button emulation since we have a physical select button
                    limeController.supportedEmulationFlags &= ~EMULATING_SELECT;
                }
            }
            
            if (@available(iOS 14.0, tvOS 14.0, *)) {
                if (controller.extendedGamepad != nil &&
                    controller.extendedGamepad.buttonHome != nil) {
                    // Disable special button emulation since we have a physical special button
                    limeController.supportedEmulationFlags &= ~EMULATING_SPECIAL;
                }
            }
            
            // Prepare controller haptics for use
            [self initializeControllerHaptics:limeController];
            
            NSLog(@"playerIndex: %ld", controller.playerIndex);
            
            [_controllers setObject:limeController forKey:[NSNumber numberWithInteger:controller.playerIndex]];
            
            NSLog(@"Assigning controller index: %d", i);
            return limeController;
        }
    }
    
    return nil;
}

-(void) initializeControllerHaptics:(Controller*) controller
{
    controller.lowFreqMotor = [HapticContext createContextForLowFreqMotor:controller.gamepad];
    controller.highFreqMotor = [HapticContext createContextForHighFreqMotor:controller.gamepad];
    controller.leftTriggerMotor = [HapticContext createContextForLeftTrigger:controller.gamepad];
    controller.rightTriggerMotor = [HapticContext createContextForRightTrigger:controller.gamepad];
}

// 添加振动方法
RCT_EXPORT_METHOD(initRumble) {
    _oscEnabled = false;
    _controllers = [[NSMutableDictionary alloc] init];
    
    NSLog(@"已连接的支持控制器数量: %lu", (unsigned long)[GCController controllers].count);
    
    for (GCController* controller in [GCController controllers]) {
      if ([self isSupportedGamepad:controller]) {
          [self assignController:controller];
      }
    }
    
    NSLog(@"_controllers: %@", _controllers);
}

RCT_EXPORT_METHOD(rumble:(int)duration lowFreqMotor:(int)lowFreqMotor highFreqMotor:(int)highFreqMotor leftTrigger:(int)leftTrigger rightTrigger:(int)rightTrigger intensity:(int)intensity) {
    for (Controller* controller in [_controllers allValues]) {
        if(controller != nil) {
            NSLog(@"Controller vendor: %@", controller.gamepad.vendorName);
            NSLog(@"Controller lowFreqMotor: %d", lowFreqMotor);
            [controller.lowFreqMotor setMotorAmplitude: lowFreqMotor];
            [controller.highFreqMotor setMotorAmplitude: highFreqMotor];
            
            [controller.leftTriggerMotor setMotorAmplitude:leftTrigger];
            [controller.rightTriggerMotor setMotorAmplitude:rightTrigger];
        }
        
    }
}

- (void)dealloc {
    [self stopObservingGamepads];
}

- (void)startObservingGamepads {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(controllerDidConnect:)
                                                 name:GCControllerDidConnectNotification
                                               object:nil];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(controllerDidDisconnect:)
                                                 name:GCControllerDidDisconnectNotification
                                               object:nil];

    // 初始连接时也发送一次 gamepad 列表
    [self updateGamepadListEvent];
}

- (void)stopObservingGamepads {
    [[NSNotificationCenter defaultCenter] removeObserver:self name:GCControllerDidConnectNotification object:nil];
    [[NSNotificationCenter defaultCenter] removeObserver:self name:GCControllerDidDisconnectNotification object:nil];
}

- (void)controllerDidConnect:(NSNotification *)notification {
    GCController *controller = notification.object;
    if (controller) {
        [self setupController:controller];
        [self updateGamepadListEvent];
    }
}

- (void)controllerDidDisconnect:(NSNotification *)notification {
    [self updateGamepadListEvent];
}

- (void)setupController:(GCController *)controller {
    if (controller.extendedGamepad) {
        GCExtendedGamepad *extendedGamepad = controller.extendedGamepad;
        __weak typeof(self) weakSelf = self;

        extendedGamepad.valueChangedHandler = ^(GCExtendedGamepad *gamepad, GCControllerElement *element) {
            __strong typeof(weakSelf) strongSelf = weakSelf;
            if (!strongSelf) return;

            // 直接检查是否是对应的按钮
            if (element == gamepad.buttonA) {
                [strongSelf sendButtonEvent:@"A" pressed:gamepad.buttonA.pressed];
            } else if (element == gamepad.buttonB) {
                [strongSelf sendButtonEvent:@"B" pressed:gamepad.buttonB.pressed];
            } else if (element == gamepad.buttonX) {
                [strongSelf sendButtonEvent:@"X" pressed:gamepad.buttonX.pressed];
            } else if (element == gamepad.buttonY) {
                [strongSelf sendButtonEvent:@"Y" pressed:gamepad.buttonY.pressed];
            } else if (element == gamepad.leftShoulder) {
                [strongSelf sendButtonEvent:@"LeftShoulder" pressed:gamepad.leftShoulder.pressed];
            } else if (element == gamepad.rightShoulder) {
                [strongSelf sendButtonEvent:@"RightShoulder" pressed:gamepad.rightShoulder.pressed];
            } else if (element == gamepad.buttonMenu) {
                [strongSelf sendButtonEvent:@"Menu" pressed:gamepad.buttonMenu.pressed];
            } else if (element == gamepad.buttonOptions) {
                [strongSelf sendButtonEvent:@"View" pressed:gamepad.buttonOptions.pressed];
            } else if (element == gamepad.leftThumbstickButton) {
                [strongSelf sendButtonEvent:@"LeftThumb" pressed:gamepad.leftThumbstickButton.pressed];
            } else if (element == gamepad.rightThumbstickButton) {
                [strongSelf sendButtonEvent:@"RightThumb" pressed:gamepad.rightThumbstickButton.pressed];
            } else if (element == gamepad.dpad) {
                [strongSelf sendDpadEvent:gamepad.dpad];
            } else if (element == gamepad.leftThumbstick) {
                [strongSelf sendLeftStickEvent:gamepad.leftThumbstick];
            } else if (element == gamepad.rightThumbstick) {
                [strongSelf sendRightStickEvent:gamepad.rightThumbstick];
            } else if (element == gamepad.leftTrigger) {
                [strongSelf sendLeftTriggerEvent:gamepad.leftTrigger];
            } else if (element == gamepad.rightTrigger) {
                [strongSelf sendRightTriggerEvent:gamepad.rightTrigger];
            }
        };
    }
}

@end
