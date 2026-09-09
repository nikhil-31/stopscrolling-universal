import { _electron as electron, expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function capture(page: Page, name: string, testInfo: TestInfo) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, {
    path,
  });
}

test("main screens and settings render in light and dark themes", async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), "stopscrolling-ui-"));
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...cleanEnv } = process.env;
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env: {
      ...cleanEnv,
      STOPSCROLLING_UI_TEST: "1",
    },
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
    });
    await expect(page.getByTestId("app-root")).toBeVisible();
    await expect(page.getByTestId("sidebar-today-item")).toHaveAttribute("aria-current", "page");

    await capture(page, "today-light-desktop", testInfo);

    for (const screen of ["calendar", "insights", "leaderboard", "account"] as const) {
      await page.getByTestId(`sidebar-${screen}-item`).click();
      await expect(page.getByTestId(`sidebar-${screen}-item`)).toHaveAttribute("aria-current", "page");
      await capture(page, `${screen}-light`, testInfo);
    }

    await page.evaluate(() => window.stopscrolling.setCommandPalette(true));
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await capture(page, "command-palette", testInfo);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();

    await page.evaluate(() => window.stopscrolling.selectInspector({
      kind: "segment",
      segment: {
        id: "screenshot-session",
        start: "2026-09-09T09:00:00.000Z",
        end: "2026-09-09T09:42:00.000Z",
        label: "Writing product notes",
        subtitle: "Notes",
        url: "https://example.com/weekly-notes",
        bundleID: "com.example.notes",
        category: "Productivity",
        appName: "Notes",
        devicePlatform: "macos",
        deviceName: "Studio Mac",
        timeZoneIdentifier: "Asia/Kolkata",
        isLive: false,
      },
    }));
    await expect(page.getByRole("complementary", { name: "Session inspector" })).toBeVisible();
    await capture(page, "inspector-light-desktop", testInfo);
    await page.getByRole("button", { name: "Close inspector" }).click();

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 640);
    });
    await page.getByTestId("sidebar-today-item").click();
    await capture(page, "today-light-minimum", testInfo);

    await page.evaluate(() => window.stopscrolling.updateSettings({ appearance: "dark" }));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture(page, "today-dark-minimum", testInfo);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
    });
    await capture(page, "today-dark-desktop", testInfo);

    await page.evaluate(() => window.stopscrolling.openSettings());
    const settings = await app.waitForEvent("window");
    await expect(settings.getByRole("heading", { name: "Settings" })).toBeVisible();
    await capture(settings, "settings-dark", testInfo);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
