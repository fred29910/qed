# src/app/ — Controller Layer

## OVERVIEW
Central dispatcher for the entire app. Routes menu picks, tray clicks, keyboard shortcuts, and button presses through a single `handleCommand()` entry. Owns `ControllerContext` (the service bag), `AppEvent` (internal pub/sub), and `AppCommand` (the exhaustive union). Three files, no index.

## STRUCTURE
```
app-controller.ts          # startApp, handleCommand, navigateTo, openSettingsWindow, lifecycle
app-controller-types.ts    # ControllerContext, AppEvent/AppEventListener, AppCommand re-export
theme.ts                   # LIGHT/DARK palettes, paletteFor(), RGBA type
```
No `index.ts`. Everything imported directly by consumers.

## WHERE TO LOOK
| What | Where |
|---|---|
| App entry | `startApp(ctx, body)` — builds window, installs tray + menu, starts run loop |
| Command dispatch | `handleCommand(command)` — exhaustive switch on AppCommand union |
| Route navigation | `navigateTo(route)` — emits `route-changed` event |
| Settings window | `openSettingsWindow()` / `closeSettingsWindow()` — creates or shows secondary window |
| Events | `AppEvent` union in types (route-changed, theme-changed, settings-window-opened/closed, always-on-top-changed, background-mode-changed) |
| Commands | `AppCommand` re-exported from `platform/menu-bar.ts` — add new commands there, handle here |
| Theme cycling | `cycleTheme()` — rotates system → light → dark → system |
| Colour palettes | `theme.ts` — `LIGHT` / `DARK` frozen objects, `paletteFor(theme)` returns the active one |
| Lifecycle | `onAppActivate()`, `onAppTerminate()`, `onAppBackground()`, `onAppForeground()` |
| Diagnostics | `describeEnvironment()` — snapshot of host + paths for about/settings views |

## CONVENTIONS
- **No index.ts.** `app-controller.ts` is imported directly (`import { startApp } from '../app/app-controller.js'`).
- **ControllerContext is never built manually.** It's assembled once in `main.ts` and threaded through.
- **Exhaustiveness check on AppCommand.** `handleCommand` ends with `const _exhaustive: never = command`. Adding a new `AppCommand` in `platform/menu-bar.ts` forces a compile error here until handled.
- **Theme palette is frozen.** `LIGHT` and `DARK` are `Object.freeze`d. Don't mutate; use `paletteFor()`.

## ANTI-PATTERNS
- **Don't build `ControllerContext` yourself.** There's exactly one in `main.ts`. Constructing a second is a bug.
- **Don't add `index.ts` to this directory.** The controller is imported by name. A barrel would blur ownership.
- **Don't throw from bus handlers.** The contract is that `IpcBus.send()` never throws; errors are returned as payloads. The caller handles them.
