'use client';
import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { ipc } from '@/lib/ipc/client';
import { cn } from '@/lib/utils';

// Custom window chrome for the frameless BrowserWindow (frame: false in
// electron/main.ts). The whole strip is a drag region; the three controls on
// the right opt out via -webkit-app-region: no-drag and talk to the main
// process over IPC.
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    ipc.isWindowMaximized().then((m) => active && setMaximized(m));
    const unsub = ipc.onWindowMaximizedChange(setMaximized);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-8 select-none items-center justify-between bg-linear-to-b from-black/70 to-transparent [-webkit-app-region:drag]"
    >
      <span className="flex items-center gap-2 pl-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="text-[11px] font-medium tracking-[0.25em] text-white/45">
          PSYCHOBALANCE
        </span>
      </span>

      <div className="flex h-full [-webkit-app-region:no-drag]">
        <WinButton label="Згорнути" onClick={() => ipc.minimizeWindow()}>
          <Minus className="h-3.5 w-3.5" />
        </WinButton>
        <WinButton
          label={maximized ? 'Відновити' : 'Розгорнути'}
          onClick={() => ipc.toggleMaximizeWindow()}
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </WinButton>
        <WinButton label="Закрити" danger onClick={() => ipc.closeWindow()}>
          <X className="h-4 w-4" />
        </WinButton>
      </div>
    </div>
  );
}

function WinButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-full w-11 items-center justify-center text-white/60 transition-colors hover:text-white',
        danger ? 'hover:bg-red-600' : 'hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}
