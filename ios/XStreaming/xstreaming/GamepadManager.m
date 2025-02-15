#import "GamepadManager.h"

@implementation GamepadManager {
    bool hasListeners;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
    return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"GamepadConnected", @"GamepadDisconnected", @"GamepadInput"];
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _currentScreen = @"";
        _hasGameController = NO;
        hasListeners = NO;
        [self setupGameController];
    }
    return self;
}

- (void)startObserving
{
    hasListeners = YES;
}

- (void)stopObserving
{
    hasListeners = NO;
}

- (void)setupGameController
{
    [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleControllerDidConnect:)
                                               name:GCControllerDidConnectNotification
                                             object:nil];
    
    [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleControllerDidDisconnect:)
                                               name:GCControllerDidDisconnectNotification
                                             object:nil];
    
    // Check for already connected controllers
    if (GCController.controllers.count > 0) {
        [self handleControllerDidConnect:nil];
    }
}

- (void)handleControllerDidConnect:(NSNotification *)notification
{
    _hasGameController = YES;
    _currentController = GCController.controllers.firstObject;
    
    if (!hasListeners) return;
    
    [self sendEventWithName:@"GamepadConnected" body:@{
        @"name": _currentController.vendorName ?: @"Unknown Controller"
    }];
    
    __weak typeof(self) weakSelf = self;
    
    // 设置按钮输入回调
    _currentController.extendedGamepad.buttonA.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"A" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.buttonB.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"B" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.buttonX.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"X" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.buttonY.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"Y" value:value pressed:pressed];
    };
    
    // 设置方向键输入回调
    _currentController.extendedGamepad.dpad.up.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"DpadUp" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.dpad.down.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"DpadDown" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.dpad.left.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"DpadLeft" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.dpad.right.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"DpadRight" value:value pressed:pressed];
    };
    
    // 设置肩部按钮输入回调
    _currentController.extendedGamepad.leftShoulder.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"L1" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.rightShoulder.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"R1" value:value pressed:pressed];
    };
    
    // 设置扳机键输入回调
    _currentController.extendedGamepad.leftTrigger.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"L2" value:value pressed:pressed];
    };
    
    _currentController.extendedGamepad.rightTrigger.valueChangedHandler = ^(GCControllerButtonInput *button, float value, BOOL pressed) {
        [weakSelf handleButtonInput:@"R2" value:value pressed:pressed];
    };
    
    // 设置摇杆输入回调
    _currentController.extendedGamepad.leftThumbstick.valueChangedHandler = ^(GCControllerDirectionPad *dpad, float xValue, float yValue) {
        [weakSelf handleThumbstickInput:@"LeftStick" xValue:xValue yValue:yValue];
    };
    
    _currentController.extendedGamepad.rightThumbstick.valueChangedHandler = ^(GCControllerDirectionPad *dpad, float xValue, float yValue) {
        [weakSelf handleThumbstickInput:@"RightStick" xValue:xValue yValue:yValue];
    };
}

- (void)handleControllerDidDisconnect:(NSNotification *)notification
{
    _hasGameController = NO;
    _currentController = nil;
    
    if (!hasListeners) return;
    
    [self sendEventWithName:@"GamepadDisconnected" body:@{}];
}

- (void)handleButtonInput:(NSString *)button value:(float)value pressed:(BOOL)pressed
{
    if (!hasListeners) return;
    
    [self sendEventWithName:@"GamepadInput" body:@{
        @"type": @"button",
        @"button": button,
        @"value": @(value),
        @"pressed": @(pressed)
    }];
}

- (void)handleThumbstickInput:(NSString *)stick xValue:(float)xValue yValue:(float)yValue
{
    if (!hasListeners) return;
    
    [self sendEventWithName:@"GamepadInput" body:@{
        @"type": @"thumbstick",
        @"stick": stick,
        @"x": @(xValue),
        @"y": @(yValue)
    }];
}

RCT_EXPORT_METHOD(setCurrentScreen:(NSString *)value)
{
    _currentScreen = value;
}

RCT_EXPORT_METHOD(vibrate:(int)duration lowFreqMotor:(int)lowFreqMotor highFreqMotor:(int)highFreqMotor leftTrigger:(int)leftTrigger rightTrigger:(int)rightTrigger intensity:(int)intensity)
{
    if (@available(iOS 14.0, *)) {
        GCController *controller = GCController.controllers.firstObject;
        if (controller && [controller respondsToSelector:@selector(hapticEngine)]) {
            // 将输入值转换为 0-1 范围
            float normalizedLowFreq = (float)lowFreqMotor / 255.0;
            float normalizedHighFreq = (float)highFreqMotor / 255.0;
            float normalizedLeftTrigger = (float)leftTrigger / 255.0;
            float normalizedRightTrigger = (float)rightTrigger / 255.0;
            
            // 根据 intensity 调整震动强度
            float intensityMultiplier = 1.0;
            switch (intensity) {
                case 1: // very weak
                    intensityMultiplier = 0.4;
                    break;
                case 2: // weak
                    intensityMultiplier = 0.8;
                    break;
                case 4: // strong
                    intensityMultiplier = 1.5;
                    break;
                case 5: // very strong
                    intensityMultiplier = 2.0;
                    break;
            }
            
            normalizedLowFreq *= intensityMultiplier;
            normalizedHighFreq *= intensityMultiplier;
            normalizedLeftTrigger *= intensityMultiplier;
            normalizedRightTrigger *= intensityMultiplier;
            
            // 确保值在 0-1 范围内
            normalizedLowFreq = MIN(1.0, MAX(0.0, normalizedLowFreq));
            normalizedHighFreq = MIN(1.0, MAX(0.0, normalizedHighFreq));
            normalizedLeftTrigger = MIN(1.0, MAX(0.0, normalizedLeftTrigger));
            normalizedRightTrigger = MIN(1.0, MAX(0.0, normalizedRightTrigger));
            
            // 主体震动
            if (normalizedLowFreq > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy];
                [generator prepare];
                [generator impactOccurred];
            }
            
            if (normalizedHighFreq > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
                [generator prepare];
                [generator impactOccurred];
            }
            
            // 扳机震动
            if (normalizedLeftTrigger > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                [generator prepare];
                [generator impactOccurred];
            }
            
            if (normalizedRightTrigger > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                [generator prepare];
                [generator impactOccurred];
            }
        }
    }
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end 