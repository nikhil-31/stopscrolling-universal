#pragma once

#ifdef _WIN32
#include <windows.h>

#include "BlockingCore.hpp"

#include <atomic>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace stopscrolling::windows {

inline constexpr wchar_t kServiceName[] = L"StopScrollingService";
inline constexpr wchar_t kWatchdogServiceName[] = L"StopScrollingStrictWatchdog";
inline constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\StopScrolling.Blocking.v1";

std::filesystem::path programDataDirectory();
std::int64_t unixNow();
std::uint64_t monotonicNowMs();

class ProgramDataStore final : public StateStore {
 public:
  ProgramDataStore();
  PersistedState load() override;
  void save(const PersistedState&) override;

 private:
  std::filesystem::path path_;
  std::mutex mutex_;
};

SignatureVerifier productionSignatureVerifier();
bool authenticatePipeClient(HANDLE pipe);
std::string installedApplicationInventoryJson();

class WfpEnforcer {
 public:
  WfpEnforcer();
  ~WfpEnforcer();
  void replace(const std::vector<Occurrence>& active);
  void removeAll(bool removeObjects = false);

 private:
  void* engine_{};
};

class ProcessWatcher {
 public:
  ProcessWatcher();
  ~ProcessWatcher();
  void replace(const std::vector<Occurrence>& active);
  void stop();

 private:
  void run();
  std::mutex mutex_;
  std::vector<AppIdentity> blocked_;
  std::atomic_bool stopping_{false};
  std::thread worker_;
};

void writeStrictMarker(std::optional<std::uint64_t> deadlineTickMs);
bool strictMarkerActive(std::uint64_t tickNow);

}  // namespace stopscrolling::windows
#endif
