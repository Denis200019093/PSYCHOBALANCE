import { useEffect } from 'react';
import type { PolarClient } from '@/lib/ble/polarClient';
import { zoneEngine } from '@/lib/hr/zoneEngine';
import { hrvEngine } from '@/lib/hr/hrvEngine';
import { findZoneById } from '@/lib/hr/zones';
import { useSession } from '@/lib/store/useSession';
import { useHrHistory } from '@/lib/store/useHrHistory';

// No HR sample for this long ⇒ device is gone. Polar streams ~1 Hz, so this
// catches a strap drop in ~2 missed beats instead of waiting 3–5 s for the OS
// BLE link-supervision timeout to fire `gattserverdisconnected`.
const staleHrMs = 2000;

// Wires a PolarClient's RxJS streams into the Zustand stores: BLE status, the
// zone engine (HR → zone with dwell hysteresis), the HRV engine, and the
// rolling HR-history chart buffer. Lives here (not in page.tsx) so the page
// stays wiring and the data flow is one place. Re-subscribes whenever settings
// change, since zone bounds / windows are read at subscription time.
export function useHrPipeline(client: PolarClient): void {
  const settings = useSession((s) => s.settings);
  const setHr = useSession((s) => s.setHr);
  const setZone = useSession((s) => s.setZone);
  const setBleStatus = useSession((s) => s.setBleStatus);
  const setHrv = useSession((s) => s.setHrv);

  useEffect(() => {
    if (!settings) return;
    useHrHistory.getState().setWindow(settings.chartWindowSec);
    const statusSub = client.status$.subscribe((status) => {
      setBleStatus(status);
      // Device not streaming (physical strap drop, manual disconnect, error) →
      // return to initial state: drop HR/zone/HRV + chart so the video and
      // widgets disappear instead of freezing on the last reading.
      if (status !== 'streaming') {
        useSession.getState().resetSession();
        useHrHistory.getState().clear();
      }
    });
    const engine$ = zoneEngine(client.hr$, {
      zones: settings.zones,
      dwellMs: settings.dwellSeconds * 1000,
    });
    const engineSub = engine$.subscribe((state) => {
      setHr(state.hrRaw);
      // Manual mode: keep whatever zone the operator selected; ignore HR.
      const current = settings.autoMode
        ? findZoneById(state.currentZoneId, settings.zones)
        : useSession.getState().currentZone;
      const pending = findZoneById(state.pendingZoneId, settings.zones);
      setZone(current, pending);
    });
    const hrv$ = hrvEngine(client.hr$, { windowSec: settings.hrvWindowSec });
    const hrvSub = hrv$.subscribe(setHrv);
    // Watchdog: each beat re-arms a timer. If it fires (stream went silent
    // before the slow OS disconnect event), wipe to initial state now.
    let staleTimer: number | null = null;
    const armStale = () => {
      if (staleTimer !== null) window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => {
        staleTimer = null;
        useSession.getState().resetSession();
        useHrHistory.getState().clear();
        if (useSession.getState().bleStatus === 'streaming') setBleStatus('disconnected');
      }, staleHrMs);
    };
    const historySub = client.hr$.subscribe((sample) => {
      armStale();
      // Beats flowing ⇒ streaming. Recovers if the watchdog tripped early on a
      // brief gap while the BLE link was actually still up.
      if (useSession.getState().bleStatus !== 'streaming') setBleStatus('streaming');
      useHrHistory.getState().push(sample.bpm, sample.ts);
    });
    const errSub = client.error$.subscribe((err) => console.error('[BLE]', err));
    return () => {
      if (staleTimer !== null) window.clearTimeout(staleTimer);
      statusSub.unsubscribe();
      engineSub.unsubscribe();
      hrvSub.unsubscribe();
      historySub.unsubscribe();
      errSub.unsubscribe();
      setHrv(null);
    };
  }, [settings, client, setHr, setZone, setBleStatus, setHrv]);
}
