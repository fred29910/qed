# src/ui/ — Flat Widget Layer

**Generated:** 2026-09-04  Parent: ./AGENTS.md  Commit: 2966a60

## OVERVIEW

7 flat widget files, no `index.ts`. Theme palette helpers, sidebar navigation, status/title bars, always-on-top settings window factory, toast overlay, and small reusable widget primitives (`Section`, `Row`, `Badge`, `ButtonRow`). Uses `perry/ui` `State<T>` for local reactive state.

## STRUCTURE

```
src/ui/
├── theme.ts                # palette tokens + imperative paint helpers (paintMuted, paintText, etc.) — re-exports from app/theme.ts
├── sidebar.ts              # vertical route nav (file-manager / settings / about) + recent files
├── status-bar.ts           # bottom bar: last error, busy indicator, store-subscribed
├── title-bar.ts            # frameless custom chrome (app name + module title)
├── settings-window.ts      # factory: creates the always-on-top secondary window
├── toast.ts                # transient banner (4 s, overlay on main ZStack)
└── widgets.ts              # Section, Row, Badge, ButtonRow, re-exports of perry/ui primitives
```

No barrel. Import individual files directly:
```ts
import { Sidebar } from '../ui/sidebar.js';
import { TitleBar } from '../ui/title-bar.js';
import { Section, Row, Badge } from '../ui/widgets.js';
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Apply theme colours to a widget | `theme.ts` | `paintMuted`, `paintText`, `paintAccent`, `paintDanger`, `paintSuccess`. `applyTheme()` is idempotent. |
| Route navigation buttons | `sidebar.ts` | Calls `navigateTo()` from controller; subscribes to `route-changed` events. |
| Always-on-top settings window | `settings-window.ts` | Factory only. Controller owns the handle and reuses it (hide/show). Settings → Advanced section has log level picker + "Open log viewer" button. |
| Custom title bar chrome | `title-bar.ts` | Pure layout. Takes a module title string, returns `HStack` widget. |
| Toast/error banner | `toast.ts` | Subscribes to `store.lastError`; auto-hides after 4 s. |
| Reusable form primitives | `widgets.ts` | `Section`, `Row`, `Badge`, `ButtonRow`. Purely structural, no paint logic. |

## CONVENTIONS

- **No index.ts.** This directory never gets a barrel. Import files selectively.
- **State<T> is local to the view.** `sidebar.ts` holds `activeRoute` and `recent` as local `State<>` cells. `status-bar.ts` holds `lastError` and `isBusy`. These never leak to other modules.
- **AppStore is passed in, not created.** Views that need the full store (`StatusBar`, `Toast`) accept it as a parameter from the controller context.
- **Theme sync.** `applyTheme()` in `theme.ts` must be called when the store's theme changes. `settings-view.ts` is where the user toggles it. Both `state/app-state.ts` and `ui/theme.ts` must stay consistent.
- **Settings window content** — `settings-view.ts` lives in `src/modules/settings/`, not here. The window factory in `settings-window.ts` only wires the body; the body is module-owned.

## ANTI-PATTERNS

- **Don't add `index.ts` to `src/ui/`.** The flat structure is intentional; importing selectively keeps the module boundary tight.
- **Don't use Redux, MobX, or React patterns.** Use `perry/ui` `State<T>` primitives. State is local to the view function scope.
- **Don't build independent stores.** Pass `AppStore` through `ControllerContext`. Creating a separate store breaks the single-source-of-truth contract.
- **Don't paint widgets outside `theme.ts`.** The `paint*` helpers in `theme.ts` are the single place where palette colours touch widgets. Callers should never pass raw RGBA values.
- **Don't put diagnostics UI here.** The diagnostics window is a separate module (`src/modules/diagnostics/`) because it has its own lifecycle and view. It is NOT always-on-top (unlike the settings window).
