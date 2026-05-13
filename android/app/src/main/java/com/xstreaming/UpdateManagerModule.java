package com.xstreaming;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateManagerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "UpdateManager";
    private static final String PROGRESS_EVENT_NAME = "UpdateManagerProgress";
    private static final String UPDATE_DIR_NAME = "updates";
    private static final long INSTALL_CLEANUP_DELAY_MS = 10 * 60 * 1000;
    private static final long UNKNOWN_TOTAL_EMIT_BYTES = 512 * 1024;

    private final ReactApplicationContext reactContext;

    public UpdateManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void downloadAndInstall(String apkUrl, String apkName, Promise promise) {
        if (apkUrl == null || apkUrl.trim().isEmpty()) {
            rejectPromise(promise, "INVALID_APK_URL", "APK download URL is empty", null);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !reactContext.getPackageManager().canRequestPackageInstalls()) {
            openInstallPermissionSettings();
            rejectPromise(
                    promise,
                    "INSTALL_PERMISSION_REQUIRED",
                    "Please allow XStreaming to install unknown apps, then try again",
                    null
            );
            return;
        }

        new Thread(() -> {
            File apkFile = null;
            try {
                File updateDir = new File(reactContext.getCacheDir(), UPDATE_DIR_NAME);
                if (!updateDir.exists() && !updateDir.mkdirs()) {
                    throw new IllegalStateException("Unable to create update cache directory");
                }

                cleanupUpdateDir(updateDir);

                String safeName = buildSafeApkName(apkName);
                apkFile = new File(updateDir, safeName);
                downloadFile(apkUrl, apkFile);
                sendProgress("installing", apkFile.length(), apkFile.length(), 1);
                installApk(apkFile);
                scheduleDelete(apkFile);
                sendProgress("completed", apkFile.length(), apkFile.length(), 1);
                resolvePromise(promise);
            } catch (Exception e) {
                if (apkFile != null && apkFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    apkFile.delete();
                }
                rejectPromise(promise, "AUTO_UPDATE_FAILED", e.getMessage(), e);
            }
        }).start();
    }

    private void resolvePromise(Promise promise) {
        UiThreadUtil.runOnUiThread(() -> promise.resolve(true));
    }

    private void rejectPromise(Promise promise, String code, String message, Throwable throwable) {
        UiThreadUtil.runOnUiThread(() -> {
            if (throwable == null) {
                promise.reject(code, message);
            } else {
                promise.reject(code, message, throwable);
            }
        });
    }

    private void openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + reactContext.getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        reactContext.startActivity(intent);
    }

    private String buildSafeApkName(String apkName) {
        String name = apkName == null ? "" : apkName.trim();
        if (name.isEmpty()) {
            name = "xstreaming-update.apk";
        }
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.toLowerCase().endsWith(".apk")) {
            name = name + ".apk";
        }
        return name;
    }

    private void cleanupUpdateDir(File updateDir) {
        File[] files = updateDir.listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (file.isFile() && file.getName().toLowerCase().endsWith(".apk")) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private void downloadFile(String apkUrl, File outputFile) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(apkUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(20 * 1000);
            connection.setReadTimeout(60 * 1000);
            connection.setInstanceFollowRedirects(true);
            connection.connect();

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException("Download failed with HTTP " + responseCode);
            }

            long totalBytes = connection.getContentLength();
            sendProgress("downloading", 0, totalBytes, totalBytes > 0 ? 0 : -1);

            try (
                    InputStream inputStream = connection.getInputStream();
                    FileOutputStream outputStream = new FileOutputStream(outputFile)
            ) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                long downloadedBytes = 0;
                int lastPercent = -1;
                long lastUnknownTotalEmitBytes = 0;
                while ((read = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, read);
                    downloadedBytes += read;
                    if (totalBytes > 0) {
                        int percent = (int) Math.floor(downloadedBytes * 100.0 / totalBytes);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            sendProgress(
                                    "downloading",
                                    downloadedBytes,
                                    totalBytes,
                                    Math.min(1, downloadedBytes * 1.0 / totalBytes)
                            );
                        }
                    } else if (downloadedBytes - lastUnknownTotalEmitBytes >= UNKNOWN_TOTAL_EMIT_BYTES) {
                        lastUnknownTotalEmitBytes = downloadedBytes;
                        sendProgress("downloading", downloadedBytes, totalBytes, -1);
                    }
                }
                outputStream.flush();
                sendProgress("downloading", downloadedBytes, totalBytes, totalBytes > 0 ? 1 : -1);
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void sendProgress(String status, long downloadedBytes, long totalBytes, double progress) {
        WritableMap params = Arguments.createMap();
        params.putString("status", status);
        params.putDouble("downloadedBytes", downloadedBytes);
        params.putDouble("totalBytes", totalBytes);
        params.putDouble("progress", progress);
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(PROGRESS_EVENT_NAME, params);
    }

    private void installApk(File apkFile) {
        Context context = reactContext.getApplicationContext();
        String authority = context.getPackageName() + ".provider";
        Uri apkUri = FileProvider.getUriForFile(context, authority, apkFile);

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        PackageManager packageManager = context.getPackageManager();
        for (android.content.pm.ResolveInfo resolveInfo :
                packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)) {
            context.grantUriPermission(
                    resolveInfo.activityInfo.packageName,
                    apkUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        }

        reactContext.startActivity(intent);
    }

    private void scheduleDelete(File apkFile) {
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            if (apkFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                apkFile.delete();
            }
        }, INSTALL_CLEANUP_DELAY_MS);
    }
}
