import { app } from "electron";

let quitting = false;

export function isQuitting() {
  return quitting;
}

export function markQuitting() {
  quitting = true;
}

export function shouldHideWindowOnClose(quittingState = quitting) {
  return !quittingState;
}

export function shouldBlockQuit(helperConfirmedStrictMode: boolean) {
  return helperConfirmedStrictMode;
}

export async function quitApp(
  shutdown: () => Promise<void>,
  helperConfirmedStrictMode = false,
  onBlocked?: () => Promise<void> | void,
) {
  if (shouldBlockQuit(helperConfirmedStrictMode)) {
    await onBlocked?.();
    return false;
  }
  if (quitting) return;
  quitting = true;
  try {
    await shutdown();
  } finally {
    app.quit();
  }
  return true;
}
