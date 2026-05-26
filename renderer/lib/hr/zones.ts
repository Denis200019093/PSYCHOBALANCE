import type { ZoneConfig } from '@shared/contracts';

export function findZone(bpm: number, zones: ZoneConfig[]): ZoneConfig | null {
  for (const z of zones) {
    if (bpm >= z.minHr && bpm < z.maxHr) return z;
  }
  return null;
}

export function findZoneById(id: string | null, zones: ZoneConfig[]): ZoneConfig | null {
  if (!id) return null;
  return zones.find((z) => z.id === id) ?? null;
}
