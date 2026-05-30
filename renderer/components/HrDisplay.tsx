'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/store/useSession';

export function HrDisplay() {
  const hrRaw = useSession((s) => s.hrRaw);
  const bleStatus = useSession((s) => s.bleStatus);

  return (
    <Card className="min-w-[200px] border-white/10 bg-black/55 text-white backdrop-blur-sm">
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="text-xs uppercase tracking-wider text-white/60">Heart Rate</div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold leading-none tabular-nums">
            {hrRaw !== null ? Math.round(hrRaw) : '—'}
          </span>
          <span className="text-sm text-white/60">bpm</span>
        </div>
        <Badge variant="outline" className="mt-1 w-fit border-white/20 text-[10px] text-white/70">
          BLE: {bleStatus}
        </Badge>
      </CardContent>
    </Card>
  );
}
