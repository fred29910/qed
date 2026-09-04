# src/ipc/ — In-Process Message Bus

**Generated:** 2026-09-04  Parent: ./AGENTS.md  Commit: 2966a60

## OVERVIEW

Typed in-process command dispatcher. Single thread; no pre-emptive
concurrency. Every FS / shell / notification / config / log / view
operation funnels through `IpcBus.send()`. **Bus never throws** —
handler exceptions are caught and returned as `IpcErr` envelopes.

## STRUCTURE

```
ipc/
├── bus.ts          # IpcBus interface + concrete bus; never throws; normalizes handler errors
└── handlers.ts     # 17 channel registrations, each wrapped in trace() for per-handler logging
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Add a new IPC channel | `types/ipc.ts` (declare union + payload type) → `handlers.ts` (register with `trace()`) → call from caller | Three places must stay in sync. |
| Wrap handler with logging | `handlers.ts` | `trace<Req, Res>('channel:name', handler)` decorator. Default level is `info` (logger.ts). |
| Understand never-throws contract | `bus.ts` lines 126-128, 139-140 | All handler errors become `{ ok: false, message }` envelopes. |
| Bus registration errors | `bus.ts` line 70 | `send()` throws for "no handler registered" — that's a developer error, not a handler error. |

## CHANNELS (17 total)

| Group | Channels | Notes |
|---|---|---|
| config | `config:get`, `config:update` | Debounced flush via `ConfigService` |
| fs | `fs:list`, `fs:read`, `fs:write`, `fs:delete`, `fs:rename`, `fs:mkdir`, `fs:stat` | All routed through `FileService` |
| shell | `shell:open-path`, `shell:open-url` | `ShellService` (per-platform reveal) |
| notify | `notify:send` | Gated by `NotificationService` |
| platform | `platform:info` | OS / paths snapshot |
| recent | `recent:add`, `recent:list` | `RecentFilesService` |
| log (NEW 1818999) | `log:snapshot`, `log:current-file-path` | Read-only views into `logger` ring buffer |
| view (NEW 1818999) | `view:open-diagnostics` | Fires `openDiagnosticsWindow()` in controller |

## CONVENTIONS

- **`trace()` wrapper is mandatory.** Every `bus.register()` in `handlers.ts` is wrapped. This keeps bus.ts logger-free (per logger plan review B2 decision).
- **Payload types live in `src/types/ipc.ts`.** The `IpcChannel` union is the single source of truth for valid channel names. Adding a channel means: (1) add to the union, (2) add a payload type, (3) register a handler in `handlers.ts`, (4) call from a caller.
- **Bus never throws (handler errors).** Handlers may throw — bus catches and returns `IpcErr`. The caller checks `result.ok` and handles failures.
- **Bus throws (registration errors).** `send()` to an unregistered channel throws synchronously. This is a developer error caught at startup or first call, not a runtime handler failure.

## ANTI-PATTERNS

- **Don't bypass the bus.** Direct service calls from `app/` or `modules/` skip the handler-side logging and contract enforcement. Always go through `bus.send()`.
- **Don't add try/catch in handlers.** Let the bus catch and return `IpcErr`. Catching in a handler breaks the `trace()` decorator's error logging.
- **Don't import `fs` here.** Bus handlers delegate to `FileService`; they don't touch `fs` themselves.
- **Don't throw `Error` from a handler.** Return an error envelope (or let the bus convert exceptions).
- **No `console.*`.** Use `logger.*` from `src/diag.ts`. The `trace()` wrapper logs at handler entry/exit.
