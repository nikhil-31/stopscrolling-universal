import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import koffi from "koffi";
import { logObservability } from "./logger";

export const MENU_BAR_AUTOSAVE_NAME = "StopScrolling";
export const MENU_BAR_POSITION_GAP = 40;

const PREFERRED_POSITION_PREFIX = "NSStatusItem Preferred Position ";
const PREFERRED_POSITION_KEY = `${PREFERRED_POSITION_PREFIX}${MENU_BAR_AUTOSAVE_NAME}`;
const PREFERRED_POSITION_MARKER = Buffer.from(PREFERRED_POSITION_PREFIX);
const KCF_NUMBER_DOUBLE_TYPE = 13;

/** Smaller positions sit further left. The leading icon is just left of the current minimum. */
export function leadingMenuBarPosition(positions: number[]): number {
  const finite = positions.filter((value) => Number.isFinite(value));
  if (!finite.length) return 0;
  return Math.max(0, Math.min(...finite) - MENU_BAR_POSITION_GAP);
}

export function preferredPositionsFromPlist(data: unknown, ignoreName = MENU_BAR_AUTOSAVE_NAME): number[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const positions: number[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PREFERRED_POSITION_PREFIX)) continue;
    if (key.slice(PREFERRED_POSITION_PREFIX.length) === ignoreName) continue;
    if (typeof value === "number" && Number.isFinite(value)) positions.push(value);
  }
  return positions;
}

export function menuBarPreferredPositions(preferencesDir = join(homedir(), "Library", "Preferences")): number[] {
  const positions: number[] = [];
  for (const path of preferenceFiles(preferencesDir)) {
    positions.push(...preferredPositionsInFile(path));
  }
  return positions;
}

export function prepareMenuBarLeadingPosition() {
  if (process.platform !== "darwin") return;
  try {
    const position = leadingMenuBarPosition(menuBarPreferredPositions());
    // AppKit names the first status item Item-0 when the tray is created.
    writePreferredPosition(position, "Item-0");
    writePreferredPosition(position, MENU_BAR_AUTOSAVE_NAME);
  } catch (error) {
    logObservability(`Menu bar position failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function pinTrayToMenuBarStart() {
  if (process.platform !== "darwin") return;
  pinWhenReady(8);
}

function pinWhenReady(attemptsLeft: number) {
  try {
    const objc = loadObjc();
    if (!objc) {
      logObservability("Menu bar position skipped: AppKit is unavailable");
      return;
    }
    const items = statusItems(objc);
    if (!items.length) {
      if (attemptsLeft > 0) {
        setTimeout(() => pinWhenReady(attemptsLeft - 1), 50);
        return;
      }
      logObservability("Menu bar position skipped: no status item");
      return;
    }
    const position = leadingMenuBarPosition(menuBarPreferredPositions());
    writePreferredPosition(position, MENU_BAR_AUTOSAVE_NAME);
    const name = nsString(objc, MENU_BAR_AUTOSAVE_NAME);
    for (const item of items) {
      objc.msgSet1(item, objc.sel("setAutosaveName:"), name);
      objc.msgBool(item, objc.sel("setVisible:"), 1);
    }
  } catch (error) {
    logObservability(`Menu bar position failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writePreferredPosition(position: number, autosaveName: string) {
  const objc = loadObjc();
  if (!objc) return;
  const defaults = objc.msg0(objc.getClass("NSUserDefaults"), objc.sel("standardUserDefaults"));
  const key = nsString(objc, `${PREFERRED_POSITION_PREFIX}${autosaveName}`);
  objc.msgSet2(defaults, objc.sel("setObject:forKey:"), cfNumber(position), key);
  objc.msg0(defaults, objc.sel("synchronize"));
}

function preferenceFiles(dir: string): string[] {
  const files: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (name.endsWith(".plist")) files.push(path);
    if (name !== "ByHost") continue;
    try {
      for (const child of readdirSync(path)) {
        if (child.endsWith(".plist")) files.push(join(path, child));
      }
    } catch {
      // A missing ByHost folder just means there are no per-host extras.
    }
  }
  return files;
}

function preferredPositionsInFile(path: string): number[] {
  try {
    if (path.endsWith("com.stopscrolling.desktop.plist")) return [];
    if (statSync(path).size > 2_000_000) return [];
    if (!readFileSync(path).includes(PREFERRED_POSITION_MARKER)) return [];
    const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], { encoding: "utf8" });
    return preferredPositionsFromPlist(JSON.parse(json));
  } catch {
    return [];
  }
}

type Pointer = unknown;

interface ObjC {
  getClass: (name: string) => Pointer;
  sel: (name: string) => Pointer;
  msg0: (self: Pointer, sel: Pointer) => Pointer;
  msgSet1: (self: Pointer, sel: Pointer, arg: Pointer) => void;
  msgSet2: (self: Pointer, sel: Pointer, arg: Pointer, arg2: Pointer) => void;
  msgBool: (self: Pointer, sel: Pointer, value: number) => void;
  msgCount: (self: Pointer, sel: Pointer) => bigint | number;
  msgIndex: (self: Pointer, sel: Pointer, index: number) => Pointer;
  msgStr: (self: Pointer, sel: Pointer, value: string) => Pointer;
  msgKey: (self: Pointer, sel: Pointer, key: Pointer) => Pointer;
}

let objcApi: ObjC | null | undefined;
let cfNumberCreate: ((allocator: Pointer, type: number, value: number[]) => Pointer) | null = null;

function loadObjc(): ObjC | null {
  if (objcApi !== undefined) return objcApi;
  try {
    koffi.load("/System/Library/Frameworks/AppKit.framework/AppKit");
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const objc = koffi.load("/usr/lib/libobjc.A.dylib");
    cfNumberCreate = cf.func("void *CFNumberCreate(void *allocator, long type, _In_ double *value)");
    objcApi = {
      getClass: objc.func("objc_getClass", "void *", ["string"]),
      sel: objc.func("sel_registerName", "void *", ["string"]),
      msg0: objc.func("objc_msgSend", "void *", ["void *", "void *"]),
      msgSet1: objc.func("objc_msgSend", "void", ["void *", "void *", "void *"]),
      msgSet2: objc.func("objc_msgSend", "void", ["void *", "void *", "void *", "void *"]),
      msgBool: objc.func("objc_msgSend", "void", ["void *", "void *", "int8"]),
      msgCount: objc.func("objc_msgSend", "uint64", ["void *", "void *"]),
      msgIndex: objc.func("objc_msgSend", "void *", ["void *", "void *", "uint64"]),
      msgStr: objc.func("objc_msgSend", "void *", ["void *", "void *", "string"]),
      msgKey: objc.func("objc_msgSend", "void *", ["void *", "void *", "void *"]),
    };
    return objcApi;
  } catch {
    objcApi = null;
    return null;
  }
}

function nsString(objc: ObjC, value: string) {
  return objc.msgStr(objc.getClass("NSString"), objc.sel("stringWithUTF8String:"), value);
}

function cfNumber(value: number) {
  if (!cfNumberCreate) throw new Error("CoreFoundation is unavailable");
  return cfNumberCreate(null, KCF_NUMBER_DOUBLE_TYPE, [value]);
}

function statusItems(objc: ObjC): Pointer[] {
  const bar = objc.msg0(objc.getClass("NSStatusBar"), objc.sel("systemStatusBar"));
  if (!bar) return [];
  const items = objc.msgKey(bar, objc.sel("valueForKey:"), nsString(objc, "_statusItems"));
  if (!items) return [];
  const count = Number(objc.msgCount(items, objc.sel("count")));
  if (!Number.isFinite(count) || count <= 0) return [];
  const found: Pointer[] = [];
  // NSStatusBar stores _statusItems as an NSPointerArray, which uses pointerAtIndex:.
  for (let index = 0; index < count; index += 1) {
    const item = objc.msgIndex(items, objc.sel("pointerAtIndex:"), index);
    if (item) found.push(item);
  }
  return found;
}
