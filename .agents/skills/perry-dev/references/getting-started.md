<!-- Perry docs bundle: getting-started.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/introduction.md -->

# Introduction

Perry is a native TypeScript compiler that compiles TypeScript source code directly to native executables. No JavaScript runtime, no JIT warmup, no V8 — your TypeScript compiles to a real binary.

```typescript
// demonstrates: the one-liner hello shown on the docs landing page
// docs: docs/src/introduction.md
// platforms: macos, linux, windows
// targets: wasm, web, android

console.log("Hello from Perry!")
```

```bash
$ perry hello.ts -o hello
$ ./hello
Hello from Perry!
```

## Why Perry?

- **Native performance** — Compiles to machine code via LLVM. Integer-heavy code like Fibonacci runs 2x faster than Node.js.
- **Real multi-threading** — `parallelMap` and `spawn` give you actual OS threads with compile-time safety. No isolates, no message passing overhead. [Something no JS runtime can do](https://docs.perryts.com/threading/overview.html).
- **Small binaries** — A hello world is ~300KB. Perry detects what runtime features you use and only links what's needed.
- **Native UI** — Build desktop and mobile apps with declarative TypeScript that compiles to real AppKit, UIKit, GTK4, Win32, or DOM widgets.
- **Terminal UI** — Build interactive CLIs with [ink-shape React hooks](https://docs.perryts.com/tui/overview.html) (`useState`, `useEffect`, `useApp`) on a native cell-grid renderer. No Node, no reconciler — just a single static binary.
- **7 targets** — macOS, iOS, Android, Windows, Linux, Web, and WebAssembly from the same source code.
- **Familiar ecosystem** — Use npm packages like `fastify`, `mysql2`, `redis`, `bcrypt`, `lodash`, and more — compiled natively.
- **Node.js compatibility** — ~95% behavioral parity with Node, including real (non-stub) implementations of `fs`, `http`/`https`/`http2`, `net`/`tls`, `crypto`, `stream`, `events`, `child_process`, `worker_threads`, `process`, and the WHATWG web globals. Against Node's own test suite (node v26), Perry passes ~97% of cases.
- **Zero config** — Point Perry at a `.ts` (or `.js`) file and get a binary. No `tsconfig.json` required.

## What Perry Compiles

Perry supports a practical subset of TypeScript:

- Variables, functions, classes, enums, interfaces
- Async/await, closures, generators
- Destructuring, spread, template literals
- Arrays, Maps, Sets, typed arrays
- Regular expressions, JSON, Promises
- Module imports/exports
- Generic type erasure

Perry also compiles **plain JavaScript** — `.js`, `.cjs`, `.mjs`, and `.jsx`
source files are parsed as JavaScript and lowered through the same native
pipeline, so no TypeScript annotations are required. Dynamic JS patterns aren't
all guaranteed, but most JavaScript projects compile and run.

See [Supported Features](https://docs.perryts.com/language/supported-features.html) for the complete list.

## Quick Example: Native App

```typescript
// demonstrates: minimal stateful UI — label + increment button
// docs: docs/src/ui/state.md
// platforms: macos, linux, windows
// targets: ios-simulator, visionos-simulator, tvos-simulator, watchos-simulator, android, web, wasm

import { App, VStack, Text, Button, State } from "perry/ui"

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
$ perry counter.ts -o counter
$ ./counter  # Opens a native macOS/Windows/Linux window
```

This produces a ~3MB native app with real platform widgets — no Electron, no WebView.

## How It Works

```
TypeScript (.ts)
    ↓ Parse (SWC)
    ↓ Lower to HIR
    ↓ Transform (inline, closure conversion, async)
    ↓ Codegen (LLVM)
    ↓ Link (system linker)
    ↓
Native Executable
```

Perry uses [SWC](https://swc.rs/) for TypeScript parsing and [LLVM](https://llvm.org/) for native code generation. Types are erased at compile time (like `tsc`), and values are represented at runtime using NaN-boxing for efficient 64-bit tagged values.

## Next Steps

- [Install Perry](https://docs.perryts.com/getting-started/installation.html)
- [Write your first program](https://docs.perryts.com/getting-started/hello-world.html)
- [Build a native app](https://docs.perryts.com/getting-started/first-app.html)


---

<!-- source: docs/src/getting-started/installation.md -->

# Installation

## Prerequisites

Perry compiles TypeScript to native binaries by linking with your system's C
toolchain, so every install path needs a linker:

- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `gcc` or `clang` for linking — see your distro below
- **Windows**: LLVM (`winget install LLVM.LLVM`) + `perry setup windows` (lightweight, ~1.5 GB, no Visual Studio needed), or MSVC Build Tools with the "Desktop development with C++" workload — see the [Windows platform guide](https://docs.perryts.com/platforms/windows.html) for both options

Perry's shipped compiler uses its in-process LLVM 22 backend for normal
codegen; it does not shell out to a host `clang -c`. A matching external clang
is needed only for specialized paths that say so explicitly, such as Windows
host `--embed`, or when deliberately selecting the external backend for
bisection (for example `PERRY_LLVM_INPROCESS=0` or a build without the default
`llvm-inprocess` feature).

Linux linker toolchain by distribution:

```bash
# Debian / Ubuntu / Pop!_OS / Mint
sudo apt install build-essential

# Arch / Manjaro / CachyOS / EndeavourOS
sudo pacman -S base-devel gcc

# Fedora / RHEL / CentOS Stream
sudo dnf install gcc gcc-c++ glibc-devel

# openSUSE
sudo zypper install -t pattern devel_basis

# Alpine / musl-based
sudo apk add build-base

# Void Linux
sudo xbps-install -S base-devel
```

Run `perry doctor` afterwards to verify the linker and platform tools. It may
also report an optional external clang used by the specialized paths above.

A source build has additional Rust, LLVM 22, and libclang prerequisites; see
[Building from Source](https://docs.perryts.com/contributing/building.html) before running Cargo.

## Install Perry

### npm / npx (recommended — any platform)

Perry ships as a prebuilt-binary npm package. This is the fastest way to get started and the only path that covers all seven host binary variants (macOS arm64/x64, Linux x64/arm64 glibc + musl, Windows x64) with a single command:

```bash
# Project-local (pins Perry's version alongside your deps)
npm install @perryts/perry
npx perry compile src/main.ts -o myapp && ./myapp

# Global
npm install -g @perryts/perry
perry compile src/main.ts -o myapp

# Zero-install, one-shot
npx -y @perryts/perry compile src/main.ts -o myapp
```

[`@perryts/perry`](https://www.npmjs.com/package/@perryts/perry) is a thin launcher; npm automatically picks the matching prebuilt via `optionalDependencies` (`@perryts/perry-darwin-arm64`, `@perryts/perry-linux-x64-musl`, etc.) based on your `os` / `cpu` / `libc`. Requires Node.js ≥ 16.

| Platform | Prebuilt package |
|---|---|
| macOS arm64 (Apple Silicon) | `@perryts/perry-darwin-arm64` |
| macOS x64 (Intel) | `@perryts/perry-darwin-x64` |
| Linux x64 (glibc) | `@perryts/perry-linux-x64` |
| Linux arm64 (glibc) | `@perryts/perry-linux-arm64` |
| Linux x64 (musl / Alpine) | `@perryts/perry-linux-x64-musl` |
| Linux arm64 (musl / Alpine) | `@perryts/perry-linux-arm64-musl` |
| Windows x64 | `@perryts/perry-win32-x64` |

#### Linux glibc requirement

The Linux **glibc** binaries are built against a glibc 2.31 sysroot, so they require **glibc ≥ 2.31**. This includes Ubuntu 20.04+, Debian 11+, RHEL 9+ and Amazon Linux 2023. Release CI checks the compiler's imported glibc symbol versions and exercises a compiled program inside that environment.

On older glibc hosts Perry uses the **fully-static musl build** instead, which has no libc dependency and runs on any Linux:

- **`install.sh`** detects the glibc version and downloads `perry-linux-<arch>-musl.tar.gz` automatically.
- **npm** — the launcher routes to `@perryts/perry-linux-x64-musl` (or `-arm64-musl`) and prints a one-time notice. npm does not install that package on a glibc machine by itself (its `libc` selector says `musl`), so install it once:

  ```bash
  npm install --force @perryts/perry-linux-x64-musl
  ```

The static build is the same compiler and produces the same binaries. The only feature it does not support is `perry/ui` (GTK4 desktop apps), which needs glibc. The glibc package includes the GTK4 archive, built separately on Ubuntu 24.04; linking a UI app still requires the GTK4, WebKitGTK, libshumate and GStreamer development libraries. Tracking issues: [#6298](https://github.com/PerryTS/perry/issues/6298), [#6351](https://github.com/PerryTS/perry/issues/6351).

### Homebrew (macOS)

```bash
brew install perryts/perry/perry
```

### winget (Windows)

```bash
winget install PerryTS.Perry
```

### APT (Debian / Ubuntu)

```bash
curl -fsSL https://perryts.github.io/perry-apt/perry.gpg.pub | sudo gpg --dearmor -o /usr/share/keyrings/perry.gpg
echo "deb [signed-by=/usr/share/keyrings/perry.gpg] https://perryts.github.io/perry-apt stable main" | sudo tee /etc/apt/sources.list.d/perry.list
sudo apt update && sudo apt install perry
```

### From Source

Install the prerequisites in [Building from Source](https://docs.perryts.com/contributing/building.html)
first. In particular, the default compiler build requires the LLVM 22
development archive; installing Rust alone is not sufficient.

```bash
git clone https://github.com/PerryTS/perry.git
cd perry
cargo build --release
```

The binary is at `target/release/perry`. Add it to your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="/path/to/perry/target/release:$PATH"
```

### Self-Update

Once installed, Perry can update itself:

```bash
perry update
```

This downloads the latest release, verifies its signature, and atomically
replaces the binary.

If you installed Perry through a package manager, use that instead — Perry will
tell you which command, and will not overwrite a binary the manager is tracking:

| installed with | upgrade with |
|---|---|
| Homebrew | `brew upgrade perryts/perry/perry` |
| npm | `npm install -g @perryts/perry@latest` |
| apt | `sudo apt update && sudo apt install --only-upgrade perry` |
| winget | `winget upgrade PerryTS.Perry` |

Perry can also mention new versions, ask before installing, or install
unattended. See [Updates](https://docs.perryts.com/cli/updates.html).

## Verify Installation

```bash
perry doctor
```

This checks your installation, shows the current version, and reports if an update is available.

```bash
perry --version
```

## Platform-Specific Setup

### macOS

No additional setup needed. Perry uses the system `cc` linker and AppKit for UI apps.

For iOS development, install Xcode (not just Command Line Tools) for the iOS SDK and simulator.

### Linux

Install GTK4 + libshumate + GStreamer development libraries for UI apps. (You
only need these if you build for `--target linux` — pure-CLI / cross-compile
to other platforms doesn't require them.)

```bash
# Ubuntu / Debian
sudo apt install libgtk-4-dev libshumate-dev libgstreamer1.0-dev

# Fedora
sudo dnf install gtk4-devel libshumate-devel gstreamer1-devel \
                 gstreamer1-plugins-base-devel

# Arch
sudo pacman -S gtk4 libshumate gstreamer gst-plugins-base
```

### Windows

Two toolchain options — pick one. Both produce identical binaries.

**Lightweight (recommended, ~1.5 GB, no Visual Studio):**

```powershell
winget install LLVM.LLVM
perry setup windows
```

`perry setup windows` downloads the Microsoft CRT + Windows SDK libraries via xwin after prompting for license acceptance. Pass `--accept-license` to skip the prompt in CI.

**MSVC Build Tools (~8 GB):**

Install Visual Studio Build Tools with the "Desktop development with C++" workload — via the Visual Studio Installer, or:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override `
  "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Run `perry doctor` to verify the toolchain. See the [Windows platform guide](https://docs.perryts.com/platforms/windows.html) for details.

## What's Next

- [Write your first program](https://docs.perryts.com/getting-started/hello-world.html)
- [Build a native app](https://docs.perryts.com/getting-started/first-app.html)

### Authenticated self-update and release migration

`perry update` only installs a release when the matching
`<archive>.update.json` is present and validates against a public-key keyring
compiled into the CLI. The manifest is Ed25519-signed over a domain-separated
payload that binds the key id, version, platform, artifact name, HTTPS URL,
SHA-256 digest, and size. Old releases that only publish `*.sha256` sidecars
are therefore intentionally **not** eligible for automatic installation;
download them manually from the release page.

Release maintainers must configure these GitHub settings before enabling a
release: repository variable `PERRY_CLI_UPDATE_PUBLIC_KEYS` (a JSON array of
`{"key_id":"...","public_key":"<base64-32-byte-Ed25519-key>"}`),
repository variable `PERRY_CLI_UPDATE_KEY_ID`, and protected secret
`PERRY_CLI_UPDATE_SIGNING_KEY` (the matching base64 32-byte seed). The workflow
fails rather than publishing an unsigned manifest when the secret/key id is
missing. Keep the old public key in the compiled keyring during rotation, sign
new manifests with the new `key_id`, and remove the old key only after the
minimum supported CLI has shipped with the replacement.

The updater stages under the install directory with owner-only permissions,
verifies before extraction, rejects links/path traversal, and restores the old
binary and libraries after an interrupted transaction. It never recommends
running the updater with elevated privileges; use the package manager or a
manual install when the installation directory is not writable.


---

<!-- source: docs/src/getting-started/hello-world.md -->

# Hello World

## Your First Program

Create a file called `hello.ts`:

```typescript
// demonstrates: the minimal Perry program in the docs
// docs: docs/src/getting-started/hello-world.md
// platforms: macos, linux, windows
// targets: wasm, web, android

console.log("Hello, Perry!")
```

Compile and run it:

```bash
perry hello.ts -o hello
./hello
```

Output:

```
Hello, Perry!
```

That's it. Perry compiled your TypeScript to a native executable — no Node.js, no bundler, no runtime.

## A Slightly Bigger Example

```typescript
// demonstrates: recursive fib as a perf-vs-node talking point
// docs: docs/src/getting-started/hello-world.md
// platforms: macos, linux, windows
// targets: wasm, web, android

function fibonacci(n: number): number {
    if (n <= 1) return n
    return fibonacci(n - 1) + fibonacci(n - 2)
}

const start = Date.now()
const result = fibonacci(35)
const elapsed = Date.now() - start

console.log(`fibonacci(35) = ${result}`)
console.log(`Completed in ${elapsed}ms`)
```

```bash
perry fib.ts -o fib
./fib
```

This runs about 2x faster than Node.js because Perry compiles to native machine code with integer specialization.

## Using Variables and Functions

```typescript
const name: string = "World"
const items: number[] = [1, 2, 3, 4, 5]

const doubled = items.map((x) => x * 2)
const sum = doubled.reduce((acc, x) => acc + x, 0)

console.log(`Hello, ${name}!`)
console.log(`Sum of doubled: ${sum}`)
```

## Async Code

```typescript
// demonstrates: async/await fetch shown in hello-world.md
// docs: docs/src/getting-started/hello-world.md
// platforms: macos, linux
// Windows excluded: this complete-file example uses try/catch, which the
// default Windows RS4GC pipeline intentionally refuses until WinEH funclet
// statepoints are supported (#7354).
// run: false

async function fetchData(): Promise<string> {
    const response = await fetch("https://httpbin.org/get")
    const data = await response.json() as { origin: string }
    return data.origin
}

const ip = await fetchData()
console.log(`Your IP: ${ip}`)
```

```bash
perry fetch.ts -o fetch
./fetch
```

Perry compiles async/await to a native async runtime backed by Tokio.

## Multi-Threading

Perry can do something no JavaScript runtime can — run your code on multiple CPU cores:

```typescript
// demonstrates: parallelMap + spawn shown in hello-world.md
// docs: docs/src/getting-started/hello-world.md
// platforms: macos, linux, windows

import { parallelMap, parallelFilter, spawn } from "perry/thread"

const data = [1, 2, 3, 4, 5, 6, 7, 8]

// Process all elements across all CPU cores
const doubled = parallelMap(data, (x: number) => x * 2)
console.log(doubled) // [2, 4, 6, 8, 10, 12, 14, 16]

// Run heavy work in the background
const result = await spawn(() => {
    let sum = 0
    for (let i = 0; i < 100_000_000; i++) sum += i
    return sum
})
console.log(result)

// parallelFilter is also available for the lift-and-parallelize case:
const evens = parallelFilter(data, (x: number) => x % 2 === 0)
console.log(evens)
```

This is real OS-level parallelism, not web workers or separate isolates. See [Multi-Threading](https://docs.perryts.com/threading/overview.html) for details.

## What the Compiler Produces

When you run `perry file.ts -o output`, Perry:

1. Parses your TypeScript with SWC
2. Lowers the AST to an intermediate representation (HIR)
3. Applies optimizations (inlining, closure conversion, etc.)
4. Generates native machine code with LLVM
5. Links with your system's C compiler

The result is a standalone executable with no external dependencies.

### Binary Size

| Program | Binary Size |
|---------|-------------|
| Hello world | ~300KB |
| CLI with fs/path | ~3MB |
| UI app | ~3MB |
| Full app with stdlib | ~48MB |

Perry automatically detects which runtime features you use and only links what's needed.

## Next Steps

- [Build a native UI app](https://docs.perryts.com/getting-started/first-app.html)
- [Configure your project](https://docs.perryts.com/getting-started/project-config.html)
- [Explore supported TypeScript features](https://docs.perryts.com/language/supported-features.html)


---

<!-- source: docs/src/getting-started/first-app.md -->

# First Native App

Perry compiles declarative TypeScript UI code to native platform widgets. No
Electron, no WebView — real AppKit on macOS, UIKit on iOS, GTK4 on Linux,
Win32 on Windows. Every example on this page is a real source file under
`docs/examples/` that CI compiles and runs on every PR.

## A Simple Counter

```typescript
// demonstrates: minimal stateful UI — label + increment button
// docs: docs/src/ui/state.md
// platforms: macos, linux, windows
// targets: ios-simulator, visionos-simulator, tvos-simulator, watchos-simulator, android, web, wasm

import { App, VStack, Text, Button, State } from "perry/ui"

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

Compile and run:

```bash
perry counter.ts -o counter
./counter
```

A native window opens with a label and two buttons. Clicking "Increment"
updates the count in real-time.

## How It Works

- **`App({ title, width, height, body })`** — Creates a native application window. `body` is the root widget.
- **`State(initialValue)`** — Creates reactive state. `.value` reads, `.set(v)` writes and triggers UI updates.
- **`VStack(spacing, [...])`** — Vertical stack layout (like SwiftUI's VStack or CSS flexbox column). The first arg is the gap in points between children.
- **`Text(string)`** — A text label. Template literals referencing `${state.value}` bind reactively.
- **`Button(label, onClick)`** — A native button with a click handler.

## A Todo App

```typescript
// demonstrates: complete reactive todo app combining State, ForEach, and widget tree mutation
// docs: docs/src/ui/state.md
// platforms: macos, linux, windows, windows-winui
// targets: ios-simulator, tvos-simulator, watchos-simulator, web, wasm

import {
    App,
    Text,
    Button,
    TextField,
    VStack,
    HStack,
    State,
    ForEach,
    Spacer,
    Divider,
} from "perry/ui"

const todos = State<string[]>([])
const count = State(0)
const input = State("")

App({
    title: "Todo App",
    width: 480,
    height: 600,
    body: VStack(16, [
        Text("My Todos"),

        HStack(8, [
            TextField("What needs to be done?", (value: string) => input.set(value)),
            Button("Add", () => {
                const text = input.value
                if (text.length > 0) {
                    todos.set([...todos.value, text])
                    count.set(count.value + 1)
                    input.set("")
                }
            }),
        ]),

        Divider(),

        ForEach(count, (i: number) =>
            HStack(8, [
                Text(todos.value[i]),
                Spacer(),
                Button("Delete", () => {
                    todos.set(todos.value.filter((_, idx) => idx !== i))
                    count.set(count.value - 1)
                }),
            ]),
        ),

        Spacer(),
        Text(`${count.value} items`),
    ]),
})
```

`ForEach(count, render)` iterates by index — keep an item array and a count
state in sync, then read items via `array.value[i]` inside the closure. See
[State Management](https://docs.perryts.com/ui/state.html) for the full pattern.

## Cross-Platform

The same code runs on all 6 platforms:

```bash
# macOS (default)
perry app.ts -o app
./app

# iOS Simulator
perry app.ts -o app --target ios-simulator

# Web (compiles to WebAssembly + DOM bridge in a self-contained HTML file)
perry app.ts -o app --target web   # alias: --target wasm
open app.html

# Other platforms
perry app.ts -o app --target windows
perry app.ts -o app --target linux
perry app.ts -o app --target android
```

Each target compiles to the platform's native widget toolkit. See
[Platforms](https://docs.perryts.com/platforms/overview.html) for details.

## Adding Styling

Styling is applied via free functions that take the widget handle as their
first argument. Colors are RGBA floats in `[0.0, 1.0]` — divide a hex byte by
255 to convert (`0x33 / 255 ≈ 0.2`).

```typescript
// demonstrates: counter from getting-started/first-app.md with styled widgets
// docs: docs/src/getting-started/first-app.md
// platforms: macos, linux, windows
// targets: ios-simulator, tvos-simulator, watchos-simulator, web, wasm
// run: false

import {
    App, VStack, Text, Button, State,
    textSetFontSize, textSetColor,
    setCornerRadius, setPadding,
    widgetSetBackgroundColor,
} from "perry/ui"

const count = State(0)

const label = Text(`Count: ${count.value}`)
textSetFontSize(label, 24)
textSetColor(label, 0.2, 0.2, 0.2, 1.0)        // RGBA in [0,1] — same as #333333

const btn = Button("Increment", () => count.set(count.value + 1))
setCornerRadius(btn, 8)
widgetSetBackgroundColor(btn, 0.0, 0.478, 1.0, 1.0)  // system blue

const stack = VStack(20, [label, btn])
setPadding(stack, 20, 20, 20, 20)

App({
    title: "Styled Counter",
    width: 400,
    height: 300,
    body: stack,
})
```

See [Styling](https://docs.perryts.com/ui/styling.html) for all available style properties.

## Next Steps

- [Project Configuration](https://docs.perryts.com/getting-started/project-config.html) — Set up `package.json` for Perry projects
- [UI Overview](https://docs.perryts.com/ui/overview.html) — Complete guide to Perry's UI system
- [Widgets Reference](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [State Management](https://docs.perryts.com/ui/state.html) — Reactive state and bindings


---

<!-- source: docs/src/getting-started/project-config.md -->

# Project Configuration

Perry projects use `perry.toml` and `package.json` for configuration. No special config file is required for basic usage, but larger projects benefit from Perry-specific settings.

> **Looking for the full perry.toml reference?** See [perry.toml Reference](https://docs.perryts.com/cli/perry-toml.html) for every field, section, platform option, and environment variable.

## Basic Setup

```bash
perry init my-project
cd my-project
```

This scaffolds `perry.toml`, `package.json`, a starter `src/main.ts`, `.gitignore`, and `tsconfig.json` (plus Perry type stubs under `.perry/types/`).

## package.json

The generated `package.json` carries the npm-interop layer. The `perry.compilePackages` array is seeded empty — it is the sole config home for that setting (it is read only from `package.json`, never from `perry.toml`):

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "private": true,
  "main": "src/main.ts",
  "perry": {
    "compilePackages": []
  }
}
```

### Perry Configuration

The `perry` field in `package.json` controls compiler behavior:

#### `compilePackages`

List npm packages to compile natively instead of routing through the JavaScript runtime:

```json
{
  "perry": {
    "compilePackages": ["@noble/curves", "@noble/hashes"]
  }
}
```

> **Two-key opt-in.** Listing a package is not sufficient on its own. Compiling
> third-party TypeScript into your binary is a privileged operation, so every
> entry in `compilePackages` must *also* be matched by an entry in
> `perry.allow.compilePackages` in the same `package.json` — otherwise the build
> refuses. Patterns accept exact names, scope wildcards (`"@scope/*"`), or the
> universal `"*"`:
>
> ```json
> {
>   "perry": {
>     "compilePackages": ["@noble/curves", "@noble/hashes"],
>     "allow": { "compilePackages": ["@noble/*"] }
>   }
> }
> ```
>
> For one-off builds where editing `package.json` isn't an option, set
> `PERRY_ALLOW_PERRY_FEATURES=1` to opt every name in (and `=0` to force the
> refusal even when `package.json` opted in).

When a package is listed here, Perry:
1. Resolves the package in `node_modules/`
2. Prefers TypeScript source (`src/index.ts`) over compiled JavaScript (`lib/index.js`)
3. Compiles all functions natively through LLVM
4. Deduplicates across nested `node_modules/` to prevent duplicate linker symbols

This is useful for pure TypeScript/JavaScript packages that don't rely on Node.js APIs. Packages that use native bindings, `eval()`, or dynamic `require()` won't work.

Universal forms (`"auto"`, `"all"`, `true`, or a `"*"` wildcard) skip packages
identified as Node native addons instead of trying to compile N-API binaries as
source. This lets a dependency's guarded optional native accelerator fall back
to its JavaScript implementation. A statically imported pure-source subpath of
such a package can still be compiled, but an actual `.node` edge fails. Naming
the addon package exactly still fails immediately with the native-addon
diagnostic.

#### `codegen`

Perry is an ahead-of-time compiler: it never runs a code string at runtime. Many libraries that would normally JIT a function from a schema or a config (`ajv`, `fast-json-stringify`, Prisma, Drizzle, …) ship a **build-time** mode that emits plain, eval-free source instead. The `codegen` field declares the commands that produce that source. Perry runs them **before** compiling, then compiles the generated output natively — so the shipped binary links no JavaScript engine.

```json
{
  "perry": {
    "codegen": [
      { "label": "ajv validators", "command": "node scripts/generate-validators.mjs" }
    ]
  }
}
```

Each entry is either a bare command string or an object with `command` (required) and an optional `label` shown in build output. Commands run in declaration order, with the working directory set to the folder containing this `package.json`, so relative script paths resolve as expected. If a command exits non-zero the build fails and prints its captured stdout/stderr.

**Security:** `codegen` is read **only** from the host project's `package.json` — never from a dependency's — so a transitive dependency can't smuggle in a build command (the same trust boundary as `compilePackages`). Skip the steps for a reproducible or sandboxed build (where the generated output is already committed) with `perry compile --no-codegen` or `PERRY_SKIP_CODEGEN=1`.

##### Worked example: `ajv/standalone`

`ajv` validates against a JSON Schema. Its default mode JITs the validator with `new Function`; its **standalone** mode emits the same validator as plain source. The generator script:

```js
// scripts/generate-validators.mjs
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { writeFileSync } from "node:fs";

const schema = {
  $id: "Config",
  type: "object",
  properties: { host: {}, port: {} },
  required: ["host", "port"],
  additionalProperties: false,
};

const ajv = new Ajv({ code: { source: true } }); // standalone source
const moduleCode = standaloneCode(ajv, ajv.compile(schema));
writeFileSync(new URL("../generated/validator.cjs", import.meta.url), moduleCode);
```

Then import the generated validator like any other module:

```ts,no-test
import validate from "./generated/validator.cjs";
if (!validate(input)) throw new Error("invalid config");
```

`perry compile` runs the `codegen` step, ajv emits `generated/validator.cjs` (no `new Function`), and Perry compiles it natively. See `test-files/test_ajv_standalone.ts` for a runnable, byte-parity-tested sample.

##### Same convention, other tools

The convention is library-agnostic — point a `codegen` command at any build-time generator and import its output:

| Tool | `command` | Output to import |
|------|-----------|------------------|
| **ajv** | `node scripts/generate-validators.mjs` (uses `ajv/standalone`) | generated validator module |
| **Prisma** | `prisma generate` | generated client |
| **Drizzle** | `drizzle-kit introspect` | generated schema/types |
| **kysely-codegen** | `kysely-codegen --out-file src/db.d.ts` | generated DB types |
| **Vue SFC** | `vue-tsc` / your SFC compile step | compiled `.vue` output |

Libraries that JIT at runtime with **no** standalone mode (e.g. `fast-json-stringify`, `find-my-way`) are handled separately — see the [`eval` / `new Function` strategy](https://github.com/PerryTS/perry/issues/1677).

#### `splash`

Configure a native splash screen for iOS and Android. The splash screen appears instantly during cold start, before your app code runs.

**Minimal (both platforms share the same splash):**

```json
{
  "perry": {
    "splash": {
      "image": "logo/icon-256.png",
      "background": "#FFF5EE"
    }
  }
}
```

**Per-platform overrides:**

```json
{
  "perry": {
    "splash": {
      "image": "logo/icon-256.png",
      "background": "#FFF5EE",
      "ios": {
        "image": "logo/splash-ios.png",
        "background": "#FFFFFF"
      },
      "android": {
        "image": "logo/splash-android.png",
        "background": "#FFFFFF"
      }
    }
  }
}
```

**Full custom override (complete control):**

```json
{
  "perry": {
    "splash": {
      "ios": {
        "storyboard": "splash/LaunchScreen.storyboard"
      },
      "android": {
        "layout": "splash/splash_background.xml",
        "theme": "splash/themes.xml"
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `splash.image` | Path to a PNG image, centered on the splash screen (both platforms) |
| `splash.background` | Hex color for the background (default: `#FFFFFF`) |
| `splash.ios.image` | iOS-specific image override |
| `splash.ios.background` | iOS-specific background color |
| `splash.ios.storyboard` | Custom LaunchScreen.storyboard (compiled with ibtool) |
| `splash.android.image` | Android-specific image override |
| `splash.android.background` | Android-specific background color |
| `splash.android.layout` | Custom drawable XML for `windowBackground` |
| `splash.android.theme` | Custom themes.xml |

**Resolution order** per platform:
1. Custom file override (storyboard / layout+theme)
2. Platform-specific image/color (`splash.{platform}.image`)
3. Universal image/color (`splash.image`)
4. No `splash` key → blank white screen (backward compatible)

## Using npm Packages

Perry natively supports many popular npm packages without any configuration:

```typescript
// demonstrates: importing built-in stdlib npm packages (project-config.md)
// docs: docs/src/getting-started/project-config.md
// platforms: macos, linux, windows
// run: false

// These four imports are Perry's most-used built-in stdlib shims:
// fastify (HTTP server), mysql2 (db), ioredis (Redis), bcrypt (password
// hashing). They're compiled to native code via Perry's per-package
// implementations — no `compilePackages` needed.
//
// `// run: false` because each one needs a live external service (DB,
// Redis, network port) to actually do anything; the binary still has to
// link cleanly, which is the drift check we want.

import fastify from "fastify"
import mysql from "mysql2/promise"
import Redis from "ioredis"
import bcrypt from "bcrypt"

const app = fastify({ logger: false })
const db = mysql.createPool({ host: "localhost", user: "root", database: "test" })
const redis = new Redis()
const hashed = await bcrypt.hash("hunter2", 10)

console.log(typeof app, typeof db, typeof redis, hashed.length)
```

These are compiled to native code using Perry's built-in implementations. See [Standard Library](https://docs.perryts.com/stdlib/overview.html) for the full list.

For packages not natively supported, use `compilePackages` for pure TS/JS packages, or the JavaScript runtime fallback for complex packages.

## Project Structure

Perry is flexible about project structure. Common patterns:

```
my-project/
├── package.json
├── src/
│   └── index.ts
└── node_modules/      # Only needed for compilePackages
```

For UI apps:

```
my-app/
├── package.json
├── src/
│   ├── index.ts       # Main app entry
│   └── components/    # UI components
└── assets/            # Images, etc.
```

## Compilation

```bash
# Compile a file
perry src/index.ts -o build/app

# Compile with a specific target
perry src/index.ts -o build/app --target ios-simulator

# Debug: print intermediate representation
perry src/index.ts --print-hir
```

See [CLI Commands](https://docs.perryts.com/cli/commands.html) for all options.

## Next Steps

- [CLI Commands](https://docs.perryts.com/cli/commands.html) — All compiler commands and flags
- [Supported Features](https://docs.perryts.com/language/supported-features.html) — What TypeScript features work
- [Standard Library](https://docs.perryts.com/stdlib/overview.html) — Supported npm packages
