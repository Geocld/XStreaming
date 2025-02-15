#import "BatteryModule.h"
#import <UIKit/UIKit.h>

@implementation BatteryModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getBatteryLevel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    UIDevice *device = [UIDevice currentDevice];
    device.batteryMonitoringEnabled = YES;
    float batteryLevel = device.batteryLevel;
    device.batteryMonitoringEnabled = NO;
    
    resolve(@(batteryLevel * 100));
}

RCT_EXPORT_METHOD(getBatteryState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    UIDevice *device = [UIDevice currentDevice];
    device.batteryMonitoringEnabled = YES;
    
    UIDeviceBatteryState batteryState = device.batteryState;
    NSString *state;
    
    switch (batteryState) {
        case UIDeviceBatteryStateUnknown:
            state = @"unknown";
            break;
        case UIDeviceBatteryStateUnplugged:
            state = @"unplugged";
            break;
        case UIDeviceBatteryStateCharging:
            state = @"charging";
            break;
        case UIDeviceBatteryStateFull:
            state = @"full";
            break;
        default:
            state = @"unknown";
            break;
    }
    
    device.batteryMonitoringEnabled = NO;
    resolve(state);
}

RCT_EXPORT_METHOD(isLowPowerModeEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    if (@available(iOS 9.0, *)) {
        BOOL isLowPowerModeEnabled = [[NSProcessInfo processInfo] isLowPowerModeEnabled];
        resolve(@(isLowPowerModeEnabled));
    } else {
        resolve(@(NO));
    }
}

@end 