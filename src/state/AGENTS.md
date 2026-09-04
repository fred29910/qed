# src/state/ — Global App Store

**Generated:** 2026-09-04  Parent: ./AGENTS.md  Commit: 2966a60

## OVERVIEW

Single file, no index, no subdir. `AppStore` is the **only** place that owns
mutable, observable app state. UI modules read via `getState()` and write via
setters; the store emits change events on every mutation so `State<T>`-based
widgets re-render. Passed through `ControllerContext` — never constructed
independently.

## STRUCTURE

```
state/
└── app-state.ts    # AppStore class + resolveTheme() + describePlatform()
```

## WHERE TO LOOK

| Task | Symbol | Notes |
|---|---|---|
| Read current state | `store.getState()` | Returns an immutable `AppState` snapshot. |
| Subscribe to changes | `store.subscribe(listener)` | Returns an unsubscribe fn. Listeners must not throw — the store catches and logs via `logger.error`. |
| Switch sidebar route | `store.setRoute(route)` | Emits a `route-changed` event to the controller. |
| Show error toast | `store.setError(msg)` / `store.clearError()` | Cleared by `clearError()` or replaced. |
| Long-running op | `store.setBusy(true/false)` | Drives the status-bar busy indicator. |
| OS theme change | `store.refreshTheme()` | Re-resolves from `config.theme` + `isDarkMode()`. |
| Resolve a theme | `resolveTheme(theme)` | Pure helper, testable. `resolveTheme('system')` reads `isDarkMode()` from `perry/system`. |
| Platform label | `describePlatform()` | Returns `'macOS' | 'Windows' | 'Linux' | 'Unknown'`. Used by the about view. |

## CONVENTIONS

- **Single store.** `AppStore` is assembled once in `main.ts` and threaded
  through `ControllerContext`. Don't create a second store or cache state
  outside the subscriber pattern.
- **Pub-sub, not pull.** The store notifies on every mutation. UI widgets
  that need fine-grained reactivity use `perry/ui` `State<T>` locally; the
  store is for imperative events ("show error toast", "open settings window").
- **Listeners must not throw.** The store wraps each call in try/catch and
  logs via `logger.error('store', 'listener threw', err)` so one bad widget
  can't break the dispatcher.
- **Config stays in sync automatically.** The constructor subscribes to
  `ConfigService`; every config write flows into `applyConfig()` → `update()`.
- **Theme is derived, not stored.** `AppState.resolvedTheme` is computed
  from `config.theme` + the OS, never set directly.

## ANTI-PATTERNS

- **Don't build a store outside `main.ts`.** There's exactly one `AppStore`;
  constructing a second breaks the single-source-of-truth contract.
- **Don't mutate `AppState` directly.** Snapshots are readonly by contract;
  always go through a setter or `update()`.
- **Don't import `fs` here.** This directory is state-only; no disk I/O.
- **Don't depend on GC timing.** The store holds a `Set<StoreListener>` and
  relies on explicit `dispose()` — never assume a listener is collected.
- **Don't bypass `resolveTheme()` for the UI.** Both `app/theme.ts` and
  `ui/theme.ts` must stay consistent with `resolveTheme()`'s output.