
package com.xstreaming;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.NonNull;
import android.os.Looper;
import android.os.Handler;
import android.content.Context;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

@ReactModule(name = ScreenAudioRecorderModule.NAME)
public class ScreenAudioRecorderModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final int REQUEST_CODE = 1001; // Scegli un valore qualsiasi per il request code

    public static final String NAME = "ScreenAudioRecorder";
    private final ReactApplicationContext reactContext;

    private MediaProjectionManager mediaProjectionManager;
    private ScreenAudioRecorderService recordService;
    private MediaProjection mediaProjection;

    public static final int MEDIA_PROJECTION_REQUEST_CODE = 1001;

    public ScreenAudioRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.reactContext.addActivityEventListener(this);
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            ScreenAudioRecorderService.ScreenAudioRecorder binder = (ScreenAudioRecorderService.ScreenAudioRecorder) service;
            recordService = binder.getRecordService();
            Log.d(NAME, "Service connected, service connected ok");
        
            // Verifica se `mediaProjection` è impostato
            if (recordService != null) {
                // Imposta l'eventEmitter quando siamo sicuri che la connessione è stabilita
                recordService.setEventEmitter(reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class));
                Log.d(NAME, "EventEmitter set in onServiceConnected().");
        
                // Se `mediaProjection` è già stato impostato, puoi avviare l'audio subito
                if (mediaProjection != null) {
                    Log.d(NAME, "Service connected, starting audio capture...");
                    recordService.setMediaProjection(mediaProjection);
                    recordService.startAudioCapture();
                } else {
                    Log.e(NAME, "MediaProjection is null durante la connessione del servizio.");
                }
            } else {
                Log.e(NAME, "Failed to connect to service, recordService is null.");
            }
        }
        

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            recordService = null;
            Log.d(NAME, "Service disconnected.");
        }
    };

    @ReactMethod
    public void start() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            mediaProjectionManager = (MediaProjectionManager) getReactApplicationContext().getSystemService(Activity.MEDIA_PROJECTION_SERVICE);
            Intent captureIntent = mediaProjectionManager.createScreenCaptureIntent();
            Activity activity = getCurrentActivity();
            if (activity != null) {
                activity.startActivityForResult(captureIntent, MEDIA_PROJECTION_REQUEST_CODE);
               
                // chiamto
            } else {
                Log.e(NAME, "Activity is null, cannot request screen capture.");
            }
        } else {
            Log.e(NAME, "Android version is not supported for MediaProjection.");
        }
    }

    @ReactMethod
    public void stop() {
        if (recordService != null) {
            recordService.stopAudioCapture();
            reactContext.unbindService(connection);
            recordService = null;
            Log.d(NAME, "stoppato");

          // chiamato

        } 
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {

       // onActivityResult chiamatoi

        if (requestCode == REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                Log.d(NAME, "MediaProjection permission granted.");
                if (mediaProjectionManager != null) {
                    // Start the service in the foreground before using MediaProjection
                    Intent serviceIntent = new Intent(reactContext, ScreenAudioRecorderService.class);
                    reactContext.startForegroundService(serviceIntent);
                   
                    reactContext.bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE);
                    Log.d(NAME, "Service binding in corso...");

                    // Wait until the service is started before getting MediaProjection
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        Log.d(NAME, "Wait until the service is started before getting MediaProjection");
                        mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data);

                        for (Field field : mediaProjection.getClass().getDeclaredFields()) {
                            field.setAccessible(true);
                            try {
                                Log.d(NAME, "Field: " + field.getName() + ", Value: " + field.get(mediaProjection));
                            } catch (IllegalAccessException e) {
                                Log.e(NAME, "Cannot access field: " + field.getName(), e);
                            }
                        }

                        for (Method method : mediaProjection.getClass().getDeclaredMethods()) {
                            Log.d(NAME, "Method: " + method.getName());
                        }

                        if (mediaProjection == null) {
                            Log.e(NAME, "MediaProjection is null.");
                            return;
                        }

                        // Start audio capture using the MediaProjection
                        if (recordService != null) {
                            Log.d(NAME, "MediaProjection work.");

                            // record risulta diverso di null
                            recordService.setMediaProjection(mediaProjection);
                            recordService.startAudioCapture();
                        }
                    }, 500);  // Wait a bit to ensure the service is started properly
                }
            } else {
                Log.e(NAME, "Permission denied or Activity result is not OK.");
            }
        }
    }

    @Override
    public void onNewIntent(Intent intent) {}

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }
}
