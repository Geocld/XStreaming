package com.xstreaming.framegen;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.lsfg.android.session.NativeBridge;

public class FrameGenStatsModule extends ReactContextBaseJavaModule {
    public FrameGenStatsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "FrameGenStatsModule";
    }

    @ReactMethod
    public void getStats(Promise promise) {
        WritableMap stats = Arguments.createMap();
        try {
            stats.putDouble("generatedFrameCount", NativeBridge.getGeneratedFrameCount());
            stats.putDouble("postedFrameCount", NativeBridge.getPostedFrameCount());
            stats.putDouble("uniqueCaptureCount", NativeBridge.getUniqueCaptureCount());
            stats.putDouble("averageQueueMs", NativeBridge.getAverageQueueMs());
            stats.putDouble("averageLatencyMs", NativeBridge.getAverageLatencyMs());
        } catch (Throwable t) {
            stats.putDouble("generatedFrameCount", 0);
            stats.putDouble("postedFrameCount", 0);
            stats.putDouble("uniqueCaptureCount", 0);
            stats.putDouble("averageQueueMs", 0);
            stats.putDouble("averageLatencyMs", 0);
        }
        promise.resolve(stats);
    }
}
