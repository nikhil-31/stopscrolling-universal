import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const native = join(root, "native/macos");
const derived = join(native, ".derivedData/widget-build");
const pack = join(native, ".derivedData/widget-pack");

if (process.platform !== "darwin") {
  console.log("Skipping the macOS widget build on this platform.");
  process.exit(0);
}

function teamFromIdentity() {
  const listed = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  const match = `${listed.stdout ?? ""}\n${listed.stderr ?? ""}`.match(/Apple Development:[^(]+\(([A-Z0-9]{10})\)/);
  return match?.[1] ?? "";
}

const team = process.env.STOPSCROLLING_TEAM_ID || teamFromIdentity() || "B8NU7A4C87";
rmSync(derived, { recursive: true, force: true });
mkdirSync(pack, { recursive: true });

const built = spawnSync("xcodebuild", [
  "-project", join(native, "StopScrollingNative.xcodeproj"),
  "-target", "StopScrollingWidget",
  "-configuration", "Release",
  `SYMROOT=${join(derived, "sym")}`,
  `OBJROOT=${join(derived, "obj")}`,
  "CODE_SIGNING_ALLOWED=NO",
  "CODE_SIGNING_REQUIRED=NO",
  "CODE_SIGN_IDENTITY=",
  `DEVELOPMENT_TEAM=${team}`,
  "build",
], { stdio: "inherit" });
if (built.status !== 0) process.exit(built.status ?? 1);

const appex = join(derived, "sym/Release/StopScrollingWidget.appex");
rmSync(join(pack, "StopScrollingWidget.appex"), { recursive: true, force: true });
cpSync(appex, join(pack, "StopScrollingWidget.appex"), { recursive: true });

const reload = join(pack, "StopScrollingWidgetReload.dylib");
const reloadSource = join(native, "Sources/WidgetReload/Reload.swift");
const slices = ["arm64", "x86_64"].map((arch) => {
  const output = join(derived, `StopScrollingWidgetReload-${arch}.dylib`);
  const compiled = spawnSync("xcrun", [
    "swiftc",
    "-emit-library",
    "-target", `${arch}-apple-macos14.0`,
    "-O",
    "-framework", "WidgetKit",
    "-o", output,
    reloadSource,
  ], { stdio: "inherit" });
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);
  return output;
});
rmSync(reload, { force: true });
const merged = spawnSync("lipo", ["-create", "-output", reload, ...slices], { stdio: "inherit" });
if (merged.status !== 0) process.exit(merged.status ?? 1);
