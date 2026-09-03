# src/services/

Cross-cutting service layer. Five classes exported through a single
barrel `index.ts`. This directory is the **only** place in `src/`
that touches `fs` or `perry/system` directly. Every other module
goes through `IpcBus` or this barrel.

## Structure

```
services/
├── index.ts                    # barrel: re-exports all five services
├── config-service.ts           # JSON config persistence (appDataDir/config.json)
├── file-service.ts             # FS operations: list/read/write/delete/rename/mkdir/stat
├── notification-service.ts     # local notifications via perry/system
├── shell-service.ts            # openURL + revealInFileManager (per-platform)
└── recent-files-service.ts     # recent-paths registry (appDataDir/recent-files.json)
```

## Where to Look

| Task | File | Notes |
|---|---|---|
| Import a service | `../services/` (barrel) | Always import from the barrel, never deep-import a service file. |
| Config read/write | `config-service.ts` | `snapshot()` returns cloned state; `update(patch)` applies partial, notifies listeners, debounced flush. `flushNow()` for shutdown. |
| File operations | `file-service.ts` | Synchronous FS (perry constraint). Refuses >32 MB reads, caps list at 5000 entries. `assertSafePath` blocks NUL bytes. |
| Open URL / reveal | `shell-service.ts` | `openUrl()` uses `perry/system.openURL`. `revealInFileManager()` dispatches per-OS (`open -R` / `explorer /select,` / `xdg-open`). |
| Notifications | `notification-service.ts` | **Gated**: returns `false` without sending when `config.notifications` is off. Never call `notificationSend` directly. |
| Recent files | `recent-files-service.ts` | `add(path)` deduplicates, caps at 20, flushes to disk immediately. `list()` returns most-recent-first snapshot. |

## Conventions

- **Barrel import only.** `import { ConfigService } from '../services/index.js'`. Never `import from './config-service.js'` outside this directory.
- **Services own their FS.** ConfigService and RecentFilesService read/write their own JSON files. FileService handles all user-facing FS operations. No other module should call `fs` directly.
- **Notifications are gated.** `NotificationService.send()` checks `config.snapshot().notifications` before dispatching. If the user hasn't opted in, the call is a silent no-op. Don't add a second gate elsewhere.
- **Services receive dependencies via constructor.** `NotificationService` takes `ConfigService`. Don't import services from each other through side effects; wire them in `main.ts`.

## Anti-PATTERNS

- **Don't import `fs` in `src/app/`, `src/modules/`, `src/ui/`, or `src/ipc/`.** All file I/O goes through `FileService` or the service barrel. The bus handlers in `src/ipc/` delegate to services; they don't touch `fs` themselves.
  - **Exception:** `src/diag.ts` is the only module outside this directory allowed to import `fs`. It is logging infrastructure, not a business service, and is the single seam for cross-platform log file rotation under `logDir()`. The rule remains that business code must not call `fs` directly — only the logger and the services in this directory do.
- **Don't create independent config stores.** `ConfigService` is the single source of truth. Other code reads via `snapshot()` and writes via `update()`. Don't instantiate a second `ConfigService` or cache config values outside the subscriber pattern.
- **Don't bypass `assertSafePath`.** FileService guards against NUL bytes and empty paths. Other FS-touching code (if any appears) must apply the same checks or use `fs-permissions.ts` from `src/platform/`.
- **Don't show notifications without checking preference.** Even if you wrap `NotificationService`, the preference check is inside `send()`. Don't duplicate the gate; don't call `notificationSend` from `perry/system` directly.
- **Don't write to read-only directories.** `appDataDir()` is the only writable location for config and recent-files. Writes anywhere else must go through `fs-permissions.ts` in `src/platform/`.
