# settings — Preferences & Advanced Section

**Generated:** 2026-09-03  Parent: ./AGENTS.md  Commit: 1818999

## OVERVIEW

Sidebar preferences module. The body of the always-on-top settings window.
Hosts Appearance / Behaviour / Storage / About sections plus the Advanced
section added in 1818999 (log level picker, log file path, copy entries,
open log viewer).

## STRUCTURE

```
settings/
├── index.ts              # barrel: SettingsView + 6 onChange handlers
├── settings-view.ts      # preferences form (Appearance / Behaviour / Storage / About / Advanced)
└── settings-changes.ts   # pure config wrappers — onThemeChange, onFontSizeChange, onDisplayNameChange, onAutostartToggle, onNotificationsToggle, onBackgroundModeToggle
```

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Add a preference row | `settings-view.ts` | Append to the relevant section. |
| Wire a config change | `settings-changes.ts` | Add `onXChange` wrapper. `bus.send('config:update', { patch })` + side effects (e.g. `applyTheme()`). |
| Add a new section | `settings-view.ts` | Add after the existing 5 sections; the Advanced section is the latest (1818999). |
| Change log level / log file UI | `settings-view.ts` lines 152-206 | Advanced section: log level picker, current log file path + Reveal, "Copy recent entries" (ring buffer), "Open log viewer" button (fires `view:open-diagnostics`). |

## CONVENTIONS

- `index.ts` is the only public surface. Import from barrel, not deep.
- `settings-changes.ts` is **pure** — no UI imports, no `perry/ui`. Just `bus.send('config:update', ...)` + post-write side effects.
- Route id is `'settings'`. Sidebar at `src/ui/sidebar.ts:138-141`.
- Window: `src/ui/settings-window.ts` is the factory (always-on-top). Body comes from this module.

## ANTI-PATTERNS

- **No `fs` import.** All persistence via `ConfigService` (through the bus).
- **No `perry/ui` in `settings-changes.ts`.** Keep it side-effect free for testability.
- **Don't add `index.ts` elsewhere.** One boundary file is enough.
- **No `console.*`.** Use `logger.error(category, msg, err?)` from `src/diag.ts`.
- **No TODOs / HACK / FIXME** (explicit ban in this file at line 4). Comment limitations if needed.
- **No placeholders.** "No placeholders, no TODOs" is enforced here.
