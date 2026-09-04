# modules/about — About Page

**Generated:** 2026-09-04  Parent: ./AGENTS.md  Commit: 2966a60

## OVERVIEW

Sidebar route (`'about'`). Read-only page: app icon/name/version,
credits, a system-info table, and two actions ("Open log folder",
"Perry documentation"). Smallest module — 2 files, 1 export.

## STRUCTURE

```
about/
├── index.ts          # public surface: re-exports AboutView only
└── about-view.ts     # builds the page; takes a ShellService
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Build the page | `about-view.ts` | `AboutView(shell: ShellService): Widget`. Calls `describeEnvironment()` for host + paths. |
| Add a credit line | `about-view.ts` | Edit the `credits` array (lines 31-39). |
| Add a system-info row | `about-view.ts` | Add a `Row(...)` to the `Section('System info', ...)` block. |
| Add an action button | `about-view.ts` | `openLogBtn` / `docsBtn` in the `actionRow`. Both call `shell.*`. |
| Expose a new API | `index.ts` | Add to the re-export list. |

## CONVENTIONS

- `index.ts` is the only public surface. Import from the barrel, not deep.
- Route id is `'about'`. Sidebar at `src/ui/sidebar.ts:138-141`.
- The view takes a `ShellService` (never the controller) — shell actions go
  through `shell.revealInFileManager()` / `shell.openUrl()`, not through IPC.
- `describeEnvironment()` is imported from `app-controller.ts` — this is an
  intentional exception to the "never module → controller" rule (see
  ANTI-PATTERNS). It is a pure snapshot function with no side effects.

## ANTI-PATTERNS

- **No `fs` import.** The view never touches disk; the log path comes from
  `logger.currentFilePath()` and the folder reveal goes through `shell`.
- **Don't import the controller for side effects.** `describeEnvironment()`
  is the only controller import allowed here, and it is read-only. Any other
  controller import creates a cycle.
- **Don't use `console.*`.** Use `logger.error(category, msg, err?)` from
  `src/diag.ts`.
- **Don't add `index.ts` elsewhere.** One boundary file is enough.
- **Don't hardcode `process.execPath`** outside the system-info row — it is
  a runtime-only value and Perry AOT rejects compile-time `process` access.