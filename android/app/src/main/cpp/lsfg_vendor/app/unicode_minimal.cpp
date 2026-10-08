// Minimal UTF-16 → UTF-8 implementation for pe-parse on Android.
//
// Upstream pe-parse pulls in ICU on non-Windows platforms to implement the
// single function peparse::from_utf16. ICU is heavy on Android NDK (uses the
// platform libicu.so with an unstable ABI), so we provide our own conversion
// here. This is enough because our use case only ever reads PE resource
// directory names, which are well-formed UTF-16LE.

#include <pe-parse/to_string.h>

#include <cstdint>
#include <string>

namespace peparse {

std::string from_utf16(const UCharString &u) {
    std::string out;
    out.reserve(u.size());
    for (std::size_t i = 0; i < u.size(); ++i) {
        std::uint32_t cp = static_cast<std::uint16_t>(u[i]);
        if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < u.size()) {
            const std::uint32_t low = static_cast<std::uint16_t>(u[i + 1]);
            if (low >= 0xDC00 && low <= 0xDFFF) {
                cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                ++i;
            }
        }
        if (cp < 0x80) {
            out.push_back(static_cast<char>(cp));
        } else if (cp < 0x800) {
            out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp < 0x10000) {
            out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }
    return out;
}

} // namespace peparse
