'use client';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '@/lib/store/useSession';

export function HrvDisplay() {
  const hrv = useSession((s) => s.hrv);
  const settings = useSession((s) => s.settings);
  const windowSec = settings?.hrvWindowSec ?? 60;

  return (
    <Card className="mt-3 min-w-[200px] border-white/10 bg-black/55 text-white backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-white/60">HRV ({windowSec}s)</div>
        <div className="mt-2 flex gap-4">
          <Metric label="RMSSD" value={hrv?.rmssd} unit="ms" digits={1} />
          <Metric label="SDNN" value={hrv?.sdnn} unit="ms" digits={1} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
          <span>pNN50: {fmt(hrv?.pnn50, 1)}%</span>
          <span>meanRR: {fmt(hrv?.meanRrMs, 0)} ms</span>
          <span>n={hrv?.sampleCount ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  unit,
  digits,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  digits: number;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-white/60">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-none tabular-nums">{fmt(value, digits)}</span>
        <span className="text-[11px] text-white/60">{unit}</span>
      </span>
    </div>
  );
}

function fmt(v: number | undefined, digits: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}
