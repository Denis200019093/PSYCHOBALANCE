'use client';
import { useEffect, useMemo, useState } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { PolarClient } from '@/lib/ble/polarClient';
import { zoneEngine } from '@/lib/hr/zoneEngine';
import { hrvEngine } from '@/lib/hr/hrvEngine';
import { findZoneById } from '@/lib/hr/zones';
import { ipc } from '@/lib/ipc/client';
import { useSession } from '@/lib/store/useSession';
import { useHrHistory } from '@/lib/store/useHrHistory';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from '@/components/VideoPlayer';
import { HrDisplay } from '@/components/HrDisplay';
import { HrvDisplay } from '@/components/HrvDisplay';
import { ZoneIndicator } from '@/components/ZoneIndicator';
import { ConnectButton } from '@/components/ConnectButton';
import { BlePicker } from '@/components/BlePicker';
import { SettingsModal } from '@/components/SettingsModal';
import { HrChart } from '@/components/HrChart';
import { TitleBar } from '@/components/TitleBar';

export default function SessionPage() {
  const settings = useSession((s) => s.settings);
  const currentZone = useSession((s) => s.currentZone);
  const bleStatus = useSession((s) => s.bleStatus);
  const setHr = useSession((s) => s.setHr);
  const setZone = useSession((s) => s.setZone);
  const setBleStatus = useSession((s) => s.setBleStatus);
  const setSettings = useSession((s) => s.setSettings);
  const setHrv = useSession((s) => s.setHrv);
  const client = useMemo(() => new PolarClient(), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const connected = bleStatus === 'streaming';
  const busy = bleStatus === 'requesting' || bleStatus === 'connecting';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyD') {
        e.preventDefault();
        setUiVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let active = true;
    ipc.getSettings().then((s) => active && setSettings(s));
    const unsub = ipc.onSettingsChange(setSettings);
    return () => {
      active = false;
      unsub();
    };
  }, [setSettings]);

  useEffect(() => {
    if (!settings) return;
    useHrHistory.getState().setWindow(settings.chartWindowSec);
    const statusSub = client.status$.subscribe(setBleStatus);
    const engine$ = zoneEngine(client.hr$, {
      zones: settings.zones,
      dwellMs: settings.dwellSeconds * 1000,
    });
    const engineSub = engine$.subscribe((state) => {
      setHr(state.hrRaw);
      const current = settings.autoMode
        ? findZoneById(state.currentZoneId, settings.zones)
        : useSession.getState().currentZone;
      const pending = findZoneById(state.pendingZoneId, settings.zones);
      setZone(current, pending);
    });
    const hrv$ = hrvEngine(client.hr$, { windowSec: settings.hrvWindowSec });
    const hrvSub = hrv$.subscribe(setHrv);
    const historySub = client.hr$.subscribe((sample) => {
      console.log('[HR]', sample.bpm, 'rr:', sample.rrIntervalsMs);
      useHrHistory.getState().push(sample.bpm, sample.ts);
    });

    const errSub = client.error$.subscribe((err) => console.error('[BLE]', err));
    return () => {
      statusSub.unsubscribe();
      engineSub.unsubscribe();
      hrvSub.unsubscribe();
      historySub.unsubscribe();
      errSub.unsubscribe();
      setHrv(null);
    };
  }, [settings, client, setHr, setZone, setBleStatus, setHrv]);

  const videoSrc = currentZone?.videoPath ? ipc.resolveVideoUrl(currentZone.videoPath) : null;
  const fadeMs = currentZone?.fadeMs ?? settings?.crossfadeMs ?? 2000;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <VideoPlayer src={videoSrc} fadeMs={fadeMs} muted={muted} volume={volume} />
      {/* Watermark — always on, survives Ctrl+D (UI hide) and kiosk. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-white.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className={`pointer-events-none absolute z-0 w-40 select-none opacity-70 transition-all duration-300 ${
          uiVisible ? 'right-5 top-10' : 'right-4 top-4'
        }`}
      />
      {uiVisible && (
        <>
          {!settings?.kioskMode && <TitleBar />}
          {connected && (
            <>
              <div className="absolute left-4 top-10 z-10 flex flex-col">
                <HrDisplay />
                {/* <HrvDisplay /> */}
                <ZoneIndicator />
                <ConnectButton
                  onConnect={() => void client.connect()}
                  onDisconnect={() => void client.disconnect()}
                />
              </div>
              <HrChart />
            </>
          )}
          {!connected && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <Button
                type="button"
                size="lg"
                variant="success"
                disabled={busy}
                onClick={() => void client.connect()}
                className="min-w-64 h-12"
              >
                {busy ? 'Підключення…' : 'Підключити Polar'}
              </Button>
            </div>
          )}
          <BlePicker />
          {connected && (
            <div className="absolute right-44 top-10 z-10 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 text-white">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
                className="h-8 w-8 p-0 text-white hover:bg-white/10"
              >
                {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (v > 0 && muted) setMuted(false);
                  if (v === 0) setMuted(true);
                }}
                aria-label="Гучність"
                className="h-1 w-28 cursor-pointer accent-white"
              />
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="absolute right-4 top-24 z-20 bg-black/55 text-white cursor-pointer hover:scale-105 hover:bg-black/70"
          >
            <Settings />
          </Button>

          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
      )}
    </main>
  );
}
