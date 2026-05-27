'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, RefreshCw, RotateCw, Sparkles } from 'lucide-react';
import { ipc } from '@/lib/ipc/client';
import { Button } from '@/components/ui/button';
import type { UpdateStatus } from '@shared/contracts';

export function UpdateIndicator() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    ipc.getAppVersion().then(setAppVersion).catch(() => setAppVersion(null));
    ipc.getUpdateStatus().then(setStatus).catch(() => undefined);
    const unsub = ipc.onUpdateStatus(setStatus);
    return unsub;
  }, []);

  const onCheck = async () => {
    setChecking(true);
    try {
      await ipc.checkForUpdate();
    } finally {
      setChecking(false);
    }
  };

  const onInstall = () => void ipc.installUpdate();

  const view = renderState(status);
  const disabled = status.state === 'disabled';

  return (
    <div
      className={`relative flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${view.tone}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0">{view.icon}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{view.title}</div>
          {view.subtitle && (
            <div className="truncate text-xs text-white/60">{view.subtitle}</div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status.state === 'downloaded' && (
          <Button size="sm" variant="success" onClick={onInstall}>
            <RotateCw />
            Перезапустити
          </Button>
        )}
        {!disabled && status.state !== 'downloading' && status.state !== 'downloaded' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onCheck()}
            disabled={checking || status.state === 'checking'}
          >
            <RefreshCw className={checking || status.state === 'checking' ? 'animate-spin' : ''} />
            Перевірити
          </Button>
        )}
      </div>
      {status.state === 'downloading' && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-lg">
          <div
            className="h-full bg-sky-400 transition-[width] duration-300"
            style={{ width: `${Math.max(2, status.percent ?? 0)}%` }}
          />
        </div>
      )}
      {appVersion && (
        <span className="absolute right-2 top-1 text-[10px] uppercase tracking-wider text-white/30">
          v{appVersion}
        </span>
      )}
    </div>
  );
}

interface StateView {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone: string;
}

function renderState(s: UpdateStatus): StateView {
  switch (s.state) {
    case 'checking':
      return {
        icon: <RefreshCw className="size-4 animate-spin text-white/70" />,
        title: 'Перевірка оновлень…',
        tone: 'border-white/10 bg-white/[0.03]',
      };
    case 'available':
      return {
        icon: <Sparkles className="size-4 text-sky-400" />,
        title: `Доступне оновлення${s.version ? ` v${s.version}` : ''}`,
        subtitle: 'Завантаження почнеться автоматично',
        tone: 'border-sky-500/30 bg-sky-500/10',
      };
    case 'downloading':
      return {
        icon: <Download className="size-4 animate-pulse text-sky-400" />,
        title: `Завантаження оновлення… ${s.percent ?? 0}%`,
        subtitle: s.bytesPerSecond
          ? `${(s.bytesPerSecond / 1024 / 1024).toFixed(2)} МБ/с${s.version ? ` · v${s.version}` : ''}`
          : s.version
            ? `v${s.version}`
            : undefined,
        tone: 'border-sky-500/30 bg-sky-500/10',
      };
    case 'downloaded':
      return {
        icon: <CheckCircle2 className="size-4 text-emerald-400" />,
        title: `Оновлення v${s.version ?? ''} готове`,
        subtitle: 'Встановиться при наступному запуску',
        tone: 'border-emerald-500/30 bg-emerald-500/10',
      };
    case 'not-available':
      return {
        icon: <CheckCircle2 className="size-4 text-emerald-400" />,
        title: 'Версія актуальна',
        subtitle: s.version ? `v${s.version}` : undefined,
        tone: 'border-white/10 bg-white/[0.03]',
      };
    case 'error':
      return {
        icon: <AlertTriangle className="size-4 text-amber-400" />,
        title: 'Помилка перевірки оновлень',
        subtitle: s.error,
        tone: 'border-amber-500/30 bg-amber-500/10',
      };
    case 'disabled':
      return {
        icon: <Sparkles className="size-4 text-white/40" />,
        title: 'Оновлення вимкнені (dev-режим)',
        tone: 'border-white/10 bg-white/[0.03]',
      };
    case 'idle':
    default:
      return {
        icon: <Sparkles className="size-4 text-white/60" />,
        title: 'Натисніть «Перевірити», щоб шукати оновлення',
        tone: 'border-white/10 bg-white/[0.03]',
      };
  }
}
