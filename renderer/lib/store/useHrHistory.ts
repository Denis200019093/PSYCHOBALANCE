import { create } from 'zustand';

export interface HrHistoryPoint {
  bpm: number;
  ts: number;
}

interface HrHistoryState {
  samples: HrHistoryPoint[];
  windowMs: number;
  setWindow: (windowSec: number) => void;
  push: (bpm: number, ts: number) => void;
  clear: () => void;
}

// Hard cap on points so a huge window can't blow memory. At 1 Hz BLE rate
// 7200 points = 2 h, plenty for any realistic chart window.
const MAX_POINTS = 7200;

export const useHrHistory = create<HrHistoryState>((set) => ({
  samples: [],
  windowMs: 300_000,
  setWindow: (windowSec) => set({ windowMs: Math.max(10, windowSec) * 1000 }),
  push: (bpm, ts) =>
    set((state) => {
      const cutoff = ts - state.windowMs;
      const next = state.samples.length >= MAX_POINTS
        ? state.samples.slice(state.samples.length - MAX_POINTS + 1)
        : state.samples.slice();
      next.push({ bpm, ts });
      while (next.length > 0 && next[0]!.ts < cutoff) next.shift();
      return { samples: next };
    }),
  clear: () => set({ samples: [] }),
}));
