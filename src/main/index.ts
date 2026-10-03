import { app, BrowserWindow, crashReporter } from "electron";
import { AppController } from "./app-controller";
import { installGameAssetProtocol, registerGameAssetScheme } from "./game-asset-protocol";
import { installMainCrashHandlers, localCrashReporterOptions, logElectronChildProcessGone } from "./crash-reporting";
import { installApplicationMenu, installIpc } from "./ipc";
import { isQuitting, markQuitting, shouldShowWindowOnLaunch, syncLaunchAtLogin } from "./lifecycle";
import { installTray, refreshTray } from "./tray";
import { createMainWindow, showMainWindow } from "./windows";

crashReporter.start(localCrashReporterOptions());
installMainCrashHandlers();
app.on("child-process-gone", (_event, details) => {
  logElectronChildProcessGone(details);
});

app.setName("Stop Scrolling");
registerGameAssetScheme();

const controller = new AppController();

app.whenReady().then(async () => {
  installGameAssetProtocol(controller.gameAssets);
  installIpc(controller);
  installApplicationMenu(controller);
  await controller.boot();
  syncLaunchAtLogin(controller.settings.launchAtLogin);
  const openedHidden = app.isPackaged && app.getLoginItemSettings().wasOpenedAsHidden;
  createMainWindow(controller, shouldShowWindowOnLaunch(openedHidden));
  installTray(controller);
  refreshTray(controller);
  controller.onBlockingStateChanged = () => {
    refreshTray(controller);
    installApplicationMenu(controller);
  };

  app.on("activate", () => {
    showMainWindow(controller);
    controller.broadcast();
  });
  app.on("browser-window-focus", () => {
    controller.broadcast();
  });
  if (process.platform === "darwin") {
    app.on("did-become-active", () => {
      controller.broadcast();
    });
  }
});

app.on("before-quit", (event) => {
  if (controller.hasHelperConfirmedStrictMode()) {
    event.preventDefault();
    void controller.helper.requestRelaunchAfterForcedExit();
    return;
  }
  markQuitting();
  void controller.shutdown();
});

app.on("window-all-closed", () => {
  if (isQuitting()) return;
  // Stay in the tray/dock until the user chooses Quit.
});
