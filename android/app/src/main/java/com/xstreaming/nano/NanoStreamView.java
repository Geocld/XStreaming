package com.xstreaming.nano;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class NanoStreamView extends FrameLayout implements SurfaceHolder.Callback {
    private static final String TAG = "NanoStreamView";
    private final ReactContext reactContext;
    private final SurfaceView surfaceView;
    private final TextView statusView;
    private final NanoRustBridge rustBridge;
    private final Handler statsHandler = new Handler(Looper.getMainLooper());
    private final Runnable statsTicker = new Runnable() {
        @Override
        public void run() {
            emitState("stats");
            if (statsTickerRunning) {
                statsHandler.postDelayed(this, 1000);
            }
        }
    };

    private boolean showStatus = true;
    private boolean statsTickerRunning = false;
    private String sessionId = "";
    private String streamType = "";
    private String renderEngine = "nano";
    private String baseUri = "";
    private String gsToken = "";
    private String webToken = "";
    private String preferredLanguage = "";
    private String iceServerUrl = "";
    private String iceServerUsername = "";
    private String iceServerCredential = "";
    private int resolution = 1080;
    private boolean stereoAudioEnabled = false;
    private boolean hasWebToken = false;
    private boolean hasStreamingTokens = false;
    private boolean authContextReady = false;
    private boolean surfaceReady = false;
    private int surfaceWidth = 0;
    private int surfaceHeight = 0;

    public NanoStreamView(Context context) {
        super(context);
        Log.i(TAG, "create NanoStreamView");
        reactContext = (ReactContext) context;
        rustBridge = new NanoRustBridge();
        rustBridge.setRumbleListener(this::emitRumble);
        setBackgroundColor(Color.BLACK);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setDescendantFocusability(FOCUS_AFTER_DESCENDANTS);

        surfaceView = new SurfaceView(context);
        surfaceView.setLayoutParams(
                new LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );
        surfaceView.setZOrderOnTop(false);
        surfaceView.setZOrderMediaOverlay(false);
        surfaceView.getHolder().addCallback(this);
        surfaceView.getHolder().setFormat(PixelFormat.OPAQUE);
        addView(surfaceView);

        statusView = new TextView(context);
        LayoutParams statusParams = new LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.gravity = Gravity.START | Gravity.TOP;
        statusParams.leftMargin = dp(12);
        statusParams.topMargin = dp(12);
        statusView.setLayoutParams(statusParams);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        statusView.setPadding(dp(10), dp(6), dp(10), dp(6));
        statusView.setBackgroundColor(0x66000000);
        addView(statusView);

        updateStatusText();
    }

    public void setShowStatus(boolean value) {
        showStatus = value;
        statusView.setVisibility(showStatus ? VISIBLE : GONE);
    }

    public void setStreamInfo(@Nullable ReadableMap streamInfo) {
        Log.i(TAG, "setStreamInfo null=" + (streamInfo == null));
        if (streamInfo == null) {
            sessionId = "";
            streamType = "";
            renderEngine = "nano";
            baseUri = "";
            gsToken = "";
            webToken = "";
            preferredLanguage = "";
            iceServerUrl = "";
            iceServerUsername = "";
            iceServerCredential = "";
            resolution = 1080;
            stereoAudioEnabled = false;
            hasWebToken = false;
            hasStreamingTokens = false;
            authContextReady = false;
            updateStatusText();
            return;
        }

        if (streamInfo.hasKey("sessionId")) {
            sessionId = safeString(streamInfo, "sessionId");
        } else if (streamInfo.hasKey("titleId")) {
            sessionId = safeString(streamInfo, "titleId");
        }
        streamType = safeString(streamInfo, "streamType");
        renderEngine = safeString(streamInfo, "render_engine");
        if (renderEngine == null || renderEngine.isEmpty()) {
            renderEngine = "nano";
        }
        ReadableMap settings = safeMap(streamInfo, "settings");
        resolution = safeInt(settings, "resolution", 1080);
        preferredLanguage = safeString(settings, "preferred_game_language");
        iceServerUrl = safeString(settings, "server_url");
        iceServerUsername = safeString(settings, "server_username");
        iceServerCredential = safeString(settings, "server_credential");
        stereoAudioEnabled = safeBoolean(settings, "enable_stereo_audio", false);
        boolean coop = safeBoolean(settings, "coop", false);
        baseUri = safeString(streamInfo, "baseUri");
        gsToken = safeString(streamInfo, "gsToken");
        ReadableMap authInfo = safeMap(streamInfo, "auth");
        webToken = safeString(authInfo, "connectUserToken");
        ReadableMap webTokenMap = safeMap(authInfo, "webToken");
        if (webToken.isEmpty()) {
            ReadableMap webTokenData = safeMap(webTokenMap, "data");
            webToken = safeString(webTokenData, "Token");
            if (webToken.isEmpty()) {
                webToken = safeString(webTokenMap, "raw");
            }
        }
        hasWebToken = !webToken.isEmpty();

        ReadableMap streamingTokens = safeMap(authInfo, "streamingTokens");
        if (baseUri.isEmpty() || gsToken.isEmpty()) {
            ReadableMap selectedToken = selectStreamingToken(streamingTokens, streamType);
            ReadableMap selectedTokenData = safeMap(selectedToken, "data");
            if (selectedTokenData == null) {
                selectedTokenData = selectedToken;
            }
            if (gsToken.isEmpty()) {
                gsToken = safeString(selectedTokenData, "gsToken");
            }
            if (baseUri.isEmpty()) {
                baseUri = extractBaseUri(selectedTokenData);
            }
        }
        hasStreamingTokens = !gsToken.isEmpty() && !baseUri.isEmpty();
        authContextReady = hasWebToken || hasStreamingTokens;
        Log.i(TAG, "streamInfo parsed session=" + sessionId
                + " type=" + streamType
                + " engine=" + renderEngine
                + " authReady=" + authContextReady
                + " hasStreamingTokens=" + hasStreamingTokens
                + " hasWebToken=" + hasWebToken
                + " surfaceReady=" + surfaceReady);
        rustBridge.updateStreamInfo(
                sessionId,
                streamType,
                renderEngine,
                baseUri,
                gsToken,
                webToken,
                resolution,
                preferredLanguage,
                iceServerUrl,
                iceServerUsername,
                iceServerCredential,
                stereoAudioEnabled,
                coop,
                hasWebToken,
                hasStreamingTokens,
                authContextReady);
        updateStatusText();
        emitState("streamInfo");
    }

    public void setStatusText(@Nullable String text) {
        if (text == null || text.isEmpty()) {
            updateStatusText();
            return;
        }
        statusView.setText(text);
        emitState("statusText");
    }

    public void startSession() {
        Log.i(TAG, "startSession requested");
        setStatusText(buildStatusText("Starting nano session"));
        startStatsTicker();
        rustBridge.start();
        requestFocus();
        emitState("startSession");
    }

    public void stopSession() {
        Log.i(TAG, "stopSession requested");
        rustBridge.stop();
        stopStatsTicker();
        setStatusText(buildStatusText("Nano session stopped"));
        emitState("stopSession");
    }

    public void requestNanoFocus() {
        requestFocus();
        emitState("requestFocus");
    }

    public void sendGamepadState(@Nullable ReadableMap gamepadState) {
        if (gamepadState == null) {
            return;
        }

        rustBridge.sendGamepadState(
                safeGamepadIndex(gamepadState),
                safeButton(gamepadState, "Nexus"),
                safeButton(gamepadState, "Menu"),
                safeButton(gamepadState, "View"),
                safeButton(gamepadState, "A"),
                safeButton(gamepadState, "B"),
                safeButton(gamepadState, "X"),
                safeButton(gamepadState, "Y"),
                safeButton(gamepadState, "DPadUp"),
                safeButton(gamepadState, "DPadDown"),
                safeButton(gamepadState, "DPadLeft"),
                safeButton(gamepadState, "DPadRight"),
                safeButton(gamepadState, "LeftShoulder"),
                safeButton(gamepadState, "RightShoulder"),
                safeButton(gamepadState, "LeftThumb"),
                safeButton(gamepadState, "RightThumb"),
                safeFloat(gamepadState, "LeftThumbXAxis"),
                safeFloat(gamepadState, "LeftThumbYAxis"),
                safeFloat(gamepadState, "RightThumbXAxis"),
                safeFloat(gamepadState, "RightThumbYAxis"),
                safeTrigger(gamepadState, "LeftTrigger"),
                safeTrigger(gamepadState, "RightTrigger"));
        // Log.i(TAG, "sendGamepadState dispatched a=" + safeButton(gamepadState, "A")
        //         + " b=" + safeButton(gamepadState, "B")
        //         + " lx=" + safeFloat(gamepadState, "LeftThumbXAxis")
        //         + " ly=" + safeFloat(gamepadState, "LeftThumbYAxis")
        //         + " rt=" + safeTrigger(gamepadState, "RightTrigger"));
    }

    public android.view.Surface getOutputSurface() {
        return surfaceView.getHolder().getSurface();
    }

    public SurfaceHolder getOutputSurfaceHolder() {
        return surfaceView.getHolder();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        Log.i(TAG, "attached");
        setKeepScreenOn(true);
        requestFocus();
        startStatsTicker();
        emitState("attached");
    }

    @Override
    protected void onDetachedFromWindow() {
        try {
            Log.i(TAG, "detached");
            stopStatsTicker();
            rustBridge.setRumbleListener(null);
            rustBridge.stop();
            rustBridge.releaseSurface();
            rustBridge.release();
            emitState("detached");
        } finally {
            setKeepScreenOn(false);
            super.onDetachedFromWindow();
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        Log.i(TAG, "surfaceCreated");
        surfaceReady = true;
        rustBridge.bindSurface(holder.getSurface(), surfaceWidth, surfaceHeight);
        emitState("surfaceCreated");
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        Log.i(TAG, "surfaceChanged size=" + width + "x" + height + " format=" + format);
        surfaceWidth = width;
        surfaceHeight = height;
        rustBridge.bindSurface(holder.getSurface(), width, height);
        emitState("surfaceChanged");
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        Log.i(TAG, "surfaceDestroyed");
        surfaceReady = false;
        surfaceWidth = 0;
        surfaceHeight = 0;
        rustBridge.releaseSurface();
        emitState("surfaceDestroyed");
    }

    private void emitState(String reason) {
        if (getId() == -1) {
            return;
        }
        WritableMap event = Arguments.createMap();
        event.putString("reason", reason);
        event.putBoolean("surfaceReady", surfaceReady);
        event.putInt("surfaceWidth", surfaceWidth);
        event.putInt("surfaceHeight", surfaceHeight);
        event.putString("sessionId", sessionId);
        event.putString("streamType", streamType);
        event.putString("renderEngine", renderEngine);
        event.putString("statusText", statusView.getText().toString());
        event.putString("sessionStage", rustBridge.getSessionStage());
        event.putString("sessionStatusText", rustBridge.getSessionStatusText());
        event.putBoolean("terminalSessionError", rustBridge.hasTerminalSessionError());
        event.putBoolean("hasWebToken", hasWebToken);
        event.putBoolean("hasStreamingTokens", hasStreamingTokens);
        event.putBoolean("authContextReady", authContextReady);
        event.putDouble("queuedVideoFrames", (double) rustBridge.getQueuedVideoFrameCount());
        event.putDouble("renderedVideoFrames", (double) rustBridge.getRenderedVideoFrameCount());
        event.putDouble("queuedVideoBytes", (double) rustBridge.getQueuedVideoByteCount());
        event.putInt("videoWidth", rustBridge.getVideoWidth());
        event.putInt("videoHeight", rustBridge.getVideoHeight());
        event.putDouble("queuedAudioFrames", (double) rustBridge.getQueuedAudioFrameCount());
        event.putDouble("decodedAudioBuffers", (double) rustBridge.getDecodedAudioBufferCount());
        event.putDouble("webRtcRttMs", rustBridge.getWebRtcRttMs());
        event.putDouble("webRtcJitterMs", rustBridge.getWebRtcJitterMs());
        event.putDouble("webRtcFps", rustBridge.getWebRtcFps());
        event.putDouble("webRtcFramesDropped", rustBridge.getWebRtcFramesDropped());
        event.putDouble("webRtcFramesReceived", rustBridge.getWebRtcFramesReceived());
        event.putDouble("webRtcPacketsReceived", rustBridge.getWebRtcPacketsReceived());
        event.putDouble("webRtcPacketsLost", rustBridge.getWebRtcPacketsLost());
        event.putDouble("webRtcPacketLossPercent", rustBridge.getWebRtcPacketLossPercent());
        event.putDouble("webRtcBitrateMbps", rustBridge.getWebRtcBitrateMbps());
        event.putDouble("webRtcDecodeMs", rustBridge.getWebRtcDecodeMs());
        reactContext
                .getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), "topNativeStateChange", event);
    }

    private void emitRumble(
            double startDelay,
            int duration,
            int delayMs,
            int repeat,
            double weakMagnitude,
            double strongMagnitude,
            double leftTrigger,
            double rightTrigger) {
        statsHandler.post(() -> emitRumbleEvent(
                startDelay,
                duration,
                delayMs,
                repeat,
                weakMagnitude,
                strongMagnitude,
                leftTrigger,
                rightTrigger));
    }

    private void emitRumbleEvent(
            double startDelay,
            int duration,
            int delayMs,
            int repeat,
            double weakMagnitude,
            double strongMagnitude,
            double leftTrigger,
            double rightTrigger) {
        if (getId() == -1) {
            return;
        }
        WritableMap event = Arguments.createMap();
        event.putDouble("startDelay", startDelay);
        event.putDouble("duration", duration);
        event.putDouble("delayMs", delayMs);
        event.putDouble("repeat", repeat);
        event.putDouble("weakMagnitude", weakMagnitude);
        event.putDouble("strongMagnitude", strongMagnitude);
        event.putDouble("leftTrigger", leftTrigger);
        event.putDouble("rightTrigger", rightTrigger);
        reactContext
                .getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), "topNanoRumble", event);
    }

    private void startStatsTicker() {
        if (statsTickerRunning) {
            return;
        }
        statsTickerRunning = true;
        statsHandler.post(statsTicker);
    }

    private void stopStatsTicker() {
        statsTickerRunning = false;
        statsHandler.removeCallbacks(statsTicker);
    }

    private void updateStatusText() {
        statusView.setVisibility(showStatus ? VISIBLE : GONE);
        statusView.setText(buildStatusText(surfaceReady ? "Surface ready" : "Surface pending"));
        emitState("updateStatusText");
    }

    private String buildStatusText(String prefix) {
        StringBuilder builder = new StringBuilder(prefix);
        if (sessionId != null && !sessionId.isEmpty()) {
            builder.append(" | session=").append(sessionId);
        }
        if (streamType != null && !streamType.isEmpty()) {
            builder.append(" | type=").append(streamType);
        }
        if (renderEngine != null && !renderEngine.isEmpty()) {
            builder.append(" | engine=").append(renderEngine);
        }
        if (authContextReady) {
            builder.append(" | auth=ready");
        }
        return builder.toString();
    }

    private static String safeString(ReadableMap map, String key) {
        try {
            return map.hasKey(key) && !map.isNull(key) ? map.getString(key) : "";
        } catch (Exception e) {
            return "";
        }
    }

    @Nullable
    private static ReadableMap safeMap(@Nullable ReadableMap map, String key) {
        try {
            return map != null && map.hasKey(key) && !map.isNull(key) ? map.getMap(key) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static int safeButton(@Nullable ReadableMap map, String key) {
        return safeFloat(map, key) > 0.0f ? 1 : 0;
    }

    private static int safeGamepadIndex(@Nullable ReadableMap map) {
        try {
            if (map == null || !map.hasKey("GamepadIndex") || map.isNull("GamepadIndex")) {
                return 0;
            }
            return map.getInt("GamepadIndex");
        } catch (Exception e) {
            return 0;
        }
    }

    private static float safeTrigger(@Nullable ReadableMap map, String key) {
        return Math.max(0.0f, Math.min(1.0f, safeFloat(map, key)));
    }

    private static float safeFloat(@Nullable ReadableMap map, String key) {
        try {
            if (map == null || !map.hasKey(key) || map.isNull(key)) {
                return 0.0f;
            }
            return (float) map.getDouble(key);
        } catch (Exception e) {
            return 0.0f;
        }
    }

    private static boolean hasReadableMapValue(@Nullable ReadableMap map, String key) {
        try {
            return map != null && map.hasKey(key) && !map.isNull(key);
        } catch (Exception e) {
            return false;
        }
    }

    @Nullable
    private static ReadableMap selectStreamingToken(@Nullable ReadableMap streamingTokens, String streamType) {
        ReadableMap selected = null;
        if (streamingTokens == null) {
            return null;
        }
        if ("cloud".equals(streamType)) {
            selected = safeMap(streamingTokens, "xCloudToken");
        } else if ("home".equals(streamType)) {
            selected = safeMap(streamingTokens, "xHomeToken");
        }
        if (selected != null) {
            return selected;
        }
        selected = safeMap(streamingTokens, "xCloudToken");
        if (selected != null) {
            return selected;
        }
        return safeMap(streamingTokens, "xHomeToken");
    }

    private static String extractBaseUri(@Nullable ReadableMap tokenData) {
        if (tokenData == null) {
            return "";
        }
        ReadableMap offeringSettings = safeMap(tokenData, "offeringSettings");
        ReadableArray regions = safeArray(offeringSettings, "regions");
        if (regions != null) {
            String fallback = "";
            for (int i = 0; i < regions.size(); i++) {
                if (regions.isNull(i)) {
                    continue;
                }
                ReadableMap region = regions.getMap(i);
                if (region == null) {
                    continue;
                }
                String baseUri = safeString(region, "baseUri");
                if (baseUri.isEmpty()) {
                    continue;
                }
                if (fallback.isEmpty()) {
                    fallback = baseUri;
                }
                if (region.hasKey("isDefault") && !region.isNull("isDefault") && region.getBoolean("isDefault")) {
                    return baseUri;
                }
            }
            return fallback;
        }
        return safeString(tokenData, "baseUri");
    }

    @Nullable
    private static ReadableArray safeArray(@Nullable ReadableMap map, String key) {
        try {
            return map != null && map.hasKey(key) && !map.isNull(key) ? map.getArray(key) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static int safeInt(@Nullable ReadableMap map, String key, int fallback) {
        try {
            return map != null && map.hasKey(key) && !map.isNull(key) ? map.getInt(key) : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    private static boolean safeBoolean(@Nullable ReadableMap map, String key, boolean fallback) {
        try {
            return map != null && map.hasKey(key) && !map.isNull(key) ? map.getBoolean(key) : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
