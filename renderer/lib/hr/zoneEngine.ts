import { Observable } from 'rxjs';
import { distinctUntilChanged, scan } from 'rxjs/operators';
import type { HrSample, ZoneConfig } from '@shared/contracts';
import { findZone } from './zones';

export interface ZoneState {
  currentZoneId: string | null;
  pendingZoneId: string | null;
  pendingSince: number | null;
  hrRaw: number;
}

export interface EngineOptions {
  zones: ZoneConfig[];
  dwellMs: number;
}

const INITIAL: ZoneState = {
  currentZoneId: null,
  pendingZoneId: null,
  pendingSince: null,
  hrRaw: 0,
};

export function zoneEngine(
  hr$: Observable<HrSample>,
  opts: EngineOptions,
): Observable<ZoneState> {
  return hr$.pipe(
    scan<HrSample, ZoneState>((state, sample) => {
      const observed = findZone(sample.bpm, opts.zones)?.id ?? null;

      // 0) Cold start (no zone established yet) — adopt the first observed zone
      // immediately. Dwell hysteresis only guards transitions BETWEEN zones, so
      // there's nothing to flap from on a fresh subscription (connect, template
      // switch, settings change). Without this the first beat would idle the
      // whole dwell with currentZoneId null → no video + zone "-" for dwellMs.
      if (state.currentZoneId === null && observed !== null) {
        return { ...state, hrRaw: sample.bpm, currentZoneId: observed, pendingZoneId: null, pendingSince: null };
      }

      // 1) Observed zone matches what we already display — clear pending.
      if (observed === state.currentZoneId) {
        return { ...state, hrRaw: sample.bpm, pendingZoneId: null, pendingSince: null };
      }

      // 2) New candidate (different from current AND different from previous pending) — start dwell timer.
      if (observed !== state.pendingZoneId) {
        return { ...state, hrRaw: sample.bpm, pendingZoneId: observed, pendingSince: sample.ts };
      }

      // 3) Candidate persists — promote to current once dwellMs elapsed.
      const dwelled = state.pendingSince !== null && sample.ts - state.pendingSince >= opts.dwellMs;
      if (dwelled) {
        return { ...state, hrRaw: sample.bpm, currentZoneId: observed, pendingZoneId: null, pendingSince: null };
      }

      return { ...state, hrRaw: sample.bpm };
    }, INITIAL),
    distinctUntilChanged(
      (a, b) =>
        a.currentZoneId === b.currentZoneId &&
        a.pendingZoneId === b.pendingZoneId &&
        a.hrRaw === b.hrRaw,
    ),
  );
}
