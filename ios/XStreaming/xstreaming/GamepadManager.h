#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <GameController/GameController.h>

@interface GamepadManager : RCTEventEmitter <RCTBridgeModule>

@property (nonatomic, strong) NSString *currentScreen;
@property (nonatomic, strong) GCController *currentController;
@property (nonatomic, assign) BOOL hasGameController;

- (void)setupGameController;
- (void)handleControllerDidConnect:(NSNotification *)notification;
- (void)handleControllerDidDisconnect:(NSNotification *)notification;

@end 