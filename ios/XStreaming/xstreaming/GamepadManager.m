#import "GamepadManager.h"
#import <GameController/GameController.h>
#import <React/RCTLog.h>
#import "Controller.h"

@implementation GamepadManager {
    NSMutableArray *_connectedControllers;
    NSString *_currentScreen; //  添加成员变量记录当前屏幕
    NSLock *_controllerStreamLock;
    
    Controller *_oscController;
#define EMULATING_SELECT     0x1
#define EMULATING_SPECIAL    0x2
    
    NSMutableDictionary *_controllers;
    char _controllerNumbers;
}

// UPDATE_BUTTON_FLAG(controller, flag, pressed)
#define UPDATE_BUTTON_FLAG(controller, x, y) \
((y) ? [self setButtonFlag:controller flags:x] : [self clearButtonFlag:controller flags:x])

#define MAX_MAGNITUDE(x, y) (abs(x) > abs(y) ? (x) : (y))

RCT_EXPORT_MODULE();

- (instancetype)init {
    NSLog(@"Gamepad manager init");
    self = [super init];
    if (self) {
        _connectedControllers = [NSMutableArray array];
        [self startObservingGamepads];
        _currentScreen = @"unknown";
        
        [self initController];
    }
    return self;
}

RCT_EXPORT_METHOD(setCurrentScreen:(NSString *)screenName)
{
    _currentScreen = screenName;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onController"];
}

// 添加这个方法来确保在主线程上初始化
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// 修改 sendEventWithName 的调用方式
//- (void)updateGamepadListEvent {
//    if (!hasListeners) return;  // 如果没有监听器，不发送事件
//    
//    NSMutableArray *gamepads = [NSMutableArray array];
//    [_connectedControllers removeAllObjects];
//    
//    for (GCController *controller in [GCController controllers]) {
//        NSMutableDictionary *gamepadInfo = [NSMutableDictionary dictionary];
//        gamepadInfo[@"name"] = controller.vendorName ?: @"Unknown Gamepad";
//        gamepadInfo[@"identifier"] = controller.productCategory ?: @"Unknown Category";
//        [gamepads addObject:gamepadInfo];
//        [_connectedControllers addObject:controller];
//    }
//    
//    if (self.bridge) {
//        [super sendEventWithName:@"onGamepadReport" body:@{@"gamepads": gamepads}];
//    }
//}

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

+ (BOOL)isSupportedGamepad:(GCController *)controller {
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

-(void) cleanupControllerHaptics:(Controller*) controller
{
    [controller.lowFreqMotor cleanup];
    [controller.highFreqMotor cleanup];
    [controller.leftTriggerMotor cleanup];
    [controller.rightTriggerMotor cleanup];
}

-(void) initController {
    if (_controllers == nil) {
        _controllers = [[NSMutableDictionary alloc] init];
    }
    
    NSLog(@"initController");
    NSLog(@"已连接的支持控制器数量: %lu", (unsigned long)[GCController controllers].count);
    
    for (GCController* controller in [GCController controllers]) {
      if ([GamepadManager isSupportedGamepad:controller]) {
          NSNumber *playerIndexKey = [NSNumber numberWithInteger:controller.playerIndex];
          if ([_controllers objectForKey:playerIndexKey] == nil) {
              [self assignController:controller];
              [self registerControllerCallbacks:controller];
          }
      }
    }
    
    NSLog(@"_controllers: %@", _controllers);
}

-(void) updateLeftStick:(Controller*)controller x:(short)x y:(short)y
{
    @synchronized(controller) {
        controller.lastLeftStickX = x;
        controller.lastLeftStickY = y;
    }
}

-(void) updateRightStick:(Controller*)controller x:(short)x y:(short)y
{
    @synchronized(controller) {
        controller.lastRightStickX = x;
        controller.lastRightStickY = y;
    }
}

-(void) updateLeftTrigger:(Controller*)controller left:(unsigned char)left
{
    @synchronized(controller) {
        controller.lastLeftTrigger = left;
    }
}

-(void) updateRightTrigger:(Controller*)controller right:(unsigned char)right
{
    @synchronized(controller) {
        controller.lastRightTrigger = right;
    }
}

-(void) updateTriggers:(Controller*) controller left:(unsigned char)left right:(unsigned char)right
{
    @synchronized(controller) {
        controller.lastLeftTrigger = left;
        controller.lastRightTrigger = right;
    }
}

-(void) handleSpecialCombosReleased:(Controller*)controller releasedButtons:(int)releasedButtons
{
    if ((controller.emulatingButtonFlags & EMULATING_SELECT) && (releasedButtons & (LB_FLAG | PLAY_FLAG))) {
        controller.lastButtonFlags &= ~BACK_FLAG;
        controller.emulatingButtonFlags &= ~EMULATING_SELECT;
    }
    
    if (controller.emulatingButtonFlags & EMULATING_SPECIAL) {
        // If Select is emulated, we use RB+Start to emulate special, otherwise we use Start+Select
        if (controller.supportedEmulationFlags & EMULATING_SELECT) {
            if (releasedButtons & (RB_FLAG | PLAY_FLAG)) {
                controller.lastButtonFlags &= ~SPECIAL_FLAG;
                controller.emulatingButtonFlags &= ~EMULATING_SPECIAL;
            }
        }
        else {
            if (releasedButtons & (BACK_FLAG | PLAY_FLAG)) {
                controller.lastButtonFlags &= ~SPECIAL_FLAG;
                controller.emulatingButtonFlags &= ~EMULATING_SPECIAL;
            }
        }
    }
}

-(void) handleSpecialCombosPressed:(Controller*)controller pressedButtons:(int)pressedButtons
{
    // Special button combos for select and special
    if (controller.lastButtonFlags & PLAY_FLAG) {
        // If LB and start are down, trigger select
        if (controller.lastButtonFlags & LB_FLAG) {
            if (controller.supportedEmulationFlags & EMULATING_SELECT) {
                controller.lastButtonFlags |= BACK_FLAG;
                controller.lastButtonFlags &= ~(pressedButtons & (PLAY_FLAG | LB_FLAG));
                controller.emulatingButtonFlags |= EMULATING_SELECT;
            }
        }
        else if (controller.supportedEmulationFlags & EMULATING_SPECIAL) {
            // If Select is emulated too, use RB+Start to emulate special
            if (controller.supportedEmulationFlags & EMULATING_SELECT) {
                if (controller.lastButtonFlags & RB_FLAG) {
                    controller.lastButtonFlags |= SPECIAL_FLAG;
                    controller.lastButtonFlags &= ~(pressedButtons & (PLAY_FLAG | RB_FLAG));
                    controller.emulatingButtonFlags |= EMULATING_SPECIAL;
                }
            }
            else {
                // If Select is physical, use Start+Select to emulate special
                if (controller.lastButtonFlags & BACK_FLAG) {
                    controller.lastButtonFlags |= SPECIAL_FLAG;
                    controller.lastButtonFlags &= ~(pressedButtons & (PLAY_FLAG | BACK_FLAG));
                    controller.emulatingButtonFlags |= EMULATING_SPECIAL;
                }
            }
        }
    }
}

-(void) setButtonFlag:(Controller*)controller flags:(int)flags
{
    @synchronized(controller) {
        controller.lastButtonFlags |= flags;
        [self handleSpecialCombosPressed:controller pressedButtons:flags];
    }
}

-(void) clearButtonFlag:(Controller*)controller flags:(int)flags
{
    @synchronized(controller) {
        controller.lastButtonFlags &= ~flags;
        [self handleSpecialCombosReleased:controller releasedButtons:flags];
    }
}

-(void) updateFinished:(Controller*)controller
{
    BOOL exitRequested = NO;
    
    [_controllerStreamLock lock];
    @synchronized(controller) {
        // Handle Start+Select+L1+R1 gamepad quit combo
        if (controller.lastButtonFlags == (PLAY_FLAG | BACK_FLAG | LB_FLAG | RB_FLAG)) {
            controller.lastButtonFlags = 0;
            exitRequested = YES;
        }
        
        // Only send controller events if we successfully reported controller arrival
        if ([self reportControllerArrival:controller]) {
            uint32_t buttonFlags = controller.lastButtonFlags;
            uint8_t leftTrigger = controller.lastLeftTrigger;
            uint8_t rightTrigger = controller.lastRightTrigger;
            int16_t leftStickX = controller.lastLeftStickX;
            int16_t leftStickY = controller.lastLeftStickY;
            int16_t rightStickX = controller.lastRightStickX;
            int16_t rightStickY = controller.lastRightStickY;
            
            // If this is merged with another controller, combine the inputs
            if (controller.mergedWithController) {
                buttonFlags |= controller.mergedWithController.lastButtonFlags;
                leftTrigger = MAX(leftTrigger, controller.mergedWithController.lastLeftTrigger);
                rightTrigger = MAX(rightTrigger, controller.mergedWithController.lastRightTrigger);
                leftStickX = MAX_MAGNITUDE(leftStickX, controller.mergedWithController.lastLeftStickX);
                leftStickY = MAX_MAGNITUDE(leftStickY, controller.mergedWithController.lastLeftStickY);
                rightStickX = MAX_MAGNITUDE(rightStickX, controller.mergedWithController.lastRightStickX);
                rightStickY = MAX_MAGNITUDE(rightStickY, controller.mergedWithController.lastRightStickY);
            }
        }
    }
    [_controllerStreamLock unlock];

}

-(void) registerControllerCallbacks:(GCController*) controller
{
    if (controller != NULL) {
        // iOS 13 allows the Start button to behave like a normal button, however
        // older MFi controllers can send an instant down+up event for the start button
        // which means the button will not be down long enough to register on the PC.
        // To work around this issue, use the old controllerPausedHandler if the controller
        // doesn't have a Select button (which indicates it probably doesn't have a proper
        // Start button either).
        BOOL useLegacyPausedHandler = YES;
        if (@available(iOS 13.0, tvOS 13.0, *)) {
            if (controller.extendedGamepad != nil &&
                controller.extendedGamepad.buttonOptions != nil) {
                useLegacyPausedHandler = NO;
            }
        }
        
        if (useLegacyPausedHandler) {
            controller.controllerPausedHandler = ^(GCController *controller) {
                Controller* limeController = [self->_controllers objectForKey:[NSNumber numberWithInteger:controller.playerIndex]];
                
                // Get off the main thread
                dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
                    [self setButtonFlag:limeController flags:PLAY_FLAG];
                    [self updateFinished:limeController];
                    
                    // Pause for 100 ms
                    usleep(100 * 1000);
                    
                    [self clearButtonFlag:limeController flags:PLAY_FLAG];
                    [self updateFinished:limeController];
                });
            };
        }
        
        if (controller.extendedGamepad != NULL) {
            // Disable system gestures on the gamepad to avoid interfering
            // with in-game controller actions
            if (@available(iOS 14.0, tvOS 14.0, *)) {
                for (GCControllerElement* element in controller.physicalInputProfile.allElements) {
                    element.preferredSystemGestureState = GCSystemGestureStateDisabled;
                }
            }
            
            controller.extendedGamepad.valueChangedHandler = ^(GCExtendedGamepad *gamepad, GCControllerElement *element) {
                Controller* limeController = [self->_controllers objectForKey:[NSNumber numberWithInteger:gamepad.controller.playerIndex]];
                float leftStickX, leftStickY;
                float rightStickX, rightStickY;
                unsigned char leftTrigger, rightTrigger;
                
                UPDATE_BUTTON_FLAG(limeController, A_FLAG, gamepad.buttonA.pressed);
                UPDATE_BUTTON_FLAG(limeController, B_FLAG, gamepad.buttonB.pressed);
                UPDATE_BUTTON_FLAG(limeController, X_FLAG, gamepad.buttonX.pressed);
                UPDATE_BUTTON_FLAG(limeController, Y_FLAG, gamepad.buttonY.pressed);
                
                UPDATE_BUTTON_FLAG(limeController, UP_FLAG, gamepad.dpad.up.pressed);
                UPDATE_BUTTON_FLAG(limeController, DOWN_FLAG, gamepad.dpad.down.pressed);
                UPDATE_BUTTON_FLAG(limeController, LEFT_FLAG, gamepad.dpad.left.pressed);
                UPDATE_BUTTON_FLAG(limeController, RIGHT_FLAG, gamepad.dpad.right.pressed);
                
                UPDATE_BUTTON_FLAG(limeController, LB_FLAG, gamepad.leftShoulder.pressed);
                UPDATE_BUTTON_FLAG(limeController, RB_FLAG, gamepad.rightShoulder.pressed);
                
                // Yay, iOS 12.1 now supports analog stick buttons
                if (@available(iOS 12.1, tvOS 12.1, *)) {
                    if (gamepad.leftThumbstickButton != nil) {
                        UPDATE_BUTTON_FLAG(limeController, LS_CLK_FLAG, gamepad.leftThumbstickButton.pressed);
                    }
                    if (gamepad.rightThumbstickButton != nil) {
                        UPDATE_BUTTON_FLAG(limeController, RS_CLK_FLAG, gamepad.rightThumbstickButton.pressed);
                    }
                }
                
                if (@available(iOS 13.0, tvOS 13.0, *)) {
                    // Options button is optional (only present on Xbox One S and PS4 gamepads)
                    if (gamepad.buttonOptions != nil) {
                        UPDATE_BUTTON_FLAG(limeController, BACK_FLAG, gamepad.buttonOptions.pressed);

                        // For older MFi gamepads, the menu button will already be handled by
                        // the controllerPausedHandler.
                        UPDATE_BUTTON_FLAG(limeController, PLAY_FLAG, gamepad.buttonMenu.pressed);
                    }
                }
                
                if (@available(iOS 14.0, tvOS 14.0, *)) {
                    // Home/Guide button is optional (only present on Xbox One S and PS4 gamepads)
                    if (gamepad.buttonHome != nil) {
                        UPDATE_BUTTON_FLAG(limeController, SPECIAL_FLAG, gamepad.buttonHome.pressed);
                    }
                    
                    // Xbox One/Series controllers
                    if (gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleOne]) {
                        UPDATE_BUTTON_FLAG(limeController, PADDLE1_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleOne].pressed);
                    }
                    if (gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleTwo]) {
                        UPDATE_BUTTON_FLAG(limeController, PADDLE2_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleTwo].pressed);
                    }
                    if (gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleThree]) {
                        UPDATE_BUTTON_FLAG(limeController, PADDLE3_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleThree].pressed);
                    }
                    if (gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleFour]) {
                        UPDATE_BUTTON_FLAG(limeController, PADDLE4_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputXboxPaddleFour].pressed);
                    }
                    if (@available(iOS 15.0, tvOS 15.0, *)) {
                        if (gamepad.controller.physicalInputProfile.buttons[GCInputButtonShare]) {
                            UPDATE_BUTTON_FLAG(limeController, MISC_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputButtonShare].pressed);
                        }
                    }
                    
                    // DualShock/DualSense controllers
                    if (gamepad.controller.physicalInputProfile.buttons[GCInputDualShockTouchpadButton]) {
                        UPDATE_BUTTON_FLAG(limeController, TOUCHPAD_FLAG, gamepad.controller.physicalInputProfile.buttons[GCInputDualShockTouchpadButton].pressed);
                    }
                }
                
                leftStickX = gamepad.leftThumbstick.xAxis.value; // -1 ~ 1
                leftStickY = gamepad.leftThumbstick.yAxis.value; // -1 ~ 1
                
                
                rightStickX = gamepad.rightThumbstick.xAxis.value; // -1 ~ 1
                rightStickY = gamepad.rightThumbstick.yAxis.value; // -1 ~ 1
                
                leftTrigger = gamepad.leftTrigger.value * 0xFF; // 0 ~ 255
                rightTrigger = gamepad.rightTrigger.value * 0xFF; // 0 ~ 255
                
                float _leftTrigger = gamepad.leftTrigger.value;
                float _rightTrigger = gamepad.rightTrigger.value;
                                
                [self updateLeftStick:limeController x:leftStickX y:leftStickY];
                [self updateRightStick:limeController x:rightStickX y:rightStickY];
                [self updateTriggers:limeController left:leftTrigger right:rightTrigger];
                [self updateFinished:limeController];
                
                [self sendEventWithName:@"onController" body:@{
                    @"buttonFlags": @(limeController.lastButtonFlags),
                    @"leftTrigger": @(_leftTrigger),
                    @"rightTrigger": @(_rightTrigger),
                    @"leftStickX": @(leftStickX),
                    @"leftStickY": @(leftStickY),
                    @"rightStickX": @(rightStickX),
                    @"rightStickY": @(rightStickY),
                }];
            };
        }
    } else {
        NSLog(@"Tried to register controller callbacks on NULL controller");
    }
}

-(void) unregisterControllerCallbacks:(GCController*) controller
{
    if (controller != NULL) {
        controller.controllerPausedHandler = NULL;
        
        if (controller.extendedGamepad != NULL) {
            // Re-enable system gestures on the gamepad buttons now
            if (@available(iOS 14.0, tvOS 14.0, *)) {
                for (GCControllerElement* element in controller.physicalInputProfile.allElements) {
                    element.preferredSystemGestureState = GCSystemGestureStateEnabled;
                }
            }
            
            controller.extendedGamepad.valueChangedHandler = NULL;
        }
    }
}

RCT_EXPORT_METHOD(rumble:(int)duration lowFreqMotor:(int)lowFreqMotor highFreqMotor:(int)highFreqMotor leftTrigger:(int)leftTrigger rightTrigger:(int)rightTrigger) {
    for (Controller* controller in [_controllers allValues]) {
        if(controller != nil) {
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
    NSLog(@"startObservingGamepads....");
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(controllerDidConnect:)
                                                 name:GCControllerDidConnectNotification
                                               object:nil];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(controllerDidDisconnect:)
                                                 name:GCControllerDidDisconnectNotification
                                               object:nil];
}

- (void)stopObservingGamepads {
    [[NSNotificationCenter defaultCenter] removeObserver:self name:GCControllerDidConnectNotification object:nil];
    [[NSNotificationCenter defaultCenter] removeObserver:self name:GCControllerDidDisconnectNotification object:nil];
}

// 控制器连接
- (void)controllerDidConnect:(NSNotification *)notification {
    NSLog(@"Controller connected!");
    GCController *controller = notification.object;
    if (![GamepadManager isSupportedGamepad:controller]) {
        // Ignore micro gamepads and motion controllers
        return;
    }
        
    Controller* limeController = [self assignController:controller];
    if (limeController) {
        // Register callbacks on the new controller
        [self registerControllerCallbacks:controller];
        
        // Report the controller arrival to the host if we're connected
        [self reportControllerArrival:limeController];
    }
}

// 控制器断开连接
- (void)controllerDidDisconnect:(NSNotification *)notification {
    NSLog(@"Controller disconnected!");
    GCController *controller = notification.object;
    if (![GamepadManager isSupportedGamepad:controller]) {
        // Ignore micro gamepads and motion controllers
        return;
    }
    
    [self unregisterControllerCallbacks:controller];
    
    NSNumber *playerIndexKey = [NSNumber numberWithInteger:controller.playerIndex];
    Controller *limeController = [_controllers objectForKey:playerIndexKey];
    
    if (limeController != nil) {
        // Stop haptics on this controller
        [self cleanupControllerHaptics:limeController];
        
        [self updateFinished:limeController];
        
        _controllerNumbers &= ~(1 << limeController.playerIndex);
        
        [_controllers removeObjectForKey:playerIndexKey];
        
        // Inform the server of the updated active gamepads before removing this controller
        [self updateFinished:limeController];
    }
}

- (void) initControllerReport {
    for (Controller* controller in [_controllers allValues]) {
        // Report the controller arrival to the host if we haven't done so yet
        [self reportControllerArrival:controller];
    }
}

-(BOOL) reportControllerArrival:(Controller*) limeController
{
    // Only report arrival once
    if (limeController.reportedArrival) {
        return YES;
    }
        
    uint8_t type = LI_CTYPE_UNKNOWN;
    uint16_t capabilities = 0;
    uint32_t supportedButtonFlags = 0;
    
    GCController *controller = limeController.gamepad;
    if (controller) {
        // This is a physical controller with a corresponding GCController object
        
        // Start is always present
        supportedButtonFlags |= PLAY_FLAG;
        
        // Detect buttons present in the GCExtendedGamepad profile
        if (controller.extendedGamepad.dpad) {
            supportedButtonFlags |= UP_FLAG | DOWN_FLAG | LEFT_FLAG | RIGHT_FLAG;
        }
        if (controller.extendedGamepad.leftShoulder) {
            supportedButtonFlags |= LB_FLAG;
        }
        if (controller.extendedGamepad.rightShoulder) {
            supportedButtonFlags |= RB_FLAG;
        }
        if (@available(iOS 13.0, tvOS 13.0, *)) {
            if (controller.extendedGamepad.buttonOptions) {
                supportedButtonFlags |= BACK_FLAG;
            }
        }
        if (@available(iOS 14.0, tvOS 14.0, *)) {
            if (controller.extendedGamepad.buttonHome) {
                supportedButtonFlags |= SPECIAL_FLAG;
            }
        }
        if (controller.extendedGamepad.buttonA) {
            supportedButtonFlags |= A_FLAG;
        }
        if (controller.extendedGamepad.buttonB) {
            supportedButtonFlags |= B_FLAG;
        }
        if (controller.extendedGamepad.buttonX) {
            supportedButtonFlags |= X_FLAG;
        }
        if (controller.extendedGamepad.buttonY) {
            supportedButtonFlags |= Y_FLAG;
        }
        if (@available(iOS 12.1, tvOS 12.1, *)) {
            if (controller.extendedGamepad.leftThumbstickButton) {
                supportedButtonFlags |= LS_CLK_FLAG;
            }
            if (controller.extendedGamepad.rightThumbstickButton) {
                supportedButtonFlags |= RS_CLK_FLAG;
            }
        }
        
        if (@available(iOS 14.0, tvOS 14.0, *)) {
            // Xbox One/Series controller
            if (controller.physicalInputProfile.buttons[GCInputXboxPaddleOne]) {
                supportedButtonFlags |= PADDLE1_FLAG;
            }
            if (controller.physicalInputProfile.buttons[GCInputXboxPaddleTwo]) {
                supportedButtonFlags |= PADDLE2_FLAG;
            }
            if (controller.physicalInputProfile.buttons[GCInputXboxPaddleThree]) {
                supportedButtonFlags |= PADDLE3_FLAG;
            }
            if (controller.physicalInputProfile.buttons[GCInputXboxPaddleFour]) {
                supportedButtonFlags |= PADDLE4_FLAG;
            }
            if (@available(iOS 15.0, tvOS 15.0, *)) {
                if (controller.physicalInputProfile.buttons[GCInputButtonShare]) {
                    supportedButtonFlags |= MISC_FLAG;
                }
            }
            
            // DualShock/DualSense controller
            if (controller.physicalInputProfile.buttons[GCInputDualShockTouchpadButton]) {
                supportedButtonFlags |= TOUCHPAD_FLAG;
            }
            if (controller.physicalInputProfile.dpads[GCInputDualShockTouchpadOne]) {
                capabilities |= LI_CCAP_TOUCHPAD;
            }
            
            if ([controller.extendedGamepad isKindOfClass:[GCXboxGamepad class]]) {
                type = LI_CTYPE_XBOX;
            }
            else if ([controller.extendedGamepad isKindOfClass:[GCDualShockGamepad class]]) {
                type = LI_CTYPE_PS;
            }
            
            if (@available(iOS 14.5, tvOS 14.5, *)) {
                if ([controller.extendedGamepad isKindOfClass:[GCDualSenseGamepad class]]) {
                    type = LI_CTYPE_PS;
                }
            }
            
            // Detect supported haptics localities
            if (controller.haptics) {
                if ([controller.haptics.supportedLocalities containsObject:GCHapticsLocalityHandles]) {
                    capabilities |= LI_CCAP_RUMBLE;
                }
                if ([controller.haptics.supportedLocalities containsObject:GCHapticsLocalityTriggers]) {
                    capabilities |= LI_CCAP_TRIGGER_RUMBLE;
                }
            }
            
            // Detect supported motion sensors
            if (controller.motion) {
                if (controller.motion.hasGravityAndUserAcceleration) {
                    capabilities |= LI_CCAP_ACCEL;
                }
                if (controller.motion.hasRotationRate) {
                    capabilities |= LI_CCAP_GYRO;
                }
            }
            
            // Detect RGB LED support
            if (controller.light) {
                capabilities |= LI_CCAP_RGB_LED;
            }
            
            // Detect battery support
            if (controller.battery) {
                capabilities |= LI_CCAP_BATTERY_STATE;
            }
        }
        else {
            // This is a virtual controller corresponding to our OSC

            // TODO: Support various layouts and button labels on the OSC
            type = LI_CTYPE_XBOX;
            capabilities = 0;
            supportedButtonFlags =
                PLAY_FLAG | BACK_FLAG | UP_FLAG | DOWN_FLAG | LEFT_FLAG | RIGHT_FLAG |
                LB_FLAG | RB_FLAG | LS_CLK_FLAG | RS_CLK_FLAG | A_FLAG | B_FLAG | X_FLAG | Y_FLAG;
        }
    }
    
    // Remember that we've reported arrival already
    limeController.reportedArrival = YES;
    return YES;
}

@end
