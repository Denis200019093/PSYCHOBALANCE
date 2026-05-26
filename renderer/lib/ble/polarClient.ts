import { BehaviorSubject, Subject } from 'rxjs';
import { parseHeartRateMeasurement } from './hrParser';
import type { BleStatus, HrSample } from '@shared/contracts';

const HR_SERVICE = 'heart_rate' as BluetoothServiceUUID;                  // 0x180D
const HR_MEASUREMENT_CHAR = 'heart_rate_measurement' as BluetoothCharacteristicUUID; // 0x2A37
const RECONNECT_DELAY_MS = 2000;

export class PolarClient {
  readonly status$ = new BehaviorSubject<BleStatus>('idle');
  readonly hr$ = new Subject<HrSample>();
  readonly error$ = new Subject<Error>();

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private reconnectTimer: number | null = null;
  private manualDisconnect = false;

  async connect(): Promise<void> {
    if (!('bluetooth' in navigator)) {
      const err = new Error('Web Bluetooth API недоступний у цьому середовищі.');
      this.error$.next(err);
      this.status$.next('error');
      return;
    }
    try {
      this.manualDisconnect = false;
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
    if (!this.device?.gatt) return;
    this.status$.next('connecting');
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(HR_SERVICE);
    this.characteristic = await service.getCharacteristic(HR_MEASUREMENT_CHAR);
    this.characteristic.addEventListener('characteristicvaluechanged', this.onNotify);
    await this.characteristic.startNotifications();
    this.status$.next('streaming');
  };

  private onNotify = (event: Event): void => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value) return;
    this.hr$.next(parseHeartRateMeasurement(char.value));
  };

  private onDisconnected = (): void => {
    this.status$.next('disconnected');
    if (this.manualDisconnect || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.openGatt();
      } catch (err) {
        this.error$.next(err as Error);
        this.status$.next('error');
      }
    }, RECONNECT_DELAY_MS);
  };

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.characteristic?.stopNotifications();
    } catch {
      /* characteristic may already be gone */
    }
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onNotify);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.device?.gatt?.disconnect();
    this.characteristic = null;
    this.device = null;
    this.status$.next('idle');
  }
}
