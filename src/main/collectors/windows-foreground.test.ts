import { beforeEach, describe, expect, it } from "vitest";
import { browserUrlFromCandidates } from "./windows-browser-url";
import {
  applyBrowserUrl,
  browserUrlForWindow,
  isShellUiHost,
  resetBrowserUrlCache,
  snapshotFromForeground,
  type WindowIdentity,
} from "./windows-foreground";

function identity(patch: Partial<WindowIdentity> = {}): WindowIdentity {
  return {
    title: "",
    imagePath: null,
    fileDescription: null,
    packageFamilyName: null,
    ...patch,
  };
}

describe("Windows foreground snapshots", () => {
  it("uses the file description and exe name for a Win32 window", () => {
    const snapshot = snapshotFromForeground(
      identity({
        title: "Untitled - Notepad",
        imagePath: "C:\\Windows\\System32\\notepad.exe",
        fileDescription: "Notepad",
      }),
    );
    expect(snapshot).toEqual({
      appName: "Notepad",
      bundleID: "notepad.exe",
      title: "Untitled - Notepad",
      url: "",
    });
  });

  it("still returns the window title when the image path cannot be read", () => {
    const snapshot = snapshotFromForeground(identity({ title: "Elevated Tool" }));
    expect(snapshot).toEqual({
      appName: "Elevated Tool",
      bundleID: "unknown",
      title: "Elevated Tool",
      url: "",
    });
  });

  it("replaces ApplicationFrameHost with the hosted package", () => {
    const snapshot = snapshotFromForeground(
      identity({
        title: "Settings",
        imagePath: "C:\\Windows\\System32\\ApplicationFrameHost.exe",
        fileDescription: "Application Frame Host",
      }),
      identity({
        title: "",
        imagePath: "C:\\Program Files\\WindowsApps\\Settings\\SystemSettings.exe",
        fileDescription: "Settings",
        packageFamilyName: "windows.immersivecontrolpanel_cw5n1h2txyewy",
      }),
    );
    expect(snapshot).toEqual({
      appName: "Settings",
      bundleID: "windows.immersivecontrolpanel_cw5n1h2txyewy",
      title: "Settings",
      url: "",
    });
  });

  it("reads a browser URL only when the title contains one", () => {
    const chrome = {
      imagePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      fileDescription: "Google Chrome",
    };
    expect(
      snapshotFromForeground(identity({ ...chrome, title: "Docs https://example.com/guide - Google Chrome" })).url,
    ).toBe("https://example.com/guide");
    expect(snapshotFromForeground(identity({ ...chrome, title: "Docs - Google Chrome" })).url).toBe("");
  });
});

describe("Windows browser websites", () => {
  beforeEach(() => {
    resetBrowserUrlCache();
  });

  it("keeps the first real address and skips placeholders", () => {
    expect(
      browserUrlFromCandidates([
        "Search Google or type a URL",
        "kittens",
        "https://gith",
        "https://github.com/stopscrolling",
        "https://example.com",
      ]),
    ).toBe("https://github.com/stopscrolling");
  });

  it("uses the address bar URL instead of the window title", () => {
    const snapshot = snapshotFromForeground(
      identity({
        title: "Docs https://example.com/guide - Google Chrome",
        imagePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        fileDescription: "Google Chrome",
      }),
    );
    expect(applyBrowserUrl(snapshot, "https://github.com/stopscrolling").url).toBe(
      "https://github.com/stopscrolling",
    );
  });

  it("does not read the address bar again for the same window and title", () => {
    let calls = 0;
    const read = () => {
      calls += 1;
      return "https://github.com/stopscrolling";
    };
    expect(browserUrlForWindow(42, "GitHub - Google Chrome", read)).toBe("https://github.com/stopscrolling");
    expect(browserUrlForWindow(42, "GitHub - Google Chrome", read)).toBe("https://github.com/stopscrolling");
    expect(calls).toBe(1);
    expect(browserUrlForWindow(42, "Example - Google Chrome", read)).toBe("https://github.com/stopscrolling");
    expect(calls).toBe(2);
  });

  it("leaves a non-browser snapshot without a URL", () => {
    const snapshot = snapshotFromForeground(
      identity({
        title: "Untitled - Notepad",
        imagePath: "C:\\Windows\\System32\\notepad.exe",
        fileDescription: "Notepad",
      }),
    );
    expect(applyBrowserUrl(snapshot, "https://example.com/from-a-control").url).toBe("");
  });
});

describe("Windows shell windows", () => {
  it("suppresses the Start menu and other shell UI", () => {
    for (const exe of [
      "StartMenuExperienceHost.exe",
      "ShellExperienceHost.exe",
      "SearchHost.exe",
      "SearchApp.exe",
      "TextInputHost.exe",
    ]) {
      expect(isShellUiHost(`C:\\Windows\\SystemApps\\${exe}`)).toBe(true);
    }
  });

  it("keeps Notepad and Explorer", () => {
    expect(isShellUiHost("C:\\Windows\\System32\\notepad.exe")).toBe(false);
    expect(isShellUiHost("C:\\Windows\\explorer.exe")).toBe(false);
    expect(isShellUiHost(null)).toBe(false);
  });
});
