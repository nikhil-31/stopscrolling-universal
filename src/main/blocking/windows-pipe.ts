import { connect } from "node:net";
import type { HelperRequest } from "./protocol";
import { MAX_HELPER_MESSAGE_BYTES } from "./protocol";
import { HelperTransportError, type HelperTransport } from "./transport";

export const WINDOWS_HELPER_PIPE = "\\\\.\\pipe\\StopScrolling.Blocking.v1";

export class WindowsNamedPipeTransport implements HelperTransport {
  readonly kind = "windows-pipe" as const;

  constructor(
    private readonly pipeName = WINDOWS_HELPER_PIPE,
    private readonly timeoutMs = 4_000,
  ) {}

  request(request: HelperRequest): Promise<unknown> {
    const body = Buffer.from(JSON.stringify(request), "utf8");
    if (body.length > MAX_HELPER_MESSAGE_BYTES) {
      return Promise.reject(new HelperTransportError("Helper request is too large", "MESSAGE_TOO_LARGE"));
    }
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32LE(body.length, 0);
    body.copy(frame, 4);

    return new Promise((resolve, reject) => {
      const socket = connect(this.pipeName);
      let settled = false;
      let received = Buffer.alloc(0);
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        error ? reject(error) : resolve(value);
      };
      socket.setTimeout(this.timeoutMs, () =>
        finish(new HelperTransportError("Blocking helper timed out", "TIMEOUT")),
      );
      socket.once("error", (error) =>
        finish(new HelperTransportError("Could not connect to blocking helper", "CONNECT_FAILED", { cause: error })),
      );
      socket.once("connect", () => socket.write(frame));
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length < 4) return;
        const size = received.readUInt32LE(0);
        if (!size || size > MAX_HELPER_MESSAGE_BYTES) {
          finish(new HelperTransportError("Malformed helper response", "MALFORMED_RESPONSE"));
          return;
        }
        if (received.length < size + 4) return;
        try {
          const response = JSON.parse(received.subarray(4, size + 4).toString("utf8")) as {
            ok?: boolean;
            result?: unknown;
            error?: unknown;
          };
          if (response.ok !== true) {
            finish(new HelperTransportError(
              typeof response.error === "string" ? response.error : "Helper rejected request",
              "HELPER_REJECTED",
            ));
          } else {
            finish(undefined, response.result);
          }
        } catch (error) {
          finish(new HelperTransportError("Malformed helper response", "MALFORMED_RESPONSE", { cause: error }));
        }
      });
    });
  }
}
