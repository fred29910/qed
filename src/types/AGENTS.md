# src/types/ — Shared Type Contracts

**Generated:** 2026-09-03  Parent: ./AGENTS.md  Commit: 1818999

## OVERVIEW

Barrel of two contracts: persisted config schema (AppConfig v2) and IPC
envelope types (IpcChannel union + per-channel payload types). These are
the only place where the shape of cross-module data is declared.

## STRUCTURE

```
types/
├── index.ts        # barrel — re-exports from config.ts + ipc.ts
├── config.ts       # AppConfig (schema v2), ThemeMode, version migration helpers
└── ipc.ts          # IpcChannel union (17 members), IpcOk/IpcErr envelope, per-channel payload types
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Bump config schema | `config.ts` | Increment `SCHEMA_VERSION` (currently `2 as const`). Add migration in `services/config-service.ts`. Add field with default. |
| Add a config field | `config.ts` | Update `AppConfig` interface + INITIAL in `state/app-state.ts` + DEFAULT in `config-service.ts`. |
| Add an IPC channel | `ipc.ts` | Add to `IpcChannel` union + add a payload type. Register handler in `ipc/handlers.ts`. |
| Add an error envelope | `ipc.ts` | `IpcErr<T = never>` — `kind: 'err', message: string`. |
| Dead code | `ipc.ts:187` | `LogLevelUpdatePayload` is defined but never imported. Wire it into a handler or remove. |

## CONVENTIONS

- **Barrel re-export only.** Import types from `../types/` (or `../types/index.js`), not from individual files unless avoiding a cycle.
- **`as const` for version.** `SCHEMA_VERSION` is a literal type, not a number — migration code uses it for switch exhaustiveness.
- **Channel union is exhaustive.** `IpcChannel` is the single source of truth for valid channel names. Bus handlers must use one of these names.
- **Payload types are `readonly` by convention.** Most payload types use `readonly` fields to prevent accidental mutation across the bus boundary.
- **AppConfig v2 (1818999)** added the `logLevel: LogLevel` field (default `'info'`). v1 → v2 migration: fill `logLevel` from `'info'` if missing.

## ANTI-PATTERNS

- **Don't add `as any` here.** `no-explicit-any` is warn; `types/` should be type-safe by example.
- **Don't import `fs` or `perry/*` runtime.** This directory is types-only (compile-time only). Runtime imports go elsewhere.
- **Don't duplicate types in `app/` or `modules/`.** Re-use the canonical types from here.
- **Don't change `SCHEMA_VERSION` without a migration.** The migration must run in `ConfigService.update()` / parse path before any consumer reads the config.
- **Don't import `console.*` or `logger` here.** Types don't log. If you need a side effect, you're in the wrong directory.
