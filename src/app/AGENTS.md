# src/app/ — Controller Layer

**Generated:** 2026-09-03  Parent: ./AGENTS.md  Commit: 1818999

## OVERVIEW
Central dispatcher for the entire app. Routes menu picks, tray clicks, keyboard shortcuts, and button presses through a single `handleCommand()` entry. Owns `ControllerContext` (the service bag), `AppEvent` (internal pub/sub), and `AppCommand` (the exhaustive union). Three files, no index.

## STRUCTURE
```
app-controller.ts          # startApp, handleCommand, navigateTo, openSettingsWindow, openDiagnosticsWindow, lifecycle
app-controller-types.ts    # ControllerContext, AppEvent/AppEventListener, AppCommand re-export, KnownAppCommand alias
theme.ts                   # LIGHT/DARK palettes, paletteFor(), Palette type (split from ui/theme.ts for testability)
```
No `index.ts`. Everything imported directly by consumers.

## WHERE TO LOOK
| What | Where |
|---|---|
| App entry | `startApp(ctx, body)` — builds window, installs tray + menu, sets logger level, starts run loop |
| Command dispatch | `handleCommand(command)` — exhaustive switch on AppCommand union (20 members incl. `view.openDiagnostics`) |
| Route navigation | `navigateTo(route)` — emits `route-changed` event |
| Settings window | `openSettingsWindow()` / `closeSettingsWindow()` — creates or shows secondary always-on-top window |
| Diagnostics window | `openDiagnosticsWindow()` / `closeDiagnosticsWindow()` — 900x600 secondary window, NOT always-on-top (plain `Window()`) |
| Events | `AppEvent` union in types (route-changed, theme-changed, settings-window-opened/closed, always-on-top-changed, background-mode-changed) |
| Commands | `AppCommand` re-exported from `platform/menu-bar.ts` — add new commands there, handle here |
| Theme cycling | `cycleTheme()` — rotates system → light → dark → system |
| Colour palettes | `theme.ts` — `LIGHT` / `DARK` frozen objects, `paletteFor(theme)` returns the active one |
| Lifecycle | `onAppActivate()`, `onAppTerminate()` (calls `logger.flush()`), `onAppBackground()`, `onAppForeground()` |
| Diagnostics | `describeEnvironment()` — snapshot of host + paths for about/settings views |
| Logger wiring | `setLevel` subscription in `startApp()` (lines 119-121), `view:open-diagnostics` IPC registration (lines 126-128) |

## CONVENTIONS
- **No index.ts.** `app-controller.ts` is imported directly (`import { startApp } from '../app/app-controller.js'`).
- **ControllerContext is never built manually.** It's assembled once in `main.ts` and threaded through. 8 callers in total.
- **Exhaustiveness check on AppCommand.** `handleCommand` ends with `const _exhaustive: never = command`. Adding a new `AppCommand` in `platform/menu-bar.ts` forces a compile error here until handled.
- **Theme palette is frozen.** `LIGHT` and `DARK` are `Object.freeze`d. Don't mutate; use `paletteFor()`.
- **Window lifecycle owned by controller.** Both `openSettingsWindow()` and `openDiagnosticsWindow()` are idempotent — first call creates, subsequent calls re-show. Controller owns the handle and reuses it (hide/show pattern).
- **Logger is cross-cutting infra.** `logger.flush()` is called in `onAppTerminate()` (line 363). Never bypass the logger with `console.*`.

## ANTI-PATTERNS
- **Don't build `ControllerContext` yourself.** There's exactly one in `main.ts`. Constructing a second is a bug.
- **Don't add `index.ts` to this directory.** The controller is imported by name. A barrel would blur ownership.
- **Don't throw from bus handlers.** The contract is that `IpcBus.send()` never throws; errors are returned as payloads. The caller handles them.
- **Don't use `console.*` here.** The controller uses `logger.*` (migrated in 1818999). Adding a `console.log` is a regression.
