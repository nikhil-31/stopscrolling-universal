import { existsSync, unlinkSync } from "node:fs";
import { typesafeKeyPath } from "./paths";

/**
 * Older versions called Jev from this device with a Typesafe key pasted into Settings.
 * The server calls Jev now; this removes a key left on disk.
 */
export function clearTypesafeApiKey() {
  try {
    if (existsSync(typesafeKeyPath())) unlinkSync(typesafeKeyPath());
  } catch {
    // Tried again on the next sign-in.
  }
}
