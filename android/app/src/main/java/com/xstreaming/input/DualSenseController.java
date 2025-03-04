package com.xstreaming.input;

import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.util.Log;

import java.nio.ByteBuffer;

public class DualSenseController extends AbstractDualSenseController {
    private static final int[] SUPPORTED_VENDORS = {
            0x054C,
            0x0CE6,
            0x0DF2,
    };

    public static boolean canClaimDevice(UsbDevice device) {
        for (int supportedVid : SUPPORTED_VENDORS) {
            if (device.getVendorId() == supportedVid &&
                    device.getInterfaceCount() >= 1
            ) {
                return true;
            }
        }

        return false;
    }

    public DualSenseController(UsbDevice device, UsbDeviceConnection connection, int deviceId, UsbDriverListener listener) {
        super(device, connection, deviceId, listener);
    }

    private float normalizeThumbStickAxis(int value) {
        return (2.0f * value / 255.0f) - 1.0f;
    }

    private float normalizeTriggerAxis(int value) {
        return value / 255.0f;
    }

    @Override
    protected boolean handleRead(ByteBuffer buffer) {
//        Log.d("UsbDriverService", "dualsenseController.java handleRead: " + buffer);
        if (buffer.remaining() != 64) {
            Log.d("UsbDriverService DualController.java", "No Daulsense input: " + buffer.remaining());
            return false;
        }

        // Skip first byte
        buffer.get();

        // Process D-pad (buttons0 & 0x0F)
        int dpad = buffer.get(8) & 0x0F;
        setDsButtonFlag(DSControllerPacket.UP_FLAG, dpad == 0 || dpad == 1 || dpad == 7);
        setDsButtonFlag(DSControllerPacket.DOWN_FLAG, dpad == 3 || dpad == 4 || dpad == 5);
        setDsButtonFlag(DSControllerPacket.LEFT_FLAG, dpad == 5 || dpad == 6 || dpad == 7);
        setDsButtonFlag(DSControllerPacket.RIGHT_FLAG, dpad == 1 || dpad == 2 || dpad == 3);

        // Process face buttons (buttons0)
        int buttons0 = buffer.get(8);
        setDsButtonFlag(DSControllerPacket.BOX_FLAG, (buttons0 & 0x10) != 0);
        setDsButtonFlag(DSControllerPacket.CROSS_FLAG, (buttons0 & 0x20) != 0);
        setDsButtonFlag(DSControllerPacket.MOON_FLAG, (buttons0 & 0x40) != 0);
        setDsButtonFlag(DSControllerPacket.PYRAMID_FLAG, (buttons0 & 0x80) != 0);

        // Process shoulder buttons and other controls (buttons1)
        int buttons1 = buffer.get(9);
        setDsButtonFlag(DSControllerPacket.L1_FLAG, (buttons1 & 0x01) != 0);
        setDsButtonFlag(DSControllerPacket.R1_FLAG, (buttons1 & 0x02) != 0);
//        setDsButtonFlag(DSControllerPacket.L2_FLAG, (buttons1 & 0x04) != 0);
//        setDsButtonFlag(DSControllerPacket.R2_FLAG, (buttons1 & 0x08) != 0);
        setDsButtonFlag(DSControllerPacket.SHARE_FLAG, (buttons1 & 0x10) != 0);
        setDsButtonFlag(DSControllerPacket.OPTIONS_FLAG, (buttons1 & 0x20) != 0);
        setDsButtonFlag(DSControllerPacket.L3_FLAG, (buttons1 & 0x40) != 0);
        setDsButtonFlag(DSControllerPacket.R3_FLAG, (buttons1 & 0x80) != 0);

        // Process special buttons (buttons2)
        int buttons2 = buffer.get(10);
        setDsButtonFlag(DSControllerPacket.PS_FLAG, (buttons2 & 0x01) != 0);
//        setDsButtonFlag(DSControllerPacket.TOUCHPAD_FLAG, (buttons2 & 0x02) != 0);
//        setDsButtonFlag(DSControllerPacket.MUTE_FLAG, (buttons2 & 0x04) != 0);

        // Process analog sticks
        int axes0 = buffer.get(1) & 0xFF;
        int axes1 = buffer.get(2) & 0xFF;
        int axes2 = buffer.get(3) & 0xFF;
        int axes3 = buffer.get(4) & 0xFF;
        int axes4 = buffer.get(5) & 0xFF;
        int axes5 = buffer.get(6) & 0xFF;

        float lsx = normalizeThumbStickAxis(axes0);
        float lsy = normalizeThumbStickAxis(axes1);
        float rsx = normalizeThumbStickAxis(axes2);
        float rsy = normalizeThumbStickAxis(axes3);
        float l2axis = normalizeTriggerAxis(axes4);
        float r2axis = normalizeTriggerAxis(axes5);

        leftTrigger = l2axis;
        rightTrigger = r2axis;
//        Log.d("UsbDriverService DualController.java", "leftTrigger: " + leftTrigger);
//        Log.d("UsbDriverService DualController.java", "rightTrigger: " + rightTrigger);

        leftStickX = lsx;
        leftStickY = lsy;
//        Log.d("UsbDriverService DualController.java", "leftStickX: " + leftStickX);
//        Log.d("UsbDriverService DualController.java", "leftStickY: " + leftStickY);

        rightStickX = rsx;
        rightStickY = rsy;
//        Log.d("UsbDriverService DualController.java", "rightStickX: " + rightStickX);
//        Log.d("UsbDriverService DualController.java", "rightStickY: " + rightStickY);

        // Return true to send input
        return true;
    }

    @Override
    protected boolean doInit() {
        Log.d("UsbDriverService", "dualsenseController.java doInit");
        return true;
    }

    @Override
    public void rumble(short lowFreqMotor, short highFreqMotor) {
//        byte[] data = {
//                0x00, 0x08, 0x00,
//                (byte)(lowFreqMotor >> 8), (byte)(highFreqMotor >> 8),
//                0x00, 0x00, 0x00
//        };
//        int res = connection.bulkTransfer(outEndpt, data, data.length, 100);
//        if (res != data.length) {
//            Log.d("UsbDriverService Xbox360Controller.java", "Rumble transfer failed: "+res);
//        }
    }

    @Override
    public void rumbleTriggers(short leftTrigger, short rightTrigger) {
        // Trigger motors not present on Xbox 360 controllers
    }

    @Override
    public void sendCommand(byte[] data) {
        Log.d("UsbDriverService DualController.java", "sendCommand");

        int res = connection.bulkTransfer(outEndpt, data, data.length, 1000);
        Log.e("UsbDriverService DualController.java", "Command transfer result: " + res);
        if (res != data.length) {
            Log.d("UsbDriverService DualController.java", "Command set transfer failed: " + res);
        }
    }
}
