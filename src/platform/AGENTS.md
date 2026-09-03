# src/platform/ — OS Abstraction Layer

**Generated:** 2026-09-03  Parent: ./AGENTS.md  Commit: 1818999

## OVERVIEW
Cross-platform host adaptation: tray icon + context menu, app menu bar with keyboard shortcuts, "launch at login" (autostart), path resolution for app data / cache / logs, and filesystem permission probes. 6 modules + barrel index. Every OS-specific detail lives here so the rest of the app never touches native APIs.

## STRUCTURE
```
platform/
├── index.ts              # barrel — re-exports platform/paths/fs-permissions ONLY (NOT tray/menu/autostart — those are imported directly)
├── platform.ts           # HostKind, isMacOS/Windows/Linux, platformLabel()
├── paths.ts              # appDataDir, cacheDir, logDir, configFilePath, autostartManifestPath, readEnv
├── fs-permissions.ts     # checkFsAccess, explainFsError
├── autostart.ts          # enableAutostart, disableAutostart, isAutostartEnabled
├── menu-bar.ts           # AppCommand union (20 members incl. view.openDiagnostics), CommandHandler, installAppMenu
└── tray-adapter.ts       # installTray, TrayHandle
```

**Non-obvious:** The barrel `index.ts` does NOT re-export `tray-adapter`, `menu-bar`, or `autostart`. Those must be imported by direct path (`'../platform/menu-bar.js'`).

## WHERE TO LOOK

| Task | File | Key exports |
|---|---|---|
| Tray icon + context menu | `tray-adapter.ts` | `installTray(handler, tooltip)` → `TrayHandle` |
| Menu bar + command routing | `menu-bar.ts` | `AppCommand` union (20 commands incl. `view.openDiagnostics`), `installAppMenu(handler)` |
| Keyboard shortcuts / AppCommand | `menu-bar.ts` | Add new commands to the `AppCommand` union + handle in controller (TypeScript exhaustiveness check) |
| Launch at login | `autostart.ts` | `enableAutostart()`, `disableAutostart()`, `isAutostartEnabled()` |
| macOS plist / Windows .cmd / XDG .desktop | `autostart.ts` | Manifest rendering per host (private helpers) |
| App data / cache / log paths | `paths.ts` | `appDataDir()`, `cacheDir()`, `logDir()`, `configFilePath()` |
| FS permission checks | `fs-permissions.ts` | `checkFsAccess(path, tryWriteProbe)` → `FsAccess` |
| FS error translation | `fs-permissions.ts` | `explainFsError(err)` → user-friendly string |
| Platform detection | `platform.ts` | `getHostKind()`, `isMacOS()`, `isWindows()`, `isLinux()` |
| Open log viewer menu | `menu-bar.ts` lines 127, 170 | "Open Log Viewer" wired in both macOS + desktop menus (AppCommand `view.openDiagnostics`) |

## CONVENTIONS

- **Barrel import for capability providers.** Other modules import `platform/paths`, `platform/fs-permissions`, `platform/platform` from `../platform/index.js`. `tray-adapter`, `menu-bar`, and `autostart` are imported by direct path because the barrel excludes them.
- **No native API leaks.** Never import `perry/ui` tray/menu APIs from `app/` or `modules/`. All native calls go through the adapters here (`tray-adapter.ts`, `menu-bar.ts`).
- **AppCommand is the single command union.** Every menu item, tray action, and keyboard shortcut maps to an `AppCommand` literal. Adding a command means: (1) add to the union in `menu-bar.ts`, (2) handle it in `app-controller.ts`, (3) wire the menu item.
- **`__platform__` is a Perry compile-time constant.** `platform.ts` reads it once; all branches using `isMacOS()` / `getHostKind()` are dead-code eliminated by the AOT compiler.

## ANTI-PATTERNS

- **Never import `fs` outside this directory** (except `src/diag.ts`). `fs-permissions.ts` is the gatekeeper. Modules and services that need filesystem access must go through `IpcBus` or `FileService`, not raw `fs`.
- **Don't write to read-only directories without `checkFsAccess()`.** `autostart.ts` writes to `~/Library/LaunchAgents`, `~/.config/autostart`, and Windows Startup. Callers that write to arbitrary paths (e.g., user-selected folders) must probe first via `checkFsAccess(path, true)`.
- **Don't build `ControllerContext` here.** This layer provides *capabilities* (tray, menu, paths, permissions). The controller (`src/app/`) owns context creation and command dispatch.
- **Don't add `AppCommand` without handling it.** TypeScript exhaustiveness is your safety net. The controller's switch on `AppCommand` must cover every union member. Currently 20 members.
