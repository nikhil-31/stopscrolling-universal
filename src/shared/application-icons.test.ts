import { describe, expect, it, vi } from "vitest";
import {
  applicationIconFilePath,
  applicationIconForLabel,
  applicationIconPathFromUrl,
  applicationIconResponse,
  applicationIconUrl,
  withApplicationIcons,
} from "./application-icons";
import type { InstalledApplication } from "./types";

function application(patch: Partial<InstalledApplication> = {}): InstalledApplication {
  return {
    displayName: "Visual Studio Code",
    executablePath: "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
    bundleIdentifier: "com.microsoft.VSCode",
    signingIdentifier: "com.microsoft.VSCode",
    packageFamilyName: null,
    publisherThumbprint: null,
    ...patch,
  };
}

describe("application icons", () => {
  it("uses the macOS app bundle and leaves Windows paths unchanged", () => {
    expect(applicationIconFilePath("/Applications/Slack.app/Contents/MacOS/Slack", "darwin"))
      .toBe("/Applications/Slack.app");
    expect(applicationIconFilePath("/Applications/Slack.app", "darwin")).toBe("/Applications/Slack.app");
    expect(applicationIconFilePath("C:\\Program Files\\Slack\\slack.exe", "win32"))
      .toBe("C:\\Program Files\\Slack\\slack.exe");
    expect(applicationIconFilePath("  ", "darwin")).toBeNull();
  });

  it("round-trips path-style icon URLs and still accepts the encoded form", () => {
    expect(applicationIconUrl("/Applications/Slack.app")).toBe("app-icon://bundle/Applications/Slack.app");
    expect(applicationIconUrl("/Applications/Visual Studio Code.app"))
      .toBe("app-icon://bundle/Applications/Visual%20Studio%20Code.app");
    expect(applicationIconUrl("C:\\Program Files\\Slack\\slack.exe"))
      .toBe("app-icon://file/C%3A/Program%20Files/Slack/slack.exe");
    for (const filePath of ["/Applications/Visual Studio Code.app", "C:\\Program Files\\Slack\\slack.exe"]) {
      expect(applicationIconPathFromUrl(applicationIconUrl(filePath))).toBe(filePath);
    }
    const legacy = `app-icon://icon/${encodeURIComponent("/Applications/Slack.app")}`;
    expect(applicationIconPathFromUrl(legacy)).toBe("/Applications/Slack.app");
    expect(applicationIconPathFromUrl("app-icon://icon/Applications/Slack.app")).toBe("/Applications/Slack.app");
    expect(applicationIconPathFromUrl("https://example.com/icon")).toBeNull();
  });

  it("attaches an icon URL only when a file path exists", () => {
    const [slack, missing] = withApplicationIcons([
      application({ displayName: "Slack", executablePath: "/Applications/Slack.app/Contents/MacOS/Slack" }),
      application({ displayName: "Store", executablePath: "" }),
    ], "darwin");
    expect(slack.iconUrl).toBe(applicationIconUrl("/Applications/Slack.app"));
    expect(missing.iconUrl).toBeNull();
  });

  it("matches an application row by display name, then by executable stem", () => {
    const code = withApplicationIcons([application()], "darwin")[0];
    expect(applicationIconForLabel("app|Visual Studio Code", "Visual Studio Code", [code])).toBe(code.iconUrl);
    expect(applicationIconForLabel("app|Code", "Code", [code])).toBe(code.iconUrl);
    expect(applicationIconForLabel("summary-id", "Code", [code])).toBe(code.iconUrl);
    expect(applicationIconForLabel("summary-id", "Code", [code], true)).toBeNull();
    expect(applicationIconForLabel("web|github.com", "github.com", [code])).toBeNull();
    expect(applicationIconForLabel("app|Notes", "Notes", [code])).toBeNull();
  });

  it("serves a cached PNG only for an inventory path", async () => {
    const slack = withApplicationIcons([
      application({ displayName: "Slack", executablePath: "/Applications/Slack.app/Contents/MacOS/Slack" }),
    ], "darwin")[0];
    const png = new Uint8Array([1, 2, 3]);
    const readIcon = vi.fn(async () => png);
    const cache = new Map<string, Uint8Array>();
    const url = slack.iconUrl ?? "";
    const legacy = `app-icon://icon/${encodeURIComponent("/Applications/Slack.app")}`;

    const first = await applicationIconResponse(url, [slack], readIcon, cache);
    const fromLegacy = await applicationIconResponse(legacy, [slack], readIcon, cache);
    const second = await applicationIconResponse(url, [slack], readIcon, cache);
    const refused = await applicationIconResponse(applicationIconUrl("/Applications/Other.app"), [slack], readIcon, cache);

    expect(first.status).toBe(200);
    expect(fromLegacy.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(png);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(png);
    expect(readIcon).toHaveBeenCalledTimes(1);
    expect(refused.status).toBe(404);
  });
});
