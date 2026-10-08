cmake_minimum_required(VERSION 3.22.1)

project(xstreaming-native)

set(XSTREAMING_LSFG_VENDOR_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/lsfg_vendor")
set(XSTREAMING_LSFG_APP_CPP_DIR "${XSTREAMING_LSFG_VENDOR_ROOT}/app")
set(XSTREAMING_LSFG_VK_ROOT "${XSTREAMING_LSFG_VENDOR_ROOT}")

if(EXISTS "${XSTREAMING_LSFG_APP_CPP_DIR}/lsfg_jni.cpp")
    set(XSTREAMING_LSFG_VULKAN_HEADERS_DIR "${XSTREAMING_LSFG_VK_ROOT}/thirdparty/vulkan-headers")
    include_directories(BEFORE "${XSTREAMING_LSFG_VULKAN_HEADERS_DIR}")

    add_library(volk STATIC "${XSTREAMING_LSFG_VK_ROOT}/thirdparty/volk/volk.c")
    target_include_directories(volk PUBLIC
        "${XSTREAMING_LSFG_VK_ROOT}/thirdparty/volk"
        "${XSTREAMING_LSFG_VULKAN_HEADERS_DIR}"
    )
    target_compile_definitions(volk PUBLIC VK_USE_PLATFORM_ANDROID_KHR=1)

    set(PEPARSE_DIR "${XSTREAMING_LSFG_VK_ROOT}/thirdparty/pe-parse/pe-parser-library")
    add_library(pe-parse STATIC
        "${PEPARSE_DIR}/src/buffer.cpp"
        "${PEPARSE_DIR}/src/parse.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/unicode_minimal.cpp"
    )
    target_include_directories(pe-parse PUBLIC "${PEPARSE_DIR}/include")
    target_compile_features(pe-parse PUBLIC cxx_std_17)

    file(GLOB_RECURSE FRAMEGEN_WATCH_SOURCES CONFIGURE_DEPENDS
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/src/*.cpp"
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/src/*.hpp"
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/include/*.hpp"
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/public/*.hpp"
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/v3.1_src/*.cpp"
        "${XSTREAMING_LSFG_VK_ROOT}/framegen/v3.1p_src/*.cpp"
    )
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
        ${FRAMEGEN_WATCH_SOURCES}
    )

    add_subdirectory("${XSTREAMING_LSFG_VK_ROOT}/thirdparty/dxbc" "${CMAKE_BINARY_DIR}/dxbc" EXCLUDE_FROM_ALL)
    add_subdirectory("${XSTREAMING_LSFG_VK_ROOT}/framegen" "${CMAKE_BINARY_DIR}/framegen" EXCLUDE_FROM_ALL)

    find_library(LSFG_LOG_LIB log)
    find_library(LSFG_NEURALNETWORKS_LIB neuralnetworks)

    add_library(lsfg-android SHARED
        "${XSTREAMING_LSFG_APP_CPP_DIR}/lsfg_jni.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/android_shader_loader.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/android_vk_probe.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/android_vk_session.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/ahb_image_bridge.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/gpu_postprocess.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/lsfg_render_loop.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/nnapi_stub.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/cpu_postprocess.cpp"
        "${XSTREAMING_LSFG_APP_CPP_DIR}/crash_reporter.cpp"
    )
    target_compile_features(lsfg-android PRIVATE cxx_std_20)
    target_include_directories(lsfg-android PRIVATE
        "${XSTREAMING_LSFG_APP_CPP_DIR}"
        "${XSTREAMING_LSFG_VULKAN_HEADERS_DIR}"
        "${XSTREAMING_LSFG_VK_ROOT}/thirdparty/volk"
        "${PEPARSE_DIR}/include"
    )
    set(LSFG_LINK_LIBS
        lsfg-vk-framegen
        dxbc
        pe-parse
        volk
        ${LSFG_LOG_LIB}
        android
    )
    if(LSFG_NEURALNETWORKS_LIB)
        list(APPEND LSFG_LINK_LIBS ${LSFG_NEURALNETWORKS_LIB})
    endif()
    target_link_libraries(lsfg-android PRIVATE ${LSFG_LINK_LIBS})
endif()
