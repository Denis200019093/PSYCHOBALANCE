'use client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/store/useSession';

interface Props {
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectButton({ onConnect, onDisconnect }: Props) {
  const status = useSession((s) => s.bleStatus);
  const connected = status === 'streaming' || status === 'connecting';
  const busy = status === 'requesting' || status === 'connecting';

  return (
    <Button
      type="button"
      size="lg"
      disabled={busy}
      onClick={connected ? onDisconnect : onConnect}
      variant={connected ? 'destructive' : 'success'}
      className="mt-3 w-full"
    >
      {busy && <Loader2 className="animate-spin" />}
      {connected ? 'Відключити' : busy ? 'Підключення…' : 'Підключити Polar'}
    </Button>
  );
}
