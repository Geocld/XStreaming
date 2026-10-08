#pragma once

#include <string>

namespace lsfg_android {

// Install signal handlers (SIGSEGV/SIGABRT/SIGBUS/SIGFPE/SIGILL) that write a
// crash report to crashPath. Also opens logPath as a ring buffer that captures
// every native LOG* call. Safe to call once at JNI_OnLoad or from a single
// Kotlin init call. Subsequent calls are no-ops.
void init_crash_reporter(const std::string &crashPath, const std::string &logPath);
void set_verbose_logging(bool enabled);

// Append a line to the native ring buffer log. Used by the LOG* macros defined
// in crash_reporter_log.hpp. async-signal-safe when called outside a handler.
void ring_log(const char *tag, int level, const char *msg);

// Convenience wrapper: format like printf and push through ring_log.
void ring_logf(const char *tag, int level, const char *fmt, ...)
    __attribute__((format(printf, 3, 4)));

} // namespace lsfg_android
