package com.xstreaming;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

public class NativeInputDialogModule extends ReactContextBaseJavaModule {
    private Dialog currentDialog;
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

    @ReactMethod
    public void showOptions(ReadableMap options, Promise promise) {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getCurrentActivity();
            if (activity == null || activity.isFinishing()) {
                promise.reject("NO_ACTIVITY", "Current activity is not available");
                return;
            }

            dismissCurrent("cancel", "");
            currentPromise = promise;
            currentInput = null;

            ReadableArray items = options != null && options.hasKey("items") && !options.isNull("items")
                    ? options.getArray("items")
                    : null;

            if (items == null || items.size() == 0) {
                resolveCurrentOption("cancel", -1, "");
                return;
            }

            String[] labels = new String[items.size()];
            String[] ids = new String[items.size()];
            for (int i = 0; i < items.size(); i++) {
                if (items.getType(i) == com.facebook.react.bridge.ReadableType.Map) {
                    ReadableMap item = items.getMap(i);
                    String id = getString(item, "id", String.valueOf(i));
                    String label = getString(item, "title", id);
                    ids[i] = id;
                    labels[i] = label;
                } else {
                    String label = items.getString(i);
                    ids[i] = String.valueOf(i);
                    labels[i] = label;
                }
            }

            int screenWidth = activity.getResources().getDisplayMetrics().widthPixels;
            int targetWidth = Math.min(dp(activity, 320), Math.round(screenWidth * 0.5f));

            FrameLayout root = new FrameLayout(activity);
            root.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
            root.setClickable(true);
            root.setFocusable(false);
            root.setFocusableInTouchMode(false);
            root.setOnClickListener(v -> {
                resolveCurrentOption("cancel", -1, "");
                if (currentDialog != null && currentDialog.isShowing()) {
                    currentDialog.dismiss();
                }
            });

            LinearLayout content = new LinearLayout(activity);
            content.setOrientation(LinearLayout.VERTICAL);
            content.setPadding(0, dp(activity, 6), 0, dp(activity, 6));
            content.setClickable(true);
            content.setFocusable(false);
            content.setFocusableInTouchMode(false);
            GradientDrawable background = new GradientDrawable();
            background.setColor(Color.argb(214, 28, 31, 36));
            background.setCornerRadius(dp(activity, 18));
            content.setBackground(background);

            FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
                    targetWidth,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER
            );
            root.addView(content, contentParams);

            final TextView[] optionViews = new TextView[labels.length];
            final int[] focusedIndex = {0};
            for (int i = 0; i < labels.length; i++) {
                final int index = i;
                TextView view = new TextView(activity);
                view.setGravity(Gravity.CENTER);
                view.setText(labels[i]);
                view.setTextColor(Color.WHITE);
                view.setTextSize(15);
                view.setSingleLine(false);
                view.setMinHeight(dp(activity, 42));
                view.setPadding(dp(activity, 24), dp(activity, 9), dp(activity, 24), dp(activity, 9));
                view.setFocusable(true);
                view.setFocusableInTouchMode(false);
                view.setClickable(true);
                view.setBackground(createOptionBackground(activity));
                view.setOnFocusChangeListener((v, hasFocus) -> {
                    if (hasFocus) {
                        focusedIndex[0] = index;
                    }
                });
                view.setOnClickListener(v -> {
                    resolveCurrentOption("select", index, ids[index]);
                    if (currentDialog != null && currentDialog.isShowing()) {
                        currentDialog.dismiss();
                    }
                });
                content.addView(view, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                ));
                optionViews[i] = view;
            }

            Dialog dialog = new Dialog(activity);
            dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
            dialog.setContentView(root);

            currentDialog = dialog;
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                window.setWindowAnimations(0);
                WindowManager.LayoutParams params = window.getAttributes();
                params.width = WindowManager.LayoutParams.MATCH_PARENT;
                params.height = WindowManager.LayoutParams.MATCH_PARENT;
                params.dimAmount = 0.32f;
                params.gravity = Gravity.CENTER;
                window.setAttributes(params);
                window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
                    window.getAttributes().setBlurBehindRadius(dp(activity, 20));
                }
            }
            dialog.setOnCancelListener(d -> resolveCurrentOption("cancel", -1, ""));
            dialog.setOnDismissListener(d -> currentDialog = null);
            dialog.setOnShowListener(d -> {
                if (optionViews.length > 0) {
                    root.post(() -> {
                        focusedIndex[0] = 0;
                        optionViews[0].requestFocus();
                    });
                }
            });
            dialog.setOnKeyListener((d, keyCode, event) -> {
                if (event.getAction() != KeyEvent.ACTION_DOWN || optionViews.length == 0) {
                    return false;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    focusedIndex[0] = Math.min(focusedIndex[0] + 1, optionViews.length - 1);
                    optionViews[focusedIndex[0]].requestFocus();
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    focusedIndex[0] = Math.max(focusedIndex[0] - 1, 0);
                    optionViews[focusedIndex[0]].requestFocus();
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                        || keyCode == KeyEvent.KEYCODE_ENTER
                        || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
                        || keyCode == KeyEvent.KEYCODE_BUTTON_A) {
                    optionViews[focusedIndex[0]].performClick();
                    return true;
                }

                return false;
            });
            dialog.show();
        });
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

    private StateListDrawable createOptionBackground(Context context) {
        StateListDrawable states = new StateListDrawable();

        GradientDrawable pressed = new GradientDrawable();
        pressed.setColor(Color.argb(72, 255, 255, 255));
        pressed.setCornerRadius(dp(context, 8));

        GradientDrawable focused = new GradientDrawable();
        focused.setColor(Color.argb(46, 255, 255, 255));
        focused.setCornerRadius(dp(context, 8));

        GradientDrawable normal = new GradientDrawable();
        normal.setColor(Color.TRANSPARENT);
        normal.setCornerRadius(dp(context, 8));

        states.addState(new int[]{android.R.attr.state_pressed}, pressed);
        states.addState(new int[]{android.R.attr.state_focused}, focused);
        states.addState(new int[]{}, normal);
        return states;
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

    private void resolveCurrentOption(String action, int index, String id) {
        if (currentPromise == null) {
            return;
        }
        Promise promise = currentPromise;
        currentPromise = null;
        WritableMap result = Arguments.createMap();
        result.putString("action", action);
        result.putInt("index", index);
        result.putString("id", id == null ? "" : id);
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
