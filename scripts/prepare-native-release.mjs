import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const output = resolve("release-native");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

export const MAC_NATIVE_LAYOUT = [
  "libStopScrollingHostClient.dylib",
  "PrivilegedHelperTools/com.stopscrolling.helper",
  "LaunchDaemons/com.stopscrolling.helper.plist",
  "SystemExtensions/com.stopscrolling.desktop.endpoint-security.systemextension",
];

function stage(source, platform) {
  if (!source || !existsSync(source)) {
    throw new Error(`${platform} native artifact is missing`);
  }
  const destination = join(output, platform, basename(source));
  mkdirSync(join(output, platform), { recursive: true });
  cpSync(source, destination, { recursive: true, errorOnExist: true });
}

function verifyCodesign(path) {
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", path], {
    stdio: "inherit",
  });
}

function requiredMacArtifact(root, relative) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    throw new Error(`macOS native artifact is missing ${relative}`);
  }
  return path;
}

function profileValue(profilePath, keyPath) {
  const decoded = execFileSync("/usr/bin/security", ["cms", "-D", "-i", profilePath]);
  return execFileSync("/usr/bin/plutil", ["-extract", keyPath, "raw", "-o", "-", "-"], { input: decoded })
    .toString()
    .trim();
}

function hostProfile() {
  const profile = process.env.STOPSCROLLING_MAC_PROVISIONING_PROFILE;
  if (!profile || !existsSync(profile)) {
    throw new Error(
      "STOPSCROLLING_MAC_PROVISIONING_PROFILE must point to the com.stopscrolling.desktop profile; without it macOS refuses to launch a host that can install a system extension",
    );
  }
  const applicationIdentifier = profileValue(profile, "Entitlements.com\\.apple\\.application-identifier");
  const teamIdentifier = profileValue(profile, "Entitlements.com\\.apple\\.developer\\.team-identifier");
  if (applicationIdentifier !== `${teamIdentifier}.com.stopscrolling.desktop`) {
    throw new Error(`Provisioning profile is for ${applicationIdentifier}, expected com.stopscrolling.desktop`);
  }
  return { profile, applicationIdentifier, teamIdentifier };
}

function stageMacNativeDirectory(root) {
  for (const relative of MAC_NATIVE_LAYOUT) {
    const source = requiredMacArtifact(root, relative);
    if (relative.endsWith(".plist")) continue;
    verifyCodesign(source);
  }
  const { profile, applicationIdentifier, teamIdentifier } = hostProfile();
  const destination = join(output, "macos");
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(root)) {
    cpSync(join(root, entry), join(destination, entry), { recursive: true });
  }
  rmSync(join(destination, "SystemExtensions", "com.stopscrolling.desktop.network-filter.systemextension"), {
    recursive: true,
    force: true,
  });
  cpSync(profile, join(destination, "embedded.provisionprofile"));
  const entitlements = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>com.apple.application-identifier</key>",
    `  <string>${applicationIdentifier}</string>`,
    "  <key>com.apple.developer.team-identifier</key>",
    `  <string>${teamIdentifier}</string>`,
    "  <key>com.apple.security.cs.allow-jit</key>",
    "  <true/>",
    "  <key>com.apple.security.automation.apple-events</key>",
    "  <true/>",
    "  <key>com.apple.developer.system-extension.install</key>",
    "  <true/>",
    "  <key>com.apple.security.application-groups</key>",
    "  <array>",
    `    <string>${teamIdentifier}.group.com.stopscrolling.shared</string>`,
    "  </array>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
  writeFileSync(join(destination, "StopScrolling.entitlements"), entitlements);
}

const macArtifact = process.env.STOPSCROLLING_MAC_NATIVE_ARTIFACT;
const windowsArtifact = process.env.STOPSCROLLING_WINDOWS_NATIVE_ARTIFACT;

if (macArtifact) {
  if (process.platform !== "darwin") {
    throw new Error("macOS native artifacts must be verified on macOS");
  }
  if (!existsSync(macArtifact)) {
    throw new Error("macOS native artifact is missing");
  }
  if (statSync(macArtifact).isDirectory()) {
    stageMacNativeDirectory(resolve(macArtifact));
  } else {
    throw new Error(
      "STOPSCROLLING_MAC_NATIVE_ARTIFACT must be a directory containing the helper, HostClient dylib, and the endpoint-security system extension",
    );
  }
}

if (windowsArtifact) {
  if (process.platform === "win32") {
    execFileSync("signtool.exe", ["verify", "/pa", "/all", "/v", windowsArtifact], {
      stdio: "inherit",
    });
  } else if (process.env.STOPSCROLLING_WINDOWS_SIGNATURE_VERIFIED !== "1") {
    throw new Error("Windows artifact requires Windows signtool verification");
  }
  stage(windowsArtifact, "windows");
}

if (!macArtifact && !windowsArtifact) {
  writeFileSync(
    join(output, "UNAVAILABLE.json"),
    `${JSON.stringify({ policyEnforcement: false, reason: "signed-native-artifacts-not-staged" })}\n`,
  );
}
