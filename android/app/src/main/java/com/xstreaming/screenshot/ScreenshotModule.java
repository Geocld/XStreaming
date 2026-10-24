package com.xstreaming.screenshot;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.MediaStore;
import android.view.PixelCopy;
import android.view.Surface;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ScreenshotModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "ScreenshotModule";

    public ScreenshotModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void captureScreen(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null");
            return;
        }

        activity.runOnUiThread(() -> {
            View decorView = activity.getWindow().getDecorView();
            SurfaceView surfaceView = findActiveSurfaceView(decorView);
            if (surfaceView == null) {
                promise.reject("NO_SURFACE", "No active video surface found");
                return;
            }

            int width = surfaceView.getWidth();
            int height = surfaceView.getHeight();
            if (width <= 0 || height <= 0) {
                promise.reject("INVALID_SIZE", "SurfaceView size is invalid");
                return;
            }

            Surface surface = surfaceView.getHolder().getSurface();
            if (surface == null || !surface.isValid()) {
                promise.reject("INVALID_SURFACE", "Surface is not valid");
                return;
            }

            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);

            HandlerThread handlerThread = new HandlerThread("PixelCopyThread");
            handlerThread.start();
            Handler handler = new Handler(handlerThread.getLooper());

            PixelCopy.request(surfaceView, bitmap, copyResult -> {
                if (copyResult == PixelCopy.SUCCESS) {
                    try {
                        String savedPath = saveBitmap(bitmap);
                        promise.resolve(savedPath);
                    } catch (Exception e) {
                        promise.reject("SAVE_FAILED", e.getMessage(), e);
                    }
                } else {
                    promise.reject("COPY_FAILED", "PixelCopy failed: " + copyResult);
                }
                bitmap.recycle();
                handlerThread.quitSafely();
            }, handler);
        });
    }

    private SurfaceView findActiveSurfaceView(View root) {
        List<SurfaceView> list = new ArrayList<>();
        collectSurfaceViews(root, list);
        if (list.isEmpty()) {
            return null;
        }

        SurfaceView selected = null;
        int maxArea = 0;

        for (SurfaceView sv : list) {
            if (!sv.isShown() || sv.getVisibility() != View.VISIBLE || sv.getAlpha() <= 0.1f) {
                continue;
            }
            Surface surface = sv.getHolder().getSurface();
            if (surface == null || !surface.isValid()) {
                continue;
            }
            int w = sv.getWidth();
            int h = sv.getHeight();
            if (w <= 1 || h <= 1) {
                continue;
            }

            if (sv.getClass().getSimpleName().contains("GLSurfaceView") && sv.getAlpha() > 0.5f) {
                return sv;
            }

            int area = w * h;
            if (area > maxArea) {
                maxArea = area;
                selected = sv;
            }
        }
        return selected;
    }

    private void collectSurfaceViews(View view, List<SurfaceView> list) {
        if (view == null) {
            return;
        }
        if (view instanceof SurfaceView) {
            list.add((SurfaceView) view);
        }
        if (view instanceof ViewGroup) {
            ViewGroup vg = (ViewGroup) view;
            int count = vg.getChildCount();
            for (int i = 0; i < count; i++) {
                collectSurfaceViews(vg.getChildAt(i), list);
            }
        }
    }

    private String saveBitmap(Bitmap bitmap) throws IOException {
        Context context = getReactApplicationContext();
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String fileName = "screenshot_" + timeStamp + ".png";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + "XStreaming");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);

                ContentResolver resolver = context.getContentResolver();
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out != null && bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                            values.clear();
                            values.put(MediaStore.Images.Media.IS_PENDING, 0);
                            resolver.update(uri, values, null, null);
                            return Environment.DIRECTORY_PICTURES + File.separator + "XStreaming" + File.separator + fileName;
                        }
                    }
                }
            } catch (Throwable ignored) {
            }
        }

        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "XStreaming");
        if (!dir.exists() && !dir.mkdirs()) {
            dir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        }
        File file = new File(dir, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                throw new IOException("Failed to write screenshot data");
            }
        }
        MediaScannerConnection.scanFile(
                context,
                new String[]{file.getAbsolutePath()},
                new String[]{"image/png"},
                null
        );
        return file.getAbsolutePath();
    }
}
