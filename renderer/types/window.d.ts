import type { PsyApi } from '../../electron/preload';

declare global {
  interface Window {
    psy: PsyApi;
  }
}

export {};
