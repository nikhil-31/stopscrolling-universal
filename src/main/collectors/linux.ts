import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ActivityCollector, ActivitySnapshot } from "./types";

const execFileAsync = promisify(execFile);

async function run(command: string, args: string[]) {
  const { stdout } = await execFileAsync(command, args, { timeout: 1500 });
  return stdout.trim();
}

export class LinuxCollector implements ActivityCollector {
  private wayland = Boolean(process.env.WAYLAND_DISPLAY);

  async start() {}
  async stop() {}
  requestPermission() {
    return true;
  }

  capabilities() {
    return {
      platform: "linux" as const,
      accessibilityGranted: true,
      urlCaptureSupported: false,
      urlCaptureNote: this.wayland
        ? "Wayland does not expose a standard window-title API. Tracking is best-effort (Hyprland/GNOME/KWin)."
        : "Window titles are read via X11. Browser URLs are not available on Linux.",
      waylandLimited: this.wayland,
    };
  }

  async sample(): Promise<ActivitySnapshot | null> {
    const fromHypr = await this.hyprland();
    if (fromHypr) return fromHypr;
    const fromGnome = await this.gnome();
    if (fromGnome) return fromGnome;
    return this.x11();
  }

  private async hyprland(): Promise<ActivitySnapshot | null> {
    try {
      const raw = await run("hyprctl", ["activewindow", "-j"]);
      const json = JSON.parse(raw) as { class?: string; title?: string };
      if (!json.class && !json.title) return null;
      return {
        appName: json.class || "Unknown",
        bundleID: json.class || "unknown",
        title: json.title || json.class || "",
        url: "",
      };
    } catch {
      return null;
    }
  }

  private async gnome(): Promise<ActivitySnapshot | null> {
    try {
      const raw = await run("gdbus", [
        "call",
        "--session",
        "--dest",
        "org.gnome.Shell",
        "--object-path",
        "/org/gnome/Shell/Focusable",
        "--method",
        "org.freedesktop.DBus.Peer.Ping",
      ]);
      if (!raw) return null;
    } catch {
      /* ignore */
    }
    return null;
  }

  private async x11(): Promise<ActivitySnapshot | null> {
    try {
      const id = await run("xdotool", ["getactivewindow"]);
      const title = await run("xdotool", ["getwindowname", id]);
      let appName = title;
      try {
        const cls = await run("xprop", ["-id", id, "WM_CLASS"]);
        const match = cls.match(/"([^"]+)"\s*,\s*"([^"]+)"/);
        appName = match?.[2] || match?.[1] || title;
      } catch {
        /* ignore */
      }
      return {
        appName,
        bundleID: appName.toLowerCase(),
        title,
        url: "",
      };
    } catch {
      return null;
    }
  }
}
