import koffi from "koffi";
import { systemPreferences } from "electron";

type AxTrusted = () => boolean;
type ElectronTrusted = (prompt: boolean) => boolean;
type AxProbe = () => boolean | null;

const UTF8 = 0x08000100;
/** Returned by AX APIs when the process is not trusted. Never shown as a prompt. */
const AX_ERROR_API_DISABLED = -25211;

type Pointer = unknown;

interface AxProbeLib {
  createSystemWide: () => Pointer;
  copyAttr: (element: Pointer, attribute: Pointer, value: Pointer[]) => number;
  createString: (alloc: Pointer | null, str: string, encoding: number) => Pointer;
  release: (cf: Pointer) => void;
}

let axTrusted: AxTrusted | null | undefined;
let probeLib: AxProbeLib | null | undefined;

function loadAxIsProcessTrusted(): AxTrusted | null {
  if (axTrusted !== undefined) return axTrusted;
  if (process.platform !== "darwin") {
    axTrusted = null;
    return null;
  }
  try {
    const ax = koffi.load("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices");
    axTrusted = ax.func("bool AXIsProcessTrusted()") as AxTrusted;
    return axTrusted;
  } catch {
    axTrusted = null;
    return null;
  }
}

function loadAxProbe(): AxProbeLib | null {
  if (probeLib !== undefined) return probeLib;
  if (process.platform !== "darwin") {
    probeLib = null;
    return null;
  }
  try {
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const ax = koffi.load("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices");
    probeLib = {
      createSystemWide: ax.func("void *AXUIElementCreateSystemWide()"),
      copyAttr: ax.func("int AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)"),
      createString: cf.func("void *CFStringCreateWithCString(void *alloc, const char *str, unsigned int encoding)"),
      release: cf.func("void CFRelease(void *cf)"),
    };
    return probeLib;
  } catch {
    probeLib = null;
    return null;
  }
}

function queryAxIsProcessTrusted(): boolean | null {
  try {
    const trusted = loadAxIsProcessTrusted();
    if (!trusted) return null;
    return trusted();
  } catch {
    return null;
  }
}

/** True when AX calls already work. Does not display a permission prompt. */
function queryAxApiEnabled(): boolean | null {
  try {
    const api = loadAxProbe();
    if (!api) return null;
    const systemWide = api.createSystemWide();
    if (!systemWide) return null;
    const name = api.createString(null, "AXFocusedApplication", UTF8);
    const slot: Pointer[] = [null as unknown as Pointer];
    const status = api.copyAttr(systemWide, name, slot);
    if (name) api.release(name);
    if (slot[0]) api.release(slot[0]);
    api.release(systemWide);
    if (status === AX_ERROR_API_DISABLED) return false;
    return true;
  } catch {
    return null;
  }
}

function queryElectronTrusted(prompt: boolean): boolean {
  try {
    return systemPreferences.isTrustedAccessibilityClient(prompt);
  } catch {
    return false;
  }
}

/** True when TCC already trusts this process. Never prompts. */
export function isAccessibilityGranted(
  ax = queryAxIsProcessTrusted,
  electron = queryElectronTrusted,
  probe = queryAxApiEnabled,
): boolean {
  if (process.platform !== "darwin") return true;
  if (ax() === true) return true;
  if (probe() === true) return true;
  return electron(false);
}

/** Prompt only when Accessibility is not already granted. */
export function requestAccessibilityAccess(
  ax = queryAxIsProcessTrusted,
  electron = queryElectronTrusted,
  probe = queryAxApiEnabled,
): boolean {
  if (isAccessibilityGranted(ax, electron, probe)) return true;
  return electron(true);
}
