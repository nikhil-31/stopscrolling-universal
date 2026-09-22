import { win32 } from "node:path";
import koffi from "koffi";
import { extractUrlFromText, looksLikeBrowser } from "@shared/browser";
import { readBrowserAddress } from "./windows-browser-url";
import type { ActivitySnapshot } from "./types";

/** Query the image path and package identity without memory-read rights. */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** Top-level owner window, used to find the UWP window inside ApplicationFrameHost. */
const GA_ROOTOWNER = 3;
const ERROR_INSUFFICIENT_BUFFER = 122;
const CORE_WINDOW_CLASS = "Windows.UI.Core.CoreWindow";
const FRAME_HOST_EXE = "applicationframehost.exe";
const TITLE_CHARS = 2048;
const PATH_CHARS = 32768;

type Hwnd = unknown;
type Handle = unknown;

interface Win32Api {
  GetForegroundWindow: () => Hwnd;
  GetWindowTextW: (hwnd: Hwnd, buffer: Buffer, maxChars: number) => number;
  GetClassNameW: (hwnd: Hwnd, buffer: Buffer, maxChars: number) => number;
  GetWindowThreadProcessId: (hwnd: Hwnd, pid: number[]) => number;
  IsWindowVisible: (hwnd: Hwnd) => number;
  GetAncestor: (hwnd: Hwnd, flags: number) => Hwnd;
  EnumWindows: (callback: (hwnd: Hwnd, lParam: number | bigint) => number, lParam: number) => number;
  OpenProcess: (access: number, inherit: number, pid: number) => Handle;
  CloseHandle: (handle: Handle) => number;
  QueryFullProcessImageNameW: (process: Handle, flags: number, buffer: Buffer, size: number[]) => number;
  GetPackageFamilyName: (process: Handle, length: number[], buffer: Buffer | null) => number;
  GetFileVersionInfoSizeW: (path: string, handle: number[] | null) => number;
  GetFileVersionInfoW: (path: string, handle: number, size: number, data: Buffer) => number;
  VerQueryValueW: (block: Buffer, subBlock: string, buffer: unknown[], length: number[]) => number;
}

export interface WindowIdentity {
  title: string;
  imagePath: string | null;
  fileDescription: string | null;
  packageFamilyName: string | null;
}

export interface ForegroundReading {
  foreground: WindowIdentity;
  hosted: WindowIdentity | null;
}

let api: Win32Api | null = null;
let enumProcReady = false;
const fileDescriptionCache = new Map<string, string | null>();

function isNullHandle(value: unknown): boolean {
  return value == null || value === 0 || value === 0n;
}

function sameHandle(a: unknown, b: unknown): boolean {
  if (isNullHandle(a) || isNullHandle(b)) return false;
  return String(a) === String(b);
}

function decodeWide(buf: Buffer, chars: number): string {
  if (chars <= 0) return "";
  const byteLength = Math.min(buf.length, chars * 2);
  return buf.toString("utf16le", 0, byteLength).replace(/\0.*$/s, "");
}

function hex4(value: number): string {
  return (value & 0xffff).toString(16).padStart(4, "0");
}

function exeFileName(imagePath: string): string {
  return win32.basename(imagePath);
}

function exeStem(imagePath: string): string {
  return exeFileName(imagePath).replace(/\.exe$/i, "");
}

function isApplicationFrameHost(imagePath: string | null): boolean {
  if (!imagePath) return false;
  return exeFileName(imagePath).toLowerCase() === FRAME_HOST_EXE;
}

function hostedIdentity(foreground: WindowIdentity, hosted: WindowIdentity | null): WindowIdentity {
  if (!isApplicationFrameHost(foreground.imagePath) || !hosted) return foreground;
  if (!hosted.imagePath && !hosted.packageFamilyName && !hosted.fileDescription) return foreground;
  return hosted;
}

let browserUrlCache: { hwnd: string; title: string; url: string } | null = null;
let addressError: unknown = null;

export function resetBrowserUrlCache() {
  browserUrlCache = null;
  addressError = null;
}

export function consumeAddressError(): unknown {
  const error = addressError;
  addressError = null;
  return error;
}

/** Reuse the address for the same window and title. A new title or hwnd reads it once. */
export function browserUrlForWindow(
  hwnd: unknown,
  title: string,
  read: (hwnd: unknown) => string = readBrowserAddress,
): string {
  const key = String(hwnd);
  if (browserUrlCache && browserUrlCache.hwnd === key && browserUrlCache.title === title) {
    return browserUrlCache.url;
  }
  let url = "";
  try {
    url = read(hwnd);
  } catch (error) {
    addressError = error;
  }
  browserUrlCache = { hwnd: key, title, url };
  return url;
}

export function applyBrowserUrl(snapshot: ActivitySnapshot, url: string): ActivitySnapshot {
  if (!url) return snapshot;
  if (!looksLikeBrowser(snapshot.appName) && !looksLikeBrowser(snapshot.bundleID)) return snapshot;
  return { ...snapshot, url };
}

/** Map a foreground window, and its hosted UWP window when present, to a snapshot. */
export function snapshotFromForeground(
  foreground: WindowIdentity,
  hosted: WindowIdentity | null = null,
): ActivitySnapshot {
  const source = hostedIdentity(foreground, hosted);
  const fileName = source.imagePath ? exeFileName(source.imagePath) : "";
  const bundleID = source.packageFamilyName || fileName || "unknown";
  const appName =
    source.fileDescription ||
    (fileName ? exeStem(source.imagePath || fileName) : "") ||
    foreground.title ||
    "Unknown";
  const title = foreground.title || source.title || appName;
  const browser = looksLikeBrowser(appName) || looksLikeBrowser(bundleID) || looksLikeBrowser(fileName);
  return {
    appName,
    bundleID,
    title,
    url: browser ? extractUrlFromText(title) : "",
  };
}

function bindWin32(): Win32Api {
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const version = koffi.load("version.dll");
  if (!enumProcReady) {
    koffi.proto("int __stdcall SsEnumWindowsProc(void *hwnd, intptr_t lParam)");
    enumProcReady = true;
  }
  return {
    GetForegroundWindow: user32.func("void * __stdcall GetForegroundWindow()"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(void *hWnd, uint16_t *lpString, int nMaxCount)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(void *hWnd, uint16_t *lpClassName, int nMaxCount)"),
    GetWindowThreadProcessId: user32.func(
      "uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)",
    ),
    IsWindowVisible: user32.func("int __stdcall IsWindowVisible(void *hWnd)"),
    GetAncestor: user32.func("void * __stdcall GetAncestor(void *hWnd, uint32_t gaFlags)"),
    EnumWindows: user32.func("int __stdcall EnumWindows(SsEnumWindowsProc *lpEnumFunc, intptr_t lParam)"),
    OpenProcess: kernel32.func(
      "void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)",
    ),
    CloseHandle: kernel32.func("int __stdcall CloseHandle(void *hObject)"),
    QueryFullProcessImageNameW: kernel32.func(
      "int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)",
    ),
    GetPackageFamilyName: kernel32.func(
      "int __stdcall GetPackageFamilyName(void *hProcess, _Inout_ uint32_t *packageFamilyNameLength, uint16_t *packageFamilyName)",
    ),
    GetFileVersionInfoSizeW: version.func(
      "uint32_t __stdcall GetFileVersionInfoSizeW(str16 lptstrFilename, uint32_t *lpdwHandle)",
    ),
    GetFileVersionInfoW: version.func(
      "int __stdcall GetFileVersionInfoW(str16 lptstrFilename, uint32_t dwHandle, uint32_t dwLen, uint8_t *lpData)",
    ),
    VerQueryValueW: version.func(
      "int __stdcall VerQueryValueW(uint8_t *pBlock, str16 lpSubBlock, _Out_ void **lplpBuffer, _Out_ uint32_t *puLen)",
    ),
  };
}

function win32Api(): Win32Api {
  if (!api) api = bindWin32();
  return api;
}

function windowText(hwnd: Hwnd, read: Win32Api["GetWindowTextW"]): string {
  try {
    const buf = Buffer.alloc(TITLE_CHARS * 2);
    return decodeWide(buf, read(hwnd, buf, TITLE_CHARS));
  } catch {
    return "";
  }
}

function windowPid(bindings: Win32Api, hwnd: Hwnd): number {
  try {
    const slot = [0];
    if (!bindings.GetWindowThreadProcessId(hwnd, slot)) return 0;
    return Number(slot[0]) || 0;
  } catch {
    return 0;
  }
}

function withProcess<T>(bindings: Win32Api, pid: number, read: (handle: Handle) => T | null): T | null {
  if (!pid) return null;
  let handle: Handle = null;
  try {
    handle = bindings.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if (isNullHandle(handle)) return null;
    return read(handle);
  } catch {
    return null;
  } finally {
    if (!isNullHandle(handle)) {
      try {
        bindings.CloseHandle(handle);
      } catch {
        /* the process handle is already unusable */
      }
    }
  }
}

function imagePath(bindings: Win32Api, handle: Handle): string | null {
  const size = [PATH_CHARS];
  const buf = Buffer.alloc(PATH_CHARS * 2);
  if (!bindings.QueryFullProcessImageNameW(handle, 0, buf, size)) return null;
  return decodeWide(buf, Number(size[0]) || PATH_CHARS) || null;
}

function packageFamilyName(bindings: Win32Api, handle: Handle): string | null {
  const read = (chars: number) => {
    const buf = Buffer.alloc(chars * 2);
    const size = [chars];
    const status = bindings.GetPackageFamilyName(handle, size, buf);
    return { status, size: Number(size[0]) || 0, buf };
  };
  const first = read(256);
  if (first.status === 0) return decodeWide(first.buf, first.size || 256) || null;
  if (first.status !== ERROR_INSUFFICIENT_BUFFER || first.size <= 1) return null;
  const second = read(first.size);
  if (second.status !== 0) return null;
  return decodeWide(second.buf, second.size || first.size) || null;
}

function utf16FromPointer(pointer: unknown, chars: number): string {
  if (!pointer || chars <= 1) return "";
  try {
    const units = koffi.decode(pointer, "uint16_t", chars - 1) as ArrayLike<number>;
    let text = "";
    for (let index = 0; index < units.length; index += 1) {
      const code = Number(units[index]);
      if (!code) break;
      text += String.fromCharCode(code);
    }
    return text.trim();
  } catch {
    return "";
  }
}

function fileDescription(bindings: Win32Api, imagePathValue: string): string | null {
  const cached = fileDescriptionCache.get(imagePathValue);
  if (cached !== undefined) return cached;
  const value = readFileDescription(bindings, imagePathValue);
  fileDescriptionCache.set(imagePathValue, value);
  return value;
}

function readFileDescription(bindings: Win32Api, imagePathValue: string): string | null {
  try {
    const bytes = bindings.GetFileVersionInfoSizeW(imagePathValue, null);
    if (!bytes) return null;
    const block = Buffer.alloc(bytes);
    if (!bindings.GetFileVersionInfoW(imagePathValue, 0, bytes, block)) return null;
    const translation: unknown[] = [null];
    const translationLength = [0];
    if (!bindings.VerQueryValueW(block, "\\VarFileInfo\\Translation", translation, translationLength)) return null;
    if (!translation[0] || Number(translationLength[0]) < 4) return null;
    const words = koffi.decode(translation[0], "uint16_t", 2) as ArrayLike<number>;
    const subBlock = `\\StringFileInfo\\${hex4(Number(words[0]))}${hex4(Number(words[1]))}\\FileDescription`;
    const description: unknown[] = [null];
    const descriptionLength = [0];
    if (!bindings.VerQueryValueW(block, subBlock, description, descriptionLength)) return null;
    return utf16FromPointer(description[0], Number(descriptionLength[0]) || 0) || null;
  } catch {
    return null;
  }
}

function readIdentity(bindings: Win32Api, hwnd: Hwnd): WindowIdentity {
  const title = windowText(hwnd, bindings.GetWindowTextW);
  const pid = windowPid(bindings, hwnd);
  const path = withProcess(bindings, pid, (handle) => imagePath(bindings, handle));
  return {
    title,
    imagePath: path,
    fileDescription: path ? fileDescription(bindings, path) : null,
    packageFamilyName: withProcess(bindings, pid, (handle) => packageFamilyName(bindings, handle)),
  };
}

function findHostedCoreWindow(bindings: Win32Api, owner: Hwnd): Hwnd | null {
  let found: Hwnd = null;
  try {
    bindings.EnumWindows((hwnd) => {
      try {
        if (!bindings.IsWindowVisible(hwnd)) return 1;
        const className = windowText(hwnd, bindings.GetClassNameW);
        if (className !== CORE_WINDOW_CLASS) return 1;
        if (!sameHandle(bindings.GetAncestor(hwnd, GA_ROOTOWNER), owner)) return 1;
        found = hwnd;
        return 0;
      } catch {
        return 1;
      }
    }, 0);
  } catch {
    return null;
  }
  return found;
}

function readForegroundFromHwnd(bindings: Win32Api, hwnd: Hwnd): ForegroundReading {
  const foreground = readIdentity(bindings, hwnd);
  if (!isApplicationFrameHost(foreground.imagePath)) {
    return { foreground, hosted: null };
  }
  const hostedHwnd = findHostedCoreWindow(bindings, hwnd);
  return {
    foreground,
    hosted: hostedHwnd ? readIdentity(bindings, hostedHwnd) : null,
  };
}

/** Read the foreground window. Returns null when no window is focused. */
export function readForegroundWindow(): ForegroundReading | null {
  const bindings = win32Api();
  const hwnd = bindings.GetForegroundWindow();
  if (isNullHandle(hwnd)) return null;
  return readForegroundFromHwnd(bindings, hwnd);
}

export function sampleForegroundWindow(): ActivitySnapshot | null {
  const bindings = win32Api();
  const hwnd = bindings.GetForegroundWindow();
  if (isNullHandle(hwnd)) return null;
  const reading = readForegroundFromHwnd(bindings, hwnd);
  const snapshot = snapshotFromForeground(reading.foreground, reading.hosted);
  if (!looksLikeBrowser(snapshot.appName) && !looksLikeBrowser(snapshot.bundleID)) return snapshot;
  return applyBrowserUrl(snapshot, browserUrlForWindow(hwnd, snapshot.title));
}
