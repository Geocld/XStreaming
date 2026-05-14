package com.xstreaming;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputFilter;
import android.text.InputType;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.EditText;
import android.widget.FrameLayout;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

public class NativeInputDialogModule extends ReactContextBaseJavaModule {
    private AlertDialog currentDialog;
    private EditText currentInput;
    private Promise currentPromise;

    public NativeInputDialogModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "NativeInputDialog";
    }

    @ReactMethod
    public void showTextInput(ReadableMap options, Promise promise) {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getCurrentActivity();
            if (activity == null || activity.isFinishing()) {
                promise.reject("NO_ACTIVITY", "Current activity is not available");
                return;
            }

            dismissCurrent("cancel", "");
            currentPromise = promise;

            String title = getString(options, "title", "");
            String message = getString(options, "message", "");
            String text = getString(options, "text", "");
            String hint = getString(options, "hint", "");
            String confirmText = getString(options, "confirmText", "OK");
            String cancelText = getString(options, "cancelText", "Cancel");
            int inputScope = getInt(options, "inputScope", 0);
            int maxLength = getInt(options, "maxLength", 0);

            EditText input = new EditText(activity);
            input.setSingleLine(false);
            input.setMinLines(1);
            input.setMaxLines(4);
            input.setText(text);
            input.setHint(hint);
            input.setSelectAllOnFocus(false);
            input.setInputType(resolveInputType(inputScope));
            input.setFocusable(true);
            input.setFocusableInTouchMode(true);
            if (maxLength > 0) {
                input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maxLength)});
            }

            FrameLayout container = new FrameLayout(activity);
            int horizontalPadding = dp(activity, 24);
            int topPadding = dp(activity, 8);
            container.setPadding(horizontalPadding, topPadding, horizontalPadding, 0);
            container.addView(input, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
            ));

            AlertDialog dialog = new AlertDialog.Builder(activity)
                    .setTitle(title)
                    .setMessage(message)
                    .setView(container)
                    .setNegativeButton(cancelText, (d, which) -> resolveCurrent("cancel", input.getText().toString()))
                    .setPositiveButton(confirmText, (d, which) -> resolveCurrent("confirm", input.getText().toString()))
                    .create();

            currentDialog = dialog;
            currentInput = input;
            dialog.setOnCancelListener(d -> resolveCurrent("cancel", input.getText().toString()));
            dialog.setOnDismissListener(d -> {
                currentDialog = null;
                currentInput = null;
            });
            dialog.setOnShowListener(d -> {
                input.requestFocus();
                input.setSelection(input.getText().length());
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setFocusable(true);
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setFocusable(true);

                InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) {
                    imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
                }
            });
            dialog.show();
        });
    }

    @ReactMethod
    public void dismiss() {
        UiThreadUtil.runOnUiThread(() -> dismissCurrent("cancel", getCurrentText()));
    }

    private int resolveInputType(int inputScope) {
        switch (inputScope) {
            case 1:
                return InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI;
            case 5:
                return InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
            case 29:
                return InputType.TYPE_CLASS_NUMBER;
            case 31:
                return InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD;
            case 32:
                return InputType.TYPE_CLASS_PHONE;
            default:
                return InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE;
        }
    }

    private void dismissCurrent(String action, String text) {
        resolveCurrent(action, text);
        if (currentDialog != null && currentDialog.isShowing()) {
            currentDialog.dismiss();
        }
        currentDialog = null;
        currentInput = null;
    }

    private void resolveCurrent(String action, String text) {
        if (currentPromise == null) {
            return;
        }
        Promise promise = currentPromise;
        currentPromise = null;
        WritableMap result = Arguments.createMap();
        result.putString("action", action);
        result.putString("text", text == null ? "" : text);
        promise.resolve(result);
    }

    private String getCurrentText() {
        if (currentInput == null) {
            return "";
        }
        return currentInput.getText().toString();
    }

    private String getString(ReadableMap map, String key, String fallback) {
        if (map != null && map.hasKey(key) && !map.isNull(key)) {
            return map.getString(key);
        }
        return fallback;
    }

    private int getInt(ReadableMap map, String key, int fallback) {
        if (map != null && map.hasKey(key) && !map.isNull(key)) {
            return map.getInt(key);
        }
        return fallback;
    }

    private int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
