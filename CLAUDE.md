# CLAUDE.md

Guidance for working in this repo. Read before writing code.

## What this is

**Psychobalance** — Electron desktop app (Windows). Plays adaptive video driven by
real-time heart rate from a Polar BLE chest strap. HR → zone → video crossfade.
UI in Ukrainian.

Stack: Electron 33 · Next.js 15 (static export) · React 19 · TypeScript (strict) ·
Zustand · RxJS · Tailwind v4 · shadcn/ui.

## Domain model — HR zones (the core contract)

The product is biofeedback: **HR → zone → video**. A *zone* is an HR band with a bound
video and crossfade time (`ZoneConfig` in `shared/contracts.ts`). The active zone selects
the playing clip; crossing a band switches the clip after a dwell delay (hysteresis) so a
brief HR spike doesn't flap the video.

Zones are **data, not code** — fully admin-editable (count, label, color, HR bounds, video,
fade). Treat the zone list as dynamic everywhere:

- Never hardcode a zone count or assume specific ids beyond the `DEFAULT_ZONES` seed.
- Resolve the active zone by scanning the configured list (`findZone`), not by branching.
- New zone-derived logic goes in an **engine** keyed off the zone list, never a fixed set.

### Thresholds vs the spec (intentional deviations)

The client's ТЗ describes **5** zones (relax / balance / mild activation / hyper /
dysregulation). The shipped default is **3** (Низька <70 / Середня 70–90 / Висока ≥90) —
the client asked to start with 3. **This is deliberate; don't "restore" the 5-zone scheme.**
More generally: where the code diverges from the written ТЗ, assume it's a client decision —
ask before changing code to match the spec. The 5-zone scheme still informs the *direction*:
any admin can rebuild it by adding zones, so the system must stay count-agnostic.

## Architecture: three processes, one contract

```
electron/   main process  — Node. Windows, IPC, settings file, auto-update, BLE picker bridge.
renderer/   renderer      — Browser. Next.js UI, Web Bluetooth, all HR/zone logic.
shared/     contracts.ts  — Types + IPC channel names. Imported by BOTH sides. Zero runtime deps.
```

Rule: **`shared/contracts.ts` is the single source of truth** for cross-process types
and IPC channel constants. Never duplicate a type or magic IPC string — import from there.
(Exception: `preload.ts` re-lists channel names as a `type` union, on purpose — see its header
comment. Sandbox forbids importing project files there.)

## Data flow (renderer) — one direction

```
PolarClient (BLE)  →  RxJS engines  →  Zustand stores  →  React components
   hr$ / status$       zoneEngine        useSession         read via selectors
                       hrvEngine         useHrHistory
```

- **`PolarClient`** (`lib/ble/`) owns the device. Exposes `hr$`, `status$`, `error$` (RxJS Subjects).
  Knows nothing about zones or UI.
- **Engines** (`lib/hr/`) are pure `Observable<In> → Observable<Out>` transforms. No React, no store,
  no side effects. `zoneEngine` = HR → zone with dwell hysteresis. `hrvEngine` = RR → HRV metrics.
- **Stores** (`lib/store/`) hold UI state only. Engine output is pushed in from the page wiring.
- **Components** read state via Zustand selectors. Wiring lives in `app/page.tsx` effects.

When adding HR-derived logic, write it as an **engine** (testable, pure), not inside a component.

## Folder map — where things go

```
electron/
  main.ts                 window lifecycle, kiosk, custom video protocol, auto-update wiring
  preload.ts              contextBridge → window.psy. Typed, sandbox-safe.
  ipc/handlers.ts         ipcMain.handle(...) for invoke channels
  services/               main-process services (settings persistence, ...)
renderer/
  app/                    Next pages. page.tsx = the one screen + stream wiring.
  components/             feature components (PascalCase.tsx)
  components/ui/          shadcn primitives — generated, don't hand-edit
  lib/ble/                Web Bluetooth client + frame parsers
  lib/hr/                 pure RxJS engines + zone math
  lib/ipc/client.ts       typed wrapper over window.psy (renderer's only IPC entry)
  lib/store/              Zustand stores (use*.ts)
  lib/utils.ts            cn() + tiny generic helpers only
  types/                  ambient .d.ts
shared/contracts.ts       cross-process types + IPC constants
```

Decision guide:
- Pure HR/RR/zone math → `lib/hr/`
- Talks to the BLE device → `lib/ble/`
- Talks to main process → `lib/ipc/client.ts` (renderer) + `ipc/handlers.ts` or `preload.ts` (main)
- Shared UI state → `lib/store/`
- A piece of screen → `components/`
- A type used by both processes → `shared/contracts.ts`

## Conventions

- **Imports**: renderer uses `@/*` (renderer root) and `@shared/*`. Electron uses relative
  `../shared/...`. Match the file you're in.
- **Naming**: components `PascalCase.tsx`, stores `useThing.ts`, RxJS streams suffixed `$`,
  ms constants suffixed `Ms`. Channel constants in `IPC.*` are `domain:action`.
- **TS is strict** incl. `noUncheckedIndexedAccess` — array access is `T | undefined`. Guard it;
  don't `!` your way past it unless truly safe.
- **State**: Zustand for shared UI state, `useState` for local component state. No new store
  unless state is read by ≥2 components.
- **Adding an IPC call** = 4 edits, in order: `shared/contracts.ts` (channel const) →
  `electron/ipc/handlers.ts` (handler) → `electron/preload.ts` (bridge method + channel in union) →
  `renderer/lib/ipc/client.ts` (typed wrapper). Components call the client wrapper, never `ipcRenderer`.
- **Comments**: explain *why*, not *what*. Match the existing terse, reason-giving style
  (see `main.ts` kiosk/protocol comments). Don't narrate obvious code.

## Style rules (keep it simple)

- Prefer functions + plain data over classes. `PolarClient` is a class because it owns
  device lifecycle/listeners — that's the bar. Engines and helpers stay pure functions.
- No new dependency without a clear reason; the dep list is intentionally small.
- No premature abstraction. Two call sites = inline; three = extract.
- Components render and wire. Push real logic down into `lib/`.
- Keep `page.tsx` as wiring, not logic. A growing effect/JSX block is a signal to extract a
  hook (`lib/hr/` or a `useX`) or a component.
- Delete dead code instead of commenting it out (git remembers).

## Roadmap & planned work

Write new code so these slot in without reshaping the architecture.

### Zone templates (next task)

Today there is one flat zone list (`AppSettings.zones`). The client wants **named
templates** — several saved zone-sets (e.g. "3 зони (дефолт)", a custom 5-zone ТЗ set)
with one active at a time. Intended shape when implemented:

```ts
interface ZoneTemplate { id: string; name: string; zones: ZoneConfig[]; }
// AppSettings: { templates: ZoneTemplate[]; activeTemplateId: string; ... }
```

Key constraint: **the HR→zone→video pipeline stays template-agnostic.** A template is a
settings/admin concern — switching it just swaps which `ZoneConfig[]` is fed to
`zoneEngine` and the `page.tsx` wiring. `zoneEngine`, `findZone`, the stores, and
`VideoPlayer` never learn the word "template". Blast radius, in order:
`contracts.ts` (types) → `settingsStore` (shape **+ migration**: load the existing flat
`zones` as a seeded default template, never drop a user's saved zones) →
`ipc/handlers.ts` + `preload.ts` + `ipc/client.ts` only if a dedicated channel beats
reusing `settings:update` → `SettingsModal` (template picker + per-template zone editor).

### Further out (from the ТЗ — leave room, don't pre-build)

- **HRV** — `hrvEngine` already emits metrics; `HrvDisplay` exists but is wired off in
  `page.tsx`. Re-enable when asked; the contract is already there.
- **Live HR chart** — `HrChart` + `useHrHistory` exist (rolling window).
- **Session history** — persisting past sessions isn't built. Would be a main-process
  service + a store, mirroring `settingsStore` (atomic writes, in-memory cache).
- **Therapist voice-over** — an audio layer above the video; not built.

## Build & run

```
npm run dev        # Next + electron + tsc watch, all together
npm run typecheck  # both tsconfigs, no emit — run before declaring done
npm run build      # build:next (static export) + build:electron
npm run package    # build + electron-builder (NSIS, Windows)
```

No test runner is configured. "Done" = `npm run typecheck` clean + the affected screen
behaves correctly when run.

## Gotchas (learned the hard way — see code comments)

- **Don't** enable `WebBluetoothNewPermissionsBackend` / experimental BLE flags — crashes Win11
  (`main.ts`). BLE picker is bridged through main via `select-bluetooth-device`.
- Videos play through the custom **`psy-video://`** protocol, path-validated against settings.
  Remote `http(s)` paths bypass it (`ipc/client.ts resolveVideoUrl`).
- Settings writes are atomic (temp + rename) and the in-memory cache is the source of truth
  while running (`settingsStore.ts`).
- `preload.ts` runs sandboxed — only `electron/events/timers/url` requireable. Keep it dependency-free.
- Kiosk mode locks the window and blocks exit shortcuts; escape hatch is Esc×3 or Ctrl+Shift+Q.
