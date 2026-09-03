# file-manager
## OVERVIEW
Sidebar file-manager: directory listing, preview, CRUD. All FS access
through `IpcBus`. `FileManagerView` builds the sidebar widget. Pure helpers
in `file-operations.ts` wrap IPC payloads.

## STRUCTURE
```
index.ts              Module boundary: re-exports view + operations.
file-manager-view.ts  Sidebar widget (path bar, toolbar, listing, preview).
file-operations.ts    IPC wrappers: refresh, stat, createFolder, createFile,
                      rename, deleteEntry, readText, revealInFinder, pushRecent.
```

## WHERE TO LOOK
| Task | File | Notes |
|---|---|---|
| Add FS operation | `file-operations.ts` | Type a payload, `bus.send()`, export. |
| Change view | `file-manager-view.ts` | Uses `State<T>` from `perry/ui`. |
| Expose new API | `index.ts` | Add to re-export list. |

## CONVENTIONS
- `index.ts` is the only public surface. Import from barrel, not deep.
- `file-operations.ts` never touches `fs`. Every call is `bus.send()`.
- Reactive `State<T>` lives inside the view function, not module scope.

## ANTI-PATTERNS
- **No `fs` import.** All file ops through `IpcBus` + service layer.
- **Don't add `index.ts` elsewhere.** One boundary file is enough.
- **Don't swallow errors.** View catches and shows them in error row.
