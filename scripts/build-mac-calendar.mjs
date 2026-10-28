import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const native = join(root, "native/macos");
const source = join(native, "Sources/CalendarBridge/CalendarBridge.swift");
const derived = join(native, ".derivedData/calendar-build");
const output = join(native, ".derivedData/widget-pack/StopScrollingCalendar.dylib");

/** Builds the EventKit bridge the app loads to read Calendar.app. Skips when the dylib is newer than its source. */
export function buildMacCalendar({ force = false } = {}) {
  if (process.platform !== "darwin") return null;
  if (!force && existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) return output;
  mkdirSync(derived, { recursive: true });
  mkdirSync(dirname(output), { recursive: true });
  const slices = ["arm64", "x86_64"].map((arch) => {
    const slice = join(derived, `StopScrollingCalendar-${arch}.dylib`);
    const compiled = spawnSync("xcrun", [
      "swiftc",
      "-emit-library",
      "-target", `${arch}-apple-macos12.0`,
      "-O",
      "-framework", "EventKit",
      "-framework", "CoreGraphics",
      "-o", slice,
      source,
    ], { stdio: "inherit" });
    if (compiled.status !== 0) throw new Error(`Building the calendar bridge for ${arch} failed.`);
    return slice;
  });
  rmSync(output, { force: true });
  const merged = spawnSync("lipo", ["-create", "-output", output, ...slices], { stdio: "inherit" });
  if (merged.status !== 0) throw new Error("Merging the calendar bridge slices failed.");
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== "darwin") {
    console.log("Skipping the macOS calendar bridge on this platform.");
  } else {
    buildMacCalendar({ force: process.argv.includes("--force") });
  }
}
