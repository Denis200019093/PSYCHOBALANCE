import { app } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ZONES, type AppSettings } from '../../shared/contracts';

const DEFAULTS: AppSettings = {
  zones: DEFAULT_ZONES,
  autoMode: true,
  dwellSeconds: 7,
  crossfadeMs: 2000,
  hrvWindowSec: 60,
  chartWindowSec: 300,
  kioskMode: false,
};

// Persists settings as JSON in the OS-standard userData directory. Writes are
// atomic (write-to-temp + rename) so a mid-write crash never corrupts the file.
export class SettingsStore extends EventEmitter {
  private readonly filePath: string;
  private cache: AppSettings;

  constructor() {
    super();
    this.filePath = path.join(app.getPath('userData'), 'psychobalance.json');
    this.cache = this.load();
  }

  get(): AppSettings {
    return this.cache;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.cache = { ...this.cache, ...patch };
    this.persist(this.cache);
    this.emit('change', this.cache);
    return this.cache;
  }

  private load(): AppSettings {
    try {
      if (!fs.existsSync(this.filePath)) return DEFAULTS;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return this.merge(DEFAULTS, parsed);
    } catch (err) {
      console.error('[SettingsStore] load failed, using defaults:', err);
      return DEFAULTS;
    }
  }

  private persist(data: AppSettings): void {
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[SettingsStore] persist failed:', err);
    }
  }

  private merge(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
    return {
      zones: Array.isArray(patch.zones) && patch.zones.length > 0 ? patch.zones : base.zones,
      autoMode: typeof patch.autoMode === 'boolean' ? patch.autoMode : base.autoMode,
      dwellSeconds: typeof patch.dwellSeconds === 'number' ? patch.dwellSeconds : base.dwellSeconds,
      crossfadeMs: typeof patch.crossfadeMs === 'number' ? patch.crossfadeMs : base.crossfadeMs,
      hrvWindowSec: typeof patch.hrvWindowSec === 'number' ? patch.hrvWindowSec : base.hrvWindowSec,
      chartWindowSec: typeof patch.chartWindowSec === 'number' ? patch.chartWindowSec : base.chartWindowSec,
      kioskMode: typeof patch.kioskMode === 'boolean' ? patch.kioskMode : base.kioskMode,
    };
  }
}
