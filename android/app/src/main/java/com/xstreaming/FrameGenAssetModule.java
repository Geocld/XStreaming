package com.xstreaming;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public final class FrameGenAssetModule extends ReactContextBaseJavaModule {
    private static final int IMPORT_REQUEST_CODE = 7312;
    private static final String DLL_FILENAME = "Lossless.dll";

    private final ReactApplicationContext reactContext;
    private Promise importPromise;

    private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(
                Activity activity,
                int requestCode,
                int resultCode,
                @Nullable Intent data
        ) {
            if (requestCode != IMPORT_REQUEST_CODE) {
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
            Uri uri = data.getData();
            new Thread(() -> importDll(uri, promise), "xstreaming-dll-import").start();
        }
    };

    FrameGenAssetModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
        context.addActivityEventListener(activityEventListener);
    }

    @Override
    public String getName() {
        return "FrameGenAssetModule";
    }

    @ReactMethod
    public void isLosslessDllImported(Promise promise) {
        File dll = getDllFile();
        promise.resolve(dll.isFile() && dll.length() > 0);
    }

    @ReactMethod
    public void importLosslessDll(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null || activity.isFinishing()) {
            promise.reject("NO_ACTIVITY", "Current activity is unavailable");
            return;
        }
        if (importPromise != null) {
            promise.reject("IMPORT_IN_PROGRESS", "A DLL import is already in progress");
            return;
        }
        importPromise = promise;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            activity.startActivityForResult(intent, IMPORT_REQUEST_CODE);
        } catch (Exception e) {
            importPromise = null;
            promise.reject("OPEN_DOCUMENT_FAILED", e.getMessage(), e);
        }
    }

    private void importDll(Uri uri, Promise promise) {
        File destination = getDllFile();
        File temporary = new File(destination.getParentFile(), DLL_FILENAME + ".importing");
        try {
            String displayName = getDisplayName(uri);
            if (!DLL_FILENAME.equalsIgnoreCase(displayName)) {
                throw new IllegalArgumentException("Selected file must be named " + DLL_FILENAME);
            }
            File parent = destination.getParentFile();
            if (!parent.isDirectory() && !parent.mkdirs()) {
                throw new IllegalStateException("Unable to create private frame generation directory");
            }

            try (InputStream input = reactContext.getContentResolver().openInputStream(uri);
                 FileOutputStream output = new FileOutputStream(temporary)) {
                if (input == null) {
                    throw new IllegalStateException("Unable to read selected file");
                }
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.getFD().sync();
            }
            if (temporary.length() == 0) {
                throw new IllegalArgumentException("Selected DLL is empty");
            }
            File backup = new File(destination.getParentFile(), DLL_FILENAME + ".previous");
            if (backup.exists() && !backup.delete()) {
                throw new IllegalStateException("Unable to clean previous DLL backup");
            }
            boolean hadDestination = destination.exists();
            if (hadDestination && !destination.renameTo(backup)) {
                throw new IllegalStateException("Unable to stage existing DLL");
            }
            if (!temporary.renameTo(destination)) {
                if (hadDestination) {
                    //noinspection ResultOfMethodCallIgnored
                    backup.renameTo(destination);
                }
                throw new IllegalStateException("Unable to store imported DLL");
            }
            if (backup.exists()) {
                //noinspection ResultOfMethodCallIgnored
                backup.delete();
            }
            clearShaderCache();
            UiThreadUtil.runOnUiThread(() -> promise.resolve(true));
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            UiThreadUtil.runOnUiThread(() ->
                    promise.reject("DLL_IMPORT_FAILED", e.getMessage(), e));
        }
    }

    private String getDisplayName(Uri uri) {
        try (Cursor cursor = reactContext.getContentResolver().query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    return cursor.getString(column);
                }
            }
        }
        return null;
    }

    private File getDllFile() {
        return new File(
                new File(reactContext.getFilesDir(), "framegen"),
                DLL_FILENAME
        );
    }

    private void clearShaderCache() {
        File cache = new File(reactContext.getFilesDir(), "spirv");
        deleteRecursively(cache);
    }

    private void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
