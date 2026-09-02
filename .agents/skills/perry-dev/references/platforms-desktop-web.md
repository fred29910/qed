<!-- Perry docs bundle: platforms-desktop-web.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/platforms/windows.md -->

# Windows

Perry compiles TypeScript apps for Windows using the Win32 API.

## Requirements

- Windows 10 or later by default (Windows 7 SP1 / Windows 8 supported via `--min-windows-version=7|8` — see [Windows 7 Compatibility](https://docs.perryts.com/platforms/windows-7.html) for the trade-offs)
- A linker toolchain — either of these two options:

### Option A — Lightweight (recommended, ~1.5 GB, no Visual Studio)

Uses LLVM's `clang` + `lld-link` plus an xwin'd copy of the Microsoft CRT + Windows SDK libraries. No admin rights, no Visual Studio install.

```powershell
winget install LLVM.LLVM
perry setup windows
```

`perry setup windows` downloads ~700 MB (unpacks to ~1.5 GB) at `%LOCALAPPDATA%\perry\windows-sdk` after prompting you to accept the Microsoft redistributable license. Pass `--accept-license` to skip the prompt in CI. Partial downloads resume safely on re-run.

### Option B — Visual Studio (~8 GB)

If you already have Visual Studio installed, add the C++ workload via the Visual Studio Installer → *Modify* → check **Desktop development with C++**. Or install standalone Build Tools:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override `
  "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Both options produce identical binaries — Perry picks Option A when the xwin'd sysroot is present, Option B otherwise. Run `perry doctor` to see which is active.

## Building

```powershell
perry compile app.ts -o app.exe --target windows
```

For a runnable starting point, see [`examples/windows_ui_demo.ts`](https://github.com/PerryTS/perry/blob/main/examples/windows_ui_demo.ts) — a small window exercising Text, Button, TextField, Slider, and a `setInterval` timer:

```powershell
perry examples/windows_ui_demo.ts -o windows_ui_demo
.\windows_ui_demo.exe
```

## UI Toolkit

Perry maps UI widgets to Win32 controls:

| Perry Widget | Win32 Class |
|-------------|------------|
| Text | Static HWND |
| Button | HWND Button |
| TextField | Edit HWND |
| SecureField | Edit (ES_PASSWORD) |
| Toggle | Checkbox |
| Slider | Trackbar (TRACKBAR_CLASSW) |
| Picker | ComboBox |
| ProgressView | PROGRESS_CLASSW |
| Image | GDI |
| VStack/HStack | Manual layout |
| ScrollView | WS_VSCROLL |
| Canvas | GDI drawing |
| Form/Section | GroupBox |

## WinUI 3 (Fluent) target

`--target windows-winui` is an opt-in backend for apps that want native WinUI
3 controls and Fluent window chrome. The default `--target windows` path is
unchanged and continues to use Win32/GDI.

The Fluent backend currently maps Text, Button, TextField, SecureField,
Toggle, Slider, ProgressView, VStack, HStack, ZStack, Spacer, Divider,
ScrollView, Form, Section, and LazyVStack through Windows Reactor. Platform
services continue to reuse the established Win32 implementation. Other visual
controls retain their ABI entry points and will gain Fluent mappings
incrementally.

Perry emits a framework-dependent, unpackaged WinUI app. Install the stable
[Windows App SDK 2.0 runtime](https://learn.microsoft.com/windows/apps/windows-app-sdk/downloads)
for the executable's architecture (x64 or ARM64) on every target machine.
Version 2.0.1 or newer is accepted. Microsoft documents the runtime and
bootstrap requirements in its
[deployment guide for unpackaged apps](https://learn.microsoft.com/windows/apps/windows-app-sdk/deploy-unpackaged-apps).

Build and run the ToDo sample from a Perry checkout:

```powershell
cargo build --release -p perry-ui-windows-winui
cargo run --release -p perry -- compile docs/examples/ui/state/todo_app.ts `
  --target windows-winui -o todo-winui.exe
.\todo-winui.exe
```

The compiler copies `Microsoft.WindowsAppRuntime.Bootstrap.dll` and
`resources.pri` beside the generated executable, including on link-cache hits.
Keep both files next to the `.exe` when redistributing it. If the Windows App
SDK runtime cannot be initialized, Perry reports the reason when
`PERRY_WINUI_DIAG=1` is set and uses the Win32 backend instead.

## Windows-Specific APIs

- **Menu bar**: HMENU / SetMenu
- **Dark mode**: Windows Registry detection
- **Preferences**: Windows Registry
- **Keychain**: CredWrite/CredRead/CredDelete (Windows Credential Manager)
- **Notifications**: Toast notifications
- **File dialogs**: IFileOpenDialog / IFileSaveDialog (COM)
- **Alerts**: MessageBoxW
- **Open URL**: ShellExecuteW

## Troubleshooting

### `LNK1181: cannot open input file 'user32.lib'`

The linker couldn't find the Windows SDK libraries. Perry probes the registry (`KitsRoot10`) and the standard `Windows Kits\10\Lib\<ver>\um\x64` install paths; when the probe fails it prints a warning listing the paths it tried. Fixes, in order of preference:

- Run `vcvars64.bat` before `perry compile` (it sets the `LIB` environment variable)
- Install the Windows 10/11 SDK via the Visual Studio Installer
- Set `LIB` manually to your SDK's `um\x64;ucrt\x64` directories

### `LNK1158: cannot run 'mt.exe'`

MSVC `link.exe` shells out to the Windows SDK's `mt.exe` to embed the UI visual-styles manifest, and `mt.exe` isn't normally on `PATH` outside a `vcvars64.bat` shell. Perry locates the SDK `bin` directory and puts it on the linker's `PATH` automatically (issue #6023), so you shouldn't see this error anymore. If `mt.exe` isn't installed anywhere, Perry skips the manifest embed with a warning instead of failing — common controls render in the classic (unthemed) look until you install the Windows 10/11 SDK. `lld-link` (Option A) never needs `mt.exe`.

### Library outputs work with either toolchain

The lightweight LLVM and full MSVC options both cover executable and library
outputs:

- `--staticlib` prefers MSVC `lib.exe`, then LLVM `llvm-lib`, then
  `llvm-ar --format=coff`.
- `--dylib` prefers LLVM `lld-link` and falls back to MSVC `link.exe`.
  Perry verifies that the linker actually wrote the DLL; older MSVC toolsets
  that silently omit it produce an actionable error recommending `lld-link`.

### SmartScreen blocks a downloaded `perry.exe`

Release binaries are not code-signed, so a `perry.exe` downloaded from GitHub Releases triggers "Windows protected your PC". Click **More info** → **Run anyway**. Installing via `winget` is generally less noisy than a raw download.

### Link fails with `os error 32` or `os error 5`

A previous build of your app is still running and holds a lock on the output `.exe`, so the linker can't overwrite it. Close the app (or `taskkill /IM app.exe /F`) and re-run the compile.

## Next Steps

- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system


---

<!-- source: docs/src/platforms/windows-7.md -->

# Windows 7 Compatibility

Perry supports compiling executables that run on Windows 7 SP1 (and Windows 8 / 8.1) — opt-in via the `--min-windows-version` flag. The default target stays Windows 10+ to preserve full DPI fidelity and modern OS integration; legacy support is one flag away when you need it.

This page covers what works, what degrades, what's outright impossible, and how to validate your build before shipping.

## TL;DR

```bash
perry compile app.ts -o app.exe --target windows --min-windows-version=7
```

Produces a PE marked Win7-compatible. Perry's UI runtime resolves the Win10-only DPI APIs lazily at startup and falls back through Win8.1 → Vista primitives, so the binary starts on Win7 SP1. Most UI widgets work. Some cosmetic effects (rounded corners, dark titlebar) silently no-op. **No JavaScript-module imports allowed** on Win7 — the V8 runtime is Win10+ unconditional.

## Why this is opt-in

Two things make a Win7-compatible PE different from a default Perry build:

1. **The PE subsystem version field.** Default Perry builds let the linker pick (currently `/SUBSYSTEM:WINDOWS` with no version, which marks the binary as needing Win8+). Win7 needs `/SUBSYSTEM:WINDOWS,5.1` or `/SUBSYSTEM:CONSOLE,5.1`. The `,5.1` suffix is the [PE subsystem ABI](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#optional-header-windows-specific-fields-image-only) declaration of "I claim to run on Windows NT 5.1 or higher" — the OS loader reads this field before deciding whether to load the binary.

2. **Win10-only API calls become runtime-resolved.** Perry's UI library calls `SetProcessDpiAwarenessContext` (Win10 1607) and `GetDpiForSystem` (Win10 1607) for per-monitor v2 DPI awareness. Hard-importing them via `extern "system"` would emit IAT entries that the OS resolves *before* `main()` runs — on Win7, the loader fails the process with "entry point not found in user32.dll" before any Rust code can run. With `--min-windows-version=7` (and on default builds too — the retrofit is unconditional), Perry resolves these symbols lazily via `LoadLibraryW + GetProcAddress` and falls back through:

   | Tier | API | Min Windows |
   | --- | --- | --- |
   | 1 | `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` | Windows 10 1607 |
   | 2 | `SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE)` | Windows 8.1 |
   | 3 | `SetProcessDPIAware()` | Windows Vista |

   System DPI lookup uses the same lazy pattern: `GetDpiForSystem` (Win10) → `GetDC + GetDeviceCaps(LOGPIXELSY)` (Win2000+).

The `--min-windows-version` flag controls only (1) — the PE marker. The lazy DPI resolution from (2) is always active because it costs essentially nothing and makes default builds more robust against being run on stripped-down Windows installs.

## Accepted values

| `--min-windows-version` | Subsystem suffix | Targets | Default? |
| --- | --- | --- | --- |
| `10` | (none — linker default) | Windows 10+ | yes |
| `8` | `,6.02` | Windows 8 / 8.1+ | no |
| `7` | `,5.1` | Windows 7 SP1+ | no |

Anything else is a hard error at compile time — typos like `--min-windows-version=11` fail loudly instead of silently behaving like the default.

## What works on Win7

The same audit that produced this feature found 12 KLOC of Win32 UI code in `perry-ui-windows` and 5 calls that touch Win10+ APIs. The 5 break down as 2 hard blockers (now lazy-resolved) and 3 cosmetic-effect calls that already failed soft and silently no-op on Win7. So the bulk of the UI surface — every standard widget — works on Win7 SP1:

- All layout containers (`VStack`, `HStack`, `ZStack`, `ScrollView`, `Spacer`, `Divider`)
- All input widgets (`Button`, `TextField`, `SecureField`, `Toggle`, `Slider`, `Picker`, `ProgressView`)
- `Text`, `Canvas`, `Image` (file + symbol)
- `Form` and `LazyVStack`
- File / folder open / save dialogs
- Clipboard access
- Audio (WASAPI is Vista+)
- Keyboard shortcuts, menus, toolbars
- Multi-window
- The full `perry-runtime` and `perry-stdlib` surface — `fs`, `http`, `crypto`, `child_process`, `Date`, `Buffer`, etc.

## What degrades silently

These behaviors target Win10 / Win11 features. On Win7 the API call returns an error code that Perry already swallows; the binary runs, but the visual effect is missing:

- **DPI quality.** Win7 has system-wide DPI only — moving a window between monitors with different DPI doesn't trigger re-scaling. Per-monitor v2 (font hinting, dialog scaling) is Win10 1607+.
- **Dark titlebar.** `DWMWA_USE_IMMERSIVE_DARK_MODE` is Win10 1809+. Titlebar follows the system theme on Win7 (light only on stock Win7).
- **Rounded window corners.** `DWMWA_WINDOW_CORNER_PREFERENCE` is Win11+. Frameless windows have square corners on Win7 / Win10.
- **Mica / Acrylic backdrop.** `DWMWA_SYSTEMBACKDROP_TYPE` is Win11+. Backdrop falls through to the standard window background on Win7 / Win10.

## What is impossible

**`perry/jsruntime` (V8 / deno_core) is Win10+ unconditional.** Anything in your project that imports a `.js` module from `node_modules` triggers `--enable-jsruntime`, which links against deno_core, which embeds V8, which won't load on Win7. There's no fallback for this — Win7 builds must avoid JS-module imports entirely. If your project compiles cleanly without `--enable-jsruntime` (i.e. only TypeScript imports, only Perry-native packages), you're good.

**Universal Windows Platform (UWP / WinRT) APIs.** Perry doesn't currently use these, but if a future feature does (e.g. modern toast notifications), it'll be Win10+ only. The runtime + stdlib audit was clean as of v0.5.395.

## How the lazy DPI resolution works

The retrofit lives in `crates/perry-ui-windows/src/dpi_compat.rs`. It exposes two functions, both safe to call on any Windows version from Vista onward:

```rust,no-test
pub fn set_process_dpi_awareness_compat();
pub fn get_system_dpi_compat() -> u32;
```

Internally each function:

1. Calls `LoadLibraryA("user32.dll")` (and `shcore.dll` for the Win8.1 tier) — both are loaded into every Win32 process by the kernel before `main`, so the call is a cheap handle lookup.
2. Calls `GetProcAddress` to find the desired symbol. Caches the result (success or failure) in an `AtomicPtr` + `AtomicU8` pair, so the lookup runs at most once per process.
3. Falls through to the next tier on miss. `set_process_dpi_awareness_compat` ends with `SetProcessDPIAware()` (Vista+, hard-imported because every supported Windows has it). `get_system_dpi_compat` ends with `GetDeviceCaps(LOGPIXELSY)` (Win2000+, dead reliable).

After the cache is warm — i.e. after `app_create` runs once — every subsequent DPI query is a single atomic load + indirect call. No measurable runtime cost vs. a hard-imported call.

## Validating a Win7 build

Perry's CI and dev hosts don't have Win7 VMs. If you ship to Win7 you need to validate the binary yourself. Three checks:

### 1. PE subsystem version

Use `dumpbin /headers app.exe | findstr "subsystem"` (MSVC) or `objdump -p app.exe | grep "MajorOSVersion"` (LLVM):

```text
$ dumpbin /headers app.exe | findstr "subsystem"
            5.01 subsystem version
               2 subsystem (Windows GUI)
```

The `5.01` confirms the PE is Win7-compatible. A default build shows `6.00` or higher.

### 2. Imports

Use `dumpbin /imports app.exe | findstr /i "user32"` (MSVC) or `objdump -p app.exe | grep -A20 "DLL Name: user32"` (LLVM). Confirm that `SetProcessDpiAwarenessContext` and `GetDpiForSystem` are **not** in the user32.dll import list. If they are, the lazy retrofit isn't taking effect — likely you've added a `use windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext;` somewhere that pulls the symbol back in.

### 3. Run on a Win7 SP1 VM

There's no substitute for actually launching the binary. Microsoft's free Win7 evaluation VM (no longer hosted directly by Microsoft, mirrored on archive.org) is the canonical reference image. Worth keeping a snapshot for regression checks.

## Caveats and gotchas

- **The MSVC linker may warn** about subsystem version `,5.1` being below the C runtime's stated minimum on newer toolchains. The warning is benign — the CRT itself runs on Win7, the warning is conservative. Watch for hard errors, not warnings.
- **xwin sysroot setup is unchanged.** Cross-compiling from macOS / Linux still uses the `perry setup windows` xwin'd toolchain. Nothing in `--min-windows-version` changes the SDK requirements.
- **Static-link the CRT** if you want the binary to run on a clean Win7 SP1 install with no Visual C++ Redistributable. Confirm the binary doesn't import `vcruntime140.dll` / `msvcp140.dll` via the dumpbin/objdump check above.
- **`perry/thread`'s SRWLOCK is Vista+, fine.** Perry's threading primitives use Rust std, which uses SRWLOCK on Windows since Rust 1.42. No `WaitOnAddress` (Win8+) involvement on the supported Rust versions.

## Issue tracking

This feature landed as the resolution to closed issue [#303](https://github.com/PerryTS/perry/issues/303). If you hit a Win7-specific failure that isn't covered here, please file a follow-up referencing this page so we can extend the audit.


---

<!-- source: docs/src/platforms/linux.md -->

# Linux (GTK4)

Perry compiles TypeScript apps for Linux using GTK4.

## Requirements

GTK4 + libshumate (MapView) + GStreamer (audio playback) development libraries.
The release-packages CI pins to these and a build-from-source fails without
them. Cairo comes in as a transitive dep of GTK4 on every distro.

```bash
# Ubuntu / Debian
sudo apt install libgtk-4-dev libshumate-dev libgstreamer1.0-dev

# Fedora
sudo dnf install gtk4-devel libshumate-devel gstreamer1-devel \
                 gstreamer1-plugins-base-devel

# Arch
sudo pacman -S gtk4 libshumate gstreamer gst-plugins-base
```

If you only need the CLI (compiling for non-Linux targets) and won't build
`perry-ui-gtk4` locally, you can skip libshumate and gstreamer.

## Building

```bash
perry app.ts -o app --target linux
./app
```

## UI Toolkit

Perry maps UI widgets to GTK4 widgets:

| Perry Widget | GTK4 Widget |
|-------------|------------|
| Text | GtkLabel |
| Button | GtkButton |
| TextField | GtkEntry |
| SecureField | GtkPasswordEntry |
| Toggle | GtkSwitch |
| Slider | GtkScale |
| Picker | GtkDropDown |
| ProgressView | GtkProgressBar |
| Image | GtkImage |
| VStack | GtkBox (vertical) |
| HStack | GtkBox (horizontal) |
| ZStack | GtkOverlay |
| ScrollView | GtkScrolledWindow |
| Canvas | Cairo drawing |
| NavigationStack | GtkStack |

## Linux-Specific APIs

- **Menu bar**: GMenu / set_menubar
- **Toolbar**: GtkHeaderBar
- **Dark mode**: GTK settings detection
- **Preferences**: GSettings or file-based
- **Keychain**: libsecret
- **Notifications**: GNotification
- **File dialogs**: GtkFileChooserDialog
- **Alerts**: GtkMessageDialog

## Styling

GTK4 styling uses CSS under the hood. Perry's styling methods (colors, fonts, corner radius) are translated to CSS properties applied via `CssProvider`.

## Testing with Geisterhand

Perry's built-in UI fuzzer works on Linux/GTK4. Screenshots use `WidgetPaintable` + `GskRenderer` for pixel-accurate capture.

```bash
perry app.ts -o app --target linux --enable-geisterhand
./app
# In another terminal:
curl http://127.0.0.1:7676/widgets
curl http://127.0.0.1:7676/screenshot -o screenshot.png
```

See [Geisterhand](https://docs.perryts.com/testing/geisterhand.html) for full API reference.

## Next Steps

- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system


---

<!-- source: docs/src/platforms/web.md -->

# Web

`--target web` and `--target wasm` are aliases for the same backend. Both produce a self-contained HTML file with embedded WebAssembly and a JavaScript bridge for DOM widgets.

```bash
perry app.ts -o app --target web    # same output as --target wasm
open app.html
```

See **[WebAssembly / Web](https://docs.perryts.com/platforms/wasm.html)** for the full documentation: how it works, supported features, UI mapping, FFI, threading, limitations, and examples.

## Why one target instead of two?

Perry used to have two browser backends:

- `--target web` (`perry-codegen-js`) — transpiled HIR to JavaScript
- `--target wasm` (`perry-codegen-wasm`) — compiled HIR to WebAssembly

These were consolidated into the WASM target so browser apps get near-native performance, FFI imports, and Web Worker threading without needing a separate JS-emit pipeline. The DOM widget runtime that the old `--target web` provided is now embedded in `wasm_runtime.js`. Both flags route through `perry-codegen-wasm` and produce identical HTML output.

## Next Steps

- [WebAssembly / Web](https://docs.perryts.com/platforms/wasm.html) — full target documentation
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — all platforms


---

<!-- source: docs/src/platforms/wasm.md -->

# WebAssembly / Web

Perry compiles TypeScript apps to **WebAssembly** for the browser using `--target wasm` or its alias `--target web`. Both flags route through the same backend (`perry-codegen-wasm`) and produce the same output: a self-contained HTML file with embedded WASM bytecode and a thin JavaScript bridge for DOM widgets and host APIs.

There used to be a separate JavaScript-emitting `--target web` (`perry-codegen-js`); it was consolidated into the WASM target so browser apps get near-native performance, FFI imports, and Web Worker threading "for free".

## Building

```bash
# Self-contained HTML (default)
perry app.ts -o app --target web
open app.html

# Same thing
perry app.ts -o app --target wasm

# Raw .wasm binary (no HTML wrapper)
perry app.ts -o app.wasm --target wasm
```

The default output is a single `.html` file containing a base64-embedded WASM binary, the `wasm_runtime.js` bridge, and a `bootPerryWasm()` call that instantiates the module. Open it directly in any modern browser — no build step, no server required for simple apps.

> **Note**: Apps that use `fetch()` or other web platform APIs that depend on a real origin must be served over HTTP (file:// URLs run into CORS / "Failed to fetch" errors). Any local static server works:
> ```bash
> python3 -m http.server 8765
> open http://localhost:8765/app.html
> ```

## How It Works

The `perry-codegen-wasm` crate compiles HIR directly to WASM bytecode using `wasm-encoder`. The output WASM:

- Imports ~280 host functions under the `rt` namespace (string ops, math, console, JSON, classes, closures, promises, fetch, etc.)
- Imports user-declared FFI functions under the `ffi` namespace
- Exports `_start`, `memory`, `__indirect_function_table`, and every user function as `__wasm_func_<idx>` (so async function bodies compiled to JS can call back into WASM)

The NaN-boxing scheme matches the native `perry-runtime` — f64 values with STRING_TAG/POINTER_TAG/INT32_TAG — so the same value representation is used across native and WASM targets. The JS bridge wraps every host import with bit-level reinterpretation so f64 NaN-boxed values pass through the BigInt-based JS↔WASM i64 boundary intact (BigInt(NaN) would otherwise throw).

## Supported Features

- **Full TypeScript language**: classes (with constructors, methods, getters/setters, inheritance, fields), async/await, closures (with captures), generators, destructuring, template literals, generics, enums, try/catch/finally
- **Module system**: cross-module imports, top-level `const`/`let` (promoted to WASM globals), circular imports
- **Standard library**: String/Array/Object methods, Map/Set, JSON, Date, RegExp, Math, Error, URL/URLSearchParams, Buffer, Promise (with `.then`/`.catch`/`.allSettled`/`.race`/`.any`/`.all`)
- **Async**: `async`/`await` (compiled to JS Promises), `setTimeout`/`setInterval`, `fetch()` with full request options (method, headers, body)
- **Threading**: `perry/thread` `parallelMap`/`parallelFilter`/`spawn` via Web Worker pool with one WASM instance per worker (see [Threading](https://docs.perryts.com/threading/overview.html))
- **DOM-based UI**: every widget in `perry/ui` (`VStack`, `HStack`, `ZStack`, `Text`, `Button`, `TextField`, `Toggle`, `Slider`, `ScrollView`, `Picker`, `Image`, `Canvas`, `Form`, `Section`, `NavigationStack`, `Table`, `LazyVStack`, `TextArea`, etc.) maps to a DOM element with flexbox layout. State bindings (`bindText`/`bindSlider`/`bindToggle`/`bindForEach`/...) work via reactive subscribers.
- **System APIs**: `localStorage`-backed preferences/keychain, dark mode detection (`prefers-color-scheme`), Web Notifications, clipboard, file open/save dialogs, File System Access API, Web Audio capture
- **FFI**: `declare function` declarations become WASM imports under the `ffi` namespace
- **Compile-time i18n**: `perry/i18n` `t()` calls work the same as native targets

## UI Mapping

Perry widgets map to HTML elements:

| Perry Widget | HTML Element |
|-------------|-------------|
| `Text` | `<span>` |
| `Button` | `<button>` |
| `TextField` | `<input type="text">` |
| `SecureField` | `<input type="password">` |
| `Toggle` | `<input type="checkbox">` |
| `Slider` | `<input type="range">` |
| `Picker` | `<select>` |
| `ProgressView` | `<progress>` |
| `Image` / `ImageFile` | `<img>` |
| `VStack` | `<div>` (flexbox column) |
| `HStack` | `<div>` (flexbox row) |
| `ZStack` | `<div>` (position: relative + absolute children) |
| `ScrollView` | `<div>` (overflow: auto) |
| `Canvas` | `<canvas>` (2D context) |
| `Table` | `<table>` |
| `Divider` | `<hr>` |
| `Spacer` | `<div>` (flex: 1) |

## FFI Support

The WASM target supports external FFI functions declared with `declare function`. They become WASM imports under the `"ffi"` namespace:

```typescript
declare function bloom_init_window(w: number, h: number, title: number, fs: number): void
declare function bloom_draw_rect(x: number, y: number, w: number, h: number,
                                  r: number, g: number, b: number, a: number): void
```

Provide them when instantiating:

```javascript
// Via __ffiImports global (set before boot)
globalThis.__ffiImports = { bloom_init_window: ..., bloom_draw_rect: ... };

// Or via bootPerryWasm second argument
await bootPerryWasm(wasmBase64, { bloom_init_window: ..., bloom_draw_rect: ... });
```

**Auto-stub for missing imports.** The `ffi` namespace is wrapped in a `Proxy` so any FFI function the host doesn't provide is auto-stubbed with a no-op that returns `TAG_UNDEFINED`. This means apps that use native libraries (e.g. Hone Editor's 56 `hone_editor_*` functions) can still instantiate and run in the browser even without the native bindings — the relevant features are simply no-ops.

## Module-Level Constants

Top-level `const`/`let` declarations are promoted to dedicated WASM globals so functions in the same module can read them, and so two modules' identical `LocalId`s don't collide:

```typescript
// telemetry.ts
const CHIRP_URL = 'https://api.chirp247.com/api/v1/event'
const API_KEY   = 'my-key'

export function trackEvent(event: string): void {
    fetch(CHIRP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chirp-Key': API_KEY },
        body: JSON.stringify({ event }),
    })
}
```

Both `CHIRP_URL` and `API_KEY` become WASM globals indexed by `(module_idx, LocalId)`. Reading them from `trackEvent` emits a `global.get` instead of trying to look up a function-local that doesn't exist.

## JavaScript Runtime Bridge

The bridge (`wasm_runtime.js`) is embedded in the HTML and provides ~280 imports across:

- **NaN-boxing helpers**: `f64ToU64` / `u64ToF64` / `nanboxString` / `nanboxPointer` / `toJsValue` / `fromJsValue`
- **String table**: dynamic JS string array indexed by string ID
- **Handle store**: maps integer handle IDs to JS objects, arrays, closures, promises, DOM elements
- **Core ops**: console, math, JSON, JSON.parse/stringify, Date, RegExp, URL, Map, Set, Buffer, fetch
- **Closure dispatch**: indirect function table + capture array, with `closure_call_0/1/2/3/spread`
- **Class dispatch**: `class_new`, `class_call_method`, `class_get_field`, `class_set_field`, parent table for inheritance
- **DOM widgets**: 168+ `perry_ui_*` functions covering every widget in `perry/ui`
- **Async functions**: compiled to JS function bodies and merged into the import object as `__async_<name>`

All host imports are wrapped via `wrapImportsForI64()` so they automatically reinterpret BigInt args (from WASM i64 params) into f64 internally and reinterpret Number returns back into BigInt. Without this wrapping, every NaN-valued f64 return would crash with "Cannot convert NaN to a BigInt".

## Web Worker Threading

`perry/thread` works in the browser via a Web Worker pool:

```typescript
function workerThreadDemo(): void {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8]
    const squares = parallelMap(numbers, (n: number) => n * n)
    console.log(`squares len=${squares.length}`)
}
```

Each worker instantiates its own WASM module with the same bytecode and bridge. Values cross between the main thread and workers via structured-clone serialization. See [Threading](https://docs.perryts.com/threading/overview.html).

## Limitations

- **No file system access** beyond the File System Access API (`window.showDirectoryPicker()`)
- **No raw TCP/UDP sockets** — only `fetch()` and `WebSocket`
- **No subprocess spawning** — `child_process.exec` etc. are no-ops
- **No native databases** — SQLite, Postgres, MySQL drivers don't compile to web
- **CORS** applies to all `fetch()` calls — third-party APIs must allow your origin
- **localStorage**, not real keychain — fine for preferences, not for secrets
- Source-mapped stack traces are JS-only; WASM stack frames show `wasm-function[N]`

## Minification

Use `--minify` to minify the embedded JS runtime bridge in the HTML output. The Rust-native JS minifier strips comments, collapses whitespace, and mangles internal identifiers, compressing the runtime from ~3,400 lines to ~180.

```bash
perry app.ts -o app --target web --minify
```

## Example: Counter App

```typescript
import { App, Text, VStack, Button, State } from "perry/ui"

const count = State(0)

App({
    title: "Counter",
    width: 400,
    height: 300,
    body: VStack(16, [
        Text(`Count: ${count.value}`),
        Button("Increment", () => count.set(count.value + 1)),
    ]),
})
```

```bash
perry counter.ts -o counter --target web
open counter.html
```

## Example: Real-World App (Mango MongoDB GUI)

The [Mango](https://github.com/MangoQuery/app) MongoDB GUI — 50 modules, 998 functions, classes, async functions, fetch with custom headers, the Hone code editor — compiles to a single 4 MB HTML file via `--target web` and renders its full UI (welcome screen, query view, edit view) in the browser. SQLite-backed connection storage gracefully degrades to an in-memory transient store on web; the rest of the app works the same as the native version.

## Next Steps

- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system
- [Threading](https://docs.perryts.com/threading/overview.html) — Web Worker threading
