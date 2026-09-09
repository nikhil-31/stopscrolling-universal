import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const APP_NAME = "StopScrolling";
const BUNDLE_ID = "com.stopscrolling.desktop";

function readPlist(plistPath) {
  return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plistPath], { encoding: "utf8" }));
}

function writePlist(plistPath, value) {
  writeFileSync(plistPath, JSON.stringify(value));
  execFileSync("plutil", ["-convert", "xml1", plistPath]);
}

function bundleHasRelativeFrameworkLinks(destApp) {
  try {
    const link = readlinkSync(join(destApp, "Contents/Frameworks/Electron Framework.framework/Resources"));
    return Boolean(link) && !link.startsWith("/");
  } catch {
    return false;
  }
}

export function ensureMacosDevApp() {
  if (process.platform !== "darwin") return "";
  const electronDir = dirname(require.resolve("electron/package.json"));
  const sourceApp = join(electronDir, "dist", "Electron.app");
  if (!existsSync(sourceApp)) {
    throw new Error(`Electron.app not found at ${sourceApp}`);
  }
  const destApp = join(process.cwd(), "out", "dev", `${APP_NAME}.app`);
  const destBinary = join(destApp, "Contents", "MacOS", "Electron");
  const sourcePlist = readPlist(join(sourceApp, "Contents", "Info.plist"));
  const destPlistPath = join(destApp, "Contents", "Info.plist");
  const alreadyBranded =
    existsSync(destBinary) &&
    existsSync(destPlistPath) &&
    bundleHasRelativeFrameworkLinks(destApp) &&
    readPlist(destPlistPath).CFBundleIdentifier === BUNDLE_ID &&
    readPlist(destPlistPath).CFBundleShortVersionString === sourcePlist.CFBundleShortVersionString;

  if (!alreadyBranded) {
    rmSync(destApp, { recursive: true, force: true });
    mkdirSync(dirname(destApp), { recursive: true });
    execFileSync("ditto", [sourceApp, destApp]);
    const plist = readPlist(destPlistPath);
    plist.CFBundleName = APP_NAME;
    plist.CFBundleDisplayName = APP_NAME;
    plist.CFBundleIdentifier = BUNDLE_ID;
    plist.NSAppleEventsUsageDescription =
      "StopScrolling reads the frontmost app and browser tab so it can record screen time.";
    writePlist(destPlistPath, plist);
  }
  execFileSync("codesign", ["--force", "--sign", "-", "--identifier", BUNDLE_ID, destApp], {
    stdio: "ignore",
  });
  try {
    execFileSync(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", destApp],
      { stdio: "ignore" },
    );
  } catch {
    // Launch Services registration is best-effort for the Accessibility prompt name.
  }
  return destBinary;
}
