# Stop Scrolling

Cross-platform desktop client for [Stop Scrolling](https://github.com/nikhil-31/stopscrolling-universal): a productivity app that records what you use, shows it as timelines and calendars, and syncs across devices.

The app tracks the frontmost application (and, on macOS, the active browser tab), stores sessions locally, and can upload them to a Stop Scrolling backend. Blocking lists and schedules can be created and synced, but this desktop build does **not** enforce website or app blocks yet.

## Features

- **Today** — live timeline, category and app/website breakdowns, and an event log for the current day
- **Calendar** — day, week, and month views with labels, work-hour targets, and optional Google Calendar overlays
- **Insights** — charts and session breakdowns over longer periods
- **Blocking** — create blocklists and schedules, then sync them to your account (enforcement is not implemented in this client)
- **Account** — sign in, register, MFA, and linked devices
- **Settings** — appearance, backend URL, sync, diagnostics, and Google Calendar
- **System tray** — closing the main window hides the app; tracking can continue in the background
- **Command palette** (`⌘K` / `Ctrl+K`) for navigation and tracking actions

Local tracking works without an account. Recording starts when the app opens and continues until you stop it from the toolbar. Sign in to sync timelines, devices, and blocking data with the backend.

## Requirements

- **Node.js 20+** (Node 22 recommended; matches Electron 35)
- **npm**
- A running Stop Scrolling API if you want cloud sync (default base URL is `http://localhost`)

### Platform extras

| Platform | Tracking | Notes |
| --- | --- | --- |
| **macOS** | Frontmost app, window title, and browser tab URL | Grant **Accessibility**. macOS may also prompt for **Automation** of Chrome, Safari, or Edge. |
| **Windows** | Frontmost app and window title | URLs are captured only when they appear in the window title. |
| **Linux** | Frontmost window (best-effort) | X11 uses `xdotool` and `xprop`. Hyprland uses `hyprctl`. Wayland has no standard window API, so tracking is limited. Browser URLs are not captured. |

On Linux, install `xdotool` and `xprop` for X11 tracking:

```sh
# Debian / Ubuntu
sudo apt install xdotool x11-utils
```

## Setup

```sh
git clone https://github.com/nikhil-31/stopscrolling-universal.git
cd stopscrolling-universal
npm install
npm run dev
```

That starts the Electron app with hot reload via electron-vite. On macOS, the first launch wraps Electron in a branded `StopScrolling.app` bundle so Accessibility and Automation prompts show the product name instead of “Electron”.

### Sign in and sync

1. Open **Account** and sign in or create an account (password at least 8 characters).
2. Open **Settings → Sync**.
3. Confirm the **API base URL** (default `http://localhost`). Use HTTPS in production.
4. Enable **Sync events to backend**.
5. Use **Sync unsynced** / **Pull from server** as needed.

HTTP is allowed for local development; Settings shows a warning if the URL starts with `http://`.

### Google Calendar (optional)

Calendar can overlay events from Google Calendar on the day view.

1. Create an OAuth 2.0 **Desktop** / loopback client in Google Cloud Console.
2. Allow a redirect URI of the form `http://127.0.0.1:<port>/callback` (the app binds a random local port).
3. Enable the Google Calendar API and the `calendar.readonly` scope.
4. Paste the **client ID** in **Settings → Calendar** and click **Connect**.

Apple Calendar / EventKit is not available in this Electron client.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the desktop app in development |
| `npm run preview` | Preview a production renderer build |
| `npm test` | Unit / component tests (Vitest) |
| `npm run typecheck` | Typecheck main/preload and renderer |
| `npm run test:ui` | Playwright UI tests against the running app |
| `npm run test:ui:update` | Update Playwright screenshots |
| `npm run build` | Compile main, preload, and renderer |
| `npm run pack` | Build unpacked app directories |
| `npm run dist` | Build installers (dmg/zip on macOS, NSIS on Windows, AppImage/deb on Linux) |

Packaged artifacts land in `dist/`. The app id is `com.stopscrolling.desktop`.

## Project layout

```
src/main/        Electron main process (windows, tray, IPC, tracker, API)
src/preload/     Context-bridge API exposed as window.stopscrolling
src/renderer/    React UI (Today, Calendar, Insights, Blocking, Account, Settings)
src/shared/      Types and pure logic shared by main and renderer
tests/           Playwright UI tests
```

Activity sampling is platform-specific under `src/main/collectors/` (`macos.ts`, `windows.ts`, `linux.ts`). Completed sessions wait in an encrypted local outbox until sync succeeds.

App data (settings, tokens, outbox, logs) lives in the Electron `userData` directory, for example:

- macOS: `~/Library/Application Support/stopscrolling/`
- Windows: `%APPDATA%\stopscrolling\`
- Linux: `~/.config/stopscrolling/`

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘1`–`⌘5` / `Ctrl+1`–`Ctrl+5` | Today, Calendar, Insights, Blocking, Account |
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘,` / `Ctrl+,` | Settings |
| `⇧⌘R` / `Ctrl+Shift+R` | Start or stop tracking |
| `⌘R` / `Ctrl+R` | Refresh the visible timeline |

## Libraries

### Runtime

| Library | Role |
| --- | --- |
| [Electron](https://www.electronjs.org/) | Desktop shell, tray, IPC, native APIs |
| [React](https://react.dev/) / [React DOM](https://react.dev/) | UI |
| [lucide-react](https://lucide.dev/) | Icons |

There is no CSS framework; styling is custom (`src/renderer/src/styles.css` and `design-system.css`). HTTP, crypto, and OAuth use Node and Electron APIs (`fetch`, `node:crypto`, `safeStorage`).

### Tooling

| Library | Role |
| --- | --- |
| [TypeScript](https://www.typescriptlang.org/) | Typed main, preload, renderer, and shared code |
| [Vite](https://vite.dev/) / [electron-vite](https://electron-vite.org/) | Dev server and production bundling |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React Fast Refresh |
| [electron-builder](https://www.electron.build/) | macOS, Windows, and Linux packages |
| [Vitest](https://vitest.dev/) | Unit tests |
| [jsdom](https://github.com/jsdom/jsdom) | DOM environment for renderer tests |
| [Testing Library](https://testing-library.com/) | Component tests |
| [Playwright](https://playwright.dev/) | End-to-end UI screenshots and flows |

## Current limitations

- Blocking UI and API sync exist; this client does not block sites or apps at the OS level.
- The Timer and Leaderboard screens are still in the codebase but are hidden from the sidebar.
- Browser URL capture is fully supported on macOS only.
- Closing the window on macOS hides to the tray instead of quitting; use Quit from the app menu or dock.
