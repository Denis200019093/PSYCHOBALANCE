import { app, BrowserWindow, Menu, ipcMain, session, protocol, net, globalShortcut } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SettingsStore } from './services/settingsStore';
import { registerIpcHandlers, broadcastSettings } from './ipc/handlers';
import { IPC, type BleDeviceInfo, type UpdateStatus } from '../shared/contracts';

let updateStatus: UpdateStatus = { state: 'idle' };

function setUpdateStatus(next: UpdateStatus): void {
  updateStatus = next;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.UPDATE_STATUS, next);
  }
}

const isDev = !app.isPackaged;
const settings = new SettingsStore();

Menu.setApplicationMenu(null);

// Web Bluetooth is on by default in modern Chromium builds shipped with Electron.
// The experimental WebBluetoothNewPermissionsBackend / ConfirmPairingSupport
// flags caused a STATUS_BREAKPOINT crash on Win11 — do NOT enable them.

// The custom protocol must be registered as 'standard' + 'secure' before app.ready
// so that <video src="psy-video://..."> behaves like a real file URL (range requests, etc.).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'psy-video',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false, stream: true },
  },
]);

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Web Bluetooth lives behind this flag in some Electron versions
      // (no-op when already enabled, kept for forward-compat).
      experimentalFeatures: false,
    },
  });

  win.setMenu(null);
  win.setMenuBarVisibility(false);

  // In-app picker bridge. The event fires repeatedly as scanning discovers
  // devices; each fire ships a FRESH callback. We always defer to the renderer
  // (preventDefault + store latest callback), stream the cumulative device list
  // to the UI, and resolve only when the user clicks a device or cancels.
  let pendingCallback: ((id: string) => void) | null = null;
  const knownDevices = new Map<string, BleDeviceInfo>();

  const broadcastDevices = () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.BLE_DEVICES, Array.from(knownDevices.values()));
    }
  };

  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    console.log(`[BLE] select-bluetooth-device fired with ${devices.length} device(s)`);
    pendingCallback = callback;
    for (const d of devices) {
      knownDevices.set(d.deviceId, {
        deviceId: d.deviceId,
        deviceName: d.deviceName || '(без імені)',
      });
    }
    broadcastDevices();
  });

  const onSelect = (_e: Electron.IpcMainEvent, deviceId: string) => {
    const cb = pendingCallback;
    pendingCallback = null;
    knownDevices.clear();
    cb?.(deviceId);
  };
  const onCancel = () => {
    const cb = pendingCallback;
    pendingCallback = null;
    knownDevices.clear();
    cb?.('');
  };
  ipcMain.on(IPC.BLE_SELECT, onSelect);
  ipcMain.on(IPC.BLE_CANCEL, onCancel);

  win.on('closed', () => {
    ipcMain.removeListener(IPC.BLE_SELECT, onSelect);
    ipcMain.removeListener(IPC.BLE_CANCEL, onCancel);
    pendingCallback?.('');
    pendingCallback = null;
  });

  // Kiosk mode: lock window into immersive fullscreen and block exit shortcuts
  // so a client cannot leave the session. Toggle via Ctrl+Shift+Q or Esc×3.
  const applyKiosk = (enabled: boolean) => {
    if (win.isDestroyed()) return;
    win.setKiosk(enabled);
    win.setAlwaysOnTop(enabled, 'screen-saver');
    win.setMenuBarVisibility(!enabled);
  };

  // Block window-close shortcuts while in kiosk. before-input-event fires only
  // when the window is focused; in kiosk it always is.
  win.webContents.on('before-input-event', (event, input) => {
    if (!win.isKiosk()) return;
    const key = input.key.toLowerCase();
    if ((input.alt && key === 'f4') || (input.control && key === 'w')) {
      event.preventDefault();
    }
  });

  // Emergency exit: Esc pressed 3 times within 2s. Safety net if the user
  // forgets the Ctrl+Shift+Q combo and panics.
  const escTimestamps: number[] = [];
  win.webContents.on('before-input-event', (_event, input) => {
    if (!win.isKiosk() || input.type !== 'keyDown' || input.key !== 'Escape') return;
    const now = Date.now();
    escTimestamps.push(now);
    while (escTimestamps.length > 0 && now - (escTimestamps[0] ?? 0) > 2000) escTimestamps.shift();
    if (escTimestamps.length >= 3) {
      escTimestamps.length = 0;
      settings.update({ kioskMode: false });
    }
  });

  // Apply current kiosk state and react to settings changes.
  settings.on('change', (s) => applyKiosk(s.kioskMode));

  if (isDev) {
    await win.loadURL('http://localhost:3000');
  } else {
    await win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'out', 'index.html'));
  }

  win.show();
  applyKiosk(settings.get().kioskMode);
  broadcastSettings(win, settings);
  return win;
}

app.whenReady().then(() => {
  // Single-purpose desktop app loading local origins only — grant all permission
  // requests. Tightening to specific permissions can be added later if the
  // renderer ever loads untrusted content.
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  // Polar HRS does not require PIN pairing; auto-confirm if a pairing dialog is ever requested.
  session.defaultSession.setBluetoothPairingHandler((_details, cb) => cb({ confirmed: true }));

  // Serve user-chosen video files via custom protocol so the renderer can play
  // arbitrary on-disk paths without exposing fs:// or file://. Path is validated
  // against the settings store to prevent traversal / unauthorized reads.
  protocol.handle('psy-video', (request) => {
    const url = new URL(request.url);
    // Hostname is a fixed marker ("local"); the on-disk path is URL-encoded into the pathname.
    const raw = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const allowed = settings.get().zones.some((z) => z.videoPath === raw);
    if (!allowed) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(raw).toString());
  });

  registerIpcHandlers(settings);

  // Global hotkey: toggle kiosk regardless of focus inside the app window.
  // Registered after app.whenReady; unregistered on quit to avoid leaks.
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    const next = !settings.get().kioskMode;
    settings.update({ kioskMode: next });
  });

  ipcMain.handle(IPC.UPDATE_GET, () => updateStatus);
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    if (isDev) return updateStatus;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      setUpdateStatus({ state: 'error', error: (err as Error).message });
    }
    return updateStatus;
  });
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    if (updateStatus.state !== 'downloaded') return false;
    autoUpdater.quitAndInstall();
    return true;
  });

  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  if (isDev) {
    setUpdateStatus({ state: 'disabled' });
  } else {
    initAutoUpdater();
  }
});

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    console.log('[autoUpdater] available', info.version);
    setUpdateStatus({ state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    setUpdateStatus({ state: 'not-available', version: info.version });
  });
  autoUpdater.on('download-progress', (p) => {
    setUpdateStatus({
      state: 'downloading',
      percent: Math.round(p.percent ?? 0),
      bytesPerSecond: p.bytesPerSecond,
      version: updateStatus.version,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[autoUpdater] downloaded', info.version, '— will install on quit');
    setUpdateStatus({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err);
    setUpdateStatus({ state: 'error', error: err.message });
  });

  const check = () => autoUpdater.checkForUpdates().catch((err) => console.error('[autoUpdater] check failed', err));
  setTimeout(check, 5_000);
  setInterval(check, 30 * 60_000);
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
