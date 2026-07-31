#[cfg(target_os = "android")]
mod platform {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_int};

    const ANDROID_LOG_INFO: c_int = 4;
    const ANDROID_LOG_WARN: c_int = 5;
    const ANDROID_LOG_ERROR: c_int = 6;
    const TAG: &str = "nano_rs";

    extern "C" {
        fn __android_log_write(prio: c_int, tag: *const c_char, text: *const c_char) -> c_int;
    }

    pub fn log(priority: c_int, message: String) {
        let Ok(tag) = CString::new(TAG) else {
            return;
        };
        let text = CString::new(message.replace('\0', " "))
            .unwrap_or_else(|_| CString::new("failed to build nano_rs log message").unwrap());
        unsafe {
            __android_log_write(priority, tag.as_ptr(), text.as_ptr());
        }
    }

    pub fn info(message: String) {
        log(ANDROID_LOG_INFO, message);
    }

    pub fn warn(message: String) {
        log(ANDROID_LOG_WARN, message);
    }

    pub fn error(message: String) {
        log(ANDROID_LOG_ERROR, message);
    }
}

#[cfg(not(target_os = "android"))]
mod platform {
    pub fn info(message: String) {
        eprintln!("[nano_rs] {message}");
    }

    pub fn warn(message: String) {
        eprintln!("[nano_rs][WARN] {message}");
    }

    pub fn error(message: String) {
        eprintln!("[nano_rs][ERROR] {message}");
    }
}

pub fn info(message: String) {
    platform::info(message);
}

pub fn warn(message: String) {
    platform::warn(message);
}

pub fn error(message: String) {
    platform::error(message);
}

#[macro_export]
macro_rules! nano_log {
    ($($arg:tt)*) => {
        $crate::logging::info(format!($($arg)*))
    };
}

#[macro_export]
macro_rules! nano_warn {
    ($($arg:tt)*) => {
        $crate::logging::warn(format!($($arg)*))
    };
}

#[macro_export]
macro_rules! nano_error {
    ($($arg:tt)*) => {
        $crate::logging::error(format!($($arg)*))
    };
}
