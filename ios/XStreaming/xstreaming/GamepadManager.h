#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <GameController/GameController.h>
#import <UIKit/UIKit.h>

@interface GamepadManager : RCTEventEmitter <RCTBridgeModule>

@property (nonatomic, strong) NSString *currentScreen;
@property (nonatomic, strong) GCController *currentController;
@property (nonatomic, assign) BOOL hasGameController;

#define LI_CTYPE_UNKNOWN  0x00
#define LI_CTYPE_XBOX     0x01
#define LI_CTYPE_PS       0x02
#define LI_CTYPE_NINTENDO 0x03
#define LI_CCAP_ANALOG_TRIGGERS 0x01 // Reports values between 0x00 and 0xFF for trigger axes
#define LI_CCAP_RUMBLE          0x02 // Can rumble in response to ConnListenerRumble() callback
#define LI_CCAP_TRIGGER_RUMBLE  0x04 // Can rumble triggers in response to ConnListenerRumbleTriggers() callback
#define LI_CCAP_TOUCHPAD        0x08 // Reports touchpad events via LiSendControllerTouchEvent()
#define LI_CCAP_ACCEL           0x10 // Can report accelerometer events via LiSendControllerMotionEvent()
#define LI_CCAP_GYRO            0x20 // Can report gyroscope events via LiSendControllerMotionEvent()
#define LI_CCAP_BATTERY_STATE   0x40 // Reports battery state via LiSendControllerBatteryEvent()
#define LI_CCAP_RGB_LED         0x80 // Can set RGB LED state via ConnListenerSetControllerLED()

// Button flags
#define A_FLAG     0x1000
#define B_FLAG     0x2000
#define X_FLAG     0x4000
#define Y_FLAG     0x8000
#define UP_FLAG    0x0001
#define DOWN_FLAG  0x0002
#define LEFT_FLAG  0x0004
#define RIGHT_FLAG 0x0008
#define LB_FLAG    0x0100
#define RB_FLAG    0x0200
#define PLAY_FLAG  0x0010
#define BACK_FLAG  0x0020
#define LS_CLK_FLAG  0x0040
#define RS_CLK_FLAG  0x0080
#define SPECIAL_FLAG 0x0400

// Extended buttons (Sunshine only)
#define PADDLE1_FLAG  0x010000
#define PADDLE2_FLAG  0x020000
#define PADDLE3_FLAG  0x040000
#define PADDLE4_FLAG  0x080000
#define TOUCHPAD_FLAG 0x100000 // Touchpad buttons on Sony controllers
#define MISC_FLAG     0x200000 // Share/Mic/Capture/Mute buttons on various controllers

@end
