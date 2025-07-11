package com.xstreaming.touchcontrols;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.appcompat.app.AppCompatActivity;

public class ButtonHaptics {
    private final boolean enabled;
    private final Context context;

    public ButtonHaptics(Context context) {
        this.context = context;
        this.enabled = true;
    }

    public void trigger() {
        trigger(false);
    }

    public void trigger(boolean harder) {
        if (!enabled) {
            return;
        }
        
        Vibrator vibrator = (Vibrator) context.getSystemService(AppCompatActivity.VIBRATOR_SERVICE);
        if (vibrator == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            VibrationEffect effect;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int effectType = harder ? VibrationEffect.EFFECT_CLICK : VibrationEffect.EFFECT_TICK;
                effect = VibrationEffect.createPredefined(effectType);
            } else {
                effect = VibrationEffect.createOneShot(10, harder ? 200 : 100);
            }
            vibrator.vibrate(effect);
        } else {
            vibrator.vibrate(10);
        }
    }
}
