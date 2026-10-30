package com.xstreaming;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.List;

public class NativeInputDialogModule extends ReactContextBaseJavaModule {
    private Dialog currentDialog;
    private EditText currentInput;
    private Promise currentPromise;
    private Handler playtimeTimerHandler;
    private Runnable playtimeTimerRunnable;

    private static class OptionItem {
        final int originalIndex;
        final String id;
        final String label;
        final int iconRes;
        final String category;
        final boolean active;

        OptionItem(int originalIndex, String id, String label, int iconRes, String category, boolean active) {
            this.originalIndex = originalIndex;
            this.id = id;
            this.label = label;
            this.iconRes = iconRes;
            this.category = category;
            this.active = active;
        }
    }

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

            String headerPlaytime = null;
            List<OptionItem> parsedItems = new ArrayList<>();

            for (int i = 0; i < items.size(); i++) {
                String id;
                String label;
                String customIcon = "";
                String customCategory = "";
                boolean active = false;

                if (items.getType(i) == com.facebook.react.bridge.ReadableType.Map) {
                    ReadableMap item = items.getMap(i);
                    id = getString(item, "id", String.valueOf(i));
                    label = getString(item, "title", id);
                    customIcon = getString(item, "icon", "");
                    customCategory = getString(item, "category", "");
                    active = getBoolean(item, "active", false);
                } else {
                    label = items.getString(i);
                    id = String.valueOf(i);
                }

                if ("playtimeInfo".equals(id)) {
                    String clean = label;
                    if (clean.startsWith("⏱️ ")) {
                        clean = clean.substring("⏱️ ".length());
                    } else if (clean.startsWith("⏱ ")) {
                        clean = clean.substring("⏱ ".length());
                    } else if (clean.startsWith("⏱️")) {
                        clean = clean.substring("⏱️".length()).trim();
                    } else if (clean.startsWith("⏱")) {
                        clean = clean.substring("⏱".length()).trim();
                    }
                    headerPlaytime = clean;
                    continue;
                }

                String category = resolveOptionCategory(id, customCategory);
                int iconRes = resolveOptionIconRes(id, label);
                parsedItems.add(new OptionItem(i, id, label, iconRes, category, active));
            }

            if (parsedItems.isEmpty()) {
                resolveCurrentOption("cancel", -1, "");
                return;
            }

            double rawStartTime = (options != null && options.hasKey("sessionStartTime"))
                    ? options.getDouble("sessionStartTime")
                    : 0;
            long sessionStartTime = (long) rawStartTime;
            final int sessionLimitSeconds = getInt(options, "sessionLimitSeconds", 0);
            String playtimeLabel = getString(options, "sessionPlaytimeLabel", "");
            final String minLeftLabel = getString(options, "minLeftLabel", "%d min left");

            if (sessionStartTime <= 0 && headerPlaytime != null) {
                long parsedSec = parseElapsedSeconds(headerPlaytime);
                if (parsedSec >= 0) {
                    sessionStartTime = System.currentTimeMillis() - (parsedSec * 1000L);
                }
                if (TextUtils.isEmpty(playtimeLabel)) {
                    int colonIdx = headerPlaytime.indexOf(':');
                    if (colonIdx > 0) {
                        playtimeLabel = headerPlaytime.substring(0, colonIdx).trim();
                    }
                }
            }
            if (TextUtils.isEmpty(playtimeLabel)) {
                playtimeLabel = "Session Playtime";
            }
            final long finalStartTime = sessionStartTime;
            final String finalPlaytimeLabel = playtimeLabel;

            List<OptionItem> tools = new ArrayList<>();
            List<OptionItem> controllers = new ArrayList<>();
            List<OptionItem> generals = new ArrayList<>();
            List<OptionItem> sessions = new ArrayList<>();
            List<OptionItem> dangers = new ArrayList<>();

            for (OptionItem it : parsedItems) {
                switch (it.category) {
                    case "tool":
                        tools.add(it);
                        break;
                    case "controller":
                        controllers.add(it);
                        break;
                    case "session":
                        sessions.add(it);
                        break;
                    case "danger":
                        dangers.add(it);
                        break;
                    default:
                        generals.add(it);
                        break;
                }
            }

            int screenWidth = activity.getResources().getDisplayMetrics().widthPixels;
            int targetWidth = Math.min(dp(activity, 620), Math.round(screenWidth * 0.92f));
            boolean showAudioGainControl = getBoolean(options, "showAudioGainControl", false);
            int audioGain = Math.max(0, Math.min(10, getInt(options, "audioGain", 1)));

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

            LinearLayout card = new LinearLayout(activity);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(activity, 14), dp(activity, 10), dp(activity, 14), dp(activity, 10));
            card.setClickable(true);
            card.setFocusable(false);
            card.setFocusableInTouchMode(false);
            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(Color.argb(242, 18, 21, 26));
            cardBg.setCornerRadius(dp(activity, 18));
            cardBg.setStroke(dp(activity, 1), Color.argb(35, 255, 255, 255));
            card.setBackground(cardBg);

            FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                    targetWidth,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER
            );
            root.addView(card, cardParams);

            LinearLayout headerBar = new LinearLayout(activity);
            headerBar.setOrientation(LinearLayout.HORIZONTAL);
            headerBar.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);

            LinearLayout playtimeChip = new LinearLayout(activity);
            playtimeChip.setOrientation(LinearLayout.HORIZONTAL);
            playtimeChip.setGravity(Gravity.CENTER_VERTICAL);
            playtimeChip.setPadding(dp(activity, 8), dp(activity, 3), dp(activity, 8), dp(activity, 3));
            GradientDrawable chipBg = new GradientDrawable();
            chipBg.setColor(Color.argb(32, 255, 255, 255));
            chipBg.setCornerRadius(dp(activity, 10));
            chipBg.setStroke(dp(activity, 1), Color.argb(24, 255, 255, 255));
            playtimeChip.setBackground(chipBg);

            ImageView playtimeIcon = new ImageView(activity);
            playtimeIcon.setImageResource(R.drawable.ic_bs_clock);
            playtimeIcon.setColorFilter(Color.parseColor("#10B981"));
            LinearLayout.LayoutParams clockParams = new LinearLayout.LayoutParams(
                    dp(activity, 12),
                    dp(activity, 12)
            );
            clockParams.rightMargin = dp(activity, 5);
            playtimeChip.addView(playtimeIcon, clockParams);

            final TextView playtimeText = new TextView(activity);
            playtimeText.setTextColor(Color.parseColor("#E5E7EB"));
            playtimeText.setTextSize(11);
            playtimeText.setTypeface(Typeface.DEFAULT_BOLD);
            playtimeText.setSingleLine(true);
            playtimeChip.addView(playtimeText);

            if (finalStartTime > 0) {
                playtimeTimerHandler = new Handler(Looper.getMainLooper());
                playtimeTimerRunnable = new Runnable() {
                    @Override
                    public void run() {
                        if (currentDialog != null && !currentDialog.isShowing()) {
                            return;
                        }
                        long elapsed = Math.max(0, (System.currentTimeMillis() - finalStartTime) / 1000);
                        String text = finalPlaytimeLabel + ": " + formatDuration(elapsed);
                        if (sessionLimitSeconds > 0) {
                            long remaining = Math.max(0, sessionLimitSeconds - elapsed);
                            int remainingMinutes = (int) Math.max(0, Math.ceil(remaining / 60.0));
                            String minStr = minLeftLabel.contains("%d")
                                    ? String.format(java.util.Locale.US, minLeftLabel, remainingMinutes)
                                    : (remainingMinutes + " min left");
                            text += " (" + minStr + ")";
                        }
                        playtimeText.setText(text);
                        if (playtimeTimerHandler != null) {
                            playtimeTimerHandler.removeCallbacks(this);
                            playtimeTimerHandler.postDelayed(this, 1000);
                        }
                    }
                };
                playtimeTimerRunnable.run();
                LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );
                chipParams.rightMargin = dp(activity, 8);
                headerBar.addView(playtimeChip, chipParams);
            } else if (headerPlaytime != null) {
                String cleanHeader = headerPlaytime.replace("⏱️", "").replace("⏱", "").trim();
                playtimeText.setText(cleanHeader);
                LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );
                chipParams.rightMargin = dp(activity, 8);
                headerBar.addView(playtimeChip, chipParams);
            }

            TextView closeBtn = new TextView(activity);
            closeBtn.setText("✕");
            closeBtn.setTextColor(Color.parseColor("#9CA3AF"));
            closeBtn.setTextSize(13);
            closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
            closeBtn.setGravity(Gravity.CENTER);
            closeBtn.setFocusable(true);
            closeBtn.setFocusableInTouchMode(true);
            closeBtn.setClickable(true);
            GradientDrawable closeBg = new GradientDrawable();
            closeBg.setColor(Color.argb(24, 255, 255, 255));
            closeBg.setCornerRadius(dp(activity, 13));
            closeBtn.setBackground(closeBg);
            closeBtn.setOnClickListener(v -> {
                resolveCurrentOption("cancel", -1, "");
                if (currentDialog != null && currentDialog.isShowing()) {
                    currentDialog.dismiss();
                }
            });
            headerBar.addView(closeBtn, new LinearLayout.LayoutParams(
                    dp(activity, 26),
                    dp(activity, 26)
            ));

            card.addView(headerBar, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            ));

            final LinearLayout finalAudioGainContent;
            final SeekBar finalAudioGainSlider;
            final TextView finalAudioGainLabel;

            if (showAudioGainControl) {
                final String audioGainTitle = getString(options, "audioGainLabel", "Boost");
                LinearLayout audioGainContent = new LinearLayout(activity);
                audioGainContent.setOrientation(LinearLayout.HORIZONTAL);
                audioGainContent.setGravity(Gravity.CENTER_VERTICAL);
                audioGainContent.setPadding(dp(activity, 10), dp(activity, 4), dp(activity, 10), dp(activity, 4));
                audioGainContent.setFocusable(true);
                audioGainContent.setFocusableInTouchMode(true);
                audioGainContent.setClickable(true);
                audioGainContent.setBackground(createOptionBackground(activity, false));

                ImageView boostIcon = new ImageView(activity);
                boostIcon.setImageResource(R.drawable.ic_bs_volume);
                boostIcon.setColorFilter(Color.parseColor("#9CA3AF"));
                LinearLayout.LayoutParams boostIconParams = new LinearLayout.LayoutParams(
                        dp(activity, 16),
                        dp(activity, 16)
                );
                boostIconParams.rightMargin = dp(activity, 6);
                audioGainContent.addView(boostIcon, boostIconParams);

                TextView boostLabel = new TextView(activity);
                boostLabel.setText(audioGainTitle);
                boostLabel.setTextColor(Color.parseColor("#E5E7EB"));
                boostLabel.setTextSize(12);
                boostLabel.setTypeface(Typeface.DEFAULT_BOLD);
                LinearLayout.LayoutParams boostLabelParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );
                boostLabelParams.rightMargin = dp(activity, 8);
                audioGainContent.addView(boostLabel, boostLabelParams);

                audioGainContent.setOnFocusChangeListener((v, hasFocus) -> {
                    if (hasFocus) {
                        boostIcon.setColorFilter(Color.parseColor("#10B981"));
                        boostLabel.setTextColor(Color.parseColor("#10B981"));
                    } else {
                        boostIcon.setColorFilter(Color.parseColor("#9CA3AF"));
                        boostLabel.setTextColor(Color.parseColor("#E5E7EB"));
                    }
                });

                SeekBar audioGainSlider = new SeekBar(activity);
                audioGainSlider.setMax(10);
                audioGainSlider.setProgress(audioGain);
                audioGainSlider.setFocusable(false);
                audioGainSlider.setProgressTintList(ColorStateList.valueOf(Color.parseColor("#10B981")));
                audioGainSlider.setThumbTintList(ColorStateList.valueOf(Color.parseColor("#10B981")));

                TextView audioGainLabel = new TextView(activity);
                audioGainLabel.setText(audioGain + "x");
                audioGainLabel.setTextColor(Color.parseColor("#34D399"));
                audioGainLabel.setTextSize(11);
                audioGainLabel.setTypeface(Typeface.DEFAULT_BOLD);
                audioGainLabel.setGravity(Gravity.CENTER);
                GradientDrawable badgeBg = new GradientDrawable();
                badgeBg.setColor(Color.argb(40, 16, 185, 129));
                badgeBg.setCornerRadius(dp(activity, 5));
                audioGainLabel.setBackground(badgeBg);
                audioGainLabel.setPadding(dp(activity, 6), dp(activity, 2), dp(activity, 6), dp(activity, 2));

                audioGainSlider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                    @Override
                    public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                        int nextGain = Math.max(0, Math.min(10, progress));
                        audioGainLabel.setText(nextGain + "x");
                        if (fromUser) {
                            emitAudioGainChange(nextGain);
                        }
                    }

                    @Override
                    public void onStartTrackingTouch(SeekBar seekBar) {}

                    @Override
                    public void onStopTrackingTouch(SeekBar seekBar) {}
                });

                LinearLayout.LayoutParams sliderParams = new LinearLayout.LayoutParams(
                        0,
                        dp(activity, 28),
                        1f
                );
                sliderParams.leftMargin = dp(activity, 2);
                sliderParams.rightMargin = dp(activity, 8);
                audioGainContent.addView(audioGainSlider, sliderParams);

                audioGainContent.addView(audioGainLabel, new LinearLayout.LayoutParams(
                        dp(activity, 32),
                        LinearLayout.LayoutParams.WRAP_CONTENT
                ));

                LinearLayout.LayoutParams audioParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dp(activity, 34)
                );
                audioParams.topMargin = dp(activity, 8);
                audioParams.bottomMargin = dp(activity, 2);
                card.addView(audioGainContent, audioParams);

                finalAudioGainContent = audioGainContent;
                finalAudioGainSlider = audioGainSlider;
                finalAudioGainLabel = audioGainLabel;
            } else {
                finalAudioGainContent = null;
                finalAudioGainSlider = null;
                finalAudioGainLabel = null;
            }

            ScrollView scrollView = new ScrollView(activity) {
                @Override
                protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                    int maxHeight = Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.82f);
                    heightMeasureSpec = MeasureSpec.makeMeasureSpec(maxHeight, MeasureSpec.AT_MOST);
                    super.onMeasure(widthMeasureSpec, heightMeasureSpec);
                }

                @Override
                public boolean executeKeyEvent(KeyEvent event) {
                    // The dialog owns DPAD navigation. ScrollView would otherwise
                    // consume up/down keys as scroll commands before the dialog
                    // can move focus between option buttons.
                    return false;
                }
            };
            scrollView.setFocusable(false);
            scrollView.setFocusableInTouchMode(false);
            scrollView.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
            scrollView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            scrollView.setVerticalScrollBarEnabled(false);

            LinearLayout columnsContainer = new LinearLayout(activity);
            columnsContainer.setOrientation(LinearLayout.HORIZONTAL);
            columnsContainer.setWeightSum(2f);
            scrollView.addView(columnsContainer, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            scrollParams.topMargin = dp(activity, 4);
            card.addView(scrollView, scrollParams);

            LinearLayout leftCol = new LinearLayout(activity);
            leftCol.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams leftColParams = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
            );
            leftColParams.rightMargin = dp(activity, 5);
            columnsContainer.addView(leftCol, leftColParams);

            LinearLayout rightCol = new LinearLayout(activity);
            rightCol.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams rightColParams = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
            );
            rightColParams.leftMargin = dp(activity, 5);
            columnsContainer.addView(rightCol, rightColParams);

            final List<View> leftViews = new ArrayList<>();
            final List<View> rightViews = new ArrayList<>();
            final List<View> optionViews = new ArrayList<>();

            if (!tools.isEmpty()) {
                for (OptionItem it : tools) {
                    View view = createCompactItemView(activity, it, false, () -> {
                        resolveCurrentOption("select", it.originalIndex, it.id);
                        if (currentDialog != null && currentDialog.isShowing()) {
                            currentDialog.dismiss();
                        }
                    });
                    leftViews.add(view);
                    optionViews.add(view);

                    LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(activity, 36)
                    );
                    itemParams.bottomMargin = dp(activity, 3);
                    leftCol.addView(view, itemParams);
                }
            }

            if (!controllers.isEmpty()) {
                for (OptionItem it : controllers) {
                    View view = createCompactItemView(activity, it, false, () -> {
                        resolveCurrentOption("select", it.originalIndex, it.id);
                        if (currentDialog != null && currentDialog.isShowing()) {
                            currentDialog.dismiss();
                        }
                    });
                    rightViews.add(view);
                    optionViews.add(view);

                    LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(activity, 36)
                    );
                    itemParams.bottomMargin = dp(activity, 3);
                    rightCol.addView(view, itemParams);
                }
            }

            if (!generals.isEmpty()) {
                for (OptionItem it : generals) {
                    View view = createCompactItemView(activity, it, false, () -> {
                        resolveCurrentOption("select", it.originalIndex, it.id);
                        if (currentDialog != null && currentDialog.isShowing()) {
                            currentDialog.dismiss();
                        }
                    });
                    rightViews.add(view);
                    optionViews.add(view);

                    LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(activity, 36)
                    );
                    itemParams.bottomMargin = dp(activity, 3);
                    rightCol.addView(view, itemParams);
                }
            }

            if (!sessions.isEmpty() || !dangers.isEmpty()) {
                for (OptionItem it : sessions) {
                    View view = createCompactItemView(activity, it, false, () -> {
                        resolveCurrentOption("select", it.originalIndex, it.id);
                        if (currentDialog != null && currentDialog.isShowing()) {
                            currentDialog.dismiss();
                        }
                    });
                    rightViews.add(view);
                    optionViews.add(view);

                    LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(activity, 36)
                    );
                    itemParams.bottomMargin = dp(activity, 3);
                    rightCol.addView(view, itemParams);
                }

                for (OptionItem it : dangers) {
                    View view = createCompactItemView(activity, it, true, () -> {
                        resolveCurrentOption("select", it.originalIndex, it.id);
                        if (currentDialog != null && currentDialog.isShowing()) {
                            currentDialog.dismiss();
                        }
                    });
                    rightViews.add(view);
                    optionViews.add(view);

                    LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            dp(activity, 36)
                    );
                    itemParams.bottomMargin = dp(activity, 2);
                    rightCol.addView(view, itemParams);
                }
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
                params.dimAmount = 0.35f;
                params.gravity = Gravity.CENTER;
                window.setAttributes(params);
                window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
                    window.getAttributes().setBlurBehindRadius(dp(activity, 22));
                }
            }
            dialog.setOnCancelListener(d -> resolveCurrentOption("cancel", -1, ""));
            dialog.setOnDismissListener(d -> {
                if (playtimeTimerHandler != null && playtimeTimerRunnable != null) {
                    playtimeTimerHandler.removeCallbacks(playtimeTimerRunnable);
                    playtimeTimerHandler = null;
                    playtimeTimerRunnable = null;
                }
                currentDialog = null;
            });
            dialog.setOnShowListener(d -> {
                if (playtimeTimerRunnable != null) {
                    playtimeTimerRunnable.run();
                }
                if (finalAudioGainContent != null) {
                    root.post(() -> finalAudioGainContent.requestFocus());
                } else if (!leftViews.isEmpty()) {
                    root.post(() -> leftViews.get(0).requestFocus());
                } else if (!rightViews.isEmpty()) {
                    root.post(() -> rightViews.get(0).requestFocus());
                }
            });
            dialog.setOnKeyListener((d, keyCode, event) -> {
                if (event.getAction() != KeyEvent.ACTION_DOWN) {
                    return false;
                }

                View cur = dialog.getCurrentFocus();
                boolean isAudioGainFocused = (finalAudioGainContent != null && cur == finalAudioGainContent);
                int leftIdx = leftViews.indexOf(cur);
                int rightIdx = rightViews.indexOf(cur);

                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (isAudioGainFocused) {
                        if (!leftViews.isEmpty()) {
                            leftViews.get(0).requestFocus();
                            return true;
                        }
                    } else if (leftIdx >= 0 && leftIdx + 1 < leftViews.size()) {
                        leftViews.get(leftIdx + 1).requestFocus();
                        return true;
                    } else if (rightIdx >= 0 && rightIdx + 1 < rightViews.size()) {
                        rightViews.get(rightIdx + 1).requestFocus();
                        return true;
                    }
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    if (isAudioGainFocused) {
                        return true;
                    } else if (leftIdx == 0 && finalAudioGainContent != null) {
                        finalAudioGainContent.requestFocus();
                        return true;
                    } else if (leftIdx > 0) {
                        leftViews.get(leftIdx - 1).requestFocus();
                        return true;
                    } else if (rightIdx == 0 && finalAudioGainContent != null) {
                        finalAudioGainContent.requestFocus();
                        return true;
                    } else if (rightIdx > 0) {
                        rightViews.get(rightIdx - 1).requestFocus();
                        return true;
                    }
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (isAudioGainFocused && finalAudioGainSlider != null) {
                        int currentGain = finalAudioGainSlider.getProgress();
                        int nextGain = Math.max(0, currentGain - 1);
                        finalAudioGainSlider.setProgress(nextGain);
                        if (finalAudioGainLabel != null) {
                            finalAudioGainLabel.setText(nextGain + "x");
                        }
                        emitAudioGainChange(nextGain);
                        return true;
                    } else if (rightIdx >= 0 && !leftViews.isEmpty()) {
                        int target = Math.min(rightIdx, leftViews.size() - 1);
                        leftViews.get(target).requestFocus();
                        return true;
                    }
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if (isAudioGainFocused && finalAudioGainSlider != null) {
                        int currentGain = finalAudioGainSlider.getProgress();
                        int nextGain = Math.min(10, currentGain + 1);
                        finalAudioGainSlider.setProgress(nextGain);
                        if (finalAudioGainLabel != null) {
                            finalAudioGainLabel.setText(nextGain + "x");
                        }
                        emitAudioGainChange(nextGain);
                        return true;
                    } else if (leftIdx >= 0 && !rightViews.isEmpty()) {
                        int target = Math.min(leftIdx, rightViews.size() - 1);
                        rightViews.get(target).requestFocus();
                        return true;
                    }
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                        || keyCode == KeyEvent.KEYCODE_ENTER
                        || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
                        || keyCode == KeyEvent.KEYCODE_BUTTON_A) {
                    if (isAudioGainFocused) {
                        return true;
                    }
                    if (cur != null) {
                        cur.performClick();
                        return true;
                    }
                }

                if (keyCode == KeyEvent.KEYCODE_BACK
                        || keyCode == KeyEvent.KEYCODE_BUTTON_B) {
                    resolveCurrentOption("cancel", -1, "");
                    dialog.dismiss();
                    return true;
                }

                return false;
            });
            dialog.show();
        });
    }

    private View createCompactItemView(Activity activity, OptionItem item, boolean isDanger, Runnable onClick) {
        LinearLayout btn = new LinearLayout(activity);
        btn.setOrientation(LinearLayout.HORIZONTAL);
        btn.setGravity(Gravity.CENTER_VERTICAL);
        btn.setPadding(dp(activity, 10), dp(activity, 6), dp(activity, 10), dp(activity, 6));
        btn.setFocusable(true);
        // The dialog can be opened while the window is still in touch mode.
        // Keep options focusable there so requestFocus() establishes a real
        // controller target and the focused StateListDrawable is rendered.
        btn.setFocusableInTouchMode(true);
        btn.setClickable(true);
        btn.setBackground(createOptionBackground(activity, isDanger));
        btn.setOnClickListener(v -> onClick.run());
        btn.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    v.requestFocusFromTouch();
                    v.setPressed(true);
                    return true;
                case MotionEvent.ACTION_UP:
                    boolean wasPressed = v.isPressed();
                    v.setPressed(false);
                    if (wasPressed) {
                        v.performClick();
                    }
                    return true;
                case MotionEvent.ACTION_MOVE:
                    v.setPressed(event.getX() >= 0
                            && event.getX() < v.getWidth()
                            && event.getY() >= 0
                            && event.getY() < v.getHeight());
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    v.setPressed(false);
                    return true;
                default:
                    return true;
            }
        });

        ImageView iconView = new ImageView(activity);
        iconView.setImageResource(item.iconRes);
        int iconColor = isDanger ? Color.parseColor("#FCA5A5") : Color.parseColor("#9CA3AF");
        iconView.setColorFilter(iconColor);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(
                dp(activity, 16),
                dp(activity, 16)
        );
        btn.addView(iconView, iconParams);

        TextView labelView = new TextView(activity);
        labelView.setText(item.label);
        labelView.setTextColor(isDanger ? Color.parseColor("#FCA5A5") : Color.WHITE);
        labelView.setTextSize(12);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setSingleLine(true);
        labelView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        );
        labelParams.leftMargin = dp(activity, 8);
        btn.addView(labelView, labelParams);

        if (item.active) {
            View dot = new View(activity);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setColor(Color.parseColor("#10B981"));
            dotBg.setCornerRadius(dp(activity, 4));
            dot.setBackground(dotBg);
            LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(
                    dp(activity, 6),
                    dp(activity, 6)
            );
            dotParams.leftMargin = dp(activity, 4);
            btn.addView(dot, dotParams);
        } else if (!isDanger) {
            TextView arrow = new TextView(activity);
            arrow.setText("›");
            arrow.setTextColor(Color.argb(100, 255, 255, 255));
            arrow.setTextSize(14);
            btn.addView(arrow, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            ));
        }

        return btn;
    }

    private long parseElapsedSeconds(String text) {
        if (TextUtils.isEmpty(text)) {
            return -1;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+):(\\d{2})(?::(\\d{2}))?").matcher(text);
        if (m.find()) {
            try {
                if (m.group(3) != null) {
                    long h = Long.parseLong(m.group(1));
                    long min = Long.parseLong(m.group(2));
                    long s = Long.parseLong(m.group(3));
                    return h * 3600 + min * 60 + s;
                } else {
                    long min = Long.parseLong(m.group(1));
                    long s = Long.parseLong(m.group(2));
                    return min * 60 + s;
                }
            } catch (Exception ignored) {
            }
        }
        return -1;
    }

    private String formatDuration(long totalSeconds) {
        long s = Math.max(0, totalSeconds);
        long hours = s / 3600;
        long minutes = (s % 3600) / 60;
        long seconds = s % 60;
        if (hours > 0) {
            return String.format(java.util.Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(java.util.Locale.US, "%d:%02d", minutes, seconds);
    }

    private String resolveOptionCategory(String id, String customCategory) {
        if (!TextUtils.isEmpty(customCategory)) {
            return customCategory;
        }
        if ("playtimeInfo".equals(id)) {
            return "status";
        }
        if ("togglePerformance".equals(id)
                || "toggleVirtualGamepad".equals(id)
                || "toggleRecording".equals(id)
                || "takeScreenshot".equals(id)
                || "editVirtualGamepad".equals(id)
                || "toggleMicrophone".equals(id)) {
            return "tool";
        }
        if ("pressNexus".equals(id)
                || "longPressNexus".equals(id)
                || "sendText".equals(id)) {
            return "controller";
        }
        if ("saveSessionAndDisconnect".equals(id)
                || "disconnectPowerOff".equals(id)) {
            return "session";
        }
        if ("disconnect".equals(id)) {
            return "danger";
        }
        return "general";
    }

    private int resolveOptionIconRes(String id, String label) {
        if (id == null) {
            return R.drawable.ic_bs_sliders;
        }
        switch (id) {
            case "togglePerformance":
                return R.drawable.ic_bs_activity;
            case "toggleVirtualGamepad":
                return R.drawable.ic_bs_dpad;
            case "toggleRecording":
                return (label != null && label.contains("Stop"))
                        ? R.drawable.ic_bs_stop
                        : R.drawable.ic_bs_record;
            case "takeScreenshot":
                return R.drawable.ic_bs_camera;
            case "editVirtualGamepad":
                return R.drawable.ic_bs_sliders;
            case "toggleMicrophone":
                return (label != null && (label.contains("Close") || label.contains("Mute")))
                        ? R.drawable.ic_bs_mic_mute
                        : R.drawable.ic_bs_mic;
            case "pressNexus":
            case "longPressNexus":
                return R.drawable.ic_bs_xbox;
            case "sendText":
                return R.drawable.ic_bs_chat;
            case "saveSessionAndDisconnect":
                return R.drawable.ic_bs_floppy;
            case "disconnectPowerOff":
            case "disconnect":
                return R.drawable.ic_bs_power;
            default:
                return R.drawable.ic_bs_sliders;
        }
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

    private void emitAudioGainChange(int gain) {
        WritableMap event = Arguments.createMap();
        event.putInt("value", Math.max(0, Math.min(10, gain)));
        getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("NativeInputDialogAudioGainChange", event);
    }

    private StateListDrawable createOptionBackground(Context context, boolean isDanger) {
        StateListDrawable states = new StateListDrawable();

        int normalColor = isDanger ? Color.argb(34, 239, 68, 68) : Color.argb(22, 255, 255, 255);
        int focusedColor = isDanger ? Color.argb(68, 239, 68, 68) : Color.argb(55, 255, 255, 255);
        int pressedColor = isDanger ? Color.argb(96, 239, 68, 68) : Color.argb(85, 255, 255, 255);
        int strokeColor = isDanger ? Color.parseColor("#EF4444") : Color.parseColor("#10B981");

        GradientDrawable pressed = new GradientDrawable();
        pressed.setColor(pressedColor);
        pressed.setCornerRadius(dp(context, 12));
        pressed.setStroke(dp(context, 1), strokeColor);

        GradientDrawable focused = new GradientDrawable();
        focused.setColor(focusedColor);
        focused.setCornerRadius(dp(context, 12));
        focused.setStroke(dp(context, 1.5f), strokeColor);

        GradientDrawable normal = new GradientDrawable();
        normal.setColor(normalColor);
        normal.setCornerRadius(dp(context, 12));
        normal.setStroke(dp(context, 1), isDanger ? Color.argb(45, 239, 68, 68) : Color.argb(18, 255, 255, 255));

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

    private boolean getBoolean(ReadableMap map, String key, boolean fallback) {
        if (map != null && map.hasKey(key) && !map.isNull(key)) {
            return map.getBoolean(key);
        }
        return fallback;
    }

    private int dp(Context context, float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
