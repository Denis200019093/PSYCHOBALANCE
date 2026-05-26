import type { HrSample } from '@shared/contracts';

// Bluetooth SIG: Heart Rate Measurement characteristic 0x2A37
// Layout:
//   byte 0    : flags
//   byte 1..N : HR (uint8 if flag bit 0 == 0, uint16 LE if bit 0 == 1)
//   optional  : energy expended (uint16 LE, kJ) if bit 3 set
//   optional  : RR intervals (uint16 LE each, units of 1/1024 s) if bit 4 set
export function parseHeartRateMeasurement(value: DataView): HrSample {
  const flags = value.getUint8(0);
  console.log('[HR-flags] 0x' + flags.toString(16).padStart(2, '0'), 'bytes:', value.byteLength, 'rrBit:', (flags & 0x10) !== 0);
  const is16bit          = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected  = (flags & 0x02) !== 0;
  const energyPresent    = (flags & 0x08) !== 0;
  const rrPresent        = (flags & 0x10) !== 0;

  let offset = 1;
  const bpm = is16bit ? value.getUint16(offset, true) : value.getUint8(offset);
  offset += is16bit ? 2 : 1;

  let energyKj: number | undefined;
  if (energyPresent) {
    energyKj = value.getUint16(offset, true);
    offset += 2;
  }

  const rrIntervalsMs: number[] = [];
  if (rrPresent) {
    while (offset + 1 < value.byteLength) {
      const raw = value.getUint16(offset, true);
      rrIntervalsMs.push((raw / 1024) * 1000);
      offset += 2;
    }
  }

  const sample: HrSample = { bpm, ts: Date.now() };
  if (rrIntervalsMs.length > 0) sample.rrIntervalsMs = rrIntervalsMs;
  if (energyKj !== undefined) sample.energyKj = energyKj;
  if (contactSupported) sample.contactDetected = contactDetected;
  return sample;
}
