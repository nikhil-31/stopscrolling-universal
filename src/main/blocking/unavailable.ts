import type { HelperRequest } from "./protocol";
import { HelperTransportError, type HelperTransport } from "./transport";

export class UnavailableHelperTransport implements HelperTransport {
  readonly kind = "unavailable" as const;

  constructor(readonly reason = "Native blocking helper is unavailable on this platform.") {}

  async request(_request: HelperRequest): Promise<never> {
    throw new HelperTransportError(this.reason);
  }
}
