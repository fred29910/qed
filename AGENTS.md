# PROJECT KNOWLEDGE BASE — qed

**Generated:** 2026-09-03  Branch: feat/ui/v1  Commit: feb317f

## OVERVIEW
Cross-platform desktop skeleton (Perry TypeScript AOT → native .exe/.app/.AppImage). No Electron/Tauri/Qt. Same `src/` produces Windows/macOS/Linux binaries via `perry compile`. 92 files, ~38k lines, max depth 5.

**Core stack:** Perry CLI (`@perryts/perry` ^0.5.1220), TypeScript 5.4 (ESM `"type":"module"`, `bundler` resolution), ESLint + Prettier, custom build/package scripts (`scripts/build-*.sh`, `package:mac/linux/windows`). CI: `.github/workflows/build.yml` (ubuntu/mac/windows matrix, `npx @perryts/perry setup --host`, artifacts for `.exe`/`.app`/`.AppImage`/`.dms`/`.msi`).

**What this is not:** a web app, a node CLI, or a library. It's a frameless window with sidebar (File Manager / Settings / About), secondary settings window (always-on-top), tray + menu bar + notifications, JSON config with debounced flush, theme switch (light/dark/system), and optional autostart (LaunchAgent / Startup `.cmd` / XDG `.desktop`). Design doc: `docs/plan_ui_v1.md` (52 KB UI spec).

## STRUCTURE
```
qed/
├── src/main.ts                     # entry (perry.toml entry)
├── src/app/                        # controller + event types (NO index — flat)
│   ├── app-controller.ts           # central dispatcher (startApp, navigateTo, openSettingsWindow)
│   ├── app-controller-types.ts     # ControllerContext, AppEvent, AppEventListener, KnownAppCommand
│   ├── app-controller-types.ts     # AppStore, theme
│   └── ...
├── src/modules/                    # feature modules (each with index.ts boundary)
│   ├── file-manager/ (3)           # view + operations + index
│   ├── settings/     (3)           # view + changes + index
│   └── about/        (2)           # view + index
├── src/services/                   # barrel index (5 exports: config/file/notification/shell/recent-files)
├── src/types/                      # barrel index (config + ipc payloads)
├── src/ipc/                        # bus + handlers (2 files)
├── src/platform/                   # OS abstraction (tray/menu-bar/autostart/paths/fs-permissions — 6 + index)
├── src/ui/                         # flat widget layer (7 files, NO index — theme, sidebar, status-bar, title-bar, settings-window, toast, widgets)
├── src/state/                      # app-state.ts (store, resolveTheme)
├── platforms/shared/icon.png
├── scripts/                        # build-*.sh / package-*.sh / build-all.sh / msi-pack.ps1
├── docs/plan_ui_v1.md              # UI design spec (single large doc)
├── .agents/skills/perry-dev/       # AOT skill refs (29 docs — cli-config, cli-flags, etc.)
└── perry.toml / package.json / tsconfig.json / .eslintrc.json / .prettierrc.json
```

**Non-obvious:** `src/app/` has NO `index.ts` (controller is imported directly by `main.ts`); `src/ui/` has NO index (widgets imported selectively); module boundaries are `index.ts` inside each `src/modules/*/`; `.agents/skills/perry-dev` is a self-contained reference module (29 config/index docs) — don't edit for the app, only read for AOT constraints.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| App startup / routing | `src/main.ts` → `src/app/app-controller.ts` | `startApp()` (line 108) is the only entry after boot. `ControllerContext` (line 41, 7 callers) is the service bag — never build one manually; always pass through `main.ts`. |
| Feature module code | `src/modules/<name>/` + `index.ts` | Each module exports its view + ops. `file-manager/` uses `IpcBus` to talk to `src/ipc/bus.ts`. |
| Service seam (file/config/notifications/shell/recent) | `src/services/index.ts` → individual files | Barrel — import from `../services/` not individual file unless avoiding barrel cycle. `ConfigService` persists JSON to `appDataDir`. |
| Platform / OS specifics | `src/platform/` | `tray-adapter.ts` (tray), `menu-bar.ts` (AppCommand union), `autostart.ts` (LaunchAgent / Windows Startup / XDG). `fs-permissions.ts` gates FS access — **never import `fs` directly** (see anti-patterns). |
| UI / theme / widgets | `src/ui/` | Flat layer — no index. `theme.ts` defines `paintMuted`/`paintText`; `settings-window.ts` is always-on-top secondary window. `sidebar.ts` handles route navigation (`file-manager`/`settings`/`about`). |
| IPC / message bus | `src/ipc/bus.ts` + `handlers.ts` | `IpcBus` interface; payloads defined in `src/types/`. Bus never throws (contract in `plan_ui_v1.md:515`) — errors must be handled by the caller. |
| App state / theme / store | `src/state/app-state.ts` | `AppStore`, `resolveTheme`. Store is passed through `ControllerContext`; don't create independent stores. |
| Cross-platform build / package | `scripts/build-*.sh`, `perry.toml` | `perry compile src/main.ts -o bin/qed` (mac/linux); `build-windows.sh` + `msi-pack.ps1`. Mac: `bundle_id=com.example.qed.macos`, `category=developer-tools`, `distribute=notarize`, `minimum_os=13.0`. Linux: `format=appimage`, `category=Development`. Windows: LLVM toolchain (`winget install LLVM.LLVM` + `perry setup windows --accept-license`), `.msi` produced by post-build script (Perry doesn't emit `.msi` directly). `march=x86-64-v2`, `opt_level=2`. |
| CI verification | `.github/workflows/build.yml` | Matrix ubuntu/mac/windows; runs `format:check` as the only "test" step — **no unit tests exist** (see notes). |

## CODE MAP (from codegraph / LSP)

| Symbol | Type | File | Ref centrality | Role |
|---|---|---|---|---|
| `startApp` | function | `src/app/app-controller.ts:108` | 2 callers (`main.ts`) | Boot entry — creates `mainWindow`, installs tray/menu, starts event loop. |
| `ControllerContext` | interface | `src/app/app-controller-types.ts:41` | 7 callers (controller, main, modules) | Service bag passed everywhere; never construct manually. |
| `mainWindow` | var | `src/app/app-controller.ts:43` | 5 callers (controller internal) | Internal window handle; not exported. |
| `AppEvent` / `AppEventListener` | union / type | `src/app/app-controller-types.ts:25` | Used by controller + UI observers | Internal events (route-changed, theme-changed, settings-window-opened/closed, background-mode-changed, always-on-top-changed). |
| `AppStore` | interface | `src/state/app-state.ts` / `app-controller-types.ts` | Passed through `ControllerContext` | Config + theme + window state; debounced disk flush. |
| `FileManagerView` | function | `src/modules/file-manager/file-manager-view.ts:32` | Feature entry (imported by module index) | Builds the sidebar file-manager widget; uses `State<T>` reactive primitives from `perry/ui`. |
| `refresh` / `createFolder` / `deleteEntry` / `readText` / `revealInFinder` / `pushRecent` | functions | `src/modules/file-manager/file-operations.ts` | Used by view + other callers | IPC wrappers around `IpcBus`; pure helpers (no direct FS — all go through bus). |
| `IpcBus` | interface | `src/ipc/bus.ts` | Central (used by services, modules, ui) | Message bus; payloads typed in `src/types/index.ts`. |
| `ConfigService` / `FileService` / `ShellService` / `NotificationService` / `RecentFilesService` | classes | `src/services/*.ts` (5 exports via index) | Cross-cutting; all modules import via barrel | Service layer — config persistence, file I/O through bus, notifications (gated), shell open, recent-files list. |
| `AppCommand` / `KnownAppCommand` | union / alias | `src/platform/menu-bar.ts` + `app-controller-types.ts` | Menu + controller + keyboard shortcuts | Exhaustive union — add here + handle in `AppController.handleCommand()`; TypeScript exhaustiveness check enforced. |

**Blast radius (edit impact):** Changing `ControllerContext` requires updating all 7 callers (`main.ts`, `app-controller.ts`, modules) and any new module imports. Changing `AppEvent` requires all observers (UI layer + controller). Changing `AppCommand` requires `menu-bar.ts`, `app-controller.ts` handler, and any keyboard-shortcut wiring.

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

- **Never import `fs` directly in source** (`src/ipc/bus.ts` bans it; `fs-permissions.ts` gates access). All file operations must go through `IpcBus` and `FileService`.
- **Never swallow errors silently** (`fs-permissions.ts` / `plan_ui_v1.md`). Always propagate to caller or log (`console.error` allowed with `eslint-disable`).
- **Never write to read-only directories** (appDataDir / cacheDir / logDir must be checked via `fs-permissions` before write).
- **Bus never throws** (contract `plan_ui_v1.md:515`). Errors in handlers must return error payloads; never throw across `bus.send()`.
- **No placeholders / TODOs / HACK / FIXME** (explicitly banned in `settings-view.ts`, `plan_ui_v1.md`). If needed, use a comment describing the limitation — don't leave a TODO.
- **Version constant must never be patched by build** (`config-service.ts`). Version is fixed at `package.json` / `perry.toml`; don't replace at compile time.
- **Sync IPC avoided** — all bus calls are async (`Promise<T>`). Don't use sync message passing.
- **Global state minimized** — store is in `AppStore` passed through `ControllerContext`; don't create module-level mutable singletons outside the controller context.
- **No `eval` / dynamic `require` / N-API** (Perry AOT constraint — `.agents/skills/perry-dev/` refs). Dynamic import (`import()` static) permitted only where statically analyzable.
- **No `process` access at compile time** — `perry` compile-time environment is limited; any `process.env` access must be conditional on runtime.

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
- **Module cycle risk:** `app-controller.ts` imports `platform/` (tray/menu); `platform/menu-bar.ts` imports `app-controller-types.ts`; `modules/file-manager/` imports `ipc/bus` + `state/app-state` + `types/`. Keep imports unidirectional (controller → services → modules → ipc; never module → controller).
- **UI theme and store must stay in sync:** `AppStore` holds theme; `resolveTheme()` reads it; `settings-window` writes it. If changing theme logic, update both `state/app-state.ts` and `ui/theme.ts` + `ui/settings-window.ts`.
- **Cross-platform build differences:** macOS uses `bundle_id`, notarize, `.app`; Linux uses `AppImage`, `.deb`, `category=Development`; Windows uses `.exe` + `.msi` via post-build script (Perry doesn't emit `.msi` directly — must run `msi-pack.ps1` after compile).
- **Config persistence:** `ConfigService` writes JSON to `appDataDir` with debounced flush; don't write synchronously on every change — use the debounce mechanism already present.
- **Design doc is authoritative:** `docs/plan_ui_v1.md` defines sidebar routes, settings window layout, tray menu items, keyboard shortcuts, theme behavior, autostart flow. If implementing UI, read this first.
- `.agents/skills/perry-dev/` contains 29 reference docs (cli-config.md, cli-flags.md, etc.) — these are documentation for the Perry toolchain, not application code. Don't modify them for app changes; read only.
- `.codegraph/` exists (codegraph.db, references/) — use `codegraph_explore` / `codegraph_node` for symbol-level exploration instead of manual grep when available.
