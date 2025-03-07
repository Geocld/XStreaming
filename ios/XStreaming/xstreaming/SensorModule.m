#import "SensorModule.h"
#import <CoreMotion/CoreMotion.h>

@implementation SensorModule {
    CMMotionManager *_motionManager;
    bool _hasListeners;
    double _lastX;
    double _lastY;
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
        _lastX = 0;
        _lastY = 0;
        _hasListeners = NO;
    }
    return self;
}

- (void)startObserving
{
    _hasListeners = YES;
}

- (void)stopObserving
{
    _hasListeners = NO;
}

RCT_EXPORT_METHOD(startSensor:(nonnull NSNumber *)sensitivity)
{
    self.customSensitivity = [sensitivity doubleValue];
    
    if (self.motionManager.gyroAvailable) {
        self.motionManager.gyroUpdateInterval = 1.0 / 100.0;  // 100 Hz
        
        __weak typeof(self) weakSelf = self;
        [self.motionManager startGyroUpdatesToQueue:[NSOperationQueue mainQueue]
                                      withHandler:^(CMGyroData *gyroData, NSError *error) {
            if (error) {
                return;
            }
            
            __strong typeof(weakSelf) strongSelf = weakSelf;
            
            if (!strongSelf->_hasListeners) {
                return;
            }
            
            double sensitivity = (1 << 8) * strongSelf.customSensitivity / 100.0;
            
            double x = -gyroData.rotationRate.x;
            double y = gyroData.rotationRate.y;
            
            double nowX = sensitivity * x + strongSelf->_lastX;
            double nowY = sensitivity * y + strongSelf->_lastY;
            
            int roundX = round(nowX);
            int roundY = round(nowY);
            
            strongSelf->_lastX = nowX - roundX;
            strongSelf->_lastY = nowY - roundY;
            
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
            
            [strongSelf sendEventWithName:@"SensorData" body:@{
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
