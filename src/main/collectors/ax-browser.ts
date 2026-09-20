import koffi from "koffi";
import { normalizeCapturedUrl } from "@shared/browser";

const UTF8 = 0x08000100;
const MAX_DEPTH = 18;

type Pointer = unknown;

interface AxLib {
  createApp: (pid: number) => Pointer;
  copyAttr: (element: Pointer, attribute: Pointer, value: Pointer[]) => number;
  createString: (alloc: Pointer | null, str: string, encoding: number) => Pointer;
  getTypeId: (cf: Pointer) => bigint | number;
  stringTypeId: () => bigint | number;
  arrayTypeId: () => bigint | number;
  urlTypeId: () => bigint | number;
  arrayCount: (array: Pointer) => number | bigint;
  arrayAt: (array: Pointer, idx: number) => Pointer;
  urlString: (url: Pointer) => Pointer;
  stringCString: (cf: Pointer, buffer: Buffer, size: number, encoding: number) => boolean;
  release: (cf: Pointer) => void;
}

let lib: AxLib | null = null;
let loadError = "";

function loadAx(): AxLib | null {
  if (lib) return lib;
  if (process.platform !== "darwin") return null;
  try {
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const ax = koffi.load("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices");
    lib = {
      createApp: ax.func("void *AXUIElementCreateApplication(int pid)"),
      copyAttr: ax.func("int AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)"),
      createString: cf.func("void *CFStringCreateWithCString(void *alloc, const char *str, unsigned int encoding)"),
      getTypeId: cf.func("unsigned long CFGetTypeID(void *cf)"),
      stringTypeId: cf.func("unsigned long CFStringGetTypeID()"),
      arrayTypeId: cf.func("unsigned long CFArrayGetTypeID()"),
      urlTypeId: cf.func("unsigned long CFURLGetTypeID()"),
      arrayCount: cf.func("long CFArrayGetCount(void *theArray)"),
      arrayAt: cf.func("void *CFArrayGetValueAtIndex(void *theArray, long idx)"),
      urlString: cf.func("void *CFURLGetString(void *url)"),
      stringCString: cf.func("bool CFStringGetCString(void *theString, void *buffer, long bufferSize, unsigned int encoding)"),
      release: cf.func("void CFRelease(void *cf)"),
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
    const found = { url: "", title };
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
    return {
      title: found.title,
      url: normalizeCapturedUrl(found.url) || (/^(chrome|brave|edge|about):/i.test(found.url) ? found.url : ""),
    };
  } catch {
    return { title: "", url: "" };
  }
}

function walk(api: AxLib, element: Pointer, depth: number, found: { url: string; title: string }) {
  if (depth > MAX_DEPTH || found.url) return;
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
