import { describe, expect, it } from "vitest";
import { activityAssetId, championKey, isGameAssetId, publishGameAssets } from "./game-assets";
import type { ScreenTimeSnapshot } from "./types";

describe("game assets", () => {
  it("maps champion names onto Data Dragon file names", () => {
    expect(championKey("Ahri")).toBe("Ahri");
    expect(championKey("Wukong")).toBe("MonkeyKing");
    expect(championKey("Lee Sin")).toBe("LeeSin");
    expect(championKey("Kai'Sa")).toBe("Kaisa");
  });

  it("picks a steam capsule or a champion square", () => {
    expect(activityAssetId({ appName: "cs2.exe" })).toBe("steam/730");
    expect(activityAssetId({ appName: "League of Legends", champion: "Ahri" })).toBe("riot/Ahri");
    expect(activityAssetId({ appName: "League of Legends" })).toBeNull();
    expect(activityAssetId({ appName: "FortniteClient-Win64-Shipping.exe" })).toBeNull();
    expect(isGameAssetId("../secrets")).toBe(false);
  });

  it("hides an asset until its file is cached", () => {
    const snapshot = {
      apps: [{ key: "app|cs2", label: "cs2", subtitle: "", category: "Gaming", seconds: 1, percentage: 1 }],
      timelineSegments: [],
      listSegments: [],
    } as unknown as ScreenTimeSnapshot;
    const hidden = publishGameAssets(snapshot, [], () => false, () => undefined);
    expect(hidden.snapshot.apps[0].assetId).toBeUndefined();
    const shown = publishGameAssets(snapshot, [], (id) => id === "steam/730", () => undefined);
    expect(shown.snapshot.apps[0].assetId).toBe("steam/730");
  });
});
