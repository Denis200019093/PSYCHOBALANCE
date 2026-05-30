import { Observable } from 'rxjs';
import { distinctUntilChanged, scan } from 'rxjs/operators';
import type { HrSample, ZoneConfig } from '@shared/contracts';
import { findZone } from './zones';

export interface ZoneState {
  currentZoneId: string | null;
  pendingZoneId: string | null;
  pendingSince: number | null;
  hrSmoothed: number;
  hrRaw: number;
}

export interface EngineOptions {
  zones: ZoneConfig[];
  dwellMs: number;
  smoothingAlpha: number;
}

const INITIAL: ZoneState = {
  currentZoneId: null,
  pendingZoneId: null,
  pendingSince: null,
  hrSmoothed: 0,
  hrRaw: 0,
};

export function zoneEngine(
  hr$: Observable<HrSample>,
  opts: EngineOptions,
): Observable<ZoneState> {
  const alpha = Math.min(1, Math.max(0.01, opts.smoothingAlpha));
  return hr$.pipe(
    scan<HrSample, ZoneState>((state, sample) => {
      const smoothed =
        state.hrSmoothed === 0
          ? sample.bpm
          : alpha * sample.bpm + (1 - alpha) * state.hrSmoothed;

      const observed = findZone(sample.bpm, opts.zones)?.id ?? null;

      // 1) Observed zone matches what we already display — clear pending.
      if (observed === state.currentZoneId) {
        return { ...state, hrRaw: sample.bpm, hrSmoothed: smoothed, pendingZoneId: null, pendingSince: null };
      }

      // 2) New candidate (different from current AND different from previous pending) — start dwell timer.
      if (observed !== state.pendingZoneId) {
        return { ...state, hrRaw: sample.bpm, hrSmoothed: smoothed, pendingZoneId: observed, pendingSince: sample.ts };
      }

      // 3) Candidate persists — promote to current once dwellMs elapsed.
      const dwelled = state.pendingSince !== null && sample.ts - state.pendingSince >= opts.dwellMs;
      if (dwelled) {
        return { ...state, hrRaw: sample.bpm, hrSmoothed: smoothed, currentZoneId: observed, pendingZoneId: null, pendingSince: null };
      }

      return { ...state, hrRaw: sample.bpm, hrSmoothed: smoothed };
    }, INITIAL),
    distinctUntilChanged(
      (a, b) =>
        a.currentZoneId === b.currentZoneId &&
        a.pendingZoneId === b.pendingZoneId &&
        Math.abs(a.hrSmoothed - b.hrSmoothed) < 0.5 &&
        a.hrRaw === b.hrRaw,
    ),
  );
}
