import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { looksLikeBrowser } from "@shared/browser";
import type { ActivityCollector, ActivitySnapshot } from "./types";

const execFileAsync = promisify(execFile);

const SCRIPT = `
Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$hwnd = [Fg]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { return }
$sb = New-Object System.Text.StringBuilder 1024
[void][Fg]::GetWindowText($hwnd, $sb, $sb.Capacity)
$pid = 0
[void][Fg]::GetWindowThreadProcessId($hwnd, [ref]$pid)
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
$proc.ProcessName + "|||" + $proc.MainModule.FileName + "|||" + $sb.ToString()
`;

export class WindowsCollector implements ActivityCollector {
  async start() {}
  async stop() {}
  requestPermission() {
    return true;
  }

  capabilities() {
    return {
      platform: "windows" as const,
      accessibilityGranted: true,
      urlCaptureSupported: false,
      urlCaptureNote: "Window titles are captured. Address-bar URLs are best-effort on Windows.",
      waylandLimited: false,
    };
  }

  async sample(): Promise<ActivitySnapshot | null> {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-Command", SCRIPT],
        { timeout: 2500, windowsHide: true },
      );
      const [appName, fileName, title] = stdout.trim().split("|||");
      const bundleID = (fileName || appName || "unknown").split("\\").pop() || appName;
      return {
        appName: appName || "Unknown",
        bundleID,
        title: title || appName || "",
        url: looksLikeBrowser(appName) ? "" : "",
      };
    } catch {
      return null;
    }
  }
}
