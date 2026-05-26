# PSYCHOBALANCE

Therapeutic desktop app for Windows 11. Streams heart rate from a Polar BLE chest strap in real time and seamlessly cross-fades between video scenarios mapped to nervous-system activation zones.

## Stack

- **Electron 33** — desktop shell
- **Next.js 15** — UI (App Router, static export `output: 'export'`)
- **Web Bluetooth API** — BLE GATT in renderer; main intercepts `select-bluetooth-device` to auto-pick the first Polar
- **RxJS** — HR stream with EMA smoothing and dwell-time hysteresis
- **Zustand** — UI state
- **electron-store** — persisted settings
- **electron-builder** — NSIS installer

## Prerequisites

- Windows 11 (≥ 22H2)
- Node.js 20 LTS or 22
- Bluetooth adapter, Polar H10 / Verity Sense / OH1

## Local development

```powershell
npm install
npm run dev
```

`npm run dev` concurrently runs:
1. Next.js dev server on `http://localhost:3000`
2. TypeScript watch compile of Electron sources → `dist-electron/`
3. Electron, after `localhost:3000` is reachable

## Production build + installer

```powershell
npm run package
# → release/PSYCHOBALANCE Setup 0.1.0.exe
```

## First-time setup

1. Launch the app → click **Налаштування →**.
2. For every zone press **Обрати…** and pick a local `mp4` / `webm` / `mov` file.
3. Adjust thresholds (`min HR` / `max HR`) and `dwellSeconds` (5–10 s recommended).
4. Return to the session screen → **Підключити Polar**.
5. The first Polar device advertising HR service is auto-selected; status moves to `streaming` within a few seconds.

## Project layout

```
electron/        Electron main + preload + IPC handlers + electron-store wrapper
renderer/        Next.js (App Router): pages, components, RxJS HR pipeline, Zustand
shared/          IPC + Settings type contracts (single source of truth)
resources/       Bundled assets (icon, optional video presets)
```

## Heart rate zones (defaults)

| Zone | HR range (bpm) | Default video intent |
|------|----------------|----------------------|
| Глибока релаксація | 0–65 | Lake, forest, soft light |
| Оптимальний баланс | 65–80 | Nature, gentle water motion |
| Помірна активація | 80–90 | Clouds, wind, shifting light |
| Гіперактивація | 90–100 | Rain, storm, dark palette |
| Дезрегуляція | 100+ | Black / pause / minimal stimulus |

All ranges and video bindings are editable in `Налаштування`.

## Design notes

- **BLE in renderer, not in main** — Web Bluetooth is native to Chromium; no native bindings to recompile per Electron upgrade. Main only suppresses the system chooser via `webContents.on('select-bluetooth-device')`.
- **Custom protocol `psy-video://`** — user-selected videos live anywhere on disk. Renderer asks main for them through a path-validated protocol handler instead of exposing `file://`.
- **Hysteresis (dwell-time)** — the zone engine only commits a new zone when the candidate persists for `dwellSeconds`. Flapping HR between two zones never triggers a switch.
- **EMA smoothing** — single-value running average (O(1) memory) avoids transient spikes from motion artifacts dominating the engine.
- **Two-layer cross-fade** — preload next zone's video into the hidden `<video>` element, swap opacity once `canplay` fires. Avoids black frames inherent to single-element `src` changes.

## Future extensions (already accommodated)

- **HRV** — `parseHeartRateMeasurement` already returns `rrIntervalsMs[]`. Add a downstream RxJS operator without touching BLE or UI plumbing.
- **Session history** — extend IPC with a `sessions:*` namespace and persist samples via `better-sqlite3`.
- **Voice instructions** — overlay `<audio>` triggered by zone changes (the same RxJS stream already exposed).
- **Live HR chart** — subscribe to `client.hr$` from a chart component (recharts / lightweight-charts).
