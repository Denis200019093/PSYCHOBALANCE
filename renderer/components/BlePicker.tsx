'use client';
import { useEffect, useState } from 'react';
import { ipc } from '@/lib/ipc/client';
import type { BleDeviceInfo } from '@shared/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function BlePicker() {
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return ipc.onBleDevices((list) => {
      setDevices(list);
      setOpen(true);
    });
  }, []);

  const close = () => {
    setOpen(false);
    setDevices([]);
  };

  const select = (id: string) => {
    ipc.selectBleDevice(id);
    close();
  };

  const cancel = () => {
    ipc.cancelBleSelect();
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
    >
      <DialogContent showClose={false} className="max-w-md border-white/10 bg-neutral-950 text-white">
        <DialogHeader>
          <DialogTitle>Виберіть пульсометр</DialogTitle>
          <DialogDescription className="text-white/60">
            Переконайтеся що датчик увімкнено та має контакт зі шкірою.
          </DialogDescription>
        </DialogHeader>

        {devices.length === 0 ? (
          <div className="py-6 text-center text-sm text-white/70">Сканування…</div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-2">
            <ul className="flex flex-col gap-2">
              {devices.map((d) => (
                <li key={d.deviceId}>
                  <button
                    onClick={() => select(d.deviceId)}
                    className="flex w-full flex-col gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
                  >
                    <span className="text-sm font-semibold">{d.deviceName}</span>
                    <span className="font-mono text-[11px] text-white/50">{d.deviceId}</span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Скасувати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
