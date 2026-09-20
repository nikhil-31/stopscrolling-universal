# Stop Scrolling native Windows enforcement

This directory is an Electron-independent Windows service boundary. It is not
enabled by the application packaging yet.

## Security and lifecycle

- `StopScrollingService` is an auto-start LocalSystem service. Its byte-mode
  named pipe accepts one length-prefixed (little-endian `uint32`, maximum 1 MiB)
  UTF-8 JSON request per connection. The pipe rejects remote clients, has a
  protected ACL, resolves the connected PID, validates Authenticode with full
  chain revocation, and requires the provisioned signer certificate SHA-256.
- Operations are exactly `applyPolicy`, `status`, `redeemBypass`, `inventory`,
  and `cancelNormal`. Signed envelopes contain `payload`, `signature`, and
  `keyID`. Payload is RFC 4648 base64 of the backend's snake_case,
  RFC 3339 UTC timestamp, sorted-key compact UTF-8 JSON;
  signatures are Ed25519 over those decoded bytes. Floating-point JSON is
  rejected. Key ID, raw 32-byte public key, device ID, and desktop signer
  thumbprint are mandatory signed-build inputs. There is no environment,
  command-line, or local-file authorization bypass.
- `%ProgramData%\StopScrolling` has a protected SYSTEM/Administrators ACL.
  Policy version, signed policy, and expiring redeemed nonces are replaced
  atomically with write-through. Versions must increase even after restart.
  Policy/token validity and device binding are checked before state changes.
- Accepted occurrence times are anchored to `GetTickCount64`. Wall-clock
  rollback cannot prolong or cancel an in-boot strict occurrence. After reboot,
  the signed wall deadline is verified again before a new monotonic anchor is
  created.
- `StopScrollingStrictWatchdog` is harmless unless a short-lived protected
  monotonic marker says a strict occurrence is currently active. Only then can
  it restart a crashed/stopped blocking service. Normal occurrences can be
  cancelled through the authenticated pipe and create no anti-quit marker.

Request example (before framing):

```json
{"operation":"applyPolicy","envelope":{"keyID":"production-2026","payload":"...","signature":"..."}}
```

## Enforcement

The service owns a persistent WFP provider and sublayer. Every policy
reconciliation uses one WFP transaction: all product filters are replaced or
none are. Exact and `*.domain` FQDN conditions are installed at outbound
ALE-connect v4/v6 layers. Resolved IPv4/IPv6 address filters are also refreshed
every tick for Windows versions/transports where FQDN metadata is unavailable.
This cannot stop an already-established connection; callers should apply policy
before an occurrence starts when zero setup latency matters.

The process watcher polls the kernel process snapshot every 40 ms, opens each
process with query-only access, and compares case-insensitive canonical
executable path, package family name, or Authenticode leaf certificate SHA-256.
Matches are reopened with only `PROCESS_TERMINATE`. Polling avoids a kernel
driver and undocumented ETW contracts, but a blocked process can briefly launch
and execute before termination. A signed minifilter/process-notify driver would
be required to remove that limitation.

`--cleanup` is installer-only maintenance: it removes product filters,
sublayer, provider, and protected state. Uninstall runs it elevated after both
services stop. Failed cleanup retains binaries for repair rather than leaving
unmanageable filters.

## Build and test

Production prerequisites:

1. Visual Studio 2022 17.10+ with MSVC, Windows 11 SDK/WDK, CMake, and Ninja.
   Install the checked-in vcpkg manifest dependency (`libsodium`) using a
   repository-pinned vcpkg baseline/toolchain. libsodium verifies raw RFC 8032
   Ed25519 signatures; no undocumented CNG provider is used. WFP FQDN support
   requires a current Windows servicing baseline.
2. Configure with provisioning values (never check secrets/private keys in):

```powershell
cmake -S native/windows -B out/windows -G Ninja `
  -DCMAKE_TOOLCHAIN_FILE=$env:VCPKG_ROOT\scripts\buildsystems\vcpkg.cmake `
  -DSTOPSCROLLING_KEY_ID=production-2026 `
  -DSTOPSCROLLING_PUBLIC_KEY_BASE64=<raw-ed25519-public-key> `
  -DSTOPSCROLLING_CLIENT_CERT_SHA256=<desktop-leaf-sha256> `
  -DSTOPSCROLLING_DEVICE_ID=<provisioned-device-uuid>
cmake --build out/windows
ctest --test-dir out/windows --output-on-failure
```

3. Sign both PE files with the product EV/organization certificate and
   timestamp them. Sign the MSI, too. Verify with `signtool verify /pa /all /v`.
4. Run `scripts/install.ps1` elevated, or consume
   `installer/StopScrolling.wxs` from the product WiX v4 project. MSI integration
   must preserve the cleanup custom action and must not add unconditional SCM
   recovery to `StopScrollingService`.

The portable policy tests also build on macOS/Linux:

```sh
cmake -S native/windows -B /tmp/stopscrolling-windows-core -G Ninja
cmake --build /tmp/stopscrolling-windows-core
ctest --test-dir /tmp/stopscrolling-windows-core --output-on-failure
```

macOS can validate canonical parsing, matching, stale/expiry/replay behavior,
and monotonic lifecycle logic. It cannot compile or execute SCM, named-pipe
peer authentication, CNG Ed25519, Authenticode, WFP, package identity, or
process termination. Those require the Windows SDK/WDK and an elevated,
throwaway Windows test VM; WFP tests should never run on a developer's primary
network stack.

`npm run native:prepare-release` stages a Windows artifact only after
`signtool verify /pa /all /v` succeeds on Windows. A cross-platform packaging
job must consume an artifact from that signing job and set
`STOPSCROLLING_WINDOWS_SIGNATURE_VERIFIED=1`; it must not claim to verify a PE
signature itself. Missing artifacts produce only an unavailable marker.

Roll out status-only first, then normal mode, then a small strict cohort.
Collect only helper availability, protocol/policy versions, and categorized
errors. Never log domains, application identities, paths, signed payloads,
tokens, or nonces. Validate service crash recovery, replay persistence,
normal cancellation, strict anti-quit, uninstall cleanup, and WFP cleanup on
an elevated disposable Windows VM before expanding the cohort.
