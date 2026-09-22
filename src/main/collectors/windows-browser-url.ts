import koffi from "koffi";
import { normalizeCapturedUrl } from "@shared/browser";

/** UIAutomationClient.h control types and the Value pattern. */
const UIA_COMBOBOX = 50003;
const UIA_EDIT = 50004;
const UIA_DOCUMENT = 50030;
const UIA_VALUE_PATTERN = 10002;
const COINIT_APARTMENTTHREADED = 2;
const CLSCTX_INPROC_SERVER = 1;
const RPC_E_CHANGED_MODE = -2147417850;
/** Chrome's address bar is eight control-view levels down. Stop there instead of entering the page. */
const MAX_DEPTH = 8;
const MAX_NODES = 50;
const POINTER = process.arch === "ia32" ? 4 : 8;

const elementFromHandleProto = koffi.proto(
  "int __stdcall UiaElementFromHandle(void *self, void *hwnd, _Out_ void **element)",
);
const controlViewWalkerProto = koffi.proto(
  "int __stdcall UiaControlViewWalker(void *self, _Out_ void **walker)",
);
const firstChildProto = koffi.proto(
  "int __stdcall UiaGetFirstChild(void *self, void *element, _Out_ void **child)",
);
const nextSiblingProto = koffi.proto(
  "int __stdcall UiaGetNextSibling(void *self, void *element, _Out_ void **next)",
);
const controlTypeProto = koffi.proto(
  "int __stdcall UiaGetCurrentControlType(void *self, _Out_ int *controlType)",
);
const currentPatternProto = koffi.proto(
  "int __stdcall UiaGetCurrentPattern(void *self, int patternId, _Out_ void **pattern)",
);
const currentValueProto = koffi.proto(
  "int __stdcall UiaGetCurrentValue(void *self, _Out_ void **value)",
);
const releaseProto = koffi.proto("uint32_t __stdcall UiaRelease(void *self)");

interface OleApi {
  CoInitializeEx: (reserved: null, flags: number) => number;
  CoCreateInstance: (
    clsid: Buffer,
    outer: null,
    context: number,
    iid: Buffer,
    out: unknown[],
  ) => number;
  SysFreeString: (value: unknown) => void;
  SysStringLen: (value: unknown) => number;
}

let ole: OleApi | null = null;
let automation: unknown = null;

/** First address-bar value that is a real website. Placeholders and half-typed text are ignored. */
export function browserUrlFromCandidates(values: readonly string[]): string {
  for (const value of values) {
    const url = normalizeCapturedUrl(value);
    if (!url) continue;
    try {
      const host = new URL(url).hostname;
      if (host === "localhost" || host.includes(".")) return url;
    } catch {
      /* try the next value */
    }
  }
  return "";
}

function guid(data1: number, data2: number, data3: number, data4: number[]): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32LE(data1 >>> 0, 0);
  buffer.writeUInt16LE(data2, 4);
  buffer.writeUInt16LE(data3, 6);
  data4.forEach((byte, index) => buffer.writeUInt8(byte, 8 + index));
  return buffer;
}

const CLSID_CUIAutomation = guid(0xff48dba4, 0x60ef, 0x4201, [0xaa, 0x87, 0x54, 0x10, 0x3e, 0xef, 0x59, 0x4e]);
const IID_IUIAutomation = guid(0x30cbe57d, 0xd9d0, 0x452a, [0xab, 0x13, 0x7a, 0xc5, 0xac, 0x48, 0x25, 0xee]);

function comOk(hr: number): boolean {
  const code = hr | 0;
  return code >= 0 || code === RPC_E_CHANGED_MODE;
}

function invoke(target: unknown, slot: number, method: ReturnType<typeof koffi.proto>, args: unknown[]): number {
  const vtable = koffi.decode(target, "void *");
  const fnPtr = koffi.decode(vtable, slot * POINTER, "void *");
  const fn = koffi.decode(fnPtr, method) as (...inner: unknown[]) => number;
  return fn(...args);
}

function release(target: unknown) {
  if (!target) return;
  try {
    invoke(target, 2, releaseProto, [target]);
  } catch {
    /* the interface is already unusable */
  }
}

function oleApi(): OleApi {
  if (ole) return ole;
  const ole32 = koffi.load("ole32.dll");
  const oleaut32 = koffi.load("oleaut32.dll");
  koffi.load("UIAutomationCore.dll");
  ole = {
    CoInitializeEx: ole32.func("int __stdcall CoInitializeEx(void *reserved, uint32_t flags)"),
    CoCreateInstance: ole32.func(
      "int __stdcall CoCreateInstance(void *rclsid, void *outer, uint32_t context, void *riid, _Out_ void **ppv)",
    ),
    SysFreeString: oleaut32.func("void __stdcall SysFreeString(void *bstr)"),
    SysStringLen: oleaut32.func("uint32_t __stdcall SysStringLen(void *bstr)"),
  };
  return ole;
}

function bstr(api: OleApi, pointer: unknown): string {
  if (!pointer) return "";
  try {
    const chars = Number(api.SysStringLen(pointer)) || 0;
    if (chars <= 0) return "";
    const units = koffi.decode(pointer, "uint16_t", chars) as ArrayLike<number>;
    let text = "";
    for (let index = 0; index < units.length; index += 1) {
      const code = Number(units[index]);
      if (!code) break;
      text += String.fromCharCode(code);
    }
    return text;
  } finally {
    try {
      api.SysFreeString(pointer);
    } catch {
      /* the string was already freed */
    }
  }
}

function automationObject(): unknown {
  if (automation) return automation;
  const api = oleApi();
  const init = api.CoInitializeEx(null, COINIT_APARTMENTTHREADED);
  if (!comOk(init)) throw new Error(`CoInitializeEx failed: ${init}`);
  const created = [null];
  const hr = api.CoCreateInstance(CLSID_CUIAutomation, null, CLSCTX_INPROC_SERVER, IID_IUIAutomation, created);
  if ((hr | 0) < 0 || !created[0]) throw new Error(`CoCreateInstance failed: ${hr}`);
  automation = created[0];
  return automation;
}

function elementFromHandle(uia: unknown, hwnd: unknown): unknown {
  const out = [null];
  const hr = invoke(uia, 6, elementFromHandleProto, [uia, hwnd, out]);
  if ((hr | 0) < 0) return null;
  return out[0];
}

function controlViewWalker(uia: unknown): unknown {
  const out = [null];
  const hr = invoke(uia, 14, controlViewWalkerProto, [uia, out]);
  if ((hr | 0) < 0) return null;
  return out[0];
}

function firstChild(walker: unknown, element: unknown): unknown {
  const out = [null];
  const hr = invoke(walker, 4, firstChildProto, [walker, element, out]);
  if ((hr | 0) < 0) return null;
  return out[0];
}

function nextSibling(walker: unknown, element: unknown): unknown {
  const out = [null];
  const hr = invoke(walker, 6, nextSiblingProto, [walker, element, out]);
  if ((hr | 0) < 0) return null;
  return out[0];
}

function controlType(element: unknown): number {
  const out = [0];
  const hr = invoke(element, 21, controlTypeProto, [element, out]);
  if ((hr | 0) < 0) return 0;
  return Number(out[0]) || 0;
}

function addressValue(element: unknown): string {
  const type = controlType(element);
  if (type !== UIA_EDIT && type !== UIA_COMBOBOX) return "";
  const pattern = [null];
  const hr = invoke(element, 16, currentPatternProto, [element, UIA_VALUE_PATTERN, pattern]);
  if ((hr | 0) < 0 || !pattern[0]) return "";
  try {
    const value = [null];
    const valueHr = invoke(pattern[0], 4, currentValueProto, [pattern[0], value]);
    if ((valueHr | 0) < 0) return "";
    return browserUrlFromCandidates([bstr(oleApi(), value[0])]);
  } finally {
    release(pattern[0]);
  }
}

function walk(walker: unknown, element: unknown, depth: number, state: { count: number }): string {
  if (!element || state.count >= MAX_NODES) return "";
  state.count += 1;
  const url = addressValue(element);
  if (url) return url;
  if (depth >= MAX_DEPTH || controlType(element) === UIA_DOCUMENT) return "";

  let child = firstChild(walker, element);
  while (child && state.count < MAX_NODES) {
    const childKey = String(child);
    let found = "";
    let sibling: unknown = null;
    try {
      found = walk(walker, child, depth + 1, state);
      if (!found && state.count < MAX_NODES) sibling = nextSibling(walker, child);
    } finally {
      release(child);
    }
    if (found) return found;
    if (!sibling || String(sibling) === childKey) break;
    child = sibling;
  }
  return "";
}

/** Read the foreground browser address bar. Returns "" when no website is showing. */
export function readBrowserAddress(hwnd: unknown): string {
  const uia = automationObject();
  const root = elementFromHandle(uia, hwnd);
  if (!root) return "";
  const walker = controlViewWalker(uia);
  try {
    if (!walker) return "";
    return walk(walker, root, 0, { count: 0 });
  } finally {
    release(root);
    release(walker);
  }
}
