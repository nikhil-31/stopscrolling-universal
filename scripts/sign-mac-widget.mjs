import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const widgetEntitlements = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../native/macos/Resources/Widget/Widget.entitlements",
);

function bundlePaths(context) {
  const product = context.packager?.appInfo?.productFilename ?? "Stop Scrolling";
  const appPath = join(context.appOutDir, `${product}.app`);
  return {
    appPath,
    appex: join(appPath, "Contents", "PlugIns", "StopScrollingWidget.appex"),
    reload: join(appPath, "Contents", "Frameworks", "StopScrollingWidgetReload.dylib"),
    calendar: join(appPath, "Contents", "Frameworks", "StopScrollingCalendar.dylib"),
  };
}

/** Signs the widget before electron-builder seals the app. An unsigned appex makes that signature fail. */
export async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { appex, reload, calendar } = bundlePaths(context);
  const identity = developmentIdentity();
  if (existsSync(calendar)) codesign(identity, calendar, null);
  if (!existsSync(appex)) return;
  codesign(identity, appex, widgetEntitlements);
  if (existsSync(reload)) codesign(identity, reload, null);
}

export async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { appPath, appex } = bundlePaths(context);
  if (!existsSync(appPath) || !existsSync(appex)) return;

  const identity = signingIdentity(appPath);
  const hostEntitlements = dumpEntitlements(appPath);
  try {
    codesign(identity, appex, widgetEntitlements);
    codesign(identity, appPath, hostEntitlements);
  } finally {
    rmSync(dirname(hostEntitlements), { recursive: true, force: true });
  }
}

export default afterSign;

function developmentIdentity() {
  const listed = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  const text = `${listed.stdout ?? ""}\n${listed.stderr ?? ""}`;
  return text.match(/"(Apple Development:[^"]+)"/)?.[1]
    ?? text.match(/"([^"]+)"/)?.[1]
    ?? "-";
}

function signingIdentity(appPath) {
  const result = spawnSync("codesign", ["-d", "--verbose=4", appPath], { encoding: "utf8" });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const authority = text.match(/^Authority=(.+)$/m);
  if (authority?.[1] && !authority[1].startsWith("Apple Root") && !authority[1].startsWith("Apple Worldwide")) {
    return authority[1].trim();
  }
  if (/Signature=adhoc/.test(text)) return "-";
  throw new Error("Could not read the signing identity used for the app.");
}

function dumpEntitlements(appPath) {
  const directory = mkdtempSync(join(tmpdir(), "stopscrolling-entitlements-"));
  const file = join(directory, "host.plist");
  const result = spawnSync("codesign", ["-d", "--entitlements", file, "--xml", appPath], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(file)) {
    throw new Error(result.stderr || "Could not read the app entitlements.");
  }
  const body = readFileSync(file, "utf8");
  const start = body.indexOf("<");
  if (start > 0) writeFileSync(file, body.slice(start));
  return file;
}

function codesign(identity, target, entitlements) {
  const args = ["--force", "--sign", identity, "--options", "runtime"];
  if (entitlements) args.push("--entitlements", entitlements, "--generate-entitlement-der");
  if (identity !== "-") args.push("--timestamp");
  args.push(target);
  const signed = spawnSync("codesign", args, { encoding: "utf8" });
  if (signed.status === 0) return;
  if (identity === "-") {
    throw new Error(signed.stderr || `codesign failed for ${target}`);
  }
  const retry = spawnSync("codesign", args.filter((arg) => arg !== "--timestamp"), { encoding: "utf8" });
  if (retry.status !== 0) throw new Error(retry.stderr || signed.stderr || `codesign failed for ${target}`);
}
