import { BehaviorSubject, Subject } from 'rxjs';
import { parseHeartRateMeasurement } from './hrParser';
import type { BleStatus, HrSample } from '@shared/contracts';

const HR_SERVICE = 'heart_rate' as BluetoothServiceUUID;                  // 0x180D
const HR_MEASUREMENT_CHAR = 'heart_rate_measurement' as BluetoothCharacteristicUUID; // 0x2A37
// Web Bluetooth's gatt.connect() has no built-in timeout — on a device that's
// gone (strap removed / out of range) it can hang forever, leaving the UI stuck
// on "Підключення…". Bound it so a dead attempt fails fast and the operator can
// retry.
const CONNECT_TIMEOUT_MS = 10000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Час очікування підключення вичерпано.')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export class PolarClient {
  readonly status$ = new BehaviorSubject<BleStatus>('idle');
  readonly hr$ = new Subject<HrSample>();
  readonly error$ = new Subject<Error>();

  // Last beat seen, kept so a re-subscriber (pipeline rebuild on template /
  // settings change) can be seeded immediately instead of waiting up to ~1s for
  // the next ~1 Hz Polar notification. Null while not streaming.
  private _lastSample: HrSample | null = null;
  get lastSample(): HrSample | null {
    return this._lastSample;
  }

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  // Bumped on every connect/disconnect/drop. An in-flight openGatt only commits
  // its result if its epoch is still current — guards against a slow/hung prior
  // attempt overwriting the status of a newer one.
  private epoch = 0;

  async connect(): Promise<void> {
    if (!('bluetooth' in navigator)) {
      const err = new Error('Web Bluetooth API недоступний у цьому середовищі.');
      this.error$.next(err);
      this.status$.next('error');
      return;
    }
    try {
      // Drop any previous device handle first. After an involuntary disconnect
      // Chromium can hand back the SAME (now dead) BluetoothDevice from
      // requestDevice; reusing its stale GATT silently fails to connect.
      this.releaseDevice();
      this.status$.next('requesting');
      this.device = await navigator.bluetooth.requestDevice({
        // Show every device advertising the standard Heart Rate Service so the
        // user can pick (Polar, Garmin, Wahoo, etc.). Picker UI is rendered
        // in-app from devices forwarded by main over IPC.
        filters: [{ services: [HR_SERVICE] }],
        optionalServices: [HR_SERVICE],
      });
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      await this.openGatt();
    } catch (err) {
      this.error$.next(err as Error);
      this.status$.next('error');
    }
  }

  private openGatt = async (): Promise<void> => {
    const device = this.device;
    if (!device?.gatt) return;
    const gen = ++this.epoch;
    this.status$.next('connecting');
    try {
      const char = await withTimeout(
        (async () => {
          const server = await device.gatt!.connect();
          const service = await server.getPrimaryService(HR_SERVICE);
          return service.getCharacteristic(HR_MEASUREMENT_CHAR);
        })(),
        CONNECT_TIMEOUT_MS,
      );
      if (gen !== this.epoch) return; // superseded by a newer attempt or a drop
      char.addEventListener('characteristicvaluechanged', this.onNotify);
      await char.startNotifications();
      this.characteristic = char;
      this.status$.next('streaming');
    } catch (err) {
      if (gen !== this.epoch) return;
      try { device.gatt!.disconnect(); } catch { /* may already be gone */ }
      this.error$.next(err as Error);
      this.status$.next('error');
    }
  };

  private onNotify = (event: Event): void => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value) return;
    const sample = parseHeartRateMeasurement(char.value);
    this._lastSample = sample;
    this.hr$.next(sample);
  };

  // Involuntary drop (strap removed / out of range). No silent auto-reconnect:
  // the app returns to its initial state and the operator reconnects manually.
  // (A self-triggered reconnect on a dead device hung the "Підключення…"
  // overlay — gatt.connect never resolves out of range.)
  private onDisconnected = (): void => {
    // Fully release the dead handle so the next connect starts from a clean
    // device — otherwise Chromium's cached object keeps its stale GATT state and
    // the reconnect won't establish.
    this.releaseDevice();
    this.status$.next('disconnected');
  };

  async disconnect(): Promise<void> {
    try {
      await this.characteristic?.stopNotifications();
    } catch {
      /* characteristic may already be gone */
    }
    this.releaseDevice();
    this.status$.next('idle');
  }

  // Detach listeners, drop the GATT link, and forget the device. Bumps epoch so
  // any in-flight openGatt is invalidated and can't commit a stale status.
  private releaseDevice(): void {
    this.epoch++;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onNotify);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    try {
      this.device?.gatt?.disconnect();
    } catch {
      /* may already be gone */
    }
    this.characteristic = null;
    this.device = null;
    this._lastSample = null; // don't seed a rebuilt pipeline with a stale beat
  }
}
