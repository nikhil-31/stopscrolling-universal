import type { HelperRequest } from "./protocol";
import { HelperTransportError, type HelperTransport } from "./transport";
import type { BlockingHostSetup } from "@shared/types";

export const MACOS_HELPER_SERVICE = "com.stopscrolling.helper";

export interface MacXpcClient {
  request(serviceName: string, request: HelperRequest): Promise<unknown>;
  requestRelaunch?(serviceName: string): Promise<void>;
  close?(): Promise<void>;
  activate?(): Promise<BlockingHostSetup>;
  setup?(): Promise<BlockingHostSetup>;
}

/**
 * The signed host supplies the Objective-C XPC client at packaging time.
 * Keeping this injectable prevents dev builds from spawning privileged tools
 * or interpolating policy into shell commands.
 */
export class MacXpcTransport implements HelperTransport {
  readonly kind = "macos-xpc" as const;

  constructor(
    private readonly client: MacXpcClient,
    private readonly serviceName = MACOS_HELPER_SERVICE,
  ) {}

  async request(request: HelperRequest) {
    try {
      return await this.client.request(this.serviceName, request);
    } catch (error) {
      throw new HelperTransportError("macOS blocking helper request failed", "XPC_FAILED", { cause: error });
    }
  }

  async requestRelaunch() {
    await this.client.requestRelaunch?.(this.serviceName);
  }

  async close() {
    await this.client.close?.();
  }

  async activate() {
    if (!this.client.activate) {
      throw new HelperTransportError("macOS host activation is unavailable", "XPC_FAILED");
    }
    return this.client.activate();
  }

  async setup() {
    if (!this.client.setup) return undefined;
    return this.client.setup();
  }
}
