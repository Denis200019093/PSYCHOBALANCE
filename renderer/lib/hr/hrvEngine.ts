import { Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, scan } from 'rxjs/operators';
import type { HrSample, HrvSample } from '@shared/contracts';

// Physiologically plausible RR bounds. Drop anything outside.
const MIN_VALID_RR_MS = 300;   // 200 bpm
const MAX_VALID_RR_MS = 2000;  // 30 bpm
// Drop RR that jumps >20% vs previous accepted — classic ectopic-beat filter.
const MAX_DELTA_RATIO = 0.2;

export interface HrvEngineOptions {
  windowSec: number;
  minSamples?: number; // emit only when buffer reaches this; default 10
}

interface RrPoint {
  rr: number;
  ts: number;
}

interface EngineState {
  buffer: RrPoint[];
  lastAccepted: number | null;
  latestTs: number;
}

const INITIAL: EngineState = { buffer: [], lastAccepted: null, latestTs: 0 };

export function hrvEngine(
  hr$: Observable<HrSample>,
  opts: HrvEngineOptions,
): Observable<HrvSample> {
  const windowMs = Math.max(10, opts.windowSec) * 1000;
  const minSamples = opts.minSamples ?? 10;

  return hr$.pipe(
    filter(
      (s): s is HrSample & { rrIntervalsMs: number[] } =>
        Array.isArray(s.rrIntervalsMs) && s.rrIntervalsMs.length > 0,
    ),
    scan<HrSample & { rrIntervalsMs: number[] }, EngineState>((state, sample) => {
      const buffer = state.buffer.slice();
      let lastAccepted = state.lastAccepted;

      for (const rr of sample.rrIntervalsMs) {
        if (rr < MIN_VALID_RR_MS || rr > MAX_VALID_RR_MS) continue;
        if (
          lastAccepted !== null &&
          Math.abs(rr - lastAccepted) / lastAccepted > MAX_DELTA_RATIO
        ) {
          continue;
        }
        buffer.push({ rr, ts: sample.ts });
        lastAccepted = rr;
      }

      const cutoff = sample.ts - windowMs;
      while (buffer.length > 0) {
        const head = buffer[0];
        if (head === undefined || head.ts >= cutoff) break;
        buffer.shift();
      }

      return { buffer, lastAccepted, latestTs: sample.ts };
    }, INITIAL),
    filter((state) => state.buffer.length >= minSamples),
    map((state) => computeHrv(state.buffer, windowMs, state.latestTs)),
    distinctUntilChanged(
      (a, b) =>
        a.ts === b.ts ||
        (Math.abs(a.rmssd - b.rmssd) < 0.1 &&
          Math.abs(a.sdnn - b.sdnn) < 0.1 &&
          a.sampleCount === b.sampleCount),
    ),
  );
}

function computeHrv(buffer: RrPoint[], windowMs: number, ts: number): HrvSample {
  const n = buffer.length;
  let sum = 0;
  for (const p of buffer) sum += p.rr;
  const meanRrMs = sum / n;

  let varSum = 0;
  for (const p of buffer) {
    const d = p.rr - meanRrMs;
    varSum += d * d;
  }
  const sdnn = Math.sqrt(varSum / n);

  let sqSum = 0;
  let nn50 = 0;
  let pairs = 0;
  for (let i = 1; i < n; i++) {
    const prev = buffer[i - 1];
    const cur = buffer[i];
    if (!prev || !cur) continue;
    const d = cur.rr - prev.rr;
    sqSum += d * d;
    if (Math.abs(d) > 50) nn50++;
    pairs++;
  }
  const rmssd = pairs > 0 ? Math.sqrt(sqSum / pairs) : 0;
  const pnn50 = pairs > 0 ? (nn50 / pairs) * 100 : 0;
  const meanHr = meanRrMs > 0 ? 60000 / meanRrMs : 0;

  return {
    rmssd,
    sdnn,
    meanRrMs,
    meanHr,
    pnn50,
    sampleCount: n,
    windowMs,
    ts,
  };
}
