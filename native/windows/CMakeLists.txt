cmake_minimum_required(VERSION 3.25)
project(StopScrollingWindows VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68d39e7d1e0b11320ad881c9f619e40d1a20f2f4ea7edc9d6b6
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(blocking_core STATIC
  src/BlockingCore.cpp
)
target_include_directories(blocking_core PUBLIC include)
target_link_libraries(blocking_core PUBLIC nlohmann_json::nlohmann_json)
target_compile_options(blocking_core PRIVATE
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX /permissive- /utf-8>
  $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Wpedantic -Werror>
)

if(WIN32)
  foreach(required STOPSCROLLING_KEY_ID STOPSCROLLING_PUBLIC_KEY_BASE64
                   STOPSCROLLING_CLIENT_CERT_SHA256 STOPSCROLLING_DEVICE_ID)
    if(NOT DEFINED ${required} OR "${${required}}" STREQUAL "")
      message(FATAL_ERROR "${required} is required for a Windows production build")
    endif()
  endforeach()
  configure_file(src/BuildConfig.hpp.in generated/BuildConfig.hpp @ONLY)
  find_package(unofficial-sodium CONFIG REQUIRED)

  add_library(windows_platform STATIC src/WindowsPlatform.cpp)
  target_include_directories(windows_platform PUBLIC include src "${CMAKE_CURRENT_BINARY_DIR}/generated")
  target_compile_definitions(windows_platform PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
  target_link_libraries(windows_platform PUBLIC blocking_core unofficial-sodium::sodium crypt32 fwpuclnt iphlpapi ole32 oleaut32 psapi shell32 userenv wintrust wbemuuid ws2_32)

  add_executable(StopScrollingService src/Service.cpp)
  target_compile_definitions(StopScrollingService PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
  target_link_libraries(StopScrollingService PRIVATE windows_platform advapi32)

  add_executable(StopScrollingStrictWatchdog src/Watchdog.cpp)
  target_compile_definitions(StopScrollingStrictWatchdog PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
  target_link_libraries(StopScrollingStrictWatchdog PRIVATE windows_platform advapi32)

  install(TARGETS StopScrollingService StopScrollingStrictWatchdog RUNTIME DESTINATION bin)
endif()

enable_testing()
add_executable(blocking_core_tests tests/CoreTests.cpp)
target_link_libraries(blocking_core_tests PRIVATE blocking_core)
add_test(NAME blocking_core_tests COMMAND blocking_core_tests)
