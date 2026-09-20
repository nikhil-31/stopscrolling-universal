#ifdef _WIN32
#include "WindowsPlatform.hpp"

#include "BuildConfig.hpp"

#include <nlohmann/json.hpp>
#include <sddl.h>

#include <atomic>
#include <mutex>
#include <thread>

using namespace stopscrolling;
using namespace stopscrolling::windows;
using json = nlohmann::json;

namespace {
SERVICE_STATUS_HANDLE statusHandle = nullptr;
SERVICE_STATUS status{SERVICE_WIN32_OWN_PROCESS};
HANDLE stopEvent = nullptr;
std::atomic_bool stopping{false};

SignedEnvelope envelope(const json& value) {
  return {value.at("payload").get<std::string>(), value.at("signature").get<std::string>(),
          value.at("keyID").get<std::string>()};
}

json occurrenceJson(const Occurrence& value) {
  return {{"id", value.id},
          {"startsAt", value.startsAt},
          {"endsAt", value.endsAt},
          {"mode", value.mode == Mode::strict ? "strict" : "normal"}};
}

class Runtime {
 public:
  Runtime()
      : engine_(store_, productionSignatureVerifier(), build::kDeviceID) {
    try {
      engine_.restore(unixNow(), monotonicNowMs());
    } catch (const ProtocolError& error) {
      // Expired or corrupt cached state is not activated. The highest accepted
      // version remains in ProgramData and still prevents policy downgrade.
      lastError_ = error.what();
    }
    publish();
  }

  json request(const json& request) {
    std::scoped_lock lock(mutex_);
    const auto operation = request.at("operation").get<std::string>();
    if (operation == "applyPolicy") {
      engine_.apply(envelope(request.at("envelope")), unixNow(), monotonicNowMs());
      publishLocked();
    } else if (operation == "redeemBypass") {
      engine_.redeem(envelope(request.at("envelope")), unixNow(), monotonicNowMs());
      publishLocked();
    } else if (operation == "cancelNormal") {
      engine_.cancelNormal(request.at("occurrenceID").get<std::string>());
      publishLocked();
    } else if (operation == "inventory") {
      return json::parse(installedApplicationInventoryJson());
    } else if (operation != "status") {
      throw ProtocolError("unknownOperation");
    }
    return statusLocked();
  }

  void tick() {
    std::scoped_lock lock(mutex_);
    publishLocked();
  }

  void stop() {
    std::scoped_lock lock(mutex_);
    const auto strictDeadline = engine_.strictDeadline(monotonicNowMs());
    processes_.replace({});
    wfp_.removeAll();
    if (!strictDeadline) writeStrictMarker(std::nullopt);
  }

 private:
  json statusLocked() {
    const auto active = engine_.active(monotonicNowMs());
    json activeIDs = json::array(), strictIDs = json::array();
    for (const auto& item : active) {
      activeIDs.push_back(item.id);
      if (item.mode == Mode::strict) strictIDs.push_back(item.id);
    }
    return {{"policyVersion", engine_.policyVersion().has_value()
                                 ? json(*engine_.policyVersion())
                                 : json(nullptr)},
            {"activeOccurrenceIDs", activeIDs},
            {"strictOccurrenceIDs", strictIDs},
            {"lastError", lastError_.empty() ? json(nullptr) : json(lastError_)}};
  }

  void publish() {
    std::scoped_lock lock(mutex_);
    publishLocked();
  }

  void publishLocked() {
    try {
      const auto current = engine_.active(monotonicNowMs());
      wfp_.replace(current);
      processes_.replace(current);
      writeStrictMarker(engine_.strictDeadline(monotonicNowMs()));
      lastError_.clear();
    } catch (const std::exception& error) {
      lastError_ = error.what();
      // Existing persistent WFP filters are intentionally left in place if an
      // atomic replacement fails. A subsequent tick retries reconciliation.
      throw;
    }
  }

  ProgramDataStore store_;
  PolicyEngine engine_;
  WfpEnforcer wfp_;
  ProcessWatcher processes_;
  std::mutex mutex_;
  std::string lastError_;
};

bool readExact(HANDLE pipe, void* data, DWORD size) {
  auto* cursor = static_cast<std::byte*>(data);
  while (size) {
    DWORD read = 0;
    if (!ReadFile(pipe, cursor, size, &read, nullptr) || read == 0) return false;
    cursor += read;
    size -= read;
  }
  return true;
}

bool writeExact(HANDLE pipe, const void* data, DWORD size) {
  const auto* cursor = static_cast<const std::byte*>(data);
  while (size) {
    DWORD written = 0;
    if (!WriteFile(pipe, cursor, size, &written, nullptr) || written == 0) return false;
    cursor += written;
    size -= written;
  }
  return true;
}

void serveClient(HANDLE pipe, Runtime& runtime) {
  json response;
  try {
    if (!authenticatePipeClient(pipe)) throw ProtocolError("unauthorizedClient");
    std::uint32_t size = 0;
    if (!readExact(pipe, &size, sizeof(size)) || size == 0 || size > 1024 * 1024)
      throw ProtocolError("malformedEnvelope");
    std::string input(size, '\0');
    if (!readExact(pipe, input.data(), size)) throw ProtocolError("malformedEnvelope");
    response = {{"ok", true}, {"result", runtime.request(json::parse(input))}};
  } catch (const std::exception& error) {
    response = {{"ok", false}, {"error", error.what()}};
  }
  const auto output = response.dump();
  const auto size = static_cast<std::uint32_t>(output.size());
  writeExact(pipe, &size, sizeof(size));
  writeExact(pipe, output.data(), size);
  FlushFileBuffers(pipe);
}

HANDLE createPipe() {
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  constexpr wchar_t acl[] = L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)";
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
          acl, SDDL_REVISION_1, &descriptor, nullptr))
    throw std::system_error(GetLastError(), std::system_category());
  SECURITY_ATTRIBUTES attributes{sizeof(attributes), descriptor, FALSE};
  HANDLE pipe = CreateNamedPipeW(
      kPipeName, PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
      PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_REJECT_REMOTE_CLIENTS, 1, 1024 * 1024,
      1024 * 1024, 0, &attributes);
  LocalFree(descriptor);
  if (pipe == INVALID_HANDLE_VALUE) throw std::system_error(GetLastError(), std::system_category());
  return pipe;
}

void report(DWORD state, DWORD exitCode = NO_ERROR) {
  status.dwCurrentState = state;
  status.dwWin32ExitCode = exitCode;
  status.dwControlsAccepted = state == SERVICE_RUNNING ? SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN : 0;
  SetServiceStatus(statusHandle, &status);
}

DWORD WINAPI control(DWORD code, DWORD, void*, void*) {
  if (code == SERVICE_CONTROL_STOP || code == SERVICE_CONTROL_SHUTDOWN) {
    report(SERVICE_STOP_PENDING);
    stopping = true;
    SetEvent(stopEvent);
    // Wake a pending ConnectNamedPipe without accepting an unauthenticated request.
    HANDLE wake = CreateFileW(kPipeName, GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (wake != INVALID_HANDLE_VALUE) CloseHandle(wake);
  }
  return NO_ERROR;
}

bool runningAsSystem() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  DWORD size = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &size);
  std::vector<std::byte> bytes(size);
  const BOOL ok = GetTokenInformation(token, TokenUser, bytes.data(), size, &size);
  BYTE systemSid[SECURITY_MAX_SID_SIZE]{};
  DWORD sidSize = sizeof(systemSid);
  CreateWellKnownSid(WinLocalSystemSid, nullptr, systemSid, &sidSize);
  const bool result =
      ok && EqualSid(reinterpret_cast<TOKEN_USER*>(bytes.data())->User.Sid, systemSid);
  CloseHandle(token);
  return result;
}

void WINAPI serviceMain(DWORD, wchar_t**) {
  statusHandle = RegisterServiceCtrlHandlerExW(kServiceName, control, nullptr);
  if (!statusHandle) return;
  report(SERVICE_START_PENDING);
  if (!runningAsSystem()) {
    report(SERVICE_STOPPED, ERROR_SERVICE_LOGON_FAILED);
    return;
  }
  stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  try {
    Runtime runtime;
    HANDLE pipe = createPipe();
    report(SERVICE_RUNNING);
    std::thread ticker([&] {
      while (WaitForSingleObject(stopEvent, 500) == WAIT_TIMEOUT) {
        try {
          runtime.tick();
        } catch (...) {
        }
      }
    });
    while (!stopping) {
      const BOOL connected = ConnectNamedPipe(pipe, nullptr)
                                 ? TRUE
                                 : GetLastError() == ERROR_PIPE_CONNECTED;
      if (connected && !stopping) serveClient(pipe, runtime);
      DisconnectNamedPipe(pipe);
    }
    ticker.join();
    runtime.stop();
    CloseHandle(pipe);
    report(SERVICE_STOPPED);
  } catch (...) {
    report(SERVICE_STOPPED, ERROR_SERVICE_SPECIFIC_ERROR);
  }
  CloseHandle(stopEvent);
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && wcscmp(argv[1], L"--cleanup") == 0) {
    try {
      WfpEnforcer enforcer;
      enforcer.removeAll(true);
      std::error_code ignored;
      std::filesystem::remove_all(programDataDirectory(), ignored);
      return ignored ? 1 : 0;
    } catch (...) {
      return 1;
    }
  }
  SERVICE_TABLE_ENTRYW table[] = {
      {const_cast<wchar_t*>(kServiceName), serviceMain},
      {nullptr, nullptr},
  };
  return StartServiceCtrlDispatcherW(table) ? 0 : static_cast<int>(GetLastError());
}
#endif
