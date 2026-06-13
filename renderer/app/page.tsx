'use client';
import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { PolarClient } from '@/lib/ble/polarClient';
import { useHrPipeline } from '@/lib/hr/useHrPipeline';
import { ipc } from '@/lib/ipc/client';
import { useSession } from '@/lib/store/useSession';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from '@/components/VideoPlayer';
import { VolumeControl } from '@/components/VolumeControl';
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
  const setSettings = useSession((s) => s.setSettings);
  const client = useMemo(() => new PolarClient(), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const connected = bleStatus === 'streaming';
  const busy = bleStatus === 'requesting' || bleStatus === 'connecting';

  useHrPipeline(client);

  // Volume/mute are a renderer-only UI pref → localStorage, not the settings
  // file (slider drag fires many changes; atomic disk writes would be wasteful).
  // Restore after mount to avoid a static-export hydration mismatch.
  useEffect(() => {
    const v = localStorage.getItem('psy.volume');
    const m = localStorage.getItem('psy.muted');
    if (v !== null) setVolume(Math.min(1, Math.max(0, Number(v))));
    if (m !== null) setMuted(m === '1');
  }, []);

  useEffect(() => {
    localStorage.setItem('psy.volume', String(volume));
    localStorage.setItem('psy.muted', muted ? '1' : '0');
  }, [volume, muted]);

  // Ctrl+D toggles all overlay UI (operator shortcut; watermark stays).
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

  const videoSrc = currentZone?.videoPath ? ipc.resolveVideoUrl(currentZone.videoPath) : null;
  const fadeMs = currentZone?.fadeMs ?? settings?.crossfadeMs ?? 2000;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <VideoPlayer src={videoSrc} fadeMs={fadeMs} muted={muted} volume={volume} />
      {/* Watermark — always on, survives Ctrl+D (UI hide) and kiosk. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="./logo-white.svg"
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
            <VolumeControl
              muted={muted}
              volume={volume}
              onMutedChange={setMuted}
              onVolumeChange={setVolume}
            />
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
