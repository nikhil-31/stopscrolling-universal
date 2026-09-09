import { currentDevicePlatform } from "@shared/platform";
import { LinuxCollector } from "./linux";
import { MacCollector } from "./macos";
import type { ActivityCollector } from "./types";
import { WindowsCollector } from "./windows";

export function createCollector(): ActivityCollector {
  switch (currentDevicePlatform()) {
    case "macos":
      return new MacCollector();
    case "windows":
      return new WindowsCollector();
    default:
      return new LinuxCollector();
  }
}
