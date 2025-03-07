#import "FullScreenManager.h"

@implementation FullScreenManager

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
    return YES;
}

RCT_EXPORT_METHOD(immersiveModeOn)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = UIApplication.sharedApplication.keyWindow;
        
        // 隐藏状态栏
        if (@available(iOS 13.0, *)) {
            UIWindowScene *windowScene = (UIWindowScene *)window.windowScene;
            UIStatusBarManager *statusBarManager = windowScene.statusBarManager;
            if ([statusBarManager respondsToSelector:@selector(setStatusBarHidden:withAnimation:)]) {
                [statusBarManager performSelector:@selector(setStatusBarHidden:withAnimation:)
                                    withObject:@YES
                                    withObject:@(UIStatusBarAnimationFade)];
            }
        } else {
            [[UIApplication sharedApplication] setStatusBarHidden:YES
                                                  withAnimation:UIStatusBarAnimationFade];
        }
        
        // 设置全屏
        UIViewController *rootViewController = window.rootViewController;
        [rootViewController setNeedsStatusBarAppearanceUpdate];
        
        // 隐藏底部 Home 指示器（如果设备有的话）
        if (@available(iOS 11.0, *)) {
            window.rootViewController.additionalSafeAreaInsets = UIEdgeInsetsZero;
            if ([window.rootViewController respondsToSelector:@selector(setNeedsUpdateOfHomeIndicatorAutoHidden)]) {
                [window.rootViewController setNeedsUpdateOfHomeIndicatorAutoHidden];
            }
        }
    });
}

RCT_EXPORT_METHOD(immersiveModeOff)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = UIApplication.sharedApplication.keyWindow;
        
        // 显示状态栏
        if (@available(iOS 13.0, *)) {
            UIWindowScene *windowScene = (UIWindowScene *)window.windowScene;
            UIStatusBarManager *statusBarManager = windowScene.statusBarManager;
            if ([statusBarManager respondsToSelector:@selector(setStatusBarHidden:withAnimation:)]) {
                [statusBarManager performSelector:@selector(setStatusBarHidden:withAnimation:)
                                    withObject:@NO
                                    withObject:@(UIStatusBarAnimationFade)];
            }
        } else {
            [[UIApplication sharedApplication] setStatusBarHidden:NO
                                                  withAnimation:UIStatusBarAnimationFade];
        }
        
        // 恢复正常显示
        UIViewController *rootViewController = window.rootViewController;
        [rootViewController setNeedsStatusBarAppearanceUpdate];
        
        // 显示底部 Home 指示器（如果设备有的话）
        if (@available(iOS 11.0, *)) {
            if ([window.rootViewController respondsToSelector:@selector(setNeedsUpdateOfHomeIndicatorAutoHidden)]) {
                [window.rootViewController setNeedsUpdateOfHomeIndicatorAutoHidden];
            }
        }
    });
}

RCT_EXPORT_METHOD(onFullScreen)
{
    [self immersiveModeOn];
}

RCT_EXPORT_METHOD(offFullScreen)
{
    [self immersiveModeOff];
}

@end