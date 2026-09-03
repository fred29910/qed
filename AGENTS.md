# PROJECT KNOWLEDGE BASE — qed

**Generated:** 2026-09-03  Branch: feat/ui/v1  Commit: 1818999

## OVERVIEW
Cross-platform desktop skeleton (Perry TypeScript AOT → native `.exe`/`.app`/`.AppImage`). No Electron/Tauri/Qt. Same `src/` produces Windows/macOS/Linux binaries via `perry compile`. ~5k lines of TS, max depth 5, ~80 source files.

**Core stack:** Perry CLI (`@perryts/perry` ^0.5.1220), TypeScript 5.4 (ESM `"type":"module"`, `bundler` resolution), ESLint + Prettier, custom build/package scripts (`scripts/build-*.sh`, `package:mac/linux/windows`). CI: `.github/workflows/build.yml` (ubuntu/mac/windows matrix, `npx @perryts/perry setup --host`, artifacts for `.exe`/`.app`/`.AppImage`/`.deb`/`.msi`).

**Logging:** `src/diag.ts` — leveled logger (`silent|error|warn|info|debug|trace`), in-memory ring buffer (500), file rotation (1 MB / 7 days / 20 files), unbuffered stderr. **Documented `fs` exception** (the only `fs` consumer outside `src/services/`). In-app viewer (`src/modules/diagnostics/`) reads the ring buffer only — no disk I/O. Review: `docs/reviews/2026-09-03-logger-plan-review.md`. Plan: `docs/plans/logger_v1.md`.

**What this is not:** a web app, a node CLI, or a library. It's a frameless window with sidebar (File Manager / Settings / About), secondary settings window (always-on-top), secondary diagnostics window (NOT always-on-top), tray + menu bar + notifications, JSON config (schema v2) with debounced flush, theme switch (light/dark/system), and optional autostart (LaunchAgent / Startup `.cmd` / XDG `.desktop`). Design doc: `docs/plan_ui_v1.md`.

## STRUCTURE
```
qed/
├── src/main.ts                     # entry (perry.toml entry) — wires services, IPC, store, then startApp()
├── src/diag.ts                     # leveled logger (LogLevel, logger singleton, diag/diagErr shims)
├── src/app/                        # controller + types + palette (NO index — flat, 3 files)
│   ├── app-controller.ts           # startApp, handleCommand, navigateTo, openSettingsWindow, openDiagnosticsWindow
│   ├── app-controller-types.ts     # ControllerContext, AppEvent, AppEventListener, KnownAppCommand (alias)
│   └── theme.ts                    # LIGHT/DARK palettes, paletteFor() — split from ui/theme.ts for testability
├── src/modules/                    # feature modules (each with index.ts boundary)
│   ├── file-manager/ (3)           # view + operations + index — sidebar route
│   ├── settings/     (3)           # view + changes + index — sidebar route, Advanced/logging section
│   ├── about/        (2)           # view + index — sidebar route
│   └── diagnostics/  (4)           # NEW (1818999) — view + window + index + AGENTS.md; NOT a sidebar route
├── src/services/                   # barrel (5 exports: config/file/notification/shell/recent-files) — only `fs` seam (besides diag.ts)
├── src/types/                      # barrel: config.ts (AppConfig v2) + ipc.ts (IpcChannel union + payload types)
├── src/ipc/                        # bus.ts (IpcBus interface) + handlers.ts (17 channels, trace() wrapper)
├── src/platform/                   # OS abstraction (tray/menu/autostart/paths/fs-permissions, 6 + barrel)
├── src/ui/                         # flat widget layer (7 files, NO index)
├── src/state/                      # app-state.ts (AppStore, resolveTheme — single source of truth)
├── platforms/shared/icon.png
├── scripts/                        # build-*.sh / package-*.sh / build-all.sh / msi-pack.ps1
├── docs/plan_ui_v1.md              # UI design spec
├── docs/plans/logger_v1.md         # logger implementation plan
├── docs/reviews/2026-09-03-logger-plan-review.md  # logger review
├── docs/架构.md                    # architecture overview (zh)
├── .agents/skills/perry-dev/       # AOT skill refs (29 docs — cli-config, cli-flags, etc.) — READ ONLY
└── perry.toml / package.json / tsconfig.json / .eslintrc.json / .prettierrc.json
```

**Non-obvious:** `src/app/` has NO `index.ts` (controller is imported directly by `main.ts`); `src/ui/` has NO index (widgets imported selectively); module boundaries are `index.ts` inside each `src/modules/*/`; `.agents/skills/perry-dev` is a self-contained reference module — don't edit for the app, only read for AOT constraints. `src/diag.ts` lives at `src/` root (not in `src/services/`) because it's cross-cutting infra, not a business service.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| App startup / routing | `src/main.ts` → `src/app/app-controller.ts` | `startApp()` is the only entry after boot. `ControllerContext` (8 callers) is the service bag — never build one manually; always pass through `main.ts`. |
| Logging / diagnostics | `src/diag.ts` + `src/modules/diagnostics/` | Logger singleton (`logger`); in-app viewer reads `logger.snapshot()` (ring buffer, 500 cap, no disk I/O). Settings → Advanced → "Open log viewer" or View menu → "Open Log Viewer". |
| Feature module code | `src/modules/<name>/` + `index.ts` | Each module exports its view + ops. `file-manager/` uses `IpcBus` to talk to `src/ipc/bus.ts`. |
| Service seam (file/config/notifications/shell/recent) | `src/services/index.ts` → individual files | Barrel — import from `../services/` not individual file unless avoiding barrel cycle. `ConfigService` persists JSON to `appDataDir`. |
| Platform / OS specifics | `src/platform/` | `tray-adapter.ts` (tray), `menu-bar.ts` (AppCommand union), `autostart.ts` (LaunchAgent / Windows Startup / XDG). `fs-permissions.ts` gates FS access — **never import `fs` directly** (see anti-patterns). |
| UI / theme / widgets | `src/ui/` | Flat layer — no index. `theme.ts` defines `paintMuted`/`paintText`; `settings-window.ts` is always-on-top secondary window. `sidebar.ts` handles route navigation (`file-manager`/`settings`/`about`). |
| IPC / message bus | `src/ipc/bus.ts` + `handlers.ts` | `IpcBus` interface; payloads defined in `src/types/`. Bus never throws (contract in `plan_ui_v1.md:515`) — errors must be handled by the caller. `handlers.ts` wraps every registration in `trace()`. |
| App state / theme / store | `src/state/app-state.ts` | `AppStore`, `resolveTheme`. Store is passed through `ControllerContext`; don't create independent stores. |
| Cross-platform build / package | `scripts/build-*.sh`, `perry.toml` | `perry compile src/main.ts -o bin/qed` (mac/linux); `build-windows.sh` + `msi-pack.ps1`. Mac: `bundle_id=com.example.qed.macos`, `category=developer-tools`, `distribute=notarize`, `minimum_os=13.0`. Linux: `format=appimage`, `category=Development`. Windows: LLVM toolchain (`winget install LLVM.LLVM` + `perry setup windows --accept-license`), `.msi` produced by post-build script (Perry doesn't emit `.msi` directly). `march=x86-64-v2`, `opt_level=2`. |
| CI verification | `.github/workflows/build.yml` | Matrix ubuntu/mac/windows; runs `format:check` as the only "test" step — **no unit tests exist** (see notes). |

## CODE MAP (from codegraph / LSP)

| Symbol | Type | File | Ref centrality | Role |
|---|---|---|---|---|
| `startApp` | function | `src/app/app-controller.ts:108` | 2 callers (`main.ts`) | Boot entry — creates `mainWindow`, installs tray/menu, starts event loop. |
| `ControllerContext` | interface | `src/app/app-controller-types.ts:41` | 8 callers (controller, main, modules) | Service bag passed everywhere; never construct manually. |
| `AppEvent` / `AppEventListener` | union / type | `src/app/app-controller-types.ts:25` | Used by controller + UI observers | Internal events (route-changed, theme-changed, settings-window-opened/closed, background-mode-changed, always-on-top-changed). |
| `AppStore` | class | `src/state/app-state.ts:70` | 19 callers | Single source of mutable observable state (config, recentFiles, lastError, isBusy, route, resolved theme). Pub-sub. |
| `openDiagnosticsWindow` / `closeDiagnosticsWindow` | functions | `src/app/app-controller.ts:275-289` | 2 callers (controller) | Lifecycle of the log-viewer window. Triggered by `AppCommand 'view.openDiagnostics'` or `view:open-diagnostics` IPC. |
| `view.openDiagnostics` | AppCommand | `src/platform/menu-bar.ts:51` | Wired in macOS + desktop menus (lines 127, 170) | Single command that opens the diagnostics window. Add new commands here + handle in `app-controller.ts` (TypeScript exhaustiveness check). |
| `Logger` / `logger` | interface / singleton | `src/diag.ts` (454 lines) | Imported by `main.ts`, `app-controller.ts`, `handlers.ts`, `app-state.ts`, `settings-view.ts`, `about-view.ts`, `diagnostics-view.ts` | Leveled logger. `setLevel()`, `flush()`, `snapshot()` (ring buffer 500), `currentFilePath()`. The only `fs` consumer outside `services/`. |
| `FileManagerView` | function | `src/modules/file-manager/file-manager-view.ts` | Feature entry (imported by module index) | Builds the sidebar file-manager widget; uses `State<T>` reactive primitives from `perry/ui`. |
| `DiagnosticsView` / `createDiagnosticsWindow` | functions | `src/modules/diagnostics/` | Imported by `app-controller.ts` (lazy open) | In-app log viewer: ring-buffer list (RENDER_PAGE=100, "Load more" 200/page), 3 filters (level/category/text). Window is plain `Window()` — NOT always-on-top. |
| `IpcBus` | interface | `src/ipc/bus.ts` | Central (used by services, modules, ui) | Message bus; payloads typed in `src/types/ipc.ts`. 17 channels including `log:snapshot`, `log:current-file-path`, `view:open-diagnostics`. |
| `ConfigService` / `FileService` / `ShellService` / `NotificationService` / `RecentFilesService` | classes | `src/services/*.ts` (5 exports via index) | Cross-cutting; all modules import via barrel | Service layer — config persistence, file I/O through bus, notifications (gated), shell open, recent-files list. |
| `AppCommand` / `KnownAppCommand` | union / alias | `src/platform/menu-bar.ts` + `app-controller-types.ts:18` | Menu + controller + keyboard shortcuts | Exhaustive union (20 members incl. `view.openDiagnostics`). `KnownAppCommand` is a trivial `type KnownAppCommand = AppCommand` alias. |

**Blast radius (edit impact):** Changing `ControllerContext` requires updating all 8 callers (`main.ts`, `app-controller.ts`, modules) and any new module imports. Changing `AppEvent` requires all observers (UI layer + controller). Changing `AppCommand` requires `menu-bar.ts`, `app-controller.ts` handler, and any keyboard-shortcut wiring. Changing `AppConfig` requires schema migration in `services/config-service.ts` (currently v2) + `types/config.ts` + consumers. Adding a logger call site requires importing from `src/diag.ts` (not `console.*`).

## CONVENTIONS (deviations from standard only — don't apply generically)

- **Module boundary:** every feature module (`file-manager/`, `settings/`, `about/`) has `index.ts` exporting view + operations. Import from `../modules/file-manager/` (barrel) not deep files unless avoiding cycle.
- **Service barrel:** `src/services/index.ts` re-exports all 5 services; `src/types/index.ts` re-exports payload types. Standard barrel — no circular import rules explicitly enforced, but tsconfig `isolatedModules` + `bundler` prevents some cycles.
- **No `index.ts` in `src/app/` or `src/ui/`:** controller is imported directly (`import { startApp } from './app/app-controller.js'`); UI widgets are imported individually (`import { Sidebar } from '../ui/sidebar.js'`). Don't add an index to these unless needed.
- **ESM imports with `.js` extension:** all internal imports use `.js` (TypeScript `bundler` resolution, `isolatedModules`). Pattern: `import { ... } from '../platform/index.js';`
- **Reactive state:** UI uses `perry/ui` `State<T>` primitives (`State<string>`, `State<readonly FsEntry[]>`) — not Redux/MobX/React. State is local to view functions (e.g., `FileManagerView`) unless passed through `AppStore`.
- **IPC envelope:** all file-system / shell / notification operations go through `IpcBus` (`bus.send<'fs:list', FsEntry[]>('fs:list', payload)`). Pure helpers (`file-operations.ts`) don't touch `fs` directly.
- **AOT constraints (from `.agents/skills/perry-dev/`):** no `eval()`, no dynamic `require()`, no N-API, no `eval`/`Function` constructor, no `process` module access at compile time. Perry compiles TypeScript to native; code must be statically analyzable.
- **Lint rules:** `eqeqeq` (strict), `curly` (always braces), `no-unused-vars` ignores `^_`, `no-explicit-any` is warn (not error), `no-console` allowed with `eslint-disable-next-line`. No explicit `function-return-type` required.
- **Prettier:** single quote, semi, trailing comma `all`, 4-space indent, 110 char width, `lf`. Config in `.prettierrc.json`.
- **TS strict:** `strict:true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals/Parameters`, `noImplicitReturns`, `isolatedModules`, `bundler` moduleResolution.
- **Platform abstraction:** `src/platform/` abstracts OS (tray/menu/autostart/paths). Never import native APIs (`appkit`, `win32`, `gtk`) directly in `src/app/` or modules — always through `platform/`.

## ANTI-PATTERNS (THIS PROJECT — EXPLICITLY FORBIDDEN)

**Perry AOT constraints** (from `.agents/skills/perry-dev/`):
- **No `eval` / `new Function()` / dynamic `require()` / N-API** — Perry has no JIT; `eval`/`Function` constructor are statically-analyzed and rejected. Dynamic `import(spec)` with computed spec is rejected (literal/const-template OK).
- **No `process` access at compile time** — `process.env` must be wrapped (e.g., `readEnv()` in `src/platform/paths.ts`). Runtime `process.execPath` / `process.stderr.write` are OK.
- **No `obj.__proto__ = x`** — use `Object.setPrototypeOf()` instead.
- **No `structuredClone`** — not in Perry AOT subset; use manual clones (see `config-service.ts:cloneConfig`).
- **No WASM runtime by default** — needs `--enable-wasm-runtime` opt-in; otherwise spec-shaped with graceful failure.
- **WeakRef/FinalizationRegistry unreliable** — `deref()` never returns undefined; GC callbacks never fire. Don't depend on GC timing.
- **Proxy is partial** — prefer plain objects + explicit APIs.
- **`--march` must be pinned for cross-machine distribution** — `perry.toml` pins `x86-64-v2`; default `native` causes SIGILL on older CPUs.
- **No `as any` / `@ts-ignore` / `@ts-expect-error`** — `no-explicit-any` is warn; generated `.d.ts` use it but app code shouldn't.

**Project-specific rules:**
- **Never import `fs` directly in source** — only `src/services/`, `src/platform/fs-permissions.ts`, `src/platform/autostart.ts`, and `src/diag.ts` may. All file operations in `app/`, `modules/`, `ui/`, `ipc/` go through `IpcBus` and `FileService`. The `diag.ts` exception is documented (cross-cutting logging infra, not a business service).
- **Never swallow errors silently** (`fs-permissions.ts` / `plan_ui_v1.md`). Always propagate to caller or log via `logger.error` (the only allowed log seam — `console.*` is banned; 12 sites migrated to `logger.error` in 1818999).
- **Never write to read-only directories** (appDataDir / cacheDir / logDir must be checked via `fs-permissions` before write).
- **Bus never throws** (contract `plan_ui_v1.md:515`). Errors in handlers must return error payloads; never throw across `bus.send()`.
- **No placeholders / TODOs / HACK / FIXME** (explicitly banned in `settings-view.ts`, `plan_ui_v1.md`). If needed, use a comment describing the limitation — don't leave a TODO.
- **Version constant must never be patched by build** (`config-service.ts`). Version is fixed at `package.json` / `perry.toml`; don't replace at compile time. Currently `SCHEMA_VERSION = 2 as const`.
- **Sync IPC avoided** — all bus calls are async (`Promise<T>`). Don't use sync message passing.
- **Global state minimized** — store is in `AppStore` passed through `ControllerContext`; only exception is the `logger` singleton in `src/diag.ts` (cross-cutting infra). Don't create module-level mutable singletons outside the controller context.
- **No native API leaks** — never import `appkit`/`win32`/`gtk`/`perry/system` in `app/` or `modules/`. Always through `platform/`.
- **Don't bypass `assertSafePath`** — `FileService` guards NUL bytes + empty paths. Other FS-touching code must apply the same checks.
- **Don't create independent config stores** — `ConfigService` is the single source of truth. Read via `snapshot()`, write via `update()`.
- **Don't add `AppCommand` without handling it** — TypeScript exhaustiveness check in `app-controller.ts:handleCommand` is the safety net.
- **Don't build `ControllerContext` in `platform/`** — `platform/` provides capabilities; controller owns context.
- **UI theme and store must stay in sync** — `AppStore` holds theme; `resolveTheme()` reads; `settings-view.ts` writes (via `config:update` + `applyTheme()`). All three of `state/app-state.ts`, `ui/theme.ts`, `ui/settings-window.ts`, and `modules/settings/settings-view.ts` must be updated together.

## UNIQUE STYLES

- **Perry AOT native build:** `npm run dev` (mac/linux live-reload), `npm run check` (perry check), `npm run build` → `bin/qed` (native, no Node runtime in binary). Package scripts exist for all platforms (`build:mac`, `build:windows`, `build:linux`, `build:all`; `package:mac`, `package:linux`, `package:windows`).
- **Custom build scripts** instead of Makefile: `scripts/build-all.sh` orchestrates all platforms. `scripts/package-*` produce `.app`/`.dmg`/`.msi`/`.deb`/`.AppImage`.
- **UI is frameless + custom title bar** — not a standard desktop framework window; `title-bar.ts` + `sidebar.ts` + `theme.ts` define the chrome.
- **Theme system:** light / dark / system — persisted in `AppStore`; `resolveTheme()` decides at boot; `settings-view.ts` allows runtime switch.
- **Tray icon + menu + keyboard shortcuts:** cross-platform shortcuts defined in `platform/menu-bar.ts` + `platform/tray-adapter.ts`; `AppCommand` union is the single source of truth.
- **Autostart:** per-host manifest (LaunchAgent plist / Windows `.cmd` / XDG `.desktop`); `autostart.ts` writes to user directory (`~/Library/LaunchAgents`, `~/.config/autostart`, Windows Startup). Requires `entitlements` on macOS (`com.apple.security.network.client`, `files.user-selected.read-write`) and `appDataDir` on Linux.
- **Notifications:** gated by user preference (`NotificationService`); never show without preference check.
- **Recent files:** `RecentFilesService` maintains list (via `recent:add` IPC); `pushRecent()` called after file read.
- **Revealing in OS file manager:** `revealInFinder()` uses `shell:open-path` (opens folder/file in native manager — `open -R` macOS, `explorer /select,` Windows, `xdg-open` Linux).

## COMMANDS

```bash
npm install
npm run dev           # perry dev (live-reload, mac/linux only)
npm run check         # perry check src/main.ts
npm run typecheck     # tsc --noEmit
npm run lint          # eslint "src/**/*.ts"
npm run lint:fix      # eslint --fix
npm run format        # prettier --write
npm run format:check  # prettier --check
npm run build         # mkdir -p bin && perry compile src/main.ts -o bin/qed
npm run build:mac     # bin/qed + bin/qed.app (notarize)
npm run build:windows # bin/qed.exe (LLVM toolchain)
npm run build:linux   # bin/qed (AppImage / .deb)
npm run build:all     # all platforms
npm run package:mac   # .app + .dmg + notarize
npm run package:linux # .AppImage + .deb
npm run package:windows # .msi (post-build script)
```

Prerequisites for build (from README): Node 20 LTS; `npm install -g @perryts/perry`; macOS `xcode-select --install`; Linux `sudo apt install build-essential libgtk-4-dev libshumate-dev libgstreamer1.0-dev`; Windows `winget install LLVM.LLVM && perry setup windows --accept-license`. Run `perry doctor` once.

## NOTES / GOTCHAS

- **No tests** — `package.json` has no `test` script; `.github/workflows/build.yml` only runs `format:check`. If adding tests, pick a framework not used elsewhere (project is untested); consider not blocking CI on them.
- **AOT constraints break dynamic patterns:** `import()` with variable path, `eval`, `new Function()`, `require` at compile time — all fail `perry compile`. Static analysis required.
- **Module cycle risk:** `app-controller.ts` imports `platform/` (tray/menu); `platform/menu-bar.ts` imports `app-controller-types.ts`; `modules/file-manager/` imports `ipc/bus` + `state/app-state` + `types/`. `src/diag.ts` is now cross-cutting (imported by 7 sites: `main.ts`, `app-controller.ts`, `handlers.ts`, `app-state.ts`, `settings-view.ts`, `about-view.ts`, `diagnostics-view.ts`). Keep imports unidirectional (controller → services → modules → ipc; never module → controller).
- **UI theme and store must stay in sync:** `AppStore` holds theme; `resolveTheme()` reads it; `settings-view.ts` writes it. If changing theme logic, update both `state/app-state.ts` and `ui/theme.ts` + `ui/settings-window.ts` + `modules/settings/settings-view.ts`.
- **Logger reachability is dual:** In-app viewer reachable via (1) View menu → "Open Log Viewer" (`AppCommand 'view.openDiagnostics'`), (2) Settings → Advanced → "Open log viewer" button (fires `view:open-diagnostics` IPC), (3) About → "Open log folder" (reveals the log directory in OS file manager, NOT the viewer window).
- **Cross-platform build differences:** macOS uses `bundle_id`, notarize, `.app`; Linux uses `AppImage`, `.deb`, `category=Development`; Windows uses `.exe` + `.msi` via post-build script (Perry doesn't emit `.msi` directly — must run `msi-pack.ps1` after compile).
- **Config persistence:** `ConfigService` writes JSON to `appDataDir` with debounced flush; don't write synchronously on every change — use the debounce mechanism already present. Schema version is currently 2 (added `logLevel` field in 1818999).
- **Design doc is authoritative:** `docs/plan_ui_v1.md` defines sidebar routes, settings window layout, tray menu items, keyboard shortcuts, theme behavior, autostart flow. If implementing UI, read this first.
- **Dead code:** `LogLevelUpdatePayload` (`src/types/ipc.ts:187`) is defined but never imported. Either wire it into a handler or remove.
- `.agents/skills/perry-dev/` contains 29 reference docs (cli-config.md, cli-flags.md, etc.) — these are documentation for the Perry toolchain, not application code. Don't modify them for app changes; read only.
- `.codegraph/` exists (codegraph.db, references/) — use `codegraph_explore` / `codegraph_node` for symbol-level exploration instead of manual grep when available.
