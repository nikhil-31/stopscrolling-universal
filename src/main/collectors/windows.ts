import { logObservability } from "../logger";
import { consumeAddressError, sampleForegroundWindow } from "./windows-foreground";
import type { ActivityCollector, SampleResult } from "./types";

export class WindowsCollector implements ActivityCollector {
  private loggedFailure = false;
  private loggedAddressFailure = false;

  async start() {}
  async stop() {}
  requestPermission() {
    return true;
  }

  capabilities() {
    return {
      platform: "windows" as const,
      accessibilityGranted: true,
      urlCaptureSupported: true,
      urlCaptureNote: "The address bar of the foreground browser is read locally.",
      waylandLimited: false,
    };
  }

  async sample(): Promise<SampleResult> {
    try {
      const result = sampleForegroundWindow();
      const addressError = consumeAddressError();
      if (addressError && !this.loggedAddressFailure) {
        this.loggedAddressFailure = true;
        const message = addressError instanceof Error ? addressError.message : String(addressError);
        logObservability(`Windows browser address read failed: ${message}`);
      }
      return result;
    } catch (error) {
      if (!this.loggedFailure) {
        this.loggedFailure = true;
        const message = error instanceof Error ? error.message : String(error);
        logObservability(`Windows foreground sample failed: ${message}`);
      }
      return { type: "unavailable" };
    }
  }
}
