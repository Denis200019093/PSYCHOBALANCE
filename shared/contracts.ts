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

export const DEFAULT_ZONE_VIDEOS: Record<string, string> = {
  low:  'https://github.com/Denis200019093/PSYCHOBALANCE_ASSETS/releases/download/videos-1/1.mp4',
  mid:  'https://github.com/Denis200019093/PSYCHOBALANCE_ASSETS/releases/download/videos-1/2.mp4',
  high: 'https://github.com/Denis200019093/PSYCHOBALANCE_ASSETS/releases/download/videos-1/3.mp4',
};

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
