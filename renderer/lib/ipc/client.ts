import type { AppSettings, BleDeviceInfo, UpdateStatus } from '@shared/contracts';

// Thin wrapper around window.psy that throws a clear error if the preload
// did not run (e.g. when accidentally opening pages in a normal browser).
function psy() {
  if (typeof window === 'undefined' || !window.psy) {
    throw new Error('window.psy is not available — preload did not initialize.');
  }
  return window.psy;
}

export const ipc = {
  getSettings: (): Promise<AppSettings> => psy().settings.get(),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    psy().settings.update(patch),
  onSettingsChange: (cb: (s: AppSettings) => void): (() => void) =>
    psy().settings.onChange(cb),
  pickVideo: (): Promise<string | null> => psy().video.pickFile(),
  resolveVideoUrl: (path: string): string =>
    /^https?:\/\//i.test(path) ? path : psy().video.resolveUrl(path),
  getAppVersion: (): Promise<string> => psy().app.version(),
  onBleDevices: (cb: (devices: BleDeviceInfo[]) => void): (() => void) =>
    psy().ble.onDevices(cb),
  selectBleDevice: (deviceId: string): void => psy().ble.select(deviceId),
  cancelBleSelect: (): void => psy().ble.cancel(),
  getUpdateStatus: (): Promise<UpdateStatus> => psy().updates.get(),
  checkForUpdate: (): Promise<UpdateStatus> => psy().updates.check(),
  installUpdate: (): Promise<boolean> => psy().updates.install(),
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) =>
    psy().updates.onStatus(cb),
};
