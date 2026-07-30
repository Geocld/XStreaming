package com.xstreaming;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class TitleShortcutManagerModule extends ReactContextBaseJavaModule {
    public static final String MODULE_NAME = "ShortcutManager";
    public static final String ACTION_OPEN_TITLE_DETAIL = "com.xstreaming.OPEN_TITLE_DETAIL";
    public static final String EVENT_OPEN_TITLE_SHORTCUT = "onTitleShortcutOpen";

    private static final String EXTRA_PRODUCT_ID = "productId";
    private static final String EXTRA_TITLE_ID = "titleId";
    private static final String EXTRA_XCLOUD_TITLE_ID = "xCloudTitleId";
    private static final String EXTRA_TITLE_NAME = "titleName";

    private final ReactApplicationContext reactContext;

    public TitleShortcutManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void addTitleShortcut(ReadableMap options, Promise promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("UNSUPPORTED_ANDROID_VERSION", "Pinned shortcuts require Android 8.0 or later");
            return;
        }

        android.content.pm.ShortcutManager shortcutManager =
                reactContext.getSystemService(android.content.pm.ShortcutManager.class);
        if (shortcutManager == null || !shortcutManager.isRequestPinShortcutSupported()) {
            promise.reject("SHORTCUT_UNSUPPORTED", "The current launcher does not support pinned shortcuts");
            return;
        }

        String productId = getString(options, EXTRA_PRODUCT_ID);
        String titleName = getString(options, EXTRA_TITLE_NAME);
        if (TextUtils.isEmpty(productId)) {
            promise.reject("MISSING_PRODUCT_ID", "productId is required");
            return;
        }
        if (TextUtils.isEmpty(titleName)) {
            titleName = "XStreaming";
        }

        try {
            Context context = reactContext.getApplicationContext();
            Intent intent = new Intent(context, MainActivity.class);
            intent.setAction(ACTION_OPEN_TITLE_DETAIL);
            intent.putExtra(EXTRA_PRODUCT_ID, productId);
            intent.putExtra(EXTRA_TITLE_ID, getString(options, EXTRA_TITLE_ID));
            intent.putExtra(EXTRA_XCLOUD_TITLE_ID, getString(options, EXTRA_XCLOUD_TITLE_ID));
            intent.putExtra(EXTRA_TITLE_NAME, titleName);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            String shortcutId = "title-detail-" + productId;
            ShortcutInfo shortcutInfo = new ShortcutInfo.Builder(context, shortcutId)
                    .setShortLabel(titleName)
                    .setLongLabel(titleName)
                    .setIcon(Icon.createWithResource(context, R.mipmap.ic_launcher))
                    .setIntent(intent)
                    .build();

            boolean requested = shortcutManager.requestPinShortcut(shortcutInfo, null);
            if (!requested) {
                promise.reject("CREATE_SHORTCUT_FAILED", "Launcher did not accept shortcut request");
                return;
            }

            WritableMap result = Arguments.createMap();
            result.putBoolean("requested", true);
            result.putString("shortcutId", shortcutId);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("CREATE_SHORTCUT_FAILED", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getInitialShortcut(Promise promise) {
        Activity activity = getCurrentActivity();
        Intent intent = activity != null ? activity.getIntent() : null;
        promise.resolve(createShortcutParams(intent));
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Required by NativeEventEmitter.
    }

    @Nullable
    public static WritableMap createShortcutParams(@Nullable Intent intent) {
        if (intent == null || !ACTION_OPEN_TITLE_DETAIL.equals(intent.getAction())) {
            return null;
        }

        String productId = intent.getStringExtra(EXTRA_PRODUCT_ID);
        if (TextUtils.isEmpty(productId)) {
            return null;
        }

        WritableMap params = Arguments.createMap();
        params.putString(EXTRA_PRODUCT_ID, productId);
        params.putString(EXTRA_TITLE_ID, intent.getStringExtra(EXTRA_TITLE_ID));
        params.putString(EXTRA_XCLOUD_TITLE_ID, intent.getStringExtra(EXTRA_XCLOUD_TITLE_ID));
        params.putString(EXTRA_TITLE_NAME, intent.getStringExtra(EXTRA_TITLE_NAME));
        return params;
    }

    private String getString(ReadableMap map, String key) {
        if (map == null || !map.hasKey(key) || map.isNull(key)) {
            return "";
        }
        return map.getString(key);
    }
}
