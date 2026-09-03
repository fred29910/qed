# diagnostics — In-App Log Viewer

## OVERVIEW

The log viewer is a secondary, non-modal window that displays the in-memory
ring buffer of `src/diag.ts`. It is the user-visible counterpart to the
logger and lives in its own module to keep the surface tight.

## STRUCTURE

```
diagnostics/
├── AGENTS.md            # this file
├── index.ts             # public surface
├── diagnostics-view.ts  # the scrollable list of entries + filter chrome
└── diagnostics-window.ts # secondary window factory (no always-on-top)
```

## WHERE TO LOOK

| Task | File |
|---|---|
| Add a new filter dimension | `diagnostics-view.ts` |
| Change window size / title | `diagnostics-window.ts` |
| Expose a new entry point | `index.ts` |

## CONVENTIONS

- The viewer reads from `logger.snapshot()` (in-memory only) — no disk I/O.
- All UI follows the `perry/ui` `State<T>` reactive pattern (see other modules).
- The window is a plain `Window(title, w, h)`; it has **no** `level: 'floating'`
  because `perry/ui` `Window` does not expose `setAlwaysOnTop` (only the
  primary `App({ level })` does). The user can re-show the window from the
  Help menu.
- Filters apply client-side; the ring buffer is at most 500 entries, so no
  virtualisation is required for the MVP.

## ANTI-PATTERNS

- **Don't add `fs` imports.** The viewer never touches disk; disk history is
  a Phase 5.5 follow-up (`log:list-recent` + `FileService.readLines`).
- **Don't import the controller.** This module is invoked by the controller
  through `openDiagnosticsWindow()`; reverse imports would create a cycle.
- **Don't bypass the `Logger` API.** No raw `console.*` calls; all log
  emission goes through `logger.*`.
