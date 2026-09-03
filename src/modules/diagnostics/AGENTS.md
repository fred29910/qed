# diagnostics — In-App Log Viewer

**Generated:** 2026-09-03  Parent: ./AGENTS.md  Commit: 1818999

## OVERVIEW

The log viewer is a secondary, non-modal window that displays the in-memory
ring buffer of `src/diag.ts`. It is the user-visible counterpart to the
logger and lives in its own module to keep the surface tight. Reachable via:
(1) View menu → "Open Log Viewer" (`AppCommand 'view.openDiagnostics'`),
(2) Settings → Advanced → "Open log viewer" button (fires `view:open-diagnostics` IPC).

## STRUCTURE

```
diagnostics/
├── AGENTS.md             # this file
├── index.ts              # public surface: re-exports DiagnosticsView + createDiagnosticsWindow
├── diagnostics-view.ts   # scrollable list of entries + level/category filters + pagination
└── diagnostics-window.ts # secondary window factory (900x600, no always-on-top)
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Add a new filter dimension | `diagnostics-view.ts` | 2 filters today: level (6 levels) + category (from snapshot). Text filter noted as follow-up at line 91-93. |
| Change window size / title | `diagnostics-window.ts` | Currently 900x600. Plain `Window()` — NOT always-on-top. |
| Pagination tuning | `diagnostics-view.ts` | `RENDER_PAGE=100`, `PAGE_INCREMENT=200`, `RING_BUFFER_CAP=500` constants at top. |
| Expose a new entry point | `index.ts` | Add to re-export list. |

## CONVENTIONS

- The viewer reads from `logger.snapshot()` (in-memory only) — no disk I/O.
- All UI follows the `perry/ui` `State<T>` reactive pattern (see other modules).
- The window is a plain `Window(title, w, h)`; it has **no** `level: 'floating'`
  because `perry/ui` `Window` does not expose `setAlwaysOnTop` (only the
  primary `App({ level })` does). The user can re-show the window from the
  View menu.
- Filters apply client-side; the ring buffer is at most 500 entries, so no
  virtualisation is required for the MVP.
- List rebuilds on every filter change (cheap, < 500 entries).
- NOT a sidebar route — only reachable via the `view.openDiagnostics` AppCommand
  or the `view:open-diagnostics` IPC channel.

## ANTI-PATTERNS

- **Don't add `fs` imports.** The viewer never touches disk; disk history is
  a Phase 5.5 follow-up (`log:list-recent` + `FileService.readLines`).
- **Don't import the controller.** This module is invoked by the controller
  through `openDiagnosticsWindow()`; reverse imports would create a cycle.
- **Don't bypass the `Logger` API.** No raw `console.*` calls; all log
  emission goes through `logger.*`.
