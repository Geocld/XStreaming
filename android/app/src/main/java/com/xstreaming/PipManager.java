package com.xstreaming;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

public class PipManager extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactApplicationContext;

    public PipManager(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactApplicationContext = reactContext;
    }

    @Override
    public String getName() {
        return "PipManager";
    }

    private boolean supportsPiPMode(Activity activity) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    @ReactMethod
    public void setAutoPipEnabled(boolean enabled) {
        Activity activity = reactApplicationContext.getCurrentActivity();
        if (activity instanceof MainActivity) {
            UiThreadUtil.runOnUiThread(() -> ((MainActivity) activity).setAutoPipEnabled(enabled));
        }
    }

    @ReactMethod
    public void enterPipMode(Promise promise) {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = reactApplicationContext.getCurrentActivity();
            if (activity == null || !supportsPiPMode(activity)) {
                promise.resolve(false);
                return;
            }

            if (activity instanceof MainActivity) {
                promise.resolve(((MainActivity) activity).enterPipModeIfPossible());
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    if (activity.isInPictureInPictureMode()) {
                        promise.resolve(true);
                        return;
                    }
                    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                    builder.setAspectRatio(new Rational(16, 9));
                    promise.resolve(activity.enterPictureInPictureMode(builder.build()));
                    return;
                } catch (RuntimeException ignored) {
                }
            }
            promise.resolve(false);
        });
    }
}
