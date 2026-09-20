import type { HelperRequest } from "./protocol";

export interface HelperTransport {
  readonly kind: "macos-xpc" | "windows-pipe" | "unavailable";
  request(request: HelperRequest): Promise<unknown>;
  requestRelaunch?(): Promise<void>;
  close?(): Promise<void>;
  activate?(): Promise<import("@shared/types").BlockingHostSetup>;
  setup?(): Promise<import("@shared/types").BlockingHostSetup | undefined>;
}

export class HelperTransportError extends Error {
  constructor(
    message: string,
    readonly code = "HELPER_UNAVAILABLE",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HelperTransportError";
  }
}
