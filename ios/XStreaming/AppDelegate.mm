#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"xstreaming";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  // 添加这些代码来设置开发服务器地址
  NSString *localhost = @"172.25.148.34"; // 比如 @"192.168.1.100"
  NSString *urlString = [NSString stringWithFormat:@"http://%@:8081/index.bundle?platform=ios", localhost];
  return [NSURL URLWithString:urlString];
  // 或者使用原来的代码
//  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];g
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

