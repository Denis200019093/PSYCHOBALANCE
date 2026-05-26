export interface ZoneConfig {
  id: string;
  label: string;
  color: string;
  minHr: number;
  maxHr: number;
  videoPath: string;
  fadeMs: number;
}

export interface AppSettings {
  zones: ZoneConfig[];
  autoMode: boolean;
  dwellSeconds: number;
  smoothingWindowSec: number;
  crossfadeMs: number;
  hrvWindowSec: number;
  chartWindowSec: number;
  kioskMode: boolean;
}

export interface HrSample {
  bpm: number;
  rrIntervalsMs?: number[];
  contactDetected?: boolean;
  energyKj?: number;
  ts: number;
}

export interface HrvSample {
  rmssd: number;        // ms — short-term parasympathetic indicator
  sdnn: number;         // ms — overall variability over window
  meanRrMs: number;     // ms — mean RR interval
  meanHr: number;       // bpm derived from meanRr (60000/meanRr)
  pnn50: number;        // % of successive RR diffs > 50 ms
  sampleCount: number;  // RR intervals used in current window
  windowMs: number;
  ts: number;
}

export type BleStatus =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'streaming'
  | 'disconnected'
  | 'error';

export const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',
  VIDEO_PICK: 'video:pick',
  APP_VERSION: 'app:version',
  BLE_DEVICES: 'ble:devices',
  BLE_SELECT: 'ble:select',
  BLE_CANCEL: 'ble:cancel',
} as const;

export interface BleDeviceInfo {
  deviceId: string;
  deviceName: string;
}
