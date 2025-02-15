#import <React/RCTBridgeModule.h>
#import <Security/Security.h>

@interface XalManager : NSObject <RCTBridgeModule>

@property (nonatomic, assign) SecKeyRef privateKey;
@property (nonatomic, assign) SecKeyRef publicKey;

@end 