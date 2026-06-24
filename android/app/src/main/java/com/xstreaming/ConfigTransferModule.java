package com.xstreaming;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class ConfigTransferModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "ConfigTransferModule";
    private static final String EXPORT_DIR_NAME = "exports";
    private static final int IMPORT_CONFIG_REQUEST_CODE = 7301;

    private final ReactApplicationContext reactContext;
    private Promise importPromise;

    private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, @Nullable Intent data) {
            if (requestCode != IMPORT_CONFIG_REQUEST_CODE) {
                return;
            }

            Promise promise = importPromise;
            importPromise = null;
            if (promise == null) {
                return;
            }

            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
                promise.reject("USER_CANCEL", "User canceled");
                return;
            }

            new Thread(() -> {
                try {
                    String content = readUriContent(data.getData());
                    UiThreadUtil.runOnUiThread(() -> promise.resolve(content));
                } catch (Exception e) {
                    UiThreadUtil.runOnUiThread(() ->
                            promise.reject("IMPORT_CONFIG_FAILED", e.getMessage(), e));
                }
            }).start();
        }
    };

    public ConfigTransferModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.reactContext.addActivityEventListener(activityEventListener);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void createAndShareConfigFile(String fileName, String content, Promise promise) {
        if (content == null || content.trim().isEmpty()) {
            promise.reject("EMPTY_CONFIG", "Config content is empty");
            return;
        }

        new Thread(() -> {
            try {
                File exportDir = new File(reactContext.getCacheDir(), EXPORT_DIR_NAME);
                if (!exportDir.exists() && !exportDir.mkdirs()) {
                    throw new IllegalStateException("Unable to create export cache directory");
                }

                String safeName = buildSafeJsonName(fileName);
                File configFile = new File(exportDir, safeName);
                try (FileOutputStream outputStream = new FileOutputStream(configFile)) {
                    outputStream.write(content.getBytes(StandardCharsets.UTF_8));
                }

                Uri uri = FileProvider.getUriForFile(
                        reactContext,
                        reactContext.getPackageName() + ".provider",
                        configFile
                );

                UiThreadUtil.runOnUiThread(() -> {
                    try {
                        Intent shareIntent = new Intent(Intent.ACTION_SEND);
                        shareIntent.setType("application/json");
                        shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                        shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                        Intent chooser = Intent.createChooser(shareIntent, safeName);
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        reactContext.startActivity(chooser);
                        promise.resolve(configFile.getAbsolutePath());
                    } catch (Exception e) {
                        promise.reject("SHARE_CONFIG_FAILED", e.getMessage(), e);
                    }
                });
            } catch (Exception e) {
                UiThreadUtil.runOnUiThread(() ->
                        promise.reject("EXPORT_CONFIG_FAILED", e.getMessage(), e));
            }
        }).start();
    }

    @ReactMethod
    public void importConfigFile(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null || activity.isFinishing()) {
            promise.reject("NO_ACTIVITY", "Current activity is not available");
            return;
        }

        if (importPromise != null) {
            promise.reject("IMPORT_IN_PROGRESS", "Another import is already in progress");
            return;
        }

        importPromise = promise;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/json", "text/plain"});
            activity.startActivityForResult(intent, IMPORT_CONFIG_REQUEST_CODE);
        } catch (Exception e) {
            importPromise = null;
            promise.reject("OPEN_DOCUMENT_FAILED", e.getMessage(), e);
        }
    }

    private String readUriContent(Uri uri) throws Exception {
        try (InputStream inputStream = reactContext.getContentResolver().openInputStream(uri)) {
            if (inputStream == null) {
                throw new IllegalStateException("Unable to open selected file");
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
            return outputStream.toString("UTF-8");
        }
    }

    private String buildSafeJsonName(String fileName) {
        String name = fileName == null ? "" : fileName.trim();
        if (name.isEmpty()) {
            name = "xstreaming_export.json";
        }
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!name.toLowerCase().endsWith(".json")) {
            name = name + ".json";
        }
        return name;
    }
}
