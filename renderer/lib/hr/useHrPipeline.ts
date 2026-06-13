import { useEffect } from 'react';
import type { PolarClient } from '@/lib/ble/polarClient';
import { zoneEngine } from '@/lib/hr/zoneEngine';
import { hrvEngine } from '@/lib/hr/hrvEngine';
import { findZoneById } from '@/lib/hr/zones';
import { useSession } from '@/lib/store/useSession';
import { useHrHistory } from '@/lib/store/useHrHistory';

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
    const statusSub = client.status$.subscribe(setBleStatus);
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
    const historySub = client.hr$.subscribe((sample) =>
      useHrHistory.getState().push(sample.bpm, sample.ts),
    );
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
}
