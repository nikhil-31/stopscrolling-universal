import { describe, expect, it } from "vitest";
import { macHostClientCandidates } from "./host-client";

describe("macOS host client resolution", () => {
  it("looks for the signed dylib under extraResources native/", () => {
    expect(macHostClientCandidates("/app/Contents/Resources")).toEqual([
      "/app/Contents/Resources/native/macos/libStopScrollingHostClient.dylib",
      "/app/Contents/Resources/native/libStopScrollingHostClient.dylib",
    ]);
  });
});
