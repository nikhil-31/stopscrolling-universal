import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { loadBlockScreens, presentBlockScreen } from "./blocking/block-screens";
import { freedomPageUrl, setBlockScreenMediaRoot } from "./blocking/freedom-page";
import { userDataDir } from "./paths";

const CARD_WIDTH = 320;
const CARD_HEIGHT = 148;
const CARD_HEIGHT_WITH_IMAGE = 280;
const MARGIN = 16;

let nudgeWindow: BrowserWindow | null = null;
let onUserDismiss: (() => void) | null = null;
let hiding = false;

function nudgeFile() {
  if (process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/nudge.html`;
  return join(__dirname, "../renderer/nudge.html");
}

function cardHeight(image: string) {
  return image ? CARD_HEIGHT_WITH_IMAGE : CARD_HEIGHT;
}

function placeOnActiveDisplay(win: BrowserWindow, image: string) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const height = cardHeight(image);
  win.setBounds({
    x: Math.round(area.x + area.width - CARD_WIDTH - MARGIN),
    y: Math.round(area.y + MARGIN),
    width: CARD_WIDTH,
    height,
  });
}

async function reminderCopy(label: string, site: string) {
  const dir = join(userDataDir(), "block-screens");
  setBlockScreenMediaRoot(dir);
  const reminder = loadBlockScreens(dir).reminder;
  let image = "";
  if (reminder.imageFile) {
    try {
      const base = await freedomPageUrl();
      image = presentBlockScreen(base, { imageFile: reminder.imageFile, header: "", detail: "" }).imageUrl;
    } catch {
      image = "";
    }
  }
  return { label, site, detail: reminder.detail.trim(), image };
}

async function loadNudge(win: BrowserWindow, copy: { label: string; site: string; detail: string; image: string }) {
  const query = { label: copy.label, site: copy.site, detail: copy.detail, image: copy.image };
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(`${process.env.ELECTRON_RENDERER_URL}/nudge.html`);
    url.search = new URLSearchParams(query).toString();
    await win.loadURL(url.toString());
    return;
  }
  await win.loadFile(nudgeFile(), { query });
}

function reveal(win: BrowserWindow, image: string) {
  if (win.isDestroyed()) return;
  placeOnActiveDisplay(win, image);
  win.showInactive();
}

/** Small card over the app in front. Showing it does not take the keyboard. */
export function showNudgeCard(label: string, site: string, onDismiss: () => void) {
  onUserDismiss = onDismiss;
  const existing = nudgeWindow && !nudgeWindow.isDestroyed() ? nudgeWindow : null;
  const copyFor = reminderCopy(label, site).catch(() => ({ label, site, detail: "", image: "" }));
  if (existing) {
    void copyFor.then(async (copy) => {
      if (existing.isDestroyed()) return;
      await loadNudge(existing, copy);
      reveal(existing, copy.image);
    });
    return existing;
  }

  const win = new BrowserWindow({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "Distracting",
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  nudgeWindow = win;
  win.on("closed", () => {
    if (nudgeWindow === win) nudgeWindow = null;
    if (hiding) {
      hiding = false;
      return;
    }
    const dismiss = onUserDismiss;
    onUserDismiss = null;
    dismiss?.();
  });
  void copyFor.then(async (copy) => {
    if (win.isDestroyed()) return;
    win.once("ready-to-show", () => reveal(win, copy.image));
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    await loadNudge(win, copy);
  });
  return win;
}

/** Hides the card without treating it as a dismiss. */
export function hideNudgeCard() {
  if (!nudgeWindow || nudgeWindow.isDestroyed()) {
    nudgeWindow = null;
    return;
  }
  hiding = true;
  const win = nudgeWindow;
  nudgeWindow = null;
  win.close();
}
