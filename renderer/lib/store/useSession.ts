import { create } from 'zustand';
import type { AppSettings, BleStatus, HrvSample, ZoneConfig } from '@shared/contracts';

interface SessionState {
  bleStatus: BleStatus;
  hrRaw: number | null;
  currentZone: ZoneConfig | null;
  pendingZone: ZoneConfig | null;
  settings: AppSettings | null;
  hrv: HrvSample | null;
  setBleStatus: (s: BleStatus) => void;
  setHr: (raw: number) => void;
  setZone: (current: ZoneConfig | null, pending: ZoneConfig | null) => void;
  setSettings: (s: AppSettings) => void;
  setHrv: (h: HrvSample | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  bleStatus: 'idle',
  hrRaw: null,
  currentZone: null,
  pendingZone: null,
  settings: null,
  hrv: null,
  setBleStatus: (bleStatus) => set({ bleStatus }),
  setHr: (hrRaw) => set({ hrRaw }),
  setZone: (currentZone, pendingZone) => set({ currentZone, pendingZone }),
  setSettings: (settings) => set({ settings }),
  setHrv: (hrv) => set({ hrv }),
}));
