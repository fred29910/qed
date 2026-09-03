# qed

A cross-platform desktop application skeleton built with the
[Perry](https://perryts.com/) TypeScript AOT compiler.

The same `src/` produces native binaries for **Windows 10/11**,
**macOS 12+**, and **Linux (Ubuntu 22.04+)**, with no third-party
desktop framework (no Electron, Tauri, or Qt).

## What you get

- Frameless main window with a custom title bar.
- Sidebar navigation across three real feature modules
  (File Manager, Settings, About).
- Secondary "Settings" window, always-on-top, hide / show on demand.
- System tray icon with a context menu.
- System menu bar (AppKit on macOS, HMENU on Windows, GMenu on
  Linux) with cross-platform keyboard shortcuts.
- Local file I/O through a single service seam.
- JSON config persistence with debounced disk flush.
- Light / dark / system theme with a runtime switch.
- Optional "launch at login" (per-host manifest: LaunchAgent plist,
  Windows Startup `.cmd`, XDG `.desktop`).
- System notifications gated on the user's preference.
- Per-platform "reveal in file manager" (`open -R` / `explorer
  /select,` / `xdg-open`).

## Prerequisites

- **Node.js 20.x LTS** — only used to drive `npm` and the Perry
  dev loop. The AOT toolchain produces a single static binary that
  ships no Node runtime.
- **Perry CLI** — `npm install -g @perryts/perry` (or
  `brew install perryts/perry/perry`, or
  `winget install PerryTS.Perry`).
- A C linker / SDK for your host:
  - **macOS** — `xcode-select --install`
  - **Linux** — `sudo apt install build-essential libgtk-4-dev libshumate-dev libgstreamer1.0-dev`
  - **Windows** — `winget install LLVM.LLVM && perry setup windows --accept-license`

Run `perry doctor` once the toolchain is in place to verify it.

## Quick start

```bash
git clone <this repo>
cd qed
npm install
npm run dev          # live-reload (mac / linux only)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format:check # prettier
```

## Build

```bash
npm run build:mac      # bin/qed + bin/qed.app
npm run build:windows  # bin/qed.exe
npm run build:linux    # bin/qed
npm run build:all      # all three in sequence
```

Packaging (optional, on top of the binary):

```bash
npm run package:mac      # bin/qed.dmg
npm run package:windows  # bin/qed.msi  (requires WiX)
npm run package:linux    # bin/qed.AppImage + bin/qed.deb
```

The `--march x86-64-v2` baseline is pinned in `perry.toml` so the
same flag is applied on every host (Windows / Linux builds are
cross-compiled from a macOS dev box too).

## Project layout

```
qed/
├── perry.toml                # build + bundle + per-platform config
├── package.json              # dev deps + npm scripts
├── tsconfig.json             # strict TS, path aliases
├── .eslintrc.json            # lint config
├── .prettierrc.json          # formatter config
├── docs/plan_ui_v1.md        # design + implementation blueprint
├── platforms/                # per-host assets (icons, .desktop, etc.)
├── scripts/                  # per-platform build + packaging scripts
├── types/                    # ambient .d.ts shims for `perry/*` until
│                             # the user runs `perry types` for the
│                             # real generated stubs
└── src/
    ├── main.ts               # entry: wires App + IPC + services
    ├── app/                  # top-level controller + theme
    ├── platform/             # cross-platform adaptation layer
    ├── types/                # shared types (config, ipc envelopes)
    ├── services/             # the *only* modules that touch `fs` /
    │                         # `perry/system` directly
    ├── state/                # global app store
    ├── ipc/                  # in-process bus + handlers
    ├── ui/                   # widgets, title bar, sidebar, status,
    │                         # toast, settings-window factory
    └── modules/              # user-facing features
        ├── file-manager/     # path bar, listing, preview
        ├── settings/         # preferences form
        └── about/            # about page
```

See [`docs/plan_ui_v1.md`](docs/plan_ui_v1.md) for the full design
rationale.

## Platform notes

- **macOS** — the default `perry` target. The first launch on
  macOS 13+ may require **Right-click → Open** the first time
  because the binary is unsigned. The plist at
  `~/Library/LaunchAgents/com.qed.app.plist` is written when the
  user enables "Launch at login" in Settings.
- **Windows** — produced by `perry compile --target windows`. The
  standalone `.exe` is fully self-contained. The optional `.msi` is
  built with WiX (`scripts/msi-pack.ps1`); SmartScreen blocks
  unsigned binaries on first launch — click **More info → Run
  anyway** for personal use, or sign with `signtool.exe` for
  distribution.
- **Linux** — pinned to glibc ≥ 2.31. The musl static build is not
  available because `perry/ui` on Linux uses GTK4. The tray icon
  requires the `appindicator` extension on vanilla GNOME; on KDE,
  XFCE, Cinnamon, MATE, Budgie, and LXQt it works out of the box.

## Contributing

`npm run lint` and `npm run typecheck` must pass. Add a JSDoc block
to every public function. Don't add `any` to your own code (Perry's
generated `.d.ts` files use it, but ours shouldn't).

## License

MIT.
