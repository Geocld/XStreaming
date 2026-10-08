#include "crash_reporter.hpp"

#include <android/log.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/system_properties.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <mutex>

// Best-effort unwinder. Available since NDK r23+. If _Unwind_Backtrace is not
// resolvable at runtime we fall back to writing only the signal + context info.
#include <unwind.h>

namespace lsfg_android {

namespace {

constexpr size_t kMaxFrames = 64;
constexpr size_t kLogRingBytes = 128 * 1024;   // 128 KB
constexpr size_t kLogRingHalf = kLogRingBytes / 2;

struct Ring {
    char buf[kLogRingBytes]{};
    std::atomic<size_t> head{0};
    std::atomic<bool> wrapped{false};
    int fileFd{-1};     // optional mirror file (append-only)
    pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
};

Ring g_ring;
std::atomic<bool> g_initialized{false};
std::atomic<bool> g_verboseLogging{false};
char g_crashPath[512] = {0};
int g_crashFdTemplate = -1;   // reserved not used; we open fresh on crash

// Async-signal-safe write of a C string to fd.
void sig_write(int fd, const char *s) {
    if (fd < 0 || s == nullptr) return;
    size_t n = 0;
    while (s[n] != '\0') ++n;
    ssize_t done = 0;
    while (done < static_cast<ssize_t>(n)) {
        ssize_t r = write(fd, s + done, n - done);
        if (r <= 0) {
            if (r == -1 && errno == EINTR) continue;
            break;
        }
        done += r;
    }
}

// Async-signal-safe unsigned hex writer (no malloc).
void sig_write_hex(int fd, uintptr_t v) {
    char out[2 + 2 * sizeof(uintptr_t) + 1];
    out[0] = '0'; out[1] = 'x';
    const char *digits = "0123456789abcdef";
    int w = 2 * static_cast<int>(sizeof(uintptr_t));
    for (int i = w - 1; i >= 0; --i) {
        out[2 + i] = digits[v & 0xFu];
        v >>= 4;
    }
    out[2 + w] = '\0';
    sig_write(fd, out);
}

void sig_write_dec(int fd, long v) {
    if (v == 0) { sig_write(fd, "0"); return; }
    char out[32];
    int i = static_cast<int>(sizeof(out)) - 1;
    out[i--] = '\0';
    bool neg = v < 0;
    unsigned long uv = neg ? static_cast<unsigned long>(-v) : static_cast<unsigned long>(v);
    while (uv > 0 && i >= 0) {
        out[i--] = '0' + (uv % 10);
        uv /= 10;
    }
    if (neg && i >= 0) out[i--] = '-';
    sig_write(fd, &out[i + 1]);
}

struct UnwindCtx {
    int fd;
    int count;
};

_Unwind_Reason_Code unwind_cb(struct _Unwind_Context *ctx, void *arg) {
    auto *uc = static_cast<UnwindCtx *>(arg);
    if (uc->count >= static_cast<int>(kMaxFrames)) return _URC_END_OF_STACK;
    uintptr_t pc = _Unwind_GetIP(ctx);
    if (pc == 0) return _URC_END_OF_STACK;

    // Write "  #NN pc 0xADDR  libname+offset\n" using only async-signal-safe ops.
    sig_write(uc->fd, "  #");
    sig_write_dec(uc->fd, uc->count);
    sig_write(uc->fd, " pc ");
    sig_write_hex(uc->fd, pc);

    Dl_info info{};
    // dladdr is NOT guaranteed async-signal-safe on all platforms; on Android
    // bionic it takes no global locks and is widely used by other crash
    // reporters (Breakpad, etc.) from inside signal handlers. The cost of the
    // occasional hang is acceptable — we're already crashed.
    if (dladdr(reinterpret_cast<void *>(pc), &info) != 0 && info.dli_fname != nullptr) {
        sig_write(uc->fd, "  ");
        sig_write(uc->fd, info.dli_fname);
        uintptr_t base = reinterpret_cast<uintptr_t>(info.dli_fbase);
        if (base != 0 && pc >= base) {
            sig_write(uc->fd, "+");
            sig_write_hex(uc->fd, pc - base);
        }
        if (info.dli_sname != nullptr) {
            sig_write(uc->fd, " ");
            sig_write(uc->fd, info.dli_sname);
        }
    }
    sig_write(uc->fd, "\n");

    uc->count += 1;
    return _URC_NO_REASON;
}

const char *signo_name(int sig) {
    switch (sig) {
        case SIGSEGV: return "SIGSEGV";
        case SIGABRT: return "SIGABRT";
        case SIGBUS:  return "SIGBUS";
        case SIGFPE:  return "SIGFPE";
        case SIGILL:  return "SIGILL";
        case SIGTRAP: return "SIGTRAP";
        default:      return "signal";
    }
}

// Dump the ring buffer contents (from tail to head, respecting wrap).
void dump_ring_locked(int fd) {
    const bool wrapped = g_ring.wrapped.load(std::memory_order_acquire);
    const size_t head = g_ring.head.load(std::memory_order_acquire);
    if (!wrapped) {
        if (head > 0) {
            const ssize_t w = write(fd, g_ring.buf, head);
            (void)w;
        }
        return;
    }
    // Wrapped: write [head..end) then [0..head).
    if (kLogRingBytes > head) {
        const ssize_t w1 = write(fd, g_ring.buf + head, kLogRingBytes - head);
        (void)w1;
    }
    if (head > 0) {
        const ssize_t w2 = write(fd, g_ring.buf, head);
        (void)w2;
    }
}

void append_prop(int fd, const char *label, const char *key) {
    char buf[PROP_VALUE_MAX] = {0};
    __system_property_get(key, buf);
    sig_write(fd, label);
    sig_write(fd, buf);
    sig_write(fd, "\n");
}

// Main handler. Runs on the alternate signal stack.
struct sigaction g_prev[7] = {};
const int g_signals[] = {SIGSEGV, SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGTRAP};

void signal_handler(int sig, siginfo_t *info, void *ucontext) {
    // Open the crash file. O_CREAT|O_TRUNC each time: only the latest crash
    // is relevant for the "share crash" dialog, previous crashes are in the
    // ring log anyway.
    int fd = -1;
    if (g_crashPath[0] != '\0') {
        fd = open(g_crashPath, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    }
    if (fd < 0) {
        // Fall back to logcat only — can't persist but at least we'll see it.
        // Re-raise to default handler to keep Android's tombstone flow.
        sigaction(sig, &g_prev[0], nullptr); // imprecise index, acceptable at crash time
        raise(sig);
        return;
    }

    sig_write(fd, "=== LSFG native crash ===\n");
    sig_write(fd, "signal: ");
    sig_write(fd, signo_name(sig));
    sig_write(fd, " (");
    sig_write_dec(fd, sig);
    sig_write(fd, ")\n");
    if (info != nullptr) {
        sig_write(fd, "si_code: ");
        sig_write_dec(fd, info->si_code);
        sig_write(fd, "\nfault_addr: ");
        sig_write_hex(fd, reinterpret_cast<uintptr_t>(info->si_addr));
        sig_write(fd, "\n");
    }
    sig_write(fd, "pid: "); sig_write_dec(fd, getpid());
    sig_write(fd, " tid: "); sig_write_dec(fd, gettid());
    sig_write(fd, "\n");

    append_prop(fd, "device: ", "ro.product.model");
    append_prop(fd, "manufacturer: ", "ro.product.manufacturer");
    append_prop(fd, "android: ", "ro.build.version.release");
    append_prop(fd, "sdk: ", "ro.build.version.sdk");
    append_prop(fd, "soc: ", "ro.soc.model");

    sig_write(fd, "\n--- native backtrace ---\n");
    UnwindCtx uc{fd, 0};
    _Unwind_Backtrace(unwind_cb, &uc);
    if (uc.count == 0) {
        sig_write(fd, "  (empty — unwind unavailable)\n");
    }

    sig_write(fd, "\n--- recent native log ---\n");
    dump_ring_locked(fd);
    sig_write(fd, "=== end ===\n");

    fsync(fd);
    close(fd);

    // Chain to previous handler (usually SIG_DFL → tombstone). Find by signum.
    for (size_t i = 0; i < sizeof(g_signals) / sizeof(g_signals[0]); ++i) {
        if (g_signals[i] == sig) {
            sigaction(sig, &g_prev[i], nullptr);
            break;
        }
    }
    raise(sig);
}

void install_handlers() {
    // Alternate stack: required because SIGSEGV may happen due to stack
    // overflow, in which case we can't run the handler on the faulting stack.
    static stack_t alt_stack{};
    static uint8_t alt_buf[SIGSTKSZ * 2];
    alt_stack.ss_sp = alt_buf;
    alt_stack.ss_size = sizeof(alt_buf);
    alt_stack.ss_flags = 0;
    sigaltstack(&alt_stack, nullptr);

    struct sigaction sa{};
    sa.sa_sigaction = signal_handler;
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK;
    sigemptyset(&sa.sa_mask);
    for (size_t i = 0; i < sizeof(g_signals) / sizeof(g_signals[0]); ++i) {
        sigaction(g_signals[i], &sa, &g_prev[i]);
    }
}

} // namespace

void init_crash_reporter(const std::string &crashPath, const std::string &logPath) {
    bool expected = false;
    if (!g_initialized.compare_exchange_strong(expected, true)) return;

    if (!crashPath.empty() && crashPath.size() < sizeof(g_crashPath)) {
        memcpy(g_crashPath, crashPath.c_str(), crashPath.size());
        g_crashPath[crashPath.size()] = '\0';
    }

    if (!logPath.empty()) {
        // Append, don't truncate. If we truncate at every process start we
        // lose the log of the *previous* session — exactly when the user
        // wants to inspect a crash. Cap growth by trimming at open time when
        // the file exceeds ~1 MB, keeping the most recent half.
        struct stat st{};
        if (stat(logPath.c_str(), &st) == 0 && st.st_size > 1 * 1024 * 1024) {
            // Read the tail, truncate, rewrite. Cheap, runs once per process.
            constexpr off_t kKeep = 512 * 1024;
            int rfd = open(logPath.c_str(), O_RDONLY);
            if (rfd >= 0) {
                if (lseek(rfd, st.st_size - kKeep, SEEK_SET) == st.st_size - kKeep) {
                    char *buf = static_cast<char *>(malloc(kKeep));
                    if (buf != nullptr) {
                        ssize_t r = read(rfd, buf, kKeep);
                        close(rfd);
                        if (r > 0) {
                            int tfd = open(logPath.c_str(), O_WRONLY | O_TRUNC, 0644);
                            if (tfd >= 0) {
                                ssize_t w = write(tfd, buf, r);
                                (void)w;
                                close(tfd);
                            }
                        }
                        free(buf);
                    }
                } else {
                    close(rfd);
                }
            }
        }
        int fd = open(logPath.c_str(), O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            g_ring.fileFd = fd;
            // Mark a fresh session so the boundary is visible in the log.
            const char marker[] = "\n=== new session ===\n";
            ssize_t w = write(fd, marker, sizeof(marker) - 1);
            (void)w;
        }
    }

    install_handlers();
}

void set_verbose_logging(bool enabled) {
    g_verboseLogging.store(enabled, std::memory_order_release);
}

void ring_log(const char *tag, int level, const char *msg) {
    if (tag == nullptr) tag = "lsfg";
    if (msg == nullptr) msg = "";
    if (!g_verboseLogging.load(std::memory_order_acquire) && level < ANDROID_LOG_WARN) {
        return;
    }

    // Timestamp (wall clock).
    struct timespec ts{};
    clock_gettime(CLOCK_REALTIME, &ts);
    struct tm tm{};
    localtime_r(&ts.tv_sec, &tm);

    char line[1024];
    const char lvl = (level == ANDROID_LOG_ERROR) ? 'E'
                   : (level == ANDROID_LOG_WARN)  ? 'W'
                   : (level == ANDROID_LOG_INFO)  ? 'I'
                   : 'D';
    int n = snprintf(line, sizeof(line),
                     "%02d:%02d:%02d.%03ld %c/%s: %s\n",
                     tm.tm_hour, tm.tm_min, tm.tm_sec,
                     ts.tv_nsec / 1000000L, lvl, tag, msg);
    if (n <= 0) return;
    if (static_cast<size_t>(n) >= sizeof(line)) n = sizeof(line) - 1;

    // Write to logcat first — if the process dies before anything else, at
    // least the dev with adb still sees it.
    __android_log_write(level, tag, msg);

    // Mirror into the ring buffer (lock is cheap, not held during fsync).
    pthread_mutex_lock(&g_ring.mu);
    size_t head = g_ring.head.load(std::memory_order_relaxed);
    for (int i = 0; i < n; ++i) {
        g_ring.buf[head] = line[i];
        head += 1;
        if (head >= kLogRingBytes) {
            head = 0;
            g_ring.wrapped.store(true, std::memory_order_release);
        }
    }
    g_ring.head.store(head, std::memory_order_release);

    // Mirror into the on-disk log too. Not async-signal-safe, so the signal
    // handler uses the ring instead and never touches the disk mirror.
    if (g_ring.fileFd >= 0) {
        ssize_t w = write(g_ring.fileFd, line, n);
        (void)w;
    }
    pthread_mutex_unlock(&g_ring.mu);
}

void ring_logf(const char *tag, int level, const char *fmt, ...) {
    char buf[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    ring_log(tag, level, buf);
}

} // namespace lsfg_android
