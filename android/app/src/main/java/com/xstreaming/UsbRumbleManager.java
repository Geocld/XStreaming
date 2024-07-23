package com.xstreaming;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.util.Log;
import android.os.Build;
import android.content.Intent;
import android.app.PendingIntent;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.content.Context;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;

public class UsbRumbleManager extends ReactContextBaseJavaModule {

    private static final String ACTION_USB_ATTACHED = "android.hardware.usb.action.USB_DEVICE_ATTACHED";
    private static final String ACTION_USB_DETACHED = "android.hardware.usb.action.USB_DEVICE_DETACHED";
    private static final String ACTION_USB_PERMISSION =
            "com.xstreaming.USB_PERMISSION";
    protected UsbEndpoint inEndpt, outEndpt;
    private final ReactApplicationContext reactContext;
  
    public UsbRumbleManager(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        setDeviceConnectionReceiver();
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "UsbRumbleManager";
    }

    private void setDeviceConnectionReceiver() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_ATTACHED);
        filter.addAction(ACTION_USB_DETACHED);

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String event = intent.getAction().equals(ACTION_USB_ATTACHED) ? "onDeviceConnect"
                        : "onDeviceDisconnect";
                UsbDevice device = (UsbDevice) intent.getExtras().get(UsbManager.EXTRA_DEVICE);
                getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(event, buildMapFromDevice(device));
            }
        };
        getReactApplicationContext().registerReceiver(receiver, filter);
    }

    private WritableMap buildMapFromDevice(UsbDevice device) {
        WritableMap map = Arguments.createMap();
        map.putString("name", device.getDeviceName());
        map.putInt("deviceId", device.getDeviceId());
        map.putInt("productId", device.getProductId());
        map.putInt("vendorId", device.getVendorId());
        map.putString("deviceName", device.getDeviceName());
        return map;
    }

    private void requestUsbPermission(UsbManager manager, UsbDevice device, Promise p) {
        try {
            ReactApplicationContext rAppContext = getReactApplicationContext();
            PendingIntent permIntent = PendingIntent.getBroadcast(rAppContext, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            registerBroadcastReceiver(p);
            manager.requestPermission(device, permIntent);
        } catch (Exception e) {
            p.reject(e);
        }
    }

    private void registerBroadcastReceiver(final Promise p) {
        IntentFilter intFilter = new IntentFilter(ACTION_USB_PERMISSION);
        final BroadcastReceiver receiver = new BroadcastReceiver() {

            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_USB_PERMISSION.equals(intent.getAction())) {
                    synchronized (this) {
                        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                        if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                            // TODO
                        } else {
                            p.reject(new Exception("Permission denied by user for device"));
                        }
                    }
                }
                unregisterReceiver(this);
            }
        };
        getReactApplicationContext().registerReceiver(receiver, intFilter);
    }

    private void unregisterReceiver(BroadcastReceiver receiver) {
        getReactApplicationContext().unregisterReceiver(receiver);
    }

    @ReactMethod
    private void rumble() {
        Log.d("UsbRumbleManager", "rmble");
        Intent intent = getCurrentActivity().getIntent();
        final UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);

        Log.d("UsbRumbleManager", "UsbDevice：" + device);

        if(device == null) {
            return;
        }

        UsbManager usbManager = (UsbManager) reactContext.getSystemService(Context.USB_SERVICE);

        boolean test = usbManager.hasPermission(device);
        Log.d("UsbRumbleManager", "Are we able to operate it：" + test);
        // Do we have permission yet?
        if (!usbManager.hasPermission(device)) {
            try {
                int intentFlags = 0;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // This PendingIntent must be mutable to allow the framework to populate EXTRA_DEVICE and EXTRA_PERMISSION_GRANTED.
                    intentFlags |= PendingIntent.FLAG_MUTABLE;
                }

                // Use an explicit intent to activate our unexported broadcast receiver, as required on Android 14+
                Intent i = new Intent(ACTION_USB_PERMISSION);
                i.setPackage("com.streaming");

                usbManager.requestPermission(device, PendingIntent.getBroadcast(reactContext, 0, i, intentFlags));
            } catch (SecurityException e) {

            }
            return;
        }
        UsbDeviceConnection connection = usbManager.openDevice(device);

        if (connection == null) {
            Log.d("UsbRumbleManager", "Unable to open USB device: "+device.getDeviceName());
            return;
        }

        // Find the endpoints
        UsbInterface iface = device.getInterface(0);
        for (int i = 0; i < iface.getEndpointCount(); i++) {
            UsbEndpoint endpt = iface.getEndpoint(i);
            if (endpt.getDirection() == UsbConstants.USB_DIR_OUT) {
                if (outEndpt != null) {
                    Log.d("UsbRumbleManager", "Found duplicate OUT endpoint");
                    return;
                }
                outEndpt = endpt;
            }
        }

        short lowFreqMotor = 300;
        short highFreqMotor = 300;

        if (outEndpt != null) {
            byte[] data = {
                    0x00, 0x08, 0x00,
                    (byte)(lowFreqMotor >> 8), (byte)(highFreqMotor >> 8),
                    0x00, 0x00, 0x00
            };
            connection.bulkTransfer(outEndpt, data, data.length, 100);
        }
    }
}