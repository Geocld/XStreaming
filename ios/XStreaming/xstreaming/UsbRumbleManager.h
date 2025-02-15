#import <React/RCTBridgeModule.h>
#import <GameController/GameController.h>

@interface UsbRumbleManager : NSObject <RCTBridgeModule>

@property (nonatomic, assign) BOOL bindUsbDevice;
@property (nonatomic, assign) BOOL hasValidUsbDevice;
@property (nonatomic, strong) NSString *usbController;

@end 