package com.xstreaming.framegen;

import android.content.Context;
import android.util.Log;

import com.lsfg.android.session.NativeBridge;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class FrameGenLog {

    private static final String TAG = "FrameGenLog";
    private static final String BASE_DIR_NAME = "session_logs";
    private static final String LOG_FILENAME = "xstreaming_framegen.log";
    private static final String CRASH_FILENAME = "xstreaming_framegen_crash.log";

    private static final Object LOCK = new Object();
    private static final SimpleDateFormat TIMESTAMP_FORMAT =
            new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    private static volatile File logFile;
    private static volatile File crashFile;
    private static volatile boolean nativeInitAttempted;
    private static volatile boolean verboseEnabled;

    private FrameGenLog() {}

    public static void init(Context context) {
        if (context == null) {
            return;
        }
        Context appContext = context.getApplicationContext();
        ensureFiles(appContext);
        if (nativeInitAttempted) {
            return;
        }
        synchronized (LOCK) {
            if (nativeInitAttempted) {
                return;
            }
            try {
                NativeBridge.initCrashReporter(
                        getCrashFile(appContext).getAbsolutePath(),
                        getLogFile(appContext).getAbsolutePath()
                );
            } catch (Throwable t) {
                Log.w(TAG, "initCrashReporter failed", t);
            }
            nativeInitAttempted = true;
        }
    }

    public static void configure(Context context, boolean verbose) {
        init(context);
        verboseEnabled = verbose;
        try {
            NativeBridge.setVerboseLogging(verbose);
        } catch (Throwable t) {
            Log.w(TAG, "setVerboseLogging failed", t);
        }
    }

    public static boolean isVerboseEnabled() {
        return verboseEnabled;
    }

    public static File getLogFile(Context context) {
        return ensureFiles(context.getApplicationContext())[0];
    }

    public static File getCrashFile(Context context) {
        return ensureFiles(context.getApplicationContext())[1];
    }

    public static void d(String tag, String msg) {
        if (!verboseEnabled) {
            return;
        }
        Log.d(tag, msg);
        append('D', tag, msg, null);
    }

    public static void i(String tag, String msg) {
        if (!verboseEnabled) {
            return;
        }
        Log.i(tag, msg);
        append('I', tag, msg, null);
    }

    public static void milestone(String tag, String msg) {
        Log.i(tag, msg);
        append('I', tag, msg, null);
    }

    public static void w(String tag, String msg) {
        Log.w(tag, msg);
        append('W', tag, msg, null);
    }

    public static void w(String tag, String msg, Throwable tr) {
        Log.w(tag, msg, tr);
        append('W', tag, msg, tr);
    }

    public static void e(String tag, String msg) {
        Log.e(tag, msg);
        append('E', tag, msg, null);
    }

    public static void e(String tag, String msg, Throwable tr) {
        Log.e(tag, msg, tr);
        append('E', tag, msg, tr);
    }

    private static File[] ensureFiles(Context context) {
        File currentLogFile = logFile;
        File currentCrashFile = crashFile;
        if (currentLogFile != null && currentCrashFile != null) {
            return new File[]{currentLogFile, currentCrashFile};
        }
        synchronized (LOCK) {
            if (logFile == null || crashFile == null) {
                File baseDir = new File(context.getFilesDir(), BASE_DIR_NAME);
                if (!baseDir.exists()) {
                    baseDir.mkdirs();
                }
                logFile = new File(baseDir, LOG_FILENAME);
                crashFile = new File(baseDir, CRASH_FILENAME);
            }
            return new File[]{logFile, crashFile};
        }
    }

    private static void append(char level, String tag, String msg, Throwable tr) {
        File file = logFile;
        if (file == null) {
            return;
        }
        try (FileWriter fileWriter = new FileWriter(file, true);
             PrintWriter printWriter = new PrintWriter(fileWriter)) {
            String timestamp = TIMESTAMP_FORMAT.format(new Date());
            printWriter.print(timestamp);
            printWriter.print(' ');
            printWriter.print(level);
            printWriter.print('/');
            printWriter.print(tag);
            printWriter.print(": ");
            printWriter.println(msg);
            if (tr != null) {
                StringWriter stringWriter = new StringWriter();
                tr.printStackTrace(new PrintWriter(stringWriter));
                printWriter.println(stringWriter.toString().trim());
            }
        } catch (Throwable ignored) {
            // Best-effort only.
        }
    }
}
