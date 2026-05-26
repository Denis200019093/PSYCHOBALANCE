'use client';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useHrHistory } from '@/lib/store/useHrHistory';
import { useSession } from '@/lib/store/useSession';
import type { ZoneConfig } from '@shared/contracts';

const VIEW_W = 1000;
const VIEW_H = 140;
const PAD_X = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 18;

const EMPTY_ZONES: ZoneConfig[] = [];

export function HrChart() {
  const samples = useHrHistory((s) => s.samples);
  const windowMs = useHrHistory((s) => s.windowMs);
  const zones = useSession((s) => s.settings?.zones ?? EMPTY_ZONES);
  const currentZoneId = useSession((s) => s.currentZone?.id ?? null);

  const view = useMemo(() => buildView(samples, windowMs, zones), [samples, windowMs, zones]);

  return (
    <Card className="absolute inset-x-4 bottom-4 z-10 border-white/10 bg-black/55 text-white backdrop-blur-sm">
      <CardContent className="p-3">
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-white/60">
          <span>HR — last {Math.round(windowMs / 60000)} min</span>
          <span>
            {samples.length > 0
              ? `${view.yMin}–${view.yMax} bpm · n=${samples.length}`
              : 'no data'}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-[140px] w-full"
        >
          {view.bands.map((b) => (
            <rect
              key={b.id}
              x={0}
              y={b.y}
              width={VIEW_W}
              height={b.h}
              fill={b.color}
              opacity={b.id === currentZoneId ? 0.32 : 0.14}
            />
          ))}
          {view.gridLines.map((g) => (
            <g key={`grid-${g.value}`}>
              <line
                x1={0}
                x2={VIEW_W}
                y1={g.y}
                y2={g.y}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={6}
                y={g.y - 2}
                fontSize={10}
                fill="rgba(255,255,255,0.55)"
                fontFamily="system-ui, sans-serif"
              >
                {g.value}
              </text>
            </g>
          ))}
          {view.path && (
            <path
              d={view.path}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {view.lastPoint && (
            <circle
              cx={view.lastPoint.x}
              cy={view.lastPoint.y}
              r={3}
              fill="#ffffff"
              stroke={view.lastPoint.color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {view.timeTicks.map((t) => (
            <text
              key={`t-${t.x}`}
              x={t.x}
              y={VIEW_H - 4}
              fontSize={10}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontFamily="system-ui, sans-serif"
            >
              {t.label}
            </text>
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}

interface ChartView {
  path: string | null;
  bands: { id: string; y: number; h: number; color: string }[];
  gridLines: { value: number; y: number }[];
  timeTicks: { x: number; label: string }[];
  yMin: number;
  yMax: number;
  lastPoint: { x: number; y: number; color: string } | null;
}

function buildView(
  samples: { bpm: number; ts: number }[],
  windowMs: number,
  zones: ZoneConfig[],
): ChartView {
  if (samples.length === 0) {
    return {
      path: null,
      bands: [],
      gridLines: [],
      timeTicks: [],
      yMin: 40,
      yMax: 180,
      lastPoint: null,
    };
  }

  let minBpm = Infinity;
  let maxBpm = -Infinity;
  for (const s of samples) {
    if (s.bpm < minBpm) minBpm = s.bpm;
    if (s.bpm > maxBpm) maxBpm = s.bpm;
  }
  const yMin = Math.max(30, Math.floor((minBpm - 5) / 10) * 10);
  const yMax = Math.max(yMin + 20, Math.ceil((maxBpm + 5) / 10) * 10);

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const elapsed = last.ts - first.ts;
  const tStart = elapsed > windowMs ? last.ts - windowMs : first.ts;
  const tEnd = tStart + windowMs;
  const plotTop = PAD_TOP;
  const plotBottom = VIEW_H - PAD_BOTTOM;
  const plotHeight = plotBottom - plotTop;
  const plotLeft = PAD_X;
  const plotRight = VIEW_W - PAD_X;
  const plotWidth = plotRight - plotLeft;

  const xFor = (ts: number) =>
    plotLeft + ((Math.max(tStart, Math.min(tEnd, ts)) - tStart) / windowMs) * plotWidth;
  const yFor = (bpm: number) =>
    plotTop + (1 - (bpm - yMin) / (yMax - yMin)) * plotHeight;

  let path = '';
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.ts < tStart) continue;
    const cmd = path === '' ? 'M' : 'L';
    path += `${cmd}${xFor(s.ts).toFixed(2)},${yFor(s.bpm).toFixed(2)}`;
  }

  const bands = zones
    .map((z) => {
      const zMin = Math.max(yMin, z.minHr);
      const zMax = Math.min(yMax, z.maxHr);
      if (zMax <= zMin) return null;
      const yTop = yFor(zMax);
      const yBottom = yFor(zMin);
      return { id: z.id, y: yTop, h: yBottom - yTop, color: z.color };
    })
    .filter((b): b is { id: string; y: number; h: number; color: string } => b !== null);

  const gridLines: { value: number; y: number }[] = [];
  const step = pickGridStep(yMax - yMin);
  const firstGrid = Math.ceil(yMin / step) * step;
  for (let v = firstGrid; v <= yMax; v += step) {
    gridLines.push({ value: v, y: yFor(v) });
  }

  const timeTicks: { x: number; label: string }[] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const seconds = Math.round((windowMs / 1000) * (i / tickCount));
    const x = plotLeft + (i / tickCount) * plotWidth;
    timeTicks.push({ x, label: i === 0 ? '0' : formatSeconds(seconds) });
  }

  const lastZone = zones.find((z) => last.bpm >= z.minHr && last.bpm < z.maxHr);
  const lastPoint = {
    x: xFor(last.ts),
    y: yFor(last.bpm),
    color: lastZone?.color ?? '#ffffff',
  };

  return { path: path || null, bands, gridLines, timeTicks, yMin, yMax, lastPoint };
}

function pickGridStep(range: number): number {
  if (range <= 40) return 10;
  if (range <= 80) return 20;
  return 50;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m${rem}s`;
}
