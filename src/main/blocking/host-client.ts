import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import koffi from "koffi";
import type { BlockingHostSetup } from "@shared/types";
import { parseHostSetup } from "./protocol";
import type { HelperRequest } from "./protocol";
import { MACOS_HELPER_SERVICE, type MacXpcClient } from "./macos-xpc";

const HOST_CLIENT_LIBRARY = "libStopScrollingHostClient.dylib";

interface HostClientLibrary {
  request: (operation: string, body: string, result: unknown[], error: unknown[]) => number;
  activate: (result: unknown[], error: unknown[]) => number;
  setup: (result: unknown[], error: unknown[]) => number;
  close: () => void;
  free: (pointer: unknown) => void;
}

let loaded: { path: string; lib: HostClientLibrary } | null = null;

export function macHostClientCandidates(resourcesPath = process.resourcesPath): string[] {
  return [
    join(resourcesPath, "native/macos", HOST_CLIENT_LIBRARY),
    join(resourcesPath, "native", HOST_CLIENT_LIBRARY),
  ];
}

function isCodesigned(path: string) {
  try {
    execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", path], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolveSignedHostClientPath(): string | undefined {
  const resourcesPath = typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  const candidates = resourcesPath ? macHostClientCandidates(resourcesPath) : [];
  return candidates.find((path) => existsSync(path) && isCodesigned(path));
}

function loadLibrary(path: string): HostClientLibrary {
  const lib = koffi.load(path);
  return {
    request: lib.func("int ss_host_request(const char *operation, const char *body, _Out_ char **result, _Out_ char **error)"),
    activate: lib.func("int ss_host_activate(_Out_ char **result, _Out_ char **error)"),
    setup: lib.func("int ss_host_setup(_Out_ char **result, _Out_ char **error)"),
    close: lib.func("void ss_host_close()"),
    free: lib.func("void ss_host_free(void *pointer)"),
  };
}

function takeCString(lib: HostClientLibrary, slot: unknown[]) {
  const pointer = slot[0];
  if (!pointer) return "";
  if (typeof pointer === "string") return pointer;
  const text = koffi.decode(pointer, "str") as string;
  lib.free(pointer);
  return text;
}

function invoke(
  lib: HostClientLibrary,
  call: (result: unknown[], error: unknown[]) => number,
): string {
  const result: unknown[] = [null];
  const error: unknown[] = [null];
  const status = call(result, error);
  const payload = takeCString(lib, result);
  const message = takeCString(lib, error);
  if (status !== 0) {
    throw new Error(message || "xpc-failed");
  }
  return payload;
}

class NativeMacHostClient implements MacXpcClient {
  constructor(private readonly lib: HostClientLibrary) {}

  async request(_serviceName: string, request: HelperRequest): Promise<unknown> {
    const body = requestBody(request);
    const payload = invoke(this.lib, (result, error) => (
      this.lib.request(request.operation, body, result, error)
    ));
    return payload ? JSON.parse(payload) : {};
  }

  async requestRelaunch() {
    this.lib.close();
  }

  async close() {
    this.lib.close();
  }

  async activate(): Promise<BlockingHostSetup> {
    const payload = invoke(this.lib, (result, error) => this.lib.activate(result, error));
    return parseHostSetup(JSON.parse(payload));
  }

  async setup(): Promise<BlockingHostSetup> {
    const payload = invoke(this.lib, (result, error) => this.lib.setup(result, error));
    return parseHostSetup(JSON.parse(payload));
  }
}

function requestBody(request: HelperRequest) {
  if (request.operation === "applyPolicy" || request.operation === "redeemBypass") {
    return JSON.stringify(request.envelope);
  }
  if (request.operation === "cancelNormal") return request.occurrenceID;
  return "";
}

/** Load the in-process signed host client only when the packaged dylib is present and codesigned. */
export function loadMacHostClient(): MacXpcClient | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const path = resolveSignedHostClientPath();
    if (!path) return undefined;
    if (!loaded || loaded.path !== path) {
      loaded = { path, lib: loadLibrary(path) };
    }
    return new NativeMacHostClient(loaded.lib);
  } catch {
    loaded = null;
    return undefined;
  }
}

export { MACOS_HELPER_SERVICE };
