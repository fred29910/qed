# qed — Cross-Platform Desktop App Implementation Plan (v1)

> Status: design + implementation blueprint. Source of truth for the
> `qed` skeleton built with the **Perry** TypeScript AOT compiler.
>
> Target hosts: **Windows 10/11**, **macOS 12+**, **Linux (Ubuntu 22.04+)**.
> UI toolkit on each host is whatever Perry provides (AppKit / Win32 / GTK4).
>
> This document is intentionally long. It captures every decision
> already taken in `src/`, the rationale behind the module split, the
> cross-platform quirks we worked around, and the build/packaging story.
> A reader who only has this file should be able to re-create the
> project from scratch.

---

## 0. Goals & non-goals

### 0.1 What this app is

A working desktop skeleton with:

- A **frameless main window** with a **custom title bar**.
- A **sidebar** that switches between three real feature modules:
  **File Manager**, **Settings**, **About**.
- A **second window** (Settings) that can be opened independently,
  supports *always-on-top*, *minimize-to-tray*.
- A **tray icon** with a context menu (Show / Open File Manager /
  Preferences / About / Quit).
- A **system menu bar** (macOS app menu, Windows / Linux menu bar) with
  cross-platform keyboard shortcuts for the same commands.
- **Local file I/O** through a single service seam.
- **JSON config persistence** with debounced disk flush and a
  forward-compatible schema.
- **System notifications** routed through the user's preference.
- **Optional "launch at login"** implemented per host.
- **Light / dark / system theme** with a runtime theme switch.

### 0.2 Non-goals (kept out of v1)

- No remote sync, no cloud, no telemetry.
- No SQLite — JSON config is enough for a skeleton. (The spec said
  "JSON or SQLite"; we pick JSON for the config so a fresh install
  doesn't need a native DB linker dance. The `FileService` reads /
  writes arbitrary blobs so a future SQLite module can plug in
  without changing the IPC layer.)
- No updater (`perry/updater` exists but is not wired in v1).
- No plugin system.

### 0.3 Hard constraints from the spec

1. **Perry only** — no third-party desktop framework (Electron, Tauri,
   Qt, etc.). All UI is `perry/ui`; all system access is `perry/system`.
2. **Same source, three binaries** — Windows `.exe` / `.msi`, macOS
   `.app` / `.dmg`, Linux `.AppImage` / `.deb`. All produced from
   `src/main.ts` with `--target` flags.
3. **Strict TypeScript** — `strict: true` plus the rest of the strict
   family. Every public function has JSDoc.
4. **ESLint + Prettier** — the lint script catches `any` (warning),
   unused vars (error), and the `curly` / `eqeqeq` baseline.

---

## 1. Environment setup

### 1.1 Toolchain matrix

| Tool | Version pin | Why |
|---|---|---|
| **Node.js** | 20.x LTS (only used to drive `npm run` / `perry` dev) | the AOT toolchain produces a single static binary that ships **no** Node runtime, so this is just for the dev loop. |
| **Perry CLI** | `@perryts/perry` (latest stable, ≥ 0.5 line) | the AOT compiler and runtime. |
| **TypeScript** | ^5.4 | `tsc --noEmit` for type-checking. The runtime is JS/TS compiled by Perry, not tsc. |
| **ESLint** | ^8.57 + `@typescript-eslint` ^7 | linting the source. |
| **Prettier** | ^3.2 | formatting. |
| **LLVM / clang** | any recent `clang`/`lld` on the build box | Perry uses LLVM to emit machine code. |
| **Linux dev libs** | `libgtk-4-dev libshumate-dev libgstreamer1.0-dev` | required to build Perry's GTK4 UI backend. |
| **Windows lightweight toolchain** | `winget install LLVM.LLVM && perry setup windows` | ~1.5 GB, no Visual Studio. |

### 1.2 Install steps

```bash
# 1. Global Perry
npm install -g @perryts/perry
# or: brew install perryts/perry/perry
# or: winget install PerryTS.Perry

# 2. Platform linker + system libs
# macOS:
xcode-select --install
# Linux (Ubuntu 22.04+):
sudo apt install build-essential libgtk-4-dev libshumate-dev libgstreamer1.0-dev
# Windows (PowerShell, admin not required):
winget install LLVM.LLVM
perry setup windows --accept-license

# 3. Sanity check
perry doctor

# 4. Project deps
npm install
```

### 1.3 Per-host notes

- **macOS**: the default `perry` target is macOS — no extra flag. The
  Apple platform is the one Perry has the most aggressive CI for, so
  it is the lowest-friction build host for the team.
- **Windows**: the lightweight LLVM toolchain is the recommended path.
  Produces identical binaries to the Visual Studio path. `perry setup
  windows` downloads the CRT + Windows SDK via xwin; one-time ~700 MB
  download.
- **Linux (Ubuntu 22.04+)**: we pin to glibc ≥ 2.31. The musl static
  build is **not** an option here because `perry/ui` on Linux uses
  GTK4 which depends on glibc.

---

## 2. Project layout

```
qed/
├── perry.toml                # build + bundle + per-platform config
├── package.json              # dev deps + npm scripts
├── tsconfig.json             # strict TS, path aliases
├── .eslintrc.json            # lint config
├── .prettierrc.json          # formatter config
├── .gitignore
├── docs/
│   └── plan_ui_v1.md         # this file
├── platforms/
│   ├── shared/icon.png       # source icon (used by all hosts)
│   ├── mac/assets/
│   ├── windows/assets/
│   ├── linux/assets/
│   ├── web/assets/
│   └── android/assets/
├── scripts/
│   ├── build-all.sh
│   ├── build-mac.sh
│   ├── build-windows.sh
│   ├── build-linux.sh
│   ├── package-mac.sh
│   ├── package-windows.sh
│   ├── package-linux.sh
│   └── msi-pack.ps1          # Windows: turn .exe into a .msi
└── src/
    ├── main.ts               # entry: wires App + IPC + services
    ├── app/
    │   ├── app-controller.ts        # top-level controller
    │   ├── app-controller-types.ts  # AppCommand / AppEvent shape
    │   └── theme.ts                 # light/dark palette
    ├── platform/
    │   ├── index.ts                 # barrel
    │   ├── platform.ts              # __platform__ helpers
    │   ├── paths.ts                 # ~/Library/Application Support, %APPDATA%, XDG
    │   ├── fs-permissions.ts        # explainFsError, write probe
    │   ├── autostart.ts             # per-host "launch at login"
    │   ├── menu-bar.ts              # AppKit-style menu bar adapter
    │   └── tray-adapter.ts          # cross-host tray quirks
    ├── types/
    │   ├── index.ts
    │   ├── config.ts                # AppConfig + DEFAULT_CONFIG
    │   └── ipc.ts                   # IpcRequest / IpcResponse + per-channel payloads
    ├── services/
    │   ├── index.ts
    │   ├── config-service.ts        # JSON persistence + change notifications
    │   ├── file-service.ts          # list / read / write / rename / delete
    │   ├── recent-files-service.ts  # "recently opened" list
    │   ├── notification-service.ts  # gated on config.notifications
    │   └── shell-service.ts         # openURL, revealInFileManager
    ├── state/
    │   └── app-state.ts             # global store + selectors
    ├── ipc/
    │   ├── index.ts
    │   ├── bus.ts                   # IpcBus: dispatch + subscribe
    │   └── handlers.ts              # channel → service wiring
    ├── ui/
    │   ├── theme.ts                 # palette tokens
    │   ├── title-bar.ts             # frameless title bar
    │   ├── sidebar.ts               # navigation rail
    │   ├── status-bar.ts            # bottom status row
    │   ├── toast.ts                 # transient notification banner
    │   ├── settings-window.ts       # secondary Window factory
    │   └── widgets.ts               # small reusable bits (Section, Row, …)
    └── modules/
        ├── file-manager/
        │   ├── index.ts
        │   ├── file-manager-view.ts
        │   └── file-operations.ts
        ├── settings/
        │   ├── index.ts
        │   ├── settings-view.ts
        │   └── settings-changes.ts
        └── about/
            ├── index.ts
            └── about-view.ts
```

### 2.1 Why this split?

- **`platform/`** isolates every "Perry-only call that varies by host"
  into a single tree. A new developer reading `src/platform/index.ts`
  gets the entire cross-platform surface in one screen.
- **`services/`** are the *only* modules allowed to import `fs` /
  `perry/system`. Everything else goes through IPC. That gives us a
  single mockable seam and keeps the UI free of try/catch noise.
- **`ipc/`** is the contract between UI and services. Handlers are
  registered at startup; UI calls `IpcBus.send(channel, payload)` and
  awaits the response (or subscribes to a one-shot channel).
- **`modules/`** are user-facing features. Each owns its view, its
  data fetches via the IPC bus, and its UI state.
- **`app/`** glues everything together: routes menu / tray commands,
  owns the main + settings windows, manages lifecycle.

---

## 3. Cross-platform adaptation layer (`src/platform/`)

### 3.1 `platform.ts` — `__platform__` constants

`__platform__` is a Perry compile-time constant (see
`references/platforms-apple.md`):

```
0  macOS        5  Web (WASM)
1  iOS          6  tvOS
2  Android      7  watchOS
3  Windows      8  visionOS
4  Linux
```

The compiler constant-folds `__platform__` comparisons and eliminates
the dead branch, so `if (isMacOS()) { … }` has **zero runtime cost**
on a Windows build.

Exports: `PLATFORM`, `getHostKind()`, `isDesktop()`, `isMacOS()`,
`isWindows()`, `isLinux()`, `platformLabel()`.

### 3.2 `paths.ts` — per-host standard paths

Perry implements `node:os` and `node:path` for real, so we use them
directly. The wrapper exists so callers don't sprinkle OS conditionals
and so the per-host conventions are documented in one place.

| Concept | macOS | Linux | Windows |
|---|---|---|---|
| `appDataDir()` | `~/Library/Application Support/qed` | `$XDG_DATA_HOME/qed` (fallback `~/.local/share/qed`) | `%APPDATA%\qed` |
| `cacheDir()` | `~/Library/Caches/qed` | `$XDG_CACHE_HOME/qed` | `%LOCALAPPDATA%\qed\Cache` |
| `logDir()` | `~/Library/Logs/qed` | `$XDG_STATE_HOME/qed` (fallback `~/.local/state/qed`) | `%LOCALAPPDATA%\qed\Logs` |
| `configFilePath()` | `<appDataDir>/config.json` | same | same |
| `recentFilesPath()` | `<appDataDir>/recent-files.json` | same | same |
| `autostartManifestPath()` | `~/Library/LaunchAgents/com.qed.app.plist` | `$XDG_CONFIG_HOME/autostart/qed.desktop` | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\qed.cmd` |
| `pathSeparator()` | `/` | `/` | `\` |
| `usesCrlfLineEndings()` | `false` | `false` | `true` |

Env-var reads are wrapped in a tiny `readEnv()` helper because
`process.env[name]` returns `string | undefined` in the type stubs —
the wrapper makes the lookup and the empty-string default explicit.

### 3.3 `fs-permissions.ts` — friendly error translation

Two responsibilities:

1. `checkFsAccess(path, tryWriteProbe)` — best-effort probe combining
   `statSync` and a small temp-file write. Returns a tagged union
   (`{ ok: true } | { ok: false, reason }`).
2. `explainFsError(err)` — maps common `fs` errors to a single
   user-facing string per host. We pattern-match on the *message*
   (`EACCES`, `EPERM`, `permission denied`, `ENOENT`, `EISDIR`,
   `ENOTDIR`, `ENOSPC`) rather than the numeric code because the
   shape varies across platforms.

The `tryWriteProbe` path is opt-in: it actually writes a file, so
callers (the Settings module) use it only when the user explicitly
asks "is this folder writable?".

### 3.4 `autostart.ts` — launch at login

Perry has no built-in "launch at login" API, so we write per-host
manifests by hand. The OS picks them up on next login.

- **macOS** — LaunchAgent plist at
  `~/Library/LaunchAgents/com.qed.app.plist`. We hard-code
  `com.qed.app` as the `Label` (it must be unique per machine);
  the user can change the slug via `APP_SLUG` in `paths.ts` but
  the Label is the actual `launchctl` identifier. The plist sets
  `RunAtLoad = true` and `KeepAlive = false` (we don't want
  respawns if the user quits).
- **Windows** — we drop a small `.cmd` file in the user's Startup
  folder:

  ```bat
  @echo off
  REM Auto-generated by qed autostart. Do not edit by hand.
  start "" "<path-to-qed.exe>"
  ```

  The `.cmd` form is the most portable; a real `.lnk` requires
  shell extensions that aren't guaranteed on Server Core.
- **Linux** — XDG `.desktop` file in
  `$XDG_CONFIG_HOME/autostart/qed.desktop`. Works on GNOME, KDE,
  XFCE, Cinnamon, MATE, Budgie, LXQt.

`enableAutostart(execPath?)`, `disableAutostart()`, and
`isAutostartEnabled()` are the public surface. `execPath` defaults
to `process.execPath`, which is the running binary on every host.

### 3.5 `menu-bar.ts` — AppKit-style menu bar

Perry's `menuBarCreate` / `menuBarAddMenu` / `menuBarAttach` is the
same API on every host, but the **placement and the bold "App" menu**
differ. We unify them:

- **macOS** — the first menu is the bold "App" menu containing
  `About <App>`, separator, `Hide`, `Hide Others`, `Show All`,
  separator, `Quit`. Then `File`, `Edit`, `View`, `Help`.
- **Windows / Linux** — there's no app menu. The first menu is
  `File`, with `Preferences…` and `Exit` items. Then `Edit`,
  `View`, `Help` (with `About` under Help).

The handler is a `CommandHandler` callback (`(command: AppCommand)
=> void`) so the controller can route the commands uniformly. The
list of `AppCommand` values is exhaustive: `app.about`,
`app.preferences`, `app.hide`, `app.hideOthers`, `app.showAll`,
`app.quit`, `file.new`, `file.open`, `file.save`, `edit.*`,
`view.toggleTheme`, `view.toggleAlwaysOnTop`, `help.docs`,
`help.openLogDir`.

### 3.6 `tray-adapter.ts` — Linux/Windows tray quirks

Perry's tray API is uniform, but the click conventions differ:

- **macOS** — left-click pops the menu. There is no "left-click =
  show window" split because the menu *is* the click target.
- **Windows / Linux** — left-click fires `onClick`, right-click pops
  the menu.

We build a single menu (Show Main Window / Open File Manager /
Preferences / About / Quit) and additionally wire `trayOnClick` on
Windows / Linux so left-clicking the icon shows the main window.
On macOS, the menu pops on every click (the platform-native
behaviour).

The icon path is empty for now (`trayCreate("")` → "●" placeholder)
so the skeleton runs on every host with zero asset work. A real
asset (`platforms/<host>/tray.png`) can be hot-swapped via
`traySetIcon` without re-compiling.

---

## 4. Shared types (`src/types/`)

### 4.1 `config.ts` — the persisted config shape

```ts
export type ThemeMode = "system" | "light" | "dark";

export interface AppConfig {
    readonly version: 1;
    readonly theme: ThemeMode;
    readonly autostart: boolean;
    readonly notifications: boolean;
    readonly backgroundMode: boolean;
    readonly lastFolder: string;
    readonly fontSize: number;
    readonly displayName: string;
}

export const DEFAULT_CONFIG: AppConfig = {
    version: 1,
    theme: "system",
    autostart: false,
    notifications: true,
    backgroundMode: false,
    lastFolder: "",
    fontSize: 13,
    displayName: "",
};
```

All fields are `readonly` because the config service hands out
clones; mutation goes through `update(patch)`. The `version: 1`
constant is asserted on every load so a corrupt file can't
silently upgrade the schema.

### 4.2 `ipc.ts` — message envelopes

```ts
export type IpcChannel =
    | "config:get" | "config:update"
    | "fs:list" | "fs:read" | "fs:write" | "fs:delete"
    | "fs:rename" | "fs:mkdir" | "fs:stat"
    | "shell:open-path" | "shell:open-url"
    | "notify:send"
    | "platform:info"
    | "recent:add" | "recent:list" | "recent:clear";
```

Each channel has a paired `XxxPayload` interface and (where the
return value is non-trivial) a `XxxResult` interface. The envelope
is a tagged union (`{ ok: true, value } | { ok: false, message,
detail? }`).

**Why an in-process bus?** Perry has no separate worker process
today, so this is a typed in-memory command dispatcher that
justifies the rest of the architecture. The interface matches a
JSON-RPC-ish envelope so a future worker-mode split is a
transport change, not a contract change.

---

## 5. Services (`src/services/`)

### 5.1 `config-service.ts` — JSON persistence

- Reads `<appDataDir>/config.json` once at construction. On
  missing / corrupt / wrong-shape file, returns `DEFAULT_CONFIG`.
- `update(patch)` merges into the in-memory copy, calls every
  listener, and schedules a debounced disk flush (250 ms).
- `flushNow()` is called from `onTerminate` so we never lose a
  pending write.
- `subscribe(listener)` returns an unsubscribe function. Listeners
  receive a fresh clone, so they can't mutate internal state by
  accident.

The merge logic (`mergeWithDefaults`) hand-validates each field
type rather than spreading blindly. That way a future schema
addition can be added without trusting whatever a hand-edited
JSON file claims.

### 5.2 `file-service.ts` — file / folder operations

Single seam for the UI to perform file/folder operations:

| Operation | Throws | Notes |
|---|---|---|
| `list(path, showHidden)` | readdir errors | Caps at 5 000 entries; sorts dirs-first, case-insensitive. |
| `read(path, encoding)` | if file > 32 MB | Encoding is `"utf-8"` or `"binary"` (base64). |
| `write(path, content, encoding)` | if NUL byte or empty | Creates parents; encodes base64 if asked. |
| `delete(path, recursive)` | if NUL byte or empty | `rmSync({ recursive, force: true })`. |
| `rename(from, to)` | if either path is bad | Creates parent of `to`; uses `renameSync`. |
| `mkdir(path, idempotent)` | if path is bad | `mkdirSync({ recursive: true })`; with `idempotent`, an existing path is OK. |
| `stat(path)` | statSync errors | Returns a tiny `FsStat` shape. |

The 32 MB cap and 5 000-entry cap exist because the UI is
synchronous and a giant file would freeze the main thread. Future
work can wrap the calls in `Promise.resolve().then(...)` if a
real-world need shows up.

`assertSafePath` rejects empty strings and NUL bytes. It does
**not** block writes into `appDataDir()` itself — settings live
there. Tighter rules (e.g. "don't delete a folder containing the
config") belong in the UI layer.

### 5.3 `notification-service.ts`

Thin wrapper over `perry/system.notificationSend`:

- Returns `false` if the user disabled notifications in config
  (no need to plumb that through every caller).
- Routes failures through `explainFsError` for uniform logging.

### 5.4 `recent-files-service.ts`

Persists the last 20 opened paths to
`<appDataDir>/recent-files.json`. `add(path)` dedups and moves
to front; `list()` returns most-recent-first; `clear()` empties.

### 5.5 `shell-service.ts`

- `openUrl(url)` — delegates to `perry/system.openURL`. On macOS
  this hits `NSWorkspace.open`; on Windows `ShellExecuteW`; on
  Linux `xdg-open`; on Web `window.open`.
- `revealInFileManager(path)` — uses platform-native "select in
  file manager" idioms: `open -R` (macOS), `explorer /select,`
  (Windows), `xdg-open <parent>` (Linux fallback — no portable
  "select file" command).

---

## 6. State container (`src/state/app-state.ts`)

A tiny pub-sub store that exposes:

- `currentRoute: "file-manager" | "settings" | "about"` — what's
  selected in the sidebar.
- `config: AppConfig` — last-known config (kept in sync with the
  ConfigService).
- `recentFiles: readonly string[]` — last-known recent list.
- `lastError: string | null` — most recent user-facing error,
  cleared by the toast.
- `isBusy: boolean` — set by long-running operations so the UI
  can show a spinner.
- `theme: ResolvedTheme` — "light" | "dark", resolved from
  `config.theme` × `isDarkMode()`.

The store has `subscribe(listener)` and an `emit(event)` helper.
It's deliberately small — anything with logic lives in the
controller or the relevant module.

---

## 7. IPC layer (`src/ipc/`)

### 7.1 `bus.ts` — `IpcBus`

A typed dispatcher that:

1. Generates request ids (8-hex-char random).
2. Calls the registered handler for a channel.
3. Resolves or rejects a `Promise` keyed by the request id.
4. Catches handler exceptions and converts them to `IpcErr`.

`send<T>(channel, payload, timeoutMs = 5000)` returns
`Promise<T>`; the bus itself never throws to the caller (errors
become `IpcErr`).

`register(channel, handler)` is called once at startup from
`src/ipc/handlers.ts`. Handlers receive the payload and return
the result (or throw — the bus wraps it).

### 7.2 `handlers.ts` — channel → service wiring

One function per channel, mapped onto the right service:

| Channel | Handler body |
|---|---|
| `config:get` | `ConfigService.snapshot()` |
| `config:update` | `ConfigService.update(payload.patch)` |
| `fs:list` | `FileService.list(path, showHidden)` |
| `fs:read` / `fs:write` / `fs:delete` / `fs:rename` / `fs:mkdir` / `fs:stat` | straight service calls |
| `shell:open-path` | `ShellService.revealInFileManager` |
| `shell:open-url` | `ShellService.openUrl` |
| `notify:send` | `NotificationService.send` (returns `{ delivered: boolean }`) |
| `platform:info` | build from the `platform/` module |
| `recent:add` / `recent:list` / `recent:clear` | `RecentFilesService` |

The handler is the only place where `try { … } catch (err) { … }`
exists around a service call. UI code sees a clean typed
`Promise<T>`.

---

## 8. UI primitives (`src/ui/`)

### 8.1 `theme.ts` — palette tokens

Two palettes: `LIGHT` and `DARK`. Each is a frozen object with
`background`, `surface`, `text`, `muted`, `accent`, `border`,
`danger`, `success`. Colors are RGBA floats in `[0,1]` (Perry
expects that range — hex bytes must be divided by 255).

`applyTheme(theme: ResolvedTheme)` sets CSS-like defaults on
known widgets. The actual theming is **imperative** (Perry has
no stylesheet), so we keep the palette centralized so all
modules read from the same source.

`currentTheme()` reads the resolved theme from the global state.

### 8.2 `title-bar.ts` — frameless title bar

The main window is `frameless: true`. The custom title bar is a
`HStack` containing:

- App name label (left).
- Centered "current module" title.
- Right-aligned window controls (minimize, maximize/restore, close).

The window controls call into the AppController:
- Minimize: `windowMinimize(handle)`.
- Maximize: `windowMaximize(handle)` / `windowRestore(handle)`
  toggling.
- Close: `windowHide(handle)` if background mode, else `windowClose(handle)`.

On macOS, the title bar still has a "traffic light" reservation
because the OS draws them in the top-left regardless of
`frameless`. We leave space for them.

### 8.3 `sidebar.ts` — navigation rail

`VStack` of 3 clickable rows: 📁 File Manager, ⚙️ Settings, ℹ️
About. Each is a `Button` styled to look like a list item. The
selected row uses the accent color as the background.

A horizontal divider separates the nav from a "Recent files"
list at the bottom of the sidebar. Clicking a recent file routes
the file manager to that path.

### 8.4 `status-bar.ts` — bottom row

Shows `lastError` (or empty), the current folder, and a small
"●" indicator for `isBusy`.

### 8.5 `toast.ts` — transient banner

A simple "slide down from the top" banner that shows the most
recent `lastError` for 4 seconds. Implemented as an absolutely
positioned overlay on the main `ZStack`.

### 8.6 `settings-window.ts` — secondary window factory

`createSettingsWindow(controller)` returns a `Window` handle:

- Title: "Settings — qed".
- Size: 640 × 480.
- Resizable: false (so the form layout doesn't break).
- Always-on-top by default (user-controllable from the View menu).
- Body: the Settings view (see §9.2).

`controller.openSettingsWindow()` hides the existing window if
shown (or shows it if hidden). `controller.closeSettingsWindow()`
hides without destroying (so reopening is instant).

### 8.7 `widgets.ts` — small reusable bits

- `Section(title, ...children)` — labeled vertical group.
- `Row(label, control)` — a labelled row used in the Settings
  form.
- `Badge(text, kind)` — small coloured pill (info / warn / error).

---

## 9. Modules (`src/modules/`)

### 9.1 File Manager

**Goal**: a small but real file browser. Not a clone of Finder —
just enough to demonstrate `fs:list`, `fs:read`, `fs:write`,
`fs:rename`, `fs:delete`, `fs:mkdir`, `fs:stat`.

**UI** (in `file-manager-view.ts`):

- **Path bar**: read-only `TextField` showing the current folder,
  plus a "↑" button to go up one level and a "🏠" button to go to
  `homedir()`.
- **Toolbar**: Refresh, New Folder, New File, Rename, Delete.
- **Listing**: `LazyVStack` of rows with icon (📁 / 📄), name
  (clickable to enter dir / open file), size, mtime. Hidden files
  are hidden unless the user toggles "Show hidden" in the toolbar.
- **Preview**: a side `TextArea` showing the file's content if it's
  a text file < 32 MB; otherwise a placeholder "Binary file,
  X bytes".

**State**:

- `currentPath: string` — starts at `homedir()` or the last
  `config.lastFolder` if it still exists.
- `selectedEntry: FsEntry | null` — the row the user clicked.
- `showHidden: boolean` — local toggle, persisted to config on
  close.

**Operations** (`file-operations.ts`):

- `refresh()` — `IpcBus.send("fs:list", { path, showHidden })`.
- `enter(entry)` — push onto a back-stack and `refresh()`.
- `up()` — pop the back-stack.
- `createFolder()`, `createFile()` — `fs:mkdir` / `fs:write`.
- `rename()` — `fs:rename`.
- `delete()` — `fs:delete` with `recursive: true` for directories,
  with a confirm dialog before.
- `revealInFinder()` — `shell:open-path`.
- `open()` — if file is text and ≤ 32 MB, show in preview; else
  call `shell:open-path` to hand off to the OS.

Recent files are pushed to the sidebar via `IpcBus.send("recent:add")`.

### 9.2 Settings

**Goal**: a real preferences form. No placeholders, no TODOs.

**UI** (in `settings-view.ts`):

- **Section: Appearance**
  - Theme: `Picker` — System / Light / Dark.
  - Font size: `Slider` (8–48). Live-updates the example text.
  - Display name: `TextField`.
- **Section: Behaviour**
  - Launch at login: `Toggle` — applies immediately via
    `enableAutostart()` / `disableAutostart()`.
  - Show notifications: `Toggle` — `config.update({ notifications })`.
  - Background mode: `Toggle` — calls `controller.setBackgroundMode`
    which hides the dock/taskbar icon.
- **Section: Storage**
  - Read-only path list:
    - App data: `appDataDir()`.
    - Cache: `cacheDir()`.
    - Logs: `logDir()`.
  - Each row has a "Reveal" button (`shell:open-path`).
  - "Open config.json" button — opens the JSON in the OS default
    text editor (`shell:open-path`).
- **Section: About** (in the Settings window only — the main
  window has its own About module)
  - Version, build number, platform label.
  - "Open log folder" button.

**State** is the live `config` snapshot from the store. Every
toggle / picker change calls `IpcBus.send("config:update", { patch })`
and the IPC layer applies it. The store is updated by listening to
`ConfigService` directly, so the UI re-renders without round-trip.

### 9.3 About

**Goal**: a real About page, not a stub.

**UI** (in `about-view.ts`):

- App icon (the source `platforms/shared/icon.png`).
- App name (large), version, build number, commit-ish (read from
  a generated `BUILD_INFO` constant if present, else "dev").
- "Made with Perry" line.
- **Credits** — a list of the open-source pieces (Perry runtime,
  GTK4 on Linux, AppKit on macOS, Win32 on Windows).
- **System info**:
  - Platform label.
  - Architecture (`os.arch()`).
  - Executable path.
  - App data dir.
- **Licenses** button — opens a `WebView` (or a modal `TextArea`
  on Windows where WebView has caveats) showing LICENSE.

---

## 10. App controller (`src/app/`)

The controller owns:

- The `mainWindow` handle.
- The optional `settingsWindow` handle.
- The tray handle (`TrayHandle`).
- The `IpcBus` reference.
- The current theme.
- The "background mode" state.

### 10.1 Command dispatch

`handleCommand(command: AppCommand)`:

```
app.about          → navigate mainWindow to "about"
app.preferences    → openSettingsWindow()
app.hide           → windowHide (mac only meaningful)
app.hideOthers     → no-op outside mac
app.showAll        → no-op
app.quit           → windowClose(mainWindow) + process.exit
file.new           → mainWindow → file-manager → createFile dialog
file.open          → openFileDialog → route file manager
file.save          → route file manager to "save current"
edit.*             → no-op (perry/ui has no text editor built in)
view.toggleTheme   → cycle System → Light → Dark → System
view.toggleAlwaysOnTop → setAlwaysOnTop on mainWindow
help.docs          → openUrl("https://docs.perryts.com/")
help.openLogDir    → shellService.revealInFileManager(logDir())
```

### 10.2 Lifecycle hooks

- `onActivate(() => { ... })` — fires on first show and on macOS
  re-activation. Shows the main window if hidden.
- `onTerminate(() => { ... })` — flushes the config, removes the
  tray icon, and calls `process.exit(0)`.
- `onAppDidEnterBackground(() => { ... })` / `onAppDidBecomeActive` —
  reserved for future background-task wiring; the v1 skeleton just
  logs.

### 10.3 Background mode

`controller.setBackgroundMode(enabled)`:

- macOS — `appSetActivationPolicy(enabled ? "accessory" : "regular")`.
- Windows — `windowSetToolWindow(mainWindow, enabled ? 1 : 0)`.
  (Removes the taskbar entry; the tray icon stays.)
- Linux — `windowSetSkipTaskbar(mainWindow, enabled ? 1 : 0)`.

### 10.4 Theme resolution

`resolveTheme(config.theme)`:

```ts
function resolveTheme(t: ThemeMode): ResolvedTheme {
    if (t === "light") return "light";
    if (t === "dark") return "dark";
    return isDarkMode() ? "dark" : "light";
}
```

The store listens to `ConfigService` updates and re-resolves when
`theme` changes. The `applyTheme` helper in `ui/theme.ts` then
walks the known widget handles and updates their backgrounds /
text colors.

### 10.5 Multi-window

`mainWindow` is created by `App({...})` — it's special because it
owns the run loop.

`settingsWindow` is created with `Window("Settings", 640, 480)` and
kept around (hide / show) so reopening is instant. Closing via the
window button hides; closing via the in-app Quit button destroys.

Both windows share the same `Controller`; the Settings window's
view binds to the same store and the same IPC bus, so a config
change in the Settings window is visible immediately in the main
window and vice versa.

### 10.6 Tray integration

On startup the controller calls `installTray(handleCommand,
"qed — Cross-platform desktop skeleton")`. The tray handle is
stored in the controller so it can be torn down on `onTerminate`.

---

## 11. Entry point (`src/main.ts`)

```ts
// 1. Instantiate services.
const config = new ConfigService();
const files = new FileService();
const recent = new RecentFilesService();
const notifications = new NotificationService(config);
const shell = new ShellService();

// 2. Wire IPC.
const bus = new IpcBus();
registerIpcHandlers(bus, { config, files, recent, notifications, shell });

// 3. Build the global store (subscribes to config + recent).
const store = new AppStore(config, recent);

// 4. Build the controller.
const controller = new AppController({ bus, config, files, recent, notifications, shell, store });

// 5. Register global menu + tray + lifecycle.
installAppMenu(controller.handleCommand);
installTray(controller.handleCommand, "qed");
onActivate(() => controller.onActivate());
onTerminate(() => controller.onTerminate());

// 6. Show the main window.
App({
    title: "qed",
    width: 1100,
    height: 720,
    frameless: true,
    vibrancy: "sidebar",   // macOS-only no-op elsewhere
    body: MainView(controller),
});
```

The order matters: services are constructed **before** the IPC bus
is registered so the handlers can capture them. The menu / tray are
installed before `App(...)` so the per-host plumbing is ready when
the window appears.

---

## 12. Cross-platform adaptation details

### 12.1 Path separators

Perry's `path.join` already normalizes separators per host. The
only place we hand-roll a path is `paths.ts`, and we always use
`path.join` (which is `posix.join` on Linux/macOS, `win32.join` on
Windows). UI code must use `path.join` too — no string
concatenation with `/` or `\` literals.

The one exception is the file manager: when we display a path in
a `TextField` we keep the native separator (so it round-trips
through the dialog). The internal representation is always
forward-slash (Perry normalizes anyway).

### 12.2 File permissions

- **macOS** — sandboxed apps need entitlements. We request
  `com.apple.security.files.user-selected.read-write` in
  `perry.toml` so the user-selected folder works. App-data dir is
  always writable.
- **Windows** — `%APPDATA%`, `%LOCALAPPDATA%`, Documents, Desktop
  are always writable. `Program Files` is not. We never write
  there.
- **Linux** — POSIX DAC. The OS's file dialog grants access to
  whatever the user picked. `~/.local/share` is always writable
  for the owning user.

`explainFsError` translates the most common error codes into
host-appropriate advice (see §3.3).

### 12.3 macOS menu bar

AppKit expects the app menu (the bold one with the app name) to
contain `About`, `Hide`, `Quit`. We install that menu first when
`isMacOS()` is true, and the perry runtime draws it at the top
right of the screen (next to the Apple menu). On Windows / Linux
there's no app menu; we start with `File`.

### 12.4 Linux system tray

KSNI (StatusNotifierItem) requires D-Bus. On KDE / XFCE /
Cinnamon / MATE / Budgie / LXQt it works out of the box. On
vanilla GNOME without the `appindicator` extension, the icon
doesn't render — the perry runtime logs a one-line warning and
the rest of the app keeps working. The README documents this so
users know to install `gnome-shell-extension-appindicator` if
they want the icon.

### 12.5 Windows smart-screen

Release binaries are not code-signed (no cert in this skeleton).
The first launch triggers "Windows protected your PC". The README
tells the user to click **More info → Run anyway** for personal
use, or sign the binary with `signtool.exe` for distribution.

---

## 13. Build, packaging, distribution

### 13.1 Compile commands

```bash
# macOS (default target on macOS host)
perry compile src/main.ts -o bin/qed --march x86-64-v2

# Windows
perry compile src/main.ts -o bin/qed.exe --target windows --march x86-64-v2

# Linux
perry compile src/main.ts -o bin/qed --target linux --march x86-64-v2
```

The `--march x86-64-v2` is pinned in `perry.toml` so the same
flag is applied on every host (Windows / Linux builds are
cross-compiled from a macOS dev box too).

### 13.2 One-shot build scripts

- `scripts/build-all.sh` — calls the per-platform script in
  sequence. Useful for CI.
- `scripts/build-mac.sh` — produces `bin/qed` (the binary) and
  `bin/qed.app` (the bundle, after `perry publish macos`).
- `scripts/build-windows.sh` — produces `bin/qed.exe` and
  invokes `scripts/msi-pack.ps1` to wrap it as a `.msi`.
- `scripts/build-linux.sh` — produces `bin/qed` and
  `perry publish linux` for the AppImage.

### 13.3 Packaging outputs

| Host | Format | Producer | Install command |
|---|---|---|---|
| macOS | `.dmg` (drag-to-Applications) | `productbuild` after `perry publish macos` | `open qed.dmg` → drag to `/Applications` |
| macOS | `.app` | `perry publish macos` | drop into `/Applications` |
| Windows | `.exe` | `perry compile --target windows` | double-click |
| Windows | `.msi` | `scripts/msi-pack.ps1` (wraps the `.exe` in WiX) | double-click → "Next, Next, Finish" |
| Linux | `.AppImage` | `perry publish linux` | `chmod +x qed.AppImage && ./qed.AppImage` |
| Linux | `.deb` | `perry publish linux --format deb` | `sudo dpkg -i qed.deb` |

### 13.4 Cross-compilation

Perry can cross-compile from any host to any other. The CI matrix
in `.github/workflows/build.yml` (sketched in §15) builds all three
artifacts on a single Linux runner using `perry setup windows` to
get the Windows SDK and `clang` for the macOS target.

---

## 14. Quality

### 14.1 Lint

```bash
npm run lint        # errors only
npm run lint:fix    # autofix where possible
```

The config (`eslint:recommended` + `@typescript-eslint/recommended`
+ `prettier`) catches:

- unused vars (error),
- implicit `any` (warn),
- missing `===` (error),
- missing braces (error).

`@typescript-eslint/no-explicit-any` is a **warning** because Perry's
generated `.d.ts` files use `any` heavily — we can't fix that,
but we should know when *our* code does it.

### 14.2 Type-checking

`npm run typecheck` runs `tsc --noEmit` against the strict
config. This is the most important gate: it catches null-handling
issues, missing payload types, and any drift between the `.d.ts`
stubs and the real code.

### 14.3 Format

`npm run format` runs `prettier --write`. `format:check` is the
CI gate.

### 14.4 JSDoc

Every exported function in `src/` has a JSDoc block with at
least a one-line summary and (where the contract isn't obvious)
`@param` and `@returns` tags. The config / IPC types have a
block-level doc on each interface explaining the field's role.

---

## 15. CI sketch (`.github/workflows/build.yml`)

```yaml
name: build
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
  build:
    needs: test
    strategy:
      matrix: { os: [ubuntu-latest, macos-latest, windows-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx --yes @perryts/perry setup --host ${{ matrix.os }}
      - run: ./scripts/build-${{ matrix.os == 'windows-latest' && 'windows' || (matrix.os == 'macos-latest' && 'mac' || 'linux') }}.sh
      - uses: actions/upload-artifact@v4
        with:
          name: qed-${{ matrix.os }}
          path: dist/
```

---

## 16. Platform compatibility matrix

| Feature | Windows 10/11 | macOS 12+ | Linux (Ubuntu 22.04+) |
|---|---|---|---|
| Frameless window | ✅ (`WS_POPUP`) | ✅ (`NSWindowStyleMask::Borderless`) | ✅ (`set_decorated(false)`) |
| Custom title bar | ✅ | ✅ | ✅ |
| Sidebar navigation | ✅ | ✅ | ✅ |
| Multi-window | ✅ | ✅ | ✅ |
| Always-on-top | ✅ (`SetWindowPos`) | ✅ (`NSWindow.level`) | ✅ (`set_modal(true)` best-effort) |
| Background mode | ✅ (`WS_EX_TOOLWINDOW`) | ✅ (`NSApp.setActivationPolicy`) | ✅ (`set_skip_taskbar`) |
| Tray icon | ✅ (Shell_NotifyIconW) | ✅ (NSStatusItem) | ✅ (KSNI over D-Bus) |
| System menu bar | ✅ (HMENU) | ✅ (NSMenu) | ✅ (GMenu) |
| Local file I/O | ✅ | ✅ (sandboxed) | ✅ |
| Config persistence | ✅ (JSON in %APPDATA%) | ✅ (JSON in ~/Library) | ✅ (JSON in XDG_DATA_HOME) |
| Notifications | ✅ (Toast) | ✅ (UNUserNotificationCenter) | ✅ (GNotification) |
| Launch at login | ✅ (Startup .cmd) | ✅ (LaunchAgent plist) | ✅ (XDG .desktop) |
| Dark mode | ✅ (Registry) | ✅ (`effectiveAppearance`) | ✅ (GTK settings) |
| JSON config | ✅ | ✅ | ✅ |
| Theme switch | ✅ | ✅ | ✅ |
| File dialogs | ✅ (IFileOpenDialog) | ✅ (NSOpenPanel) | ✅ (GtkFileChooserDialog) |

**Known limitations**:

- Linux tray on vanilla GNOME requires the `appindicator`
  extension; otherwise the icon doesn't render (a warning is
  logged at startup).
- Windows SmartScreen blocks unsigned binaries on first launch.
- macOS sandboxed builds need the user-selected-file entitlement,
  which is requested in `perry.toml`.
- The Windows `.msi` is produced by a WiX script because the
  Perry CLI emits a standalone `.exe` (not an installer). The
  `.msi` is optional — the `.exe` is fully self-contained.

---

## 17. README + developer onboarding

The `README.md` covers:

1. **What this is** — one paragraph + screenshot placeholder.
2. **Tech stack** — Perry + perry/ui + perry/system + Node
   stdlib (`fs`, `os`, `path`, `child_process`).
3. **Prerequisites** — see §1.
4. **Local dev** — `npm install`, `npm run dev` (live-reload),
   `npm run typecheck`, `npm run lint`, `npm run format`.
5. **Build** — see §13. `npm run build:mac` etc.
6. **Install** — copy-pasteable per-host steps.
7. **Platform notes** — known limitations per host (see §16).
8. **Project layout** — the tree from §2.
9. **Contributing** — `npm run lint` + `npm run typecheck` must
   pass; add a JSDoc to every public function.
10. **License** — MIT.

---

## 18. Open questions / future work

- **Updater** — `perry/updater` exists. Worth wiring in once we
  have a real distribution channel.
- **Auto-launch on macOS via SMLoginItemSetEnabled** — more
  robust than LaunchAgent, but requires a helper app. Skipped in
  v1.
- **Real tray icon** — once a designer ships `tray.png` /
  `tray.icns` / `tray.ico` assets.
- **Code signing** — outside the scope of a skeleton; the README
  documents the per-host commands.
- **Crash reporting** — `perry/background` + a remote endpoint
  could collect panics. Not in v1.

---

## 19. Summary of decisions

| Decision | Rationale |
|---|---|
| In-process IPC bus | Perry has no separate worker process today; the bus is a typed dispatcher that mirrors JSON-RPC so a future split is a transport change. |
| JSON config (not SQLite) | One less native dep; 5 KB of JSON is fine for ≤ 20 fields. |
| `frameless: true` on main window | Custom title bar is part of the spec; the spec calls for hiding the system default title bar. |
| Settings as a separate window | Spec calls for "at least main + settings window". Reuse is via hide/show so reopening is instant. |
| Launch-at-login via per-host manifest | Perry has no built-in API; per-host manifests are the OS-recommended approach. |
| Tray with placeholder icon | The skeleton runs with zero asset work; real assets are a hot-swap. |
| `__platform__` for branching | Compile-time constant; zero runtime cost. |
| Per-platform adapter in `platform/` | One tree for every cross-platform call; new contributors can grok the whole layer in one read. |
| Strict TS + ESLint + Prettier | Spec calls for it; no `any` in app code (generated stubs are exempt). |
