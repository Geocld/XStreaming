package com.xstreaming;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.facebook.react.modules.core.DeviceEventManagerModule;

//@RequiresApi(api = Build.VERSION_CODES.UPSIDE_DOWN_CAKE) // Android 14 o superiore
public class ScreenAudioRecorderService extends Service {
    private static final int SERVICE_ID = 1;
    private static final String NOTIFICATION_CHANNEL_ID = "ScreenAudioRecorder";
    private static final String NOTIFICATION_CHANNEL_NAME = "Screen Audio Recorder Service";

    private MediaProjection mediaProjection;
    private AudioRecord recorder;
    private boolean isRecording;
    private int sampleRateInHz = 44100;
    private int channelConfig = AudioFormat.CHANNEL_IN_STEREO;
    private int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
    private int bufferSize;
    private DeviceEventManagerModule.RCTDeviceEventEmitter eventEmitter;

    @Override
    public IBinder onBind(Intent intent) {
        return new ScreenAudioRecorder();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // tutto chiamato onStartCommand
        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("Screen Audio Recording")
                .setContentText("Recording audio from your screen")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .build();

        // Avvio del servizio in primo piano con il tipo di Media Projection richiesto
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {


            startForeground(SERVICE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(SERVICE_ID, notification);

        }

        return START_NOT_STICKY;
    }

    public void startAudioCapture() {

        // startAudioCapture() viene chiamato
        if (mediaProjection == null) {
            Log.e("ScreenAudioRecorder", "MediaProjection is null. Cannot start audio capture.");
            return;
        }

        try {
            isRecording = true;

            Log.d("ScreenAudioRecorder", "Configuring AudioPlaybackCapture...");

            AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration
                    .Builder(mediaProjection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .build();

            bufferSize = AudioRecord.getMinBufferSize(sampleRateInHz, channelConfig, audioFormat);

            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                // TODO: Consider calling
                //    ActivityCompat#requestPermissions
                // here to request the missing permissions, and then overriding
                //   public void onRequestPermissionsResult(int requestCode, String[] permissions,
                //                                          int[] grantResults)
                // to handle the case where the user grants the permission. See the documentation
                // for ActivityCompat#requestPermissions for more details.
                return;
            }
            recorder = new AudioRecord
                    .Builder()
                    .setAudioPlaybackCaptureConfig(config)
                    .setAudioFormat(
                            new AudioFormat.Builder()
                                    .setSampleRate(sampleRateInHz)
                                    .setChannelMask(channelConfig)
                                    .setEncoding(audioFormat)
                                    .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .build();

            recorder.startRecording();
            Log.d("ScreenAudioRecorder", "Audio recording started.");

            Thread recordingThread = new Thread(() -> {
                try {
                    byte[] buffer = new byte[bufferSize];
                    while (isRecording) {
                        int bytesRead = recorder.read(buffer, 0, buffer.length);
                        if (bytesRead > 0) {
                            String base64Data = Base64.encodeToString(buffer, 0, bytesRead, Base64.NO_WRAP);
                            if (eventEmitter != null) {
                                eventEmitter.emit("data", base64Data);
                                Log.d("ScreenAudioRecorder", "Audio data emitted: " + base64Data.substring(0, Math.min(100, base64Data.length())) + "...");
                            } else {

                                // risulta null
                                Log.e("ScreenAudioRecorder", "EventEmitter is null, cannot emit data.");
                            }
                        }
                    }
                    recorder.stop();
                    recorder.release();
                    recorder = null;  // Aggiunto per evitare accessi successivi a un oggetto rilasciato
                    Log.d("ScreenAudioRecorder", "Audio recording stopped.");
                } catch (Exception e) {
                    Log.e("ScreenAudioRecorder", "Recording error", e);
                }
            });

            recordingThread.start();

        } catch (Exception e) {
            Log.e("ScreenAudioRecorder", "Failed to start audio capture", e);
        }
    }

    public void stopAudioCapture() {
        isRecording = false;
        if (recorder != null) {
            recorder.stop();
            recorder.release();
            recorder = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        stopForeground(true);
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    NOTIFICATION_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    public void setMediaProjection(MediaProjection mediaProjection) {
        this.mediaProjection = mediaProjection;
    }

    public void setEventEmitter(DeviceEventManagerModule.RCTDeviceEventEmitter eventEmitter) {
        this.eventEmitter = eventEmitter;
    }

    public class ScreenAudioRecorder extends Binder {
        ScreenAudioRecorderService getRecordService() {
            return ScreenAudioRecorderService.this;
        }
    }
}