#ifdef _WIN32
#include "WindowsPlatform.hpp"

#include <windows.h>

using namespace stopscrolling::windows;

namespace {
SERVICE_STATUS_HANDLE statusHandle = nullptr;
SERVICE_STATUS status{SERVICE_WIN32_OWN_PROCESS};
HANDLE stopEvent = nullptr;

void report(DWORD state) {
  status.dwCurrentState = state;
  status.dwControlsAccepted = state == SERVICE_RUNNING ? SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN : 0;
  SetServiceStatus(statusHandle, &status);
}

DWORD WINAPI control(DWORD code, DWORD, void*, void*) {
  if (code == SERVICE_CONTROL_STOP || code == SERVICE_CONTROL_SHUTDOWN) {
    report(SERVICE_STOP_PENDING);
    SetEvent(stopEvent);
  }
  return NO_ERROR;
}

void startBlockingServiceIfStopped() {
  SC_HANDLE manager = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CONNECT);
  if (!manager) return;
  SC_HANDLE service =
      OpenServiceW(manager, kServiceName, SERVICE_QUERY_STATUS | SERVICE_START);
  if (service) {
    SERVICE_STATUS_PROCESS state{};
    DWORD bytes = 0;
    if (QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO,
                             reinterpret_cast<BYTE*>(&state), sizeof(state), &bytes) &&
        state.dwCurrentState == SERVICE_STOPPED)
      StartServiceW(service, 0, nullptr);
    CloseServiceHandle(service);
  }
  CloseServiceHandle(manager);
}

void WINAPI serviceMain(DWORD, wchar_t**) {
  statusHandle = RegisterServiceCtrlHandlerExW(kWatchdogServiceName, control, nullptr);
  if (!statusHandle) return;
  report(SERVICE_START_PENDING);
  stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  report(SERVICE_RUNNING);
  while (WaitForSingleObject(stopEvent, 200) == WAIT_TIMEOUT)
    if (strictMarkerActive(monotonicNowMs())) startBlockingServiceIfStopped();
  CloseHandle(stopEvent);
  report(SERVICE_STOPPED);
}
}  // namespace

int wmain() {
  SERVICE_TABLE_ENTRYW table[] = {
      {const_cast<wchar_t*>(kWatchdogServiceName), serviceMain},
      {nullptr, nullptr},
  };
  return StartServiceCtrlDispatcherW(table) ? 0 : static_cast<int>(GetLastError());
}
#endif
