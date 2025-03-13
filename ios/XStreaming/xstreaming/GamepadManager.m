#import "GamepadManager.h"
#import <GameController/GameController.h>
#import <React/RCTLog.h>

@implementation GamepadManager {
    NSMutableArray *_connectedControllers;
    NSString *_currentScreen; //  添加成员变量记录当前屏幕
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

// 修改 sendEventWithName 的调用方式
- (void)updateGamepadListEvent {
    
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
    
// 添加振动方法
RCT_EXPORT_METHOD(vibrate:(int)duration lowFreqMotor:(int)lowFreqMotor highFreqMotor:(int)highFreqMotor leftTrigger:(int)leftTrigger rightTrigger:(int)rightTrigger intensity:(int)intensity) {
    // iOS 设备振动
    UIImpactFeedbackGenerator *generator;
    UIImpactFeedbackStyle style = UIImpactFeedbackStyleMedium;
    
    // 根据强度选择振动样式
    switch (intensity) {
        case 1:
            style = UIImpactFeedbackStyleLight;
            break;
        case 2:
            style = UIImpactFeedbackStyleMedium;
            break;
        case 4:
        case 5:
            style = UIImpactFeedbackStyleHeavy;
            break;
        default:
            style = UIImpactFeedbackStyleMedium;
            break;
    }
    
    // 如果强度都为 0，则不振动
    if (lowFreqMotor == 0 && highFreqMotor == 0) {
        return;
    }
    
    generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:style];
    [generator prepare];
    [generator impactOccurred];
    
    // 对于长时间振动，可以考虑重复触发
    if (duration > 500) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UIImpactFeedbackGenerator *repeatGenerator = [[UIImpactFeedbackGenerator alloc] initWithStyle:style];
            [repeatGenerator prepare];
            [repeatGenerator impactOccurred];
        });
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
