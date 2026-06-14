import { app } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_NAME,
  makeDefaultTemplate,
  type AppSettings,
  type ZoneConfig,
  type ZoneTemplate,
} from '../../shared/contracts';

const DEFAULTS: AppSettings = {
  templates: [makeDefaultTemplate()],
  activeTemplateId: DEFAULT_TEMPLATE_ID,
  autoMode: true,
  dwellSeconds: 7,
  crossfadeMs: 2000,
  hrvWindowSec: 60,
  chartWindowSec: 300,
  kioskMode: false,
};

// Settings on disk from before zone templates existed have a flat `zones` array
// instead of `templates`. Read it so migration can seed it as the default
// template rather than dropping the user's saved zones.
type LegacySettings = Partial<AppSettings> & { zones?: ZoneConfig[] };

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
      const parsed = JSON.parse(raw) as LegacySettings;
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

  private merge(base: AppSettings, patch: LegacySettings): AppSettings {
    const { templates, activeTemplateId } = this.mergeTemplates(base, patch);
    return {
      templates,
      activeTemplateId,
      autoMode: typeof patch.autoMode === 'boolean' ? patch.autoMode : base.autoMode,
      dwellSeconds: typeof patch.dwellSeconds === 'number' ? patch.dwellSeconds : base.dwellSeconds,
      crossfadeMs: typeof patch.crossfadeMs === 'number' ? patch.crossfadeMs : base.crossfadeMs,
      hrvWindowSec: typeof patch.hrvWindowSec === 'number' ? patch.hrvWindowSec : base.hrvWindowSec,
      chartWindowSec: typeof patch.chartWindowSec === 'number' ? patch.chartWindowSec : base.chartWindowSec,
      kioskMode: typeof patch.kioskMode === 'boolean' ? patch.kioskMode : base.kioskMode,
    };
  }

  private mergeTemplates(
    base: AppSettings,
    patch: LegacySettings,
  ): Pick<AppSettings, 'templates' | 'activeTemplateId'> {
    // New shape on disk: keep valid templates, clamp activeTemplateId to one.
    const valid = Array.isArray(patch.templates)
      ? patch.templates.filter(
          (t): t is ZoneTemplate =>
            !!t && typeof t.id === 'string' && Array.isArray(t.zones) && t.zones.length > 0,
        )
      : [];
    if (valid.length > 0) {
      const activeTemplateId = valid.some((t) => t.id === patch.activeTemplateId)
        ? (patch.activeTemplateId as string)
        : (valid[0] as ZoneTemplate).id;
      return { templates: valid, activeTemplateId };
    }
    // Legacy flat `zones`: seed as the default template, never drop saved zones.
    if (Array.isArray(patch.zones) && patch.zones.length > 0) {
      return {
        templates: [{ id: DEFAULT_TEMPLATE_ID, name: DEFAULT_TEMPLATE_NAME, zones: patch.zones }],
        activeTemplateId: DEFAULT_TEMPLATE_ID,
      };
    }
    return { templates: base.templates, activeTemplateId: base.activeTemplateId };
  }
}
