import { ipcMain, dialog, app, type BrowserWindow } from 'electron';
import { IPC } from '../../shared/contracts';
import type { SettingsStore } from '../services/settingsStore';

export function registerIpcHandlers(store: SettingsStore): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => store.get());

  ipcMain.handle(IPC.SETTINGS_UPDATE, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) {
      throw new Error('settings:update expects an object');
    }
    return store.update(patch as Parameters<SettingsStore['update']>[0]);
  });

  ipcMain.handle(IPC.VIDEO_PICK, async () => {
    const r = await dialog.showOpenDialog({
      title: 'Виберіть відеофайл для зони',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }],
    });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
  });

  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion());
}

export function broadcastSettings(win: BrowserWindow, store: SettingsStore): void {
  const handler = (s: ReturnType<SettingsStore['get']>) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.SETTINGS_CHANGED, s);
  };
  store.on('change', handler);
  win.on('closed', () => store.off('change', handler));
}
