#import "SensorModule.h"
#import <CoreMotion/CoreMotion.h>

@implementation SensorModule {
    CMMotionManager *_motionManager;
    bool hasListeners;
    double lastX;
    double lastY;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"SensorData"];
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _motionManager = [[CMMotionManager alloc] init];
        _customSensitivity = 15000;
        lastX = 0;
        lastY = 0;
        hasListeners = NO;
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

RCT_EXPORT_METHOD(startSensor:(nonnull NSNumber *)sensitivity)
{
    self.customSensitivity = [sensitivity doubleValue];
    
    if (self.motionManager.gyroAvailable) {
        self.motionManager.gyroUpdateInterval = 1.0 / 100.0;  // 100 Hz
        
        [self.motionManager startGyroUpdatesToQueue:[NSOperationQueue mainQueue]
                                      withHandler:^(CMGyroData *gyroData, NSError *error) {
            if (error) {
                return;
            }
            
            if (!hasListeners) {
                return;
            }
            
            double sensitivity = (1 << 8) * self.customSensitivity / 100.0;
            
            double x = -gyroData.rotationRate.x;
            double y = gyroData.rotationRate.y;
            
            double nowX = sensitivity * x + lastX;
            double nowY = sensitivity * y + lastY;
            
            int roundX = round(nowX);
            int roundY = round(nowY);
            
            lastX = nowX - roundX;
            lastY = nowY - roundY;
            
            if (roundX > 32767) {
                roundX = 32767;
            } else if (roundX < -32767) {
                roundX = -32767;
            }
            
            if (roundY > 32767) {
                roundY = 32767;
            } else if (roundY < -32767) {
                roundY = -32767;
            }
            
            [self sendEventWithName:@"SensorData" body:@{
                @"x": @(roundX),
                @"y": @(roundY)
            }];
        }];
    }
}

RCT_EXPORT_METHOD(stopSensor)
{
    if ([self.motionManager isGyroActive]) {
        [self.motionManager stopGyroUpdates];
    }
}

- (void)dealloc
{
    if ([self.motionManager isGyroActive]) {
        [self.motionManager stopGyroUpdates];
    }
}

@end 