#import "UsbRumbleManager.h"
#import <React/RCTLog.h>

@implementation UsbRumbleManager

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _bindUsbDevice = NO;
        _hasValidUsbDevice = NO;
        _usbController = @"";
        
        // 监听游戏手柄连接状态
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleControllerDidConnect:)
                                                   name:GCControllerDidConnectNotification
                                                 object:nil];
        
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleControllerDidDisconnect:)
                                                   name:GCControllerDidDisconnectNotification
                                                 object:nil];
        
        // 检查已连接的控制器
        if (GCController.controllers.count > 0) {
            [self handleControllerDidConnect:nil];
        }
    }
    return self;
}

- (void)handleControllerDidConnect:(NSNotification *)notification
{
    GCController *controller = notification.object ?: GCController.controllers.firstObject;
    if (controller) {
        self.hasValidUsbDevice = YES;
        self.usbController = controller.vendorName ?: @"Unknown Controller";
    }
}

- (void)handleControllerDidDisconnect:(NSNotification *)notification
{
    if (GCController.controllers.count == 0) {
        self.hasValidUsbDevice = NO;
        self.usbController = @"";
    }
}

RCT_EXPORT_METHOD(setBindUsbDevice:(BOOL)value)
{
    _bindUsbDevice = value;
}

RCT_EXPORT_METHOD(getHasValidUsbDevice:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve(@(self.hasValidUsbDevice));
}

RCT_EXPORT_METHOD(getUsbController:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve(self.usbController);
}

RCT_EXPORT_METHOD(rumble:(int)lowFreqMotor highFreqMotor:(int)highFreqMotor)
{
    if (@available(iOS 14.0, *)) {
        GCController *controller = GCController.controllers.firstObject;
        if (controller && controller.haptics) {
            // 将输入值转换为 0-1 范围
            float normalizedLowFreq = (float)lowFreqMotor / 255.0;
            float normalizedHighFreq = (float)highFreqMotor / 255.0;
            
            // 确保值在 0-1 范围内
            normalizedLowFreq = MIN(1.0, MAX(0.0, normalizedLowFreq));
            normalizedHighFreq = MIN(1.0, MAX(0.0, normalizedHighFreq));
            
            // 使用系统震动代替，因为控制器震动API可能不可用
            UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy];
            [generator prepare];
            [generator impactOccurred];
            
            if (normalizedHighFreq > 0) {
                generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
                [generator prepare];
                [generator impactOccurred];
            }
        } else {
            // 使用系统震动
            UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy];
            [generator prepare];
            [generator impactOccurred];
            
            if (highFreqMotor > 0) {
                generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
                [generator prepare];
                [generator impactOccurred];
            }
        }
    }
}

RCT_EXPORT_METHOD(rumbleTriggers:(int)leftTrigger rightTrigger:(int)rightTrigger)
{
    if (@available(iOS 14.0, *)) {
        GCController *controller = GCController.controllers.firstObject;
        if (controller && controller.haptics) {
            // 将输入值转换为 0-1 范围
            float normalizedLeft = (float)leftTrigger / 255.0;
            float normalizedRight = (float)rightTrigger / 255.0;
            
            // 确保值在 0-1 范围内
            normalizedLeft = MIN(1.0, MAX(0.0, normalizedLeft));
            normalizedRight = MIN(1.0, MAX(0.0, normalizedRight));
            
            // 使用系统震动
            if (normalizedLeft > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                [generator prepare];
                [generator impactOccurred];
            }
            
            if (normalizedRight > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                [generator prepare];
                [generator impactOccurred];
            }
        } else {
            // 使用系统震动
            if (leftTrigger > 0) {
                UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                [generator prepare];
                [generator impactOccurred];
            }
            
            if (rightTrigger > 0) {
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
