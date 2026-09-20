# Stop Scrolling native macOS enforcement

This directory contains the source boundary for macOS blocking. `BlockingCore`
is intentionally independent of Electron; the root helper verifies all remote
authorization before publishing a minimal active-policy snapshot to the two
system extensions.

## Targets

- `PrivilegedHelper`: root launch daemon and authenticated Mach-service XPC
  endpoint (`applyPolicy`, `status`, `redeemBypass`, `inventory`,
  `cancelNormal`). The peer's audit token is checked against the designated
  requirement for the signed desktop app.
- `NetworkFilterExtension`: `NEFilterDataProvider` that drops a hostname only
  when it equals a blocked domain or is its subdomain.
- `EndpointSecurityExtension`: subscribes only to `AUTH_EXEC` and denies a
  process only when an active occurrence matches signing identifier, bundle
  identifier, or exact standardized executable path.
- `HostClient`: in-process NSXPC client, `SMAppService` helper registration,
  and `OSSystemExtensionRequest` / `NEFilterManager` activation owned by
  `com.stopscrolling.desktop`.
- `BlockingCore`: canonical signed protocol, Ed25519 verification, root-owned
  policy/replay cache, monotonic deadlines, matching, and app inventory.

The Swift package is for deterministic local compilation and unit tests.
`StopScrollingMac.xcworkspace` (with `StopScrollingNative.xcodeproj`) assigns
those source directories to helper, HostClient, Network Filter, and Endpoint
Security targets and uses the checked-in plist/entitlement files under
`Resources/`. Rebuild the project with `xcodegen generate` from `project.yml`
when XcodeGen is available. Packaging into the unsigned Electron job stays
unavailable; the entitlement-bearing job uses
`electron-builder.mac-signed.yml`.

## Trust and failure behavior

Policies and bypass tokens contain base64 canonical JSON plus a base64 Ed25519
signature. Signed payload fields use the backend API's snake_case contract and
RFC 3339 UTC timestamps; the local XPC envelope uses `payload`, `signature`,
and `keyID`. The helper accepts only byte-for-byte sorted-key canonical JSON,
a matching payload/envelope key ID, a configured key ID, increasing policy versions, the
device ID from the verified policy, and valid occurrence bounds. The signing public key,
team ID, and client signing ID are signed build/provisioning inputs in the helper
Info.plist. After signature verification the helper binds to `policy.device_id`; there
is no compile-time device UUID. There
is no environment-variable, command-line, or local-file production bypass.

An accepted wall-clock deadline is converted to `systemUptime` immediately.
Published extension snapshots carry that monotonic anchor, reject snapshots
from an earlier boot, and expire without consulting the mutable wall clock.
Only a currently active, verified strict occurrence creates
`strict-active`. The launchd `PathState` watchdog therefore relaunches a crash
only during strict enforcement. Normal occurrences can be cancelled through
XPC and never create the watchdog marker. Missing, malformed, reboot-stale, or
expired extension state allows traffic/exec; an already active verified strict
snapshot remains fail-closed only until its monotonic deadline.

The policy cache is atomically replaced with mode `0600`; the production path
requires root ownership and refuses group/world-writable state. Redeemed bypass
nonces and their expirations are stored in the same root-owned state so replay
protection survives helper restarts.

## Apple capabilities and activation

These capabilities require an Apple Developer team and cannot be exercised by
an unsigned local Swift build:

1. Request Apple approval for
   `com.apple.developer.endpoint-security.client`.
2. Enable the Network Extension
   `content-filter-provider-systemextension` capability.
3. Enable System Extension install and the shared App Group on the host,
   helper, and both extensions. Replace the placeholder team prefix through
   Xcode signing settings.
4. Embed both system extensions in
   `Contents/Library/SystemExtensions`. Activate them from the signed host with
   `OSSystemExtensionRequest.activationRequest`, handling replacement and user
   approval callbacks.
5. After activation, configure and enable the content filter with
   `NEFilterManager`. Endpoint Security also requires the user's System
   Settings approval and Full Disk Access where macOS requests it.
6. Install/register the helper and launchd property list using Apple's current
   `SMAppService` privileged-helper flow from HostClient. Do not copy it from
   Electron or run installation scripts as root.
7. Sign every nested component with the same team, hardened runtime, and
   timestamp; notarize and staple the final application.

Build the signed nested binaries from the workspace, then stage them:

```sh
cd native/macos
xcodebuild -workspace StopScrollingMac.xcworkspace -scheme StopScrollingNative -configuration Release build
./scripts/export-native-artifacts.sh
# codesign --sign "$IDENTITY" --deep --strict --options runtime --timestamp <each nested binary>
STOPSCROLLING_MAC_NATIVE_ARTIFACT="$PWD/build/native-artifacts" \
STOPSCROLLING_TEAM_ID=YOURTEAMID \
  npm run dist:mac-signed
```

`npm run native:prepare-release` with that directory verifies
`codesign --verify --deep --strict` on the helper, HostClient dylib, and both
system extensions, then stages them for `electron-builder.mac-signed.yml`
(`Contents/Library/SystemExtensions`, LaunchDaemons, PrivilegedHelperTools,
and host entitlements including `system-extension.install`). Unsigned
`npm run pack` must keep shipping `release-native/UNAVAILABLE.json`.

Development Team provisioning, restricted entitlements, system-extension user
approval, and root helper installation are hard blockers for end-to-end local
enforcement. The Swift package can validate source and policy behavior without
those privileges, but it cannot activate either system extension.

## Local checks

```sh
cd native/macos
swift test
swift build
plutil -lint Resources/**/*.plist
```

Do not use `swift run StopScrollingHelper` as a development shortcut: it must
be root-installed, signed, and configured, and its XPC boundary intentionally
rejects untrusted callers.

## Packaging and rollout

`npm run native:prepare-release` stages a macOS artifact only after
`codesign --verify --deep --strict` succeeds on the helper, HostClient, and
both system extensions. With no artifact it packages an
explicit unavailable marker; Electron must continue reporting enforcement as
unavailable. Provide `STOPSCROLLING_MAC_NATIVE_ARTIFACT` only in the
entitlement-bearing release job (`npm run dist:mac-signed`).

## Signed internal Mac verification

On a signed internal Mac with Network Extension, Endpoint Security, App Group,
and Full Disk Access granted:

1. Apply a policy that lists a test host and a test app; helper `status` must
   include that occurrence ID.
2. Traffic to the listed host is dropped by the Network Filter.
3. Launching the listed app is denied with `AUTH_EXEC`.
4. Strict: Quit stays disabled for the duration of the occurrence.
5. Normal: End session cancels the occurrence through XPC.

Unsigned `npm run pack` still has no enforcement and still ships
`UNAVAILABLE.json`.

Roll out in phases: signed internal builds with enforcement disabled, staff
devices with status-only telemetry, a small strict-mode cohort, then gradual
expansion. Telemetry must contain only availability/error categories and
versions—never domains, app identities, paths, tokens, nonces, or policy
payloads. Halt rollout on helper crash loops, stale-policy rejection spikes,
or disagreement between helper strict status and the desktop UI.
