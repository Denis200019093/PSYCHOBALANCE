'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
} from 'recharts';
import type { DotProps } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { useHrHistory } from '@/lib/store/useHrHistory';
import { useSession } from '@/lib/store/useSession';
import type { ZoneConfig } from '@shared/contracts';

const EMPTY_ZONES: ZoneConfig[] = [];
const AXIS_COLOR = 'rgba(255,255,255,0.2)';
const TICK_COLOR = 'rgba(255,255,255,0.55)';

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
              ? `${view.yDomain[0]}–${view.yDomain[1]} bpm · n=${samples.length}`
              : 'no data'}
          </span>
        </div>
        <div className="h-35 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} />
              {zones.map((z) => (
                // Horizontal HR band per zone; brighter when it's the active zone.
                <ReferenceArea
                  key={z.id}
                  y1={z.minHr}
                  y2={z.maxHr}
                  fill={z.color}
                  fillOpacity={z.id === currentZoneId ? 0.32 : 0.14}
                  stroke="none"
                  ifOverflow="hidden"
                />
              ))}
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={view.xDomain}
                allowDataOverflow
                ticks={view.xTicks}
                interval={0}
                tickFormatter={(ts: number) => formatSeconds(Math.round((ts - view.xDomain[0]) / 1000))}
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                stroke={AXIS_COLOR}
              />
              <YAxis
                domain={view.yDomain}
                allowDataOverflow
                ticks={view.yTicks}
                interval={0}
                width={34}
                tick={{ fill: TICK_COLOR, fontSize: 10 }}
                stroke={AXIS_COLOR}
              />
              <Line
                type="linear"
                dataKey="bpm"
                stroke="#ffffff"
                strokeWidth={1.5}
                isAnimationActive={false}
                dot={<LastDot total={samples.length} color={view.lastColor} />}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Render a marker only on the final sample (recharts calls `dot` per point).
function LastDot({ total, color, ...props }: DotProps & { total: number; color: string; index?: number }) {
  const { cx, cy, index } = props as DotProps & { index?: number };
  if (index !== total - 1 || cx == null || cy == null) return null;
  return (
    <circle cx={cx} cy={cy} r={3} fill="#ffffff" stroke={color} strokeWidth={1.5} />
  );
}

interface ChartView {
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  lastColor: string;
}

function buildView(
  samples: { bpm: number; ts: number }[],
  windowMs: number,
  zones: ZoneConfig[],
): ChartView {
  if (samples.length === 0) {
    const now = Date.now();
    return {
      xDomain: [now - windowMs, now],
      yDomain: [40, 180],
      xTicks: timeTicks(now - windowMs, windowMs),
      yTicks: [40, 180],
      lastColor: '#ffffff',
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

  const lastZone = zones.find((z) => last.bpm >= z.minHr && last.bpm < z.maxHr);

  // Y ticks at the visible zone boundaries (the from/to of each band) plus the
  // axis ends, so the labels read off where each zone starts and stops.
  const bounds = new Set<number>([yMin, yMax]);
  for (const z of zones) {
    if (z.minHr > yMin && z.minHr < yMax) bounds.add(z.minHr);
    if (z.maxHr > yMin && z.maxHr < yMax) bounds.add(z.maxHr);
  }

  return {
    xDomain: [tStart, tStart + windowMs],
    yDomain: [yMin, yMax],
    xTicks: timeTicks(tStart, windowMs),
    yTicks: [...bounds].sort((a, b) => a - b),
    lastColor: lastZone?.color ?? '#ffffff',
  };
}

// Tick timestamps every 30 s; widen the step on long windows so labels don't crowd.
function timeTicks(tStart: number, windowMs: number): number[] {
  const totalSec = windowMs / 1000;
  let stepSec = 30;
  while (totalSec / stepSec > 13) stepSec *= 2;
  const ticks: number[] = [];
  for (let sec = 0; sec <= totalSec + 0.001; sec += stepSec) {
    ticks.push(tStart + sec * 1000);
  }
  return ticks;
}

function formatSeconds(s: number): string {
  if (s <= 0) return '0';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m${rem}s`;
}
