#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <GameController/GameController.h>
#import <UIKit/UIKit.h>

@interface GamepadManager : RCTEventEmitter <RCTBridgeModule>

@property (nonatomic, strong) NSString *currentScreen;
@property (nonatomic, strong) GCController *currentController;
@property (nonatomic, assign) BOOL hasGameController;

- (void)updateGamepadListEvent;

@end
