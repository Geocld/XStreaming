#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <CoreMotion/CoreMotion.h>

@interface SensorModule : RCTEventEmitter <RCTBridgeModule>

@property (nonatomic, strong) CMMotionManager *motionManager;
@property (nonatomic, assign) double customSensitivity;

@end 