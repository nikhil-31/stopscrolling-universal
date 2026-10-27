import koffi from "koffi";
import { normalizeCapturedUrl } from "@shared/browser";

const UTF8 = 0x08000100;
const MAX_DEPTH = 18;
/** Elements visited per walk; large pages otherwise cost thousands of blocking AX calls. */
const MAX_NODES = 800;
/** A walk for the same window title is reused this long. */
const CONTEXT_REUSE_MS = 2_000;

type Pointer = unknown;

interface AxLib {
  createApp: (pid: number) => Pointer;
  createSystemWide: () => Pointer;
  copyAttr: (element: Pointer, attribute: Pointer, value: Pointer[]) => number;
  setAttr: (element: Pointer, attribute: Pointer, value: Pointer) => number;
  performAction: (element: Pointer, action: Pointer) => number;
  getPid: (element: Pointer, pid: number[]) => number;
  createString: (alloc: Pointer | null, str: string, encoding: number) => Pointer;
  getTypeId: (cf: Pointer) => bigint | number;
  stringTypeId: () => bigint | number;
  arrayTypeId: () => bigint | number;
  urlTypeId: () => bigint | number;
  arrayCount: (array: Pointer) => number | bigint;
  arrayAt: (array: Pointer, idx: number) => Pointer;
  urlString: (url: Pointer) => Pointer;
  stringCString: (cf: Pointer, buffer: Buffer, size: number, encoding: number) => boolean;
  retain: (cf: Pointer) => Pointer;
  release: (cf: Pointer) => void;
  pidPath: (pid: number, buffer: Buffer, size: number) => number;
  urlFromPath: (alloc: Pointer | null, path: string, length: number, isDirectory: boolean) => Pointer;
  createBundle: (alloc: Pointer | null, url: Pointer) => Pointer;
  bundleIdentifier: (bundle: Pointer) => Pointer;
}

let lib: AxLib | null = null;
let loadError = "";

function loadAx(): AxLib | null {
  if (lib) return lib;
  if (process.platform !== "darwin") return null;
  try {
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const ax = koffi.load("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices");
    const proc = koffi.load("/usr/lib/libproc.dylib");
    lib = {
      createApp: ax.func("void *AXUIElementCreateApplication(int pid)"),
      createSystemWide: ax.func("void *AXUIElementCreateSystemWide()"),
      copyAttr: ax.func("int AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)"),
      setAttr: ax.func("int AXUIElementSetAttributeValue(void *element, void *attribute, void *value)"),
      performAction: ax.func("int AXUIElementPerformAction(void *element, void *action)"),
      getPid: ax.func("int AXUIElementGetPid(void *element, _Out_ int *pid)"),
      createString: cf.func("void *CFStringCreateWithCString(void *alloc, const char *str, unsigned int encoding)"),
      getTypeId: cf.func("unsigned long CFGetTypeID(void *cf)"),
      stringTypeId: cf.func("unsigned long CFStringGetTypeID()"),
      arrayTypeId: cf.func("unsigned long CFArrayGetTypeID()"),
      urlTypeId: cf.func("unsigned long CFURLGetTypeID()"),
      arrayCount: cf.func("long CFArrayGetCount(void *theArray)"),
      arrayAt: cf.func("void *CFArrayGetValueAtIndex(void *theArray, long idx)"),
      urlString: cf.func("void *CFURLGetString(void *url)"),
      stringCString: cf.func("bool CFStringGetCString(void *theString, void *buffer, long bufferSize, unsigned int encoding)"),
      retain: cf.func("void *CFRetain(void *cf)"),
      release: cf.func("void CFRelease(void *cf)"),
      pidPath: proc.func("int proc_pidpath(int pid, void *buffer, uint32_t buffersize)"),
      urlFromPath: cf.func("void *CFURLCreateFromFileSystemRepresentation(void *alloc, const char *buffer, long bufLen, bool isDirectory)"),
      createBundle: cf.func("void *CFBundleCreate(void *alloc, void *bundleURL)"),
      bundleIdentifier: cf.func("void *CFBundleGetIdentifier(void *bundle)"),
    };
    return lib;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function cfString(api: AxLib, value: string) {
  return api.createString(null, value, UTF8);
}

function readString(api: AxLib, cf: Pointer | null | undefined) {
  if (!cf) return "";
  const typeId = Number(api.getTypeId(cf));
  let stringRef: Pointer = cf;
  if (typeId === Number(api.urlTypeId())) {
    stringRef = api.urlString(cf);
    if (!stringRef) return "";
  } else if (typeId !== Number(api.stringTypeId())) {
    return "";
  }
  const buffer = Buffer.alloc(4096);
  if (!api.stringCString(stringRef, buffer, buffer.length, UTF8)) return "";
  const end = buffer.indexOf(0);
  return buffer.toString("utf8", 0, end === -1 ? buffer.length : end).trim();
}

function copyValue(api: AxLib, element: Pointer, attribute: string) {
  const name = cfString(api, attribute);
  const slot: Pointer[] = [null as unknown as Pointer];
  const status = api.copyAttr(element, name, slot);
  api.release(name);
  if (status !== 0 || !slot[0]) return null;
  return slot[0];
}

function attrString(api: AxLib, element: Pointer, attribute: string) {
  const value = copyValue(api, element, attribute);
  if (!value) return "";
  const text = readString(api, value);
  api.release(value);
  return text;
}

function forEachChild(api: AxLib, element: Pointer, visit: (child: Pointer) => void) {
  const value = copyValue(api, element, attributeChildren);
  if (!value) return;
  if (Number(api.getTypeId(value)) !== Number(api.arrayTypeId())) {
    api.release(value);
    return;
  }
  const count = Number(api.arrayCount(value));
  for (let index = 0; index < count; index += 1) {
    const child = api.arrayAt(value, index);
    if (child) visit(child);
  }
  api.release(value);
}

const attributeChildren = "AXChildren";

function looksLikeUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (/^(https?:|file:|ftp:|chrome:|brave:|edge:|about:)/i.test(trimmed)) return true;
  return Boolean(normalizeCapturedUrl(trimmed));
}

function isAddressBar(api: AxLib, element: Pointer) {
  const role = attrString(api, element, "AXRole");
  if (role !== "AXTextField" && role !== "AXComboBox" && role !== "AXTextArea") return false;
  if (attrString(api, element, "AXSubrole") === "AXURLField") return true;
  const identity = [
    attrString(api, element, "AXIdentifier"),
    attrString(api, element, "AXDescription"),
    attrString(api, element, "AXRoleDescription"),
  ].join(" ").toLowerCase();
  if (/(address|omnibox|url|location)/.test(identity)) return true;
  return looksLikeUrl(attrString(api, element, "AXValue"));
}

function addressValue(api: AxLib, element: Pointer) {
  const value = attrString(api, element, "AXValue");
  if (looksLikeUrl(value)) return value;
  const url = attrString(api, element, "AXURL") || attrString(api, element, "AXDocument");
  return looksLikeUrl(url) ? url : "";
}

export function axLoadError() {
  return loadError;
}

/** App menu items such as "Quit Google Chrome". */
export function isQuitMenuItem(title: string) {
  return /^quit\b/i.test(title.trim());
}

function focusedApplication(api: AxLib) {
  const system = api.createSystemWide();
  if (!system) return null;
  const app = copyValue(api, system, "AXFocusedApplication");
  api.release(system);
  return app;
}

/** Bundle identifiers by executable path; a reused pid maps to a new path. */
const bundleIds = new Map<string, string>();

function executablePath(api: AxLib, pid: number) {
  const buffer = Buffer.alloc(4096);
  const length = api.pidPath(pid, buffer, buffer.length);
  return length > 0 ? buffer.toString("utf8", 0, length) : "";
}

function bundleIdForExecutable(api: AxLib, path: string) {
  const cached = bundleIds.get(path);
  if (cached !== undefined) return cached;
  let id = "";
  const marker = path.lastIndexOf("/Contents/MacOS/");
  if (marker > 0) {
    const bundlePath = path.slice(0, marker);
    const url = api.urlFromPath(null, bundlePath, Buffer.byteLength(bundlePath), true);
    if (url) {
      const bundle = api.createBundle(null, url);
      if (bundle) {
        id = readString(api, api.bundleIdentifier(bundle));
        api.release(bundle);
      }
      api.release(url);
    }
  }
  bundleIds.set(path, id);
  return id;
}

/** Frontmost app and its focused window title, read without spawning osascript. */
export function readFrontmostApp(): { appName: string; bundleID: string; title: string; pid: number } | null {
  const api = loadAx();
  if (!api) return null;
  try {
    const app = focusedApplication(api);
    if (!app) return null;
    const slot = [0];
    const status = api.getPid(app, slot);
    const pid = status === 0 ? slot[0] ?? 0 : 0;
    const appName = attrString(api, app, "AXTitle");
    const window = copyValue(api, app, "AXFocusedWindow");
    const title = window ? attrString(api, window, "AXTitle") : "";
    if (window) api.release(window);
    api.release(app);
    if (!pid || !appName) return null;
    const path = executablePath(api, pid);
    return { appName, bundleID: path ? bundleIdForExecutable(api, path) : "", title, pid };
  } catch {
    return null;
  }
}

function someChild(api: AxLib, element: Pointer, visit: (child: Pointer) => boolean) {
  const value = copyValue(api, element, attributeChildren);
  if (!value) return false;
  if (Number(api.getTypeId(value)) !== Number(api.arrayTypeId())) {
    api.release(value);
    return false;
  }
  const count = Number(api.arrayCount(value));
  let done = false;
  for (let index = 0; index < count && !done; index += 1) {
    const child = api.arrayAt(value, index);
    if (child) done = visit(child);
  }
  api.release(value);
  return done;
}

function performNamedAction(api: AxLib, element: Pointer, name: string) {
  const action = cfString(api, name);
  const status = api.performAction(element, action);
  api.release(action);
  return status === 0;
}

function confirmAddress(api: AxLib, element: Pointer, url: string) {
  const attribute = cfString(api, "AXValue");
  const value = cfString(api, url);
  const setStatus = api.setAttr(element, attribute, value);
  api.release(attribute);
  api.release(value);
  if (setStatus !== 0) return false;
  return performNamedAction(api, element, "AXConfirm") || performNamedAction(api, element, "AXPress");
}

function redirectInTree(api: AxLib, element: Pointer, depth: number, url: string): boolean {
  if (depth > MAX_DEPTH) return false;
  if (isAddressBar(api, element)) return confirmAddress(api, element, url);
  return someChild(api, element, (child) => redirectInTree(api, child, depth + 1, url));
}

/** Point the focused browser's address field at a URL. Only the front tab is reachable. */
export function redirectFocusedBrowser(url: string) {
  const api = loadAx();
  if (!api || !url) return false;
  try {
    const app = focusedApplication(api);
    if (!app) return false;
    const window = copyValue(api, app, "AXFocusedWindow");
    const redirected = redirectInTree(api, window ?? app, 0, url);
    if (window) api.release(window);
    api.release(app);
    return redirected;
  } catch {
    return false;
  }
}

function pressQuitInTree(api: AxLib, element: Pointer, depth: number): boolean {
  if (depth > 8) return false;
  if (isQuitMenuItem(attrString(api, element, "AXTitle"))) return performNamedAction(api, element, "AXPress");
  return someChild(api, element, (child) => pressQuitInTree(api, child, depth + 1));
}

const KEY_V = 0x09;
const KEY_L = 0x25;
const KEY_RETURN = 0x24;
const KEY_ESCAPE = 0x35;
const COMMAND = 0x100000;

/** True when the address bar is showing the freedom page, not the blocked site. */
export function omniboxIsFreedomPage(value: string, pageUrl: string) {
  const shown = omniboxIdentity(value);
  const target = omniboxIdentity(pageUrl);
  return Boolean(shown && target && shown === target);
}

/** A tab strip item. Other radio buttons in the page are not tabs. */
export function isBrowserTab(role: string, roleDescription: string) {
  return (role === "AXRadioButton" || role === "AXTab") && /tab/i.test(roleDescription);
}

/**
 * Press Return after the freedom URL is in the address bar.
 * A successful AXValue write commits even when the bar still shows the blocked host.
 * A paste commits only once the bar shows the freedom page.
 */
export function shouldCommitNavigation(wroteValue: boolean, shown: string, pageUrl: string) {
  if (wroteValue) return true;
  return omniboxIsFreedomPage(shown, pageUrl);
}

function omniboxIdentity(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

interface KeyLib {
  create: (source: null, key: number, down: boolean) => Pointer;
  setFlags: (event: Pointer, flags: number) => void;
  postToPid: (pid: number, event: Pointer) => void;
  release: (event: Pointer) => void;
}

let keys: KeyLib | null | undefined;

function loadKeys(): KeyLib | null {
  if (keys !== undefined) return keys;
  if (process.platform !== "darwin") {
    keys = null;
    return null;
  }
  try {
    const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    keys = {
      create: cg.func("void *CGEventCreateKeyboardEvent(void *source, unsigned short key, bool down)"),
      setFlags: cg.func("void CGEventSetFlags(void *event, uint64_t flags)"),
      postToPid: cg.func("void CGEventPostToPid(int pid, void *event)"),
      release: cf.func("void CFRelease(void *event)"),
    };
    return keys;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    keys = null;
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function focusedPid(api: AxLib) {
  const app = focusedApplication(api);
  if (!app) return 0;
  const slot = [0];
  const status = api.getPid(app, slot);
  api.release(app);
  return status === 0 ? slot[0] ?? 0 : 0;
}

function postKey(lib: KeyLib, pid: number, keyCode: number, down: boolean, flags = 0) {
  const event = lib.create(null, keyCode, down);
  if (!event) return false;
  if (flags) lib.setFlags(event, flags);
  lib.postToPid(pid, event);
  lib.release(event);
  return true;
}

function chord(lib: KeyLib, pid: number, keyCode: number, flags = 0) {
  return postKey(lib, pid, keyCode, true, flags) && postKey(lib, pid, keyCode, false, flags);
}

function findAddressBarValue(api: AxLib, element: Pointer, depth: number): string {
  if (depth > MAX_DEPTH) return "";
  if (isAddressBar(api, element)) return attrString(api, element, "AXValue");
  const children = copyValue(api, element, attributeChildren);
  if (!children) return "";
  if (Number(api.getTypeId(children)) !== Number(api.arrayTypeId())) {
    api.release(children);
    return "";
  }
  const count = Number(api.arrayCount(children));
  let found = "";
  for (let index = 0; index < count && !found; index += 1) {
    const child = api.arrayAt(children, index);
    if (child) found = findAddressBarValue(api, child, depth + 1);
  }
  api.release(children);
  return found;
}

function readFocusedOmnibox(api: AxLib) {
  const app = focusedApplication(api);
  if (!app) return "";
  try {
    const focusedEl = copyValue(api, app, "AXFocusedUIElement");
    if (focusedEl) {
      const direct = isAddressBar(api, focusedEl) ? attrString(api, focusedEl, "AXValue") : "";
      api.release(focusedEl);
      if (direct) return direct;
    }
    const window = copyValue(api, app, "AXFocusedWindow");
    const found = findAddressBarValue(api, window ?? app, 0);
    if (window) api.release(window);
    return found;
  } finally {
    api.release(app);
  }
}

async function pasteOmnibox(lib: KeyLib, pid: number, url: string) {
  const { clipboard } = await import("electron");
  const previous = clipboard.readText();
  clipboard.writeText(url);
  try {
    if (!chord(lib, pid, KEY_L, COMMAND)) return false;
    await sleep(90);
    if (!chord(lib, pid, KEY_V, COMMAND)) return false;
    await sleep(80);
    return true;
  } finally {
    clipboard.writeText(previous);
  }
}

function setAddressValue(api: AxLib, element: Pointer, url: string) {
  const attribute = cfString(api, "AXValue");
  const value = cfString(api, url);
  const setStatus = api.setAttr(element, attribute, value);
  api.release(attribute);
  api.release(value);
  return setStatus === 0;
}

function writeAddressInTree(api: AxLib, element: Pointer, depth: number, url: string): boolean {
  if (depth > MAX_DEPTH) return false;
  if (isAddressBar(api, element)) return setAddressValue(api, element, url);
  return someChild(api, element, (child) => writeAddressInTree(api, child, depth + 1, url));
}

function writeFocusedAddress(api: AxLib, url: string) {
  const app = focusedApplication(api);
  if (!app) return false;
  try {
    const focusedEl = copyValue(api, app, "AXFocusedUIElement");
    if (focusedEl && isAddressBar(api, focusedEl)) {
      const wrote = setAddressValue(api, focusedEl, url);
      api.release(focusedEl);
      return wrote;
    }
    if (focusedEl) api.release(focusedEl);
    const window = copyValue(api, app, "AXFocusedWindow");
    const wrote = writeAddressInTree(api, window ?? app, 0, url);
    if (window) api.release(window);
    return wrote;
  } finally {
    api.release(app);
  }
}

/** Stop the load, write the freedom page into the address bar, and commit it. */
export async function typeFocusedOmnibox(url: string) {
  const api = loadAx();
  const lib = loadKeys();
  if (!api || !lib || !url) return false;
  const pid = focusedPid(api);
  if (!pid) return false;
  try {
    if (!chord(lib, pid, KEY_ESCAPE)) return false;
    await sleep(30);
    if (!chord(lib, pid, KEY_L, COMMAND)) return false;
    await sleep(90);
    const wrote = writeFocusedAddress(api, url);
    if (shouldCommitNavigation(wrote, readFocusedOmnibox(api), url)) {
      return chord(lib, pid, KEY_RETURN);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!(await pasteOmnibox(lib, pid, url))) return false;
      await sleep(40);
      if (!shouldCommitNavigation(false, readFocusedOmnibox(api), url)) continue;
      return chord(lib, pid, KEY_RETURN);
    }
    return false;
  } catch {
    return false;
  }
}

function collectTabs(api: AxLib, element: Pointer, depth: number, found: Pointer[]) {
  if (depth > MAX_DEPTH) return;
  if (isBrowserTab(attrString(api, element, "AXRole"), attrString(api, element, "AXRoleDescription"))) {
    const retained = api.retain(element);
    if (retained) found.push(retained);
    return;
  }
  forEachChild(api, element, (child) => collectTabs(api, child, depth + 1, found));
}

function readFocusedPageUrl(api: AxLib) {
  const app = focusedApplication(api);
  if (!app) return "";
  const slot = [0];
  const status = api.getPid(app, slot);
  api.release(app);
  const pid = status === 0 ? slot[0] ?? 0 : 0;
  if (!pid) return "";
  return readBrowserContext(pid).url;
}

/** Select each tab in the focused window and redirect the ones that match. */
export async function redirectFocusedWindowTabs(pageUrl: string, matches: (url: string) => boolean) {
  const api = loadAx();
  if (!api || !pageUrl) return false;
  const app = focusedApplication(api);
  if (!app) return false;
  const window = copyValue(api, app, "AXFocusedWindow");
  const tabs: Pointer[] = [];
  try {
    collectTabs(api, window ?? app, 0, tabs);
    if (!tabs.length) return typeFocusedOmnibox(pageUrl);
    let moved = false;
    let sawUrl = false;
    for (const tab of tabs) {
      performNamedAction(api, tab, "AXPress");
      await sleep(80);
      const url = readFocusedPageUrl(api);
      if (!url) continue;
      sawUrl = true;
      if (!matches(url)) continue;
      if (await typeFocusedOmnibox(pageUrl)) moved = true;
    }
    if (moved) return true;
    if (!sawUrl) return typeFocusedOmnibox(pageUrl);
    return false;
  } catch {
    return false;
  } finally {
    for (const tab of tabs) api.release(tab);
    if (window) api.release(window);
    api.release(app);
  }
}

/** URL of whichever app is focused, plus that app's name. */
export function readFocusedBrowserContext(): { title: string; url: string; appName: string } {
  const api = loadAx();
  const empty = { title: "", url: "", appName: "" };
  if (!api) return empty;
  const app = focusedApplication(api);
  if (!app) return empty;
  const appName = attrString(api, app, "AXTitle");
  const slot = [0];
  const status = api.getPid(app, slot);
  api.release(app);
  const pid = status === 0 ? slot[0] ?? 0 : 0;
  if (!pid) return { ...empty, appName };
  return { ...readBrowserContext(pid), appName };
}

/** Press the focused app's Quit menu item. */
export function quitFocusedApp() {
  const api = loadAx();
  if (!api) return false;
  try {
    const app = focusedApplication(api);
    if (!app) return false;
    const menuBar = copyValue(api, app, "AXMenuBar");
    const quit = pressQuitInTree(api, menuBar ?? app, 0);
    if (menuBar) api.release(menuBar);
    api.release(app);
    return quit;
  } catch {
    return false;
  }
}

let lastContext: { pid: number; windowTitle: string; at: number; result: { title: string; url: string } } | null = null;

export function readBrowserContext(pid: number): { title: string; url: string } {
  const api = loadAx();
  if (!api || !pid) return { title: "", url: "" };
  try {
    const app = api.createApp(pid);
    if (!app) return { title: "", url: "" };
    const focused = copyValue(api, app, "AXFocusedWindow");
    const windowsHandle = copyValue(api, app, "AXWindows");
    let window: Pointer | null = focused;
    if (!window && windowsHandle && Number(api.getTypeId(windowsHandle)) === Number(api.arrayTypeId()) && Number(api.arrayCount(windowsHandle)) > 0) {
      window = api.arrayAt(windowsHandle, 0);
    }
    if (!window) {
      if (windowsHandle) api.release(windowsHandle);
      if (focused) api.release(focused);
      api.release(app);
      return { title: "", url: "" };
    }
    const title = attrString(api, window, "AXTitle");
    const now = Date.now();
    if (lastContext && lastContext.pid === pid && lastContext.windowTitle === title && now - lastContext.at < CONTEXT_REUSE_MS) {
      if (windowsHandle) api.release(windowsHandle);
      if (focused) api.release(focused);
      api.release(app);
      return lastContext.result;
    }
    const found = { url: "", title, budget: MAX_NODES };
    walk(api, window, 0, found);
    if (!found.url) {
      const focusedEl = copyValue(api, app, "AXFocusedUIElement");
      if (focusedEl) {
        found.url = addressValue(api, focusedEl);
        api.release(focusedEl);
      }
    }
    if (windowsHandle) api.release(windowsHandle);
    if (focused) api.release(focused);
    api.release(app);
    const result = {
      title: found.title,
      url: normalizeCapturedUrl(found.url) || (/^(chrome|brave|edge|about):/i.test(found.url) ? found.url : ""),
    };
    lastContext = { pid, windowTitle: title, at: now, result };
    return result;
  } catch {
    return { title: "", url: "" };
  }
}

function walk(api: AxLib, element: Pointer, depth: number, found: { url: string; title: string; budget: number }) {
  if (depth > MAX_DEPTH || found.url || found.budget <= 0) return;
  found.budget -= 1;
  const role = attrString(api, element, "AXRole");
  if (role === "AXWebArea") {
    const url = attrString(api, element, "AXURL") || attrString(api, element, "AXDocument");
    if (looksLikeUrl(url)) {
      found.url = url;
      const webTitle = attrString(api, element, "AXTitle");
      if (webTitle && !looksLikeUrl(webTitle)) found.title = found.title || webTitle;
      return;
    }
  }
  if (isAddressBar(api, element)) {
    const value = addressValue(api, element);
    if (value) {
      found.url = value;
      return;
    }
  }
  const url = attrString(api, element, "AXURL") || attrString(api, element, "AXDocument");
  if (looksLikeUrl(url)) {
    found.url = url;
    return;
  }
  forEachChild(api, element, (child) => {
    if (!found.url) walk(api, child, depth + 1, found);
  });
}
