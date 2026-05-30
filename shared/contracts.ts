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

export const DEFAULT_ZONES: ZoneConfig[] = [
  { id: 'low',  label: 'Низька',  color: '#3b6ea5', minHr: 0,  maxHr: 70,  videoPath: DEFAULT_ZONE_VIDEOS.low ?? '',  fadeMs: 2500 },
  { id: 'mid',  label: 'Середня', color: '#3fae6a', minHr: 70, maxHr: 90,  videoPath: DEFAULT_ZONE_VIDEOS.mid ?? '',  fadeMs: 2000 },
  { id: 'high', label: 'Висока',  color: '#c0563b', minHr: 90, maxHr: 999, videoPath: DEFAULT_ZONE_VIDEOS.high ?? '', fadeMs: 1500 },
];

export function isDefaultZoneShape(zones: ZoneConfig[]): boolean {
  if (zones.length !== DEFAULT_ZONES.length) return false;
  return DEFAULT_ZONES.every((def, i) => {
    const z = zones[i];
    if (!z) return false;
    return (
      z.id === def.id &&
      z.label === def.label &&
      z.color === def.color &&
      z.minHr === def.minHr &&
      z.maxHr === def.maxHr &&
      z.fadeMs === def.fadeMs
    );
  });
}

export const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',
  VIDEO_PICK: 'video:pick',
  APP_VERSION: 'app:version',
  BLE_DEVICES: 'ble:devices',
  BLE_SELECT: 'ble:select',
  BLE_CANCEL: 'ble:cancel',
  UPDATE_STATUS: 'update:status',
  UPDATE_GET: 'update:get',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
} as const;

export interface BleDeviceInfo {
  deviceId: string;
  deviceName: string;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  | 'disabled';

export interface UpdateStatus {
  state: UpdateState;
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
}
