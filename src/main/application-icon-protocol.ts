import { app, protocol } from "electron";
import { applicationIconResponse } from "@shared/application-icons";
import type { InstalledApplication } from "@shared/types";

const cache = new Map<string, Uint8Array>();

export function installApplicationIconProtocol(inventory: () => readonly InstalledApplication[]) {
  protocol.handle("app-icon", (request) => applicationIconResponse(
    request.url,
    inventory(),
    async (filePath) => {
      try {
        const image = await app.getFileIcon(filePath, { size: "normal" });
        if (image.isEmpty()) return null;
        return image.toPNG();
      } catch {
        return null;
      }
    },
    cache,
  ));
}
