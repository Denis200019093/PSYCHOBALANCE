'use client';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '@/lib/store/useSession';

export function ZoneIndicator() {
  const current = useSession((s) => s.currentZone);
  const pending = useSession((s) => s.pendingZone);
  const settings = useSession((s) => s.settings);

  return (
    <Card className="mt-3 min-w-[200px] border-white/10 bg-black/55 text-white backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-white/60">Zone</div>
        <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
          <span
            className="inline-block size-3 rounded-full"
            style={{
              background: current?.color ?? '#444',
              boxShadow: current ? `0 0 12px ${current.color}` : 'none',
            }}
          />
          {current?.label ?? '— не визначено —'}
        </div>
        {pending && pending.id !== current?.id && (
          <div className="mt-1 text-[11px] text-white/70">очікує: {pending.label}</div>
        )}
        <div className="mt-2 text-[11px] text-white/60">
          auto: {settings?.autoMode ? 'on' : 'off'} · dwell: {settings?.dwellSeconds ?? '—'}s
        </div>
      </CardContent>
    </Card>
  );
}
