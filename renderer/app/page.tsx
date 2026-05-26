'use client';
import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
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

export default function SessionPage() {
  const settings = useSession((s) => s.settings);
  const currentZone = useSession((s) => s.currentZone);
  const setHr = useSession((s) => s.setHr);
  const setZone = useSession((s) => s.setZone);
  const setBleStatus = useSession((s) => s.setBleStatus);
  const setSettings = useSession((s) => s.setSettings);
  const setHrv = useSession((s) => s.setHrv);
  const client = useMemo(() => new PolarClient(), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);

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
      smoothingAlpha: 1 / Math.max(1, settings.smoothingWindowSec),
    });
    const engineSub = engine$.subscribe((state) => {
      setHr(state.hrRaw, state.hrSmoothed);
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
      <VideoPlayer src={videoSrc} fadeMs={fadeMs} />
      {uiVisible && (
        <>
          <div className="absolute left-4 top-4 z-10 flex flex-col">
            <HrDisplay />
            <HrvDisplay />
            <ZoneIndicator />
            <ConnectButton
              onConnect={() => void client.connect()}
              onDisconnect={() => void client.disconnect()}
            />
          </div>
          <HrChart />
          <BlePicker />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="absolute right-4 top-4 z-10 bg-black/55 text-white hover:bg-black/70"
          >
            <Settings />
            Налаштування
          </Button>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
      )}
    </main>
  );
}
