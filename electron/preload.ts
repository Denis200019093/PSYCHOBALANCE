import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, BleDeviceInfo, UpdateStatus } from '../shared/contracts';

// IMPORTANT: with `sandbox: true`, preload may only require these built-ins:
// electron, events, timers, url. Any other require (including project paths)
// throws and aborts the preload, leaving window.psy undefined. Keep channel
// names duplicated here on purpose — single source of truth is enforced by the
// IpcChannel type below so a mismatch is a compile error.
type IpcChannel =
  | 'settings:get'
  | 'settings:update'
  | 'settings:changed'
  | 'video:pick'
  | 'app:version'
  | 'ble:devices'
  | 'ble:select'
  | 'ble:cancel'
  | 'update:status'
  | 'update:get'
  | 'update:check'
  | 'update:install';

const channel = <C extends IpcChannel>(c: C): C => c;

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(channel('settings:get')),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(channel('settings:update'), patch),
    onChange: (cb: (s: AppSettings) => void): (() => void) => {
      const h = (_: unknown, s: AppSettings) => cb(s);
      ipcRenderer.on(channel('settings:changed'), h);
      return () => ipcRenderer.removeListener(channel('settings:changed'), h);
    },
  },
  video: {
    pickFile: (): Promise<string | null> => ipcRenderer.invoke(channel('video:pick')),
    resolveUrl: (p: string): string => `psy-video://local/${encodeURIComponent(p)}`,
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke(channel('app:version')),
  },
  ble: {
    onDevices: (cb: (devices: BleDeviceInfo[]) => void): (() => void) => {
      const h = (_: unknown, devices: BleDeviceInfo[]) => cb(devices);
      ipcRenderer.on(channel('ble:devices'), h);
      return () => ipcRenderer.removeListener(channel('ble:devices'), h);
    },
    select: (deviceId: string): void => {
      ipcRenderer.send(channel('ble:select'), deviceId);
    },
    cancel: (): void => {
      ipcRenderer.send(channel('ble:cancel'));
    },
  },
  updates: {
    get: (): Promise<UpdateStatus> => ipcRenderer.invoke(channel('update:get')),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke(channel('update:check')),
    install: (): Promise<boolean> => ipcRenderer.invoke(channel('update:install')),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const h = (_: unknown, s: UpdateStatus) => cb(s);
      ipcRenderer.on(channel('update:status'), h);
      return () => ipcRenderer.removeListener(channel('update:status'), h);
    },
  },
} as const;

contextBridge.exposeInMainWorld('psy', api);

export type PsyApi = typeof api;
