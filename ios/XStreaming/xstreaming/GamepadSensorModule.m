#import "GamepadSensorModule.h"
#import <CoreMotion/CoreMotion.h>

@implementation GamepadSensorModule {
    CMMotionManager *_motionManager;
}

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"SensorData"];
}

RCT_EXPORT_METHOD(startSensor:(int)sensitivity)
{
    if (!_motionManager) {
        _motionManager = [[CMMotionManager alloc] init];
    }
    
    if (_motionManager.gyroAvailable) {
        _motionManager.gyroUpdateInterval = 1.0 / 60.0;
        [_motionManager startGyroUpdatesToQueue:[NSOperationQueue mainQueue]
                                  withHandler:^(CMGyroData *gyroData, NSError *error) {
            if (!error) {
                [self sendEventWithName:@"SensorData" body:@{
                    @"x": @(gyroData.rotationRate.x),
                    @"y": @(gyroData.rotationRate.y),
                    @"z": @(gyroData.rotationRate.z)
                }];
            }
        }];
    }
}

RCT_EXPORT_METHOD(stopSensor)
{
    if (_motionManager && _motionManager.gyroActive) {
        [_motionManager stopGyroUpdates];
    }
}

@end 