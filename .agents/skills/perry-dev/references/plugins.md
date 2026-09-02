<!-- Perry docs bundle: plugins.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/plugins/overview.md -->

# Plugin System Overview

> **Status: wired** ([#189](https://github.com/PerryTS/perry/issues/189) closed). Receiver-less calls (`loadPlugin`, `listPlugins`, `emitHook`, `invokeTool`, ...) and `PluginApi` instance methods (`api.registerHook`, `api.registerTool`, ...) dispatch through `crates/perry-codegen/src/lower_call.rs::PERRY_PLUGIN_TABLE` and `PERRY_PLUGIN_INSTANCE_TABLE`. TypeScript surface lives in `types/perry/plugin/index.d.ts`. Host-side snippets below are compile-link verified by the doc-tests harness against [`docs/examples/plugins/host_snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/plugins/host_snippets.ts); plugin-side `activate(api)` snippets against [`docs/examples/plugins/plugin_snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/plugins/plugin_snippets.ts).

Perry supports native plugins as shared libraries (`.dylib`/`.so`). Plugins extend Perry applications with custom hooks, tools, services, and routes.

## How It Works

1. A plugin is a Perry-compiled shared library with `activate(api)` and `deactivate()` entry points
2. The host application loads plugins with `loadPlugin(path)`
3. Plugins register hooks, tools, and services via the API handle
4. The host dispatches events to plugins via `emitHook(name, data)`

```
Host Application
    ↓ loadPlugin("./my-plugin.dylib")
    ↓ calls plugin_activate(api_handle)
Plugin
    ↓ api.registerHook("beforeSave", callback)
    ↓ api.registerTool("format", callback)
Host
    ↓ emitHook("beforeSave", data) → plugin callback runs
```

## Quick Example

### Plugin (compiled with `--output-type dylib`)

```typescript
let count = 0

export function activate(api: PluginApi) {
    api.setMetadata("counter", "1.0.0", "Counts hook invocations")

    api.registerHook("onRequest", (data) => {
        count++
        console.log(`Request #${count}`)
        return data
    })

    api.registerTool("getCount", "returns request count", () => count)
}

export function deactivate() {
    console.log(`Total requests processed: ${count}`)
}
```

```bash
perry my-plugin.ts --output-type dylib -o my-plugin.dylib
```

### Host Application

```typescript,no-test
import {
    loadPlugin, unloadPlugin,
    emitHook, emitEvent, invokeTool,
    setPluginConfig,
    discoverPlugins, listPlugins, listHooks, listTools,
    pluginCount, initPlugins,
} from "perry/plugin"

const id = loadPlugin("./counter-plugin.dylib")
console.log(`load returned: ${id !== 0 ? "ok" : "fail"}`)

const plugins = listPlugins()
const hooks = listHooks()
const tools = listTools()
console.log(`loaded: ${pluginCount()} plugin(s), ${hooks.length} hook(s), ${tools.length} tool(s)`)

const result = emitHook("beforeSave", { content: "hello world" })

const greeting = invokeTool("greet", { name: "Perry" })
const formatted = invokeTool("formatCode", {
    code: "const x=1",
    language: "typescript",
})
```

## Plugin ABI

Plugins must export these symbols:
- `perry_plugin_abi_version()` — Returns ABI version (for compatibility checking)
- `plugin_activate(api_handle)` — Called when plugin is loaded
- `plugin_deactivate()` — Called when plugin is unloaded

Perry generates these automatically from your `activate`/`deactivate` exports.

## Native Extensions

Perry also supports **native extensions** — packages that bundle platform-specific Rust/Swift/JNI code and compile directly into your binary. These are used for accessing platform APIs like the App Store review prompt or StoreKit in-app purchases.

See [Native Extensions](https://docs.perryts.com/plugins/native-extensions.html) for details.

## Next Steps

- [Creating Plugins](https://docs.perryts.com/plugins/creating-plugins.html) — Build a plugin step by step
- [Hooks & Events](https://docs.perryts.com/plugins/hooks-and-events.html) — Hook modes, event bus, tools
- [Native Extensions](https://docs.perryts.com/plugins/native-extensions.html) — Extensions with platform-native code
- [App Store Review](https://docs.perryts.com/plugins/appstore-review.html) — Native review prompt (iOS/Android)


---

<!-- source: docs/src/plugins/creating-plugins.md -->

# Creating Plugins

> **Status: wired** ([#189](https://github.com/PerryTS/perry/issues/189) closed). See [Plugin System Overview — Status](https://docs.perryts.com/plugins/overview.html) for the full surface. Snippets below are compile-link verified by the doc-tests harness against [`docs/examples/plugins/plugin_snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/plugins/plugin_snippets.ts) and [`docs/examples/plugins/host_snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/plugins/host_snippets.ts).

Build Perry plugins as shared libraries that extend host applications.

## Step 1: Write the Plugin

```typescript
let count = 0

export function activate(api: PluginApi) {
    api.setMetadata("counter", "1.0.0", "Counts hook invocations")

    api.registerHook("onRequest", (data) => {
        count++
        console.log(`Request #${count}`)
        return data
    })

    api.registerTool("getCount", "returns request count", () => count)
}

export function deactivate() {
    console.log(`Total requests processed: ${count}`)
}
```

## Step 2: Compile as Shared Library

```bash
perry counter-plugin.ts --output-type dylib -o counter-plugin.dylib
```

The `--output-type dylib` flag tells Perry to produce a `.dylib` (macOS) or `.so` (Linux) instead of an executable.

Perry automatically:
- Generates `perry_plugin_abi_version()` returning the current ABI version
- Generates `plugin_activate(api_handle)` calling your `activate()` function
- Generates `plugin_deactivate()` calling your `deactivate()` function
- Exports symbols with `-rdynamic` for the host to find

## Step 3: Load from Host

```typescript,no-test
import {
    loadPlugin, unloadPlugin,
    emitHook, emitEvent, invokeTool,
    setPluginConfig,
    discoverPlugins, listPlugins, listHooks, listTools,
    pluginCount, initPlugins,
} from "perry/plugin"

const id = loadPlugin("./counter-plugin.dylib")
console.log(`load returned: ${id !== 0 ? "ok" : "fail"}`)

const found = discoverPlugins("./plugins/")
console.log(`discovered ${found.length} plugin(s)`)

const result = emitHook("beforeSave", { content: "hello world" })

const greeting = invokeTool("greet", { name: "Perry" })
const formatted = invokeTool("formatCode", {
    code: "const x=1",
    language: "typescript",
})
```

## Plugin API Reference

The `api: PluginApi` passed to `activate()` provides:

### Metadata

```typescript,no-test
api.setMetadata(name: string, version: string, description: string): void
```

### Hooks

```typescript,no-test
api.registerHook(name: string, handler: (ctx: unknown) => unknown): void
api.registerHookEx(name: string, handler: (ctx: unknown) => unknown, priority: number, mode: number): void
```

`registerHook` defaults to priority 10 / mode 0 (filter). Use `registerHookEx`
for explicit priority and mode (0=filter, 1=action, 2=waterfall). Lower
priority numbers run first.

### Tools

```typescript,no-test
api.registerTool(name: string, description: string, handler: (args: unknown) => unknown): void
```

Tools are invoked by name from the host.

### Configuration

```typescript,no-test
const value = api.getConfig(key: string)  // Read host-provided config
```

### Events

```typescript,no-test
api.on(event: string, handler: (data: unknown) => void): void  // Listen for events
api.emit(event: string, data: unknown): void                    // Emit to other plugins
```

### Unregistering (Selective Cleanup)

The host purges all of a plugin's registrations when the plugin is unloaded,
so explicit unregister calls are only needed for **long-lived plugins that
re-configure themselves at runtime**, or for stopping services / event
listeners cleanly before re-registering.

```typescript,no-test
api.unregisterHook(name: string, handler: (ctx: unknown) => unknown): void
api.unregisterTool(name: string): void
api.unregisterService(name: string): void   // invokes the service's stopFn first
api.unregisterRoute(path: string): void
api.off(event: string, handler: (data: unknown) => void): void
```

`unregisterHook` / `off` do a **closure-identity compare**: pass the exact
same closure reference that was registered. `unregisterService` invokes the
service's `stopFn` before removing the entry, matching the lifecycle
contract of `registerService`. All five calls are no-ops if the caller did
not register the resource or no entry matches.

```typescript
// Recommended pattern: keep a module-scoped reference to handlers so
// `deactivate()` can selectively unregister them. The host also purges
// all of a plugin's registrations on unload, but explicit unregister
// calls are the right way to stop services / event handlers cleanly
// when a plugin re-configures itself at runtime. Shown here as a
// regular function (not exported) so it doesn't collide with the
// `activate` / `deactivate` exports from `counter-plugin` above.
const _onDataUpdated = (data: any) => {
    console.log(`${data.source} updated ${data.records} records`)
}

function _stopWorker() {
    console.log("worker stopped")
}

function _startWorker() {
    console.log("worker started")
}

function cleanupExample(api: PluginApi) {
    api.on("dataUpdated", _onDataUpdated)
    api.registerService("worker", _startWorker, _stopWorker)

    // Later, in your deactivate() export:
    api.off("dataUpdated", _onDataUpdated)
    api.unregisterService("worker")   // invokes _stopWorker before removal
}
```

## Next Steps

- [Hooks & Events](https://docs.perryts.com/plugins/hooks-and-events.html) — Hook modes, event bus
- [Overview](https://docs.perryts.com/plugins/overview.html) — Plugin system overview


---

<!-- source: docs/src/plugins/hooks-and-events.md -->

# Hooks & Events

> **Status: wired** ([#189](https://github.com/PerryTS/perry/issues/189) closed). `api.registerHook`, `api.on`, `emitHook`, `emitEvent`, `invokeTool` all dispatch to `crates/perry-runtime/src/plugin.rs`. Snippets below are compile-link verified against [`docs/examples/plugins/{plugin,host}_snippets.ts`](https://github.com/PerryTS/perry/tree/main/docs/examples/plugins).

Perry plugins communicate through hooks, events, and tools.

## Hook Modes

Hooks support three execution modes:

### Filter Mode (default)

Each plugin receives data and returns (possibly modified) data. The output of one plugin becomes the input of the next:

```typescript
function registerFilter(api: PluginApi) {
    api.registerHook("transform", (data: any) => {
        data.content = data.content.toUpperCase()
        return data // Returned data goes to next plugin
    })
}
```

### Action Mode

Plugins receive data but return value is ignored. Used for side effects. Pass
`mode = 1` to `registerHookEx`:

```typescript
function registerAction(api: PluginApi) {
    api.registerHook("onSave", (data: any) => {
        console.log(`Saved: ${data.path}`)
        return data
    })
}
```

### Waterfall Mode

Like filter mode, but specifically for accumulating/building up a result
through the chain. Pass `mode = 2` to `registerHookEx`:

```typescript
function registerWaterfall(api: PluginApi) {
    api.registerHook("buildMenu", (items: any) => {
        items.push({ label: "My Plugin Action", action: () => {} })
        return items
    })
}
```

## Hook Priority

Lower priority numbers run first. Use `registerHookEx` for explicit priority
and mode:

```typescript
function registerPriorities(api: PluginApi, validate: (d: any) => any, transform: (d: any) => any, log: (d: any) => any) {
    // Lower priority numbers run first; default 10. Mode 0=filter / 1=action / 2=waterfall.
    api.registerHookEx("beforeSave", validate, 10, 0)   // Runs first
    api.registerHookEx("beforeSave", transform, 20, 0)  // Runs second
    api.registerHookEx("beforeSave", log, 100, 1)        // Runs last (action mode)
}
```

Default priority is 10 (the value `registerHook` passes implicitly).

## Event Bus

Plugins can communicate with each other through events:

### Emitting Events

```typescript
function emitFromPlugin(api: PluginApi) {
    api.emit("dataUpdated", { source: "my-plugin", records: 42 })
}
```

```typescript
emitEvent("dataUpdated", { source: "host", records: 100 })
```

### Listening for Events

```typescript
function listenForEvent(api: PluginApi) {
    api.on("dataUpdated", (data: any) => {
        console.log(`${data.source} updated ${data.records} records`)
    })
}
```

## Tools

Plugins register callable tools (note the 3-arg shape: `name`, `description`,
`handler`):

```typescript
function registerFormatter(api: PluginApi) {
    api.registerTool("formatCode", "format source code", (args: any) => {
        return `// formatted: ${args.code}`
    })
}
```

```typescript
const greeting = invokeTool("greet", { name: "Perry" })
const formatted = invokeTool("formatCode", {
    code: "const x=1",
    language: "typescript",
})
```

## Configuration

Hosts can pass configuration to plugins via `setPluginConfig`:

```typescript
initPlugins()
setPluginConfig("api_key", "test-key")
setPluginConfig("max_retries", "3")
```

```typescript
function readConfig(api: PluginApi) {
    const theme = api.getConfig("theme")     // "dark"
    const retries = api.getConfig("maxRetries") // "3"
    return { theme, retries }
}
```

## Introspection

Query loaded plugins and their registrations:

```typescript
const plugins = listPlugins()
const hooks = listHooks()
const tools = listTools()
console.log(`loaded: ${pluginCount()} plugin(s), ${hooks.length} hook(s), ${tools.length} tool(s)`)
```

## Next Steps

- [Creating Plugins](https://docs.perryts.com/plugins/creating-plugins.html) — Build a plugin
- [Overview](https://docs.perryts.com/plugins/overview.html) — Plugin system overview


---

<!-- source: docs/src/plugins/native-extensions.md -->

# Native Extensions

> **Status: partially wired.** The `--bundle-extensions` flag, the `perry.nativeLibrary` `package.json` manifest, and `declare function` FFI imports are all wired into the compiler — see `crates/perry/src/commands/compile.rs` (the `bundle_extensions` argument, the `parse_native_library_manifest`/`build_external_native_libraries` helpers) and `crates/perry-codegen/src/codegen.rs` (the `nativeLibrary.functions` signature parser). The TypeScript snippets below assume a fully-populated extension directory exists on disk (e.g. `perry-appstore-review` cloned under `./extensions/`). They are kept as `,no-test` because the doc-tests harness doesn't have those external extensions checked in — a real project that does have them will compile cleanly. Drift protection for the parts that *don't* depend on external extensions (the FFI declare-function shape, etc.) lives in `docs/examples/platforms/wasm_snippets.ts`.

Perry supports native extensions — packages that bundle platform-specific code (Rust, Swift, JNI) alongside a TypeScript API. Unlike [dynamic plugins](https://docs.perryts.com/plugins/overview.html) loaded at runtime, native extensions are compiled directly into your binary.

Native extensions are how you access platform APIs that aren't part of Perry's built-in [System APIs](https://docs.perryts.com/system/overview.html) or [Standard Library](https://docs.perryts.com/stdlib/overview.html). Examples include [App Store Review](https://docs.perryts.com/plugins/appstore-review.html) and StoreKit for in-app purchases.

## Using a native extension

### 1. Add the extension to your project

Place the extension directory alongside your project, or in a shared extensions directory:

```
my-app/
├── package.json
├── src/
│   └── index.ts
└── extensions/
    └── perry-appstore-review/
        ├── package.json
        ├── src/
        │   └── index.ts
        ├── crate-ios/
        ├── crate-android/
        └── crate-stub/
```

### 2. Compile with `--bundle-extensions`

Pass the extensions directory when building:

```bash
perry src/index.ts -o app --target ios --bundle-extensions ./extensions
```

Perry discovers every subdirectory with a `package.json`, compiles its native crates for the target platform, and links them into your binary.

### 3. Import and use

```text
import { requestReview } from "perry-appstore-review";

await requestReview();
```

The import resolves at compile time to the extension's entry point. No runtime module loading is involved — the function compiles to a direct native call.

## How native extensions work

A native extension is a directory with a `package.json` that declares a `perry.nativeLibrary` section. This tells Perry which native functions exist, their signatures, and which Rust crate to compile for each platform.

### package.json manifest

```json
{
  "name": "perry-appstore-review",
  "version": "0.1.0",
  "main": "src/index.ts",
  "perry": {
    "nativeLibrary": {
      "functions": [
        { "name": "sb_appreview_request", "params": [], "returns": "f64" }
      ],
      "targets": {
        "ios": {
          "crate": "crate-ios",
          "lib": "libperry_appreview.a",
          "frameworks": ["StoreKit"]
        },
        "android": {
          "crate": "crate-android",
          "lib": "libperry_appreview.a",
          "frameworks": []
        },
        "macos": {
          "crate": "crate-ios",
          "lib": "libperry_appreview.a",
          "frameworks": ["StoreKit"]
        }
      }
    }
  }
}
```

#### `functions`

Each entry declares a native function the extension exports:

| Field | Description |
|-------|-------------|
| `name` | Symbol name — must match the `#[no_mangle]` Rust function exactly |
| `params` | Array of LLVM types: `"i64"` for pointers/strings, `"f64"` for numbers, `"i32"` for integers |
| `returns` | Return type — typically `"f64"` (NaN-boxed value or promise handle) |

#### `targets`

Each target platform maps to a Rust crate that implements the native functions:

| Field | Description |
|-------|-------------|
| `crate` | Relative path to the Rust crate directory |
| `lib` | Name of the static library produced by `cargo build` |
| `frameworks` | System frameworks to link (iOS/macOS only) |

Multiple targets can share the same crate (e.g., iOS and macOS often share an implementation). Platforms without an entry fall back to the stub.

### Extension directory layout

```
perry-appstore-review/
├── package.json              # Manifest with perry.nativeLibrary
├── src/
│   └── index.ts              # TypeScript API (what users import)
├── crate-ios/                # iOS/macOS native implementation
│   ├── Cargo.toml            # [lib] crate-type = ["staticlib"]
│   ├── build.rs              # Compiles Swift if needed
│   ├── src/
│   │   └── lib.rs            # Rust FFI: #[no_mangle] pub extern "C" fn ...
│   └── swift/
│       └── bridge.swift      # Swift bridge for Apple APIs (@_cdecl)
├── crate-android/            # Android native implementation
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs            # Rust FFI with JNI calls
└── crate-stub/               # Fallback for unsupported platforms
    ├── Cargo.toml
    └── src/
        └── lib.rs            # Returns error immediately
```

### TypeScript side

The `src/index.ts` declares native functions and optionally wraps them in a friendlier API:

```text
// Declare the native function (name must match package.json)
declare function sb_appreview_request(): number;

// Wrap it with a proper TypeScript signature
export async function requestReview(): Promise<void> {
  await (sb_appreview_request() as any);
}
```

`declare function` tells Perry the function is provided by native code. The raw return type is `number` because all values cross the FFI boundary as NaN-boxed `f64` values. Promise handles are NaN-boxed pointers that Perry's runtime knows how to `await`.

#### Ergonomic aliases and the wrapper-name collision rule

For manifest symbols that follow the `js_<pkg>_<snake_case>` convention (where `<pkg>` is the sanitized last segment of the package name), Perry derives an **ergonomic camelCase alias** so consumers can import a spec-faithful name without you writing any wrapper (issue #5621). For `@perryts/webgpu` a manifest symbol `js_webgpu_request_adapter` is importable as `requestAdapter`:

```typescript,no-test
// The package's src/index.ts only ambient-declares the raw symbols…
export declare function js_webgpu_request_adapter(): Promise<number>;

// …and consumers import the derived alias:
import { requestAdapter } from "@perryts/webgpu"; // → js_webgpu_request_adapter
```

The alias is a convenience **for packages that only export ambient `declare` signatures**. A *genuine* implemented export always wins over a derived alias (issue #6715): if your `src/index.ts` also exports a real wrapper whose name equals a manifest symbol's derived alias, the import binds to **your wrapper**, not the FFI symbol — your wrapper code runs, and it can call the raw symbol internally:

```typescript,no-test
export declare function js_speech_speak(
  text: string, rate: number, pitch: number, locale: string, voiceId: string): Promise<number>;

// `speak` is the derived alias of `js_speech_speak` — this real wrapper WINS.
export async function speak(text: string, options?: { rate?: number }): Promise<boolean> {
  const rate = options?.rate ?? -1;
  return (await js_speech_speak(text, rate, -1, "", "")) !== 0;
}
```

> **Recommended convention.** If you write real wrapper logic (options objects, JSON parsing, bool coercion) around your externs, name the manifest symbols `js_<pkg>_native_<snake>` so their derived aliases become `nativeSpeak`, `nativeDoThing`, etc. — names your package simply doesn't re-export. This keeps the aliases out of your public namespace and removes any chance of a wrapper/alias name clash. If two manifest symbols ever derive the *same* alias, Perry reports a hard compile error rather than binding to one silently.

### Rust side

Each platform crate is a `staticlib` that implements the declared functions using `#[no_mangle] pub extern "C"`:

```rust
// Perry runtime FFI
extern "C" {
    fn js_promise_new() -> *mut u8;
    fn js_promise_resolve(promise: *mut u8, value: f64);
    fn js_nanbox_string(ptr: i64) -> f64;
    fn js_nanbox_pointer(ptr: i64) -> f64;
}

#[no_mangle]
pub extern "C" fn sb_appreview_request() -> f64 {
    unsafe {
        let promise = js_promise_new();
        // ... call platform API, resolve promise when done ...
        js_nanbox_pointer(promise as i64)
    }
}
```

Key runtime functions available to native code:

| Function | Purpose |
|----------|---------|
| `js_promise_new()` | Create a new Perry promise, returns pointer |
| `js_promise_resolve(promise, value)` | Resolve a promise with a NaN-boxed value |
| `js_nanbox_string(ptr)` | Convert a C string pointer to a NaN-boxed string |
| `js_nanbox_pointer(ptr)` | Convert a pointer to a NaN-boxed object reference |
| `js_get_string_pointer_unified(val)` | Extract string pointer from a NaN-boxed value |
| `js_string_from_bytes(ptr, len)` | Create a Perry string from bytes |

### Swift bridge (iOS/macOS)

Apple platform APIs are often easiest to call from Swift. The pattern is:

1. Write a Swift file with `@_cdecl("function_name")` exports
2. Compile it to a static library in `build.rs`
3. Call the Swift functions from Rust via `extern "C"`

```swift
import StoreKit

typealias Callback = @convention(c) (UnsafeMutableRawPointer, UnsafePointer<CChar>) -> Void

@_cdecl("swift_appreview_request")
func swiftRequestReview(_ callback: @escaping Callback, _ context: UnsafeMutableRawPointer) {
    DispatchQueue.main.async {
        if let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
            SKStoreReviewController.requestReview(in: scene)
        }
        let result = "{\"success\":true}"
        result.withCString { callback(context, $0) }
    }
}
```

The `build.rs` compiles the Swift source into a static library using `swiftc`, targeting the correct platform SDK:

```rust
// build.rs (simplified)
fn main() {
    // Detect target: aarch64-apple-ios → arm64-apple-ios16.0, iphoneos SDK
    // Compile: swiftc -emit-library -static -target ... -sdk ... -framework StoreKit
    // Link:    cargo:rustc-link-lib=static=review_bridge
}
```

### JNI bridge (Android)

Android platform APIs are accessed through JNI. The pattern:

1. Get the `JavaVM` via `JNI_GetCreatedJavaVMs()`
2. Attach the current thread to get a `JNIEnv`
3. Call Java/Kotlin APIs through JNI method invocations
4. Resolve the Perry promise with the result

```rust
use jni::JavaVM;
use jni::objects::JValue;

fn request_review_impl() -> Result<(), String> {
    let vm = get_java_vm()?;
    let mut env = vm.attach_current_thread_as_daemon().map_err(|e| e.to_string())?;

    // Get Activity from PerryBridge
    let bridge = env.find_class("com/perry/app/PerryBridge").map_err(|e| e.to_string())?;
    let activity = env.call_static_method(bridge, "getActivity", "()Landroid/app/Activity;", &[])
        .map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

    // Call platform APIs via JNI...
    Ok(())
}
```

If the Android implementation requires a Java library (e.g., Google Play In-App Review), the app's `build.gradle` must include the dependency. Document this requirement clearly for your extension's users.

### Stub crate

For platforms without a native implementation, the stub immediately resolves the promise with an error:

```rust
#[no_mangle]
pub extern "C" fn sb_appreview_request() -> f64 {
    unsafe {
        let promise = js_promise_new();
        let msg = "{\"error\":\"Not available on this platform\"}";
        let c_str = std::ffi::CString::new(msg).unwrap();
        let val = js_nanbox_string(c_str.as_ptr() as i64);
        std::mem::forget(c_str);
        js_promise_resolve(promise, val);
        js_nanbox_pointer(promise as i64)
    }
}
```

## Build requirements

| Platform | Requirements |
|----------|-------------|
| iOS | macOS host, Xcode, `rustup target add aarch64-apple-ios` |
| iOS Simulator | macOS host, Xcode, `rustup target add aarch64-apple-ios-sim` |
| macOS | macOS host, Xcode Command Line Tools |
| Android | Android NDK, `rustup target add aarch64-linux-android` |

When Perry encounters a `perry.nativeLibrary` manifest during compilation, it:

1. Selects the crate for the current `--target` platform
2. Runs `cargo build --release --target <triple>` in the crate directory
3. Links the resulting `.a` static library into the final binary
4. Adds any declared frameworks (e.g., `-framework StoreKit`)

## Creating your own native extension

1. Create the directory structure shown above
2. Define your functions in `package.json` under `perry.nativeLibrary`
3. Implement each function in the platform crates with matching `#[no_mangle] pub extern "C"` signatures
4. Write a TypeScript entry point that declares and optionally wraps the native functions
5. Add a stub crate for unsupported platforms
6. Test with `--bundle-extensions`:
   ```bash
   perry app.ts --target ios-simulator --bundle-extensions ./extensions
   ```

## Next Steps

- [App Store Review](https://docs.perryts.com/plugins/appstore-review.html) — Native review prompt extension (iOS/Android)
- [Creating Plugins](https://docs.perryts.com/plugins/creating-plugins.html) — Dynamic plugins loaded at runtime
- [Overview](https://docs.perryts.com/plugins/overview.html) — Plugin system overview


---

<!-- source: docs/src/plugins/appstore-review.md -->

# App Store Review

> **Status: extension-dependent.** The compiler-side wiring (`--bundle-extensions`, `perry.nativeLibrary`, `declare function`) is in place — see [Native Extensions — Status](https://docs.perryts.com/plugins/native-extensions.html) — but the snippets below assume the `perry-appstore-review` extension repo has been cloned into `./extensions/`. The doc-tests harness doesn't ship that repo, so these snippets are kept as `,no-test`. Once the extension is on disk, they compile and run on iOS / iOS Simulator / macOS / Android.

Prompt users to rate your app using the native app store review dialog on iOS and Android.

The `perry-appstore-review` extension exposes a single function — `requestReview()` — that opens the platform's native review prompt. It does nothing else: when and how often to ask is entirely up to you.

**Repository:** [github.com/PerryTS/appstorereview](https://github.com/PerryTS/appstorereview)

## Quick start

### 1. Add the extension

Clone or copy the extension into your project's extensions directory:

```bash
mkdir -p extensions
cd extensions
git clone https://github.com/PerryTS/appstorereview.git perry-appstore-review
cd ..
```

Your project structure:

```
my-app/
├── package.json
├── src/
│   └── index.ts
└── extensions/
    └── perry-appstore-review/
```

### 2. Use in your app

```text
import { requestReview } from "perry-appstore-review";

// Show the review prompt when the user completes a meaningful action
async function onLevelComplete() {
  await requestReview();
}
```

### 3. Build

```bash
perry src/index.ts -o app --target ios --bundle-extensions ./extensions
```

The `--bundle-extensions` flag tells Perry to discover, compile, and link all native extensions in the given directory. The app store review native code is compiled and statically linked into your binary — no runtime dependencies.

## API

### `requestReview(): Promise<void>`

Opens the native app store review prompt. Returns a promise that resolves when the prompt has been presented (or skipped by the OS).

```text
import { requestReview } from "perry-appstore-review";

await requestReview();
```

The function only triggers the prompt. It does not:
- Track whether the user has already reviewed
- Throttle how often the prompt appears (iOS does this automatically; Android does not)
- Return whether the user actually left a review (neither platform provides this)

## Platform behavior

### iOS

The current extension uses
[`SKStoreReviewController.requestReview(in:)`](https://developer.apple.com/documentation/storekit/skstorereviewcontroller/requestreview(in:))
for its broad deployment-target compatibility. Apple now deprecates that API
in favor of
[`AppStore.requestReview(in:)`](https://developer.apple.com/documentation/storekit/appstore/requestreview(in:)-1q8qs).
Treat the legacy call as a compatibility implementation detail; new extension
releases should move to `AppStore.requestReview(in:)` when their minimum OS
allows it.

| Detail | Value |
|--------|-------|
| Native API | Compatibility path: deprecated `SKStoreReviewController.requestReview(in:)`; preferred modern API: `AppStore.requestReview(in:)` |
| Minimum iOS version | 14.0 |
| Framework | StoreKit |
| Thread | Dispatched to main thread automatically |
| Throttling | Apple limits display to 3 times per 365-day period per app. The system may silently ignore the call. |
| Development builds | Always shown in debug/TestFlight builds |
| User control | Users can disable review prompts in Settings > App Store |

**Important:** Apple's throttling means the prompt is not guaranteed to appear every time `requestReview()` is called. Design your app flow so that not showing the prompt doesn't break the user experience.

### macOS

Uses the same StoreKit API. Shares the iOS native crate (both compile from `crate-ios`).

| Detail | Value |
|--------|-------|
| Native API | Compatibility path: deprecated `SKStoreReviewController.requestReview()`; prefer StoreKit's current `AppStore`/environment review action where available |
| Minimum macOS version | 13.0 |
| Framework | StoreKit |
| Throttling | Same as iOS — system-controlled |

Only works for apps distributed through the Mac App Store.

### Android

Uses the [Google Play In-App Review API](https://developer.android.com/guide/playcore/in-app-review).

| Detail | Value |
|--------|-------|
| Native API | `ReviewManager.requestReviewFlow()` + `launchReviewFlow()` |
| Library | `com.google.android.play:review` |
| Minimum API level | 21 (Android 5.0) |
| Throttling | Google enforces a quota — the prompt may not appear every time |
| Execution | Runs on a background thread to avoid blocking the UI |

**Required Gradle dependency:** The Google Play In-App Review API is not part of the Android SDK. You must add it to your app's `build.gradle`:

```groovy
dependencies {
    implementation 'com.google.android.play:review:2.0.2'
}
```

Without this dependency, `requestReview()` will resolve with an error explaining the missing library.

### Other platforms

On unsupported platforms (Linux, Windows, Web), `requestReview()` resolves immediately with an error. It will not throw — your app continues normally.

## Best practices

**Do ask at the right moment.** Prompt after a positive experience — completing a level, finishing a task, achieving a goal. Don't ask on first launch or during onboarding.

**Don't ask too often.** Even though iOS throttles automatically, Android does not have the same strict limits. Implement your own logic to track when you last asked:

```text
import { requestReview } from "perry-appstore-review";
import { preferencesGet, preferencesSet } from "perry/system";

async function maybeAskForReview() {
  const lastAsked = Number(preferencesGet("lastReviewAsk") || "0");
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (now - lastAsked > thirtyDays) {
    preferencesSet("lastReviewAsk", String(now));
    await requestReview();
  }
}
```

**Don't condition app behavior on the review.** Neither iOS nor Android tells you whether the user left a review, gave a rating, or dismissed the prompt. The promise resolving does not mean a review was submitted.

**Don't use custom review dialogs before the native one.** Both Apple and Google discourage showing your own "Rate this app?" dialog before the native prompt. The native prompt is designed to be low-friction — adding a pre-prompt increases abandonment.

## Extension structure

The extension follows the standard [native extension](https://docs.perryts.com/plugins/native-extensions.html) layout:

```
perry-appstore-review/
├── package.json              # Declares sb_appreview_request function
├── src/
│   └── index.ts              # Exports requestReview()
├── crate-ios/                # iOS/macOS: Swift → SKStoreReviewController
│   ├── Cargo.toml
│   ├── build.rs              # Compiles Swift to static library
│   ├── src/lib.rs            # Rust FFI bridge
│   └── swift/review_bridge.swift
├── crate-android/            # Android: JNI → Play In-App Review API
│   ├── Cargo.toml
│   └── src/lib.rs
└── crate-stub/               # Other platforms: resolves with error
    ├── Cargo.toml
    └── src/lib.rs
```

One native function is declared in `package.json`:

```json
{
  "perry": {
    "nativeLibrary": {
      "functions": [
        { "name": "sb_appreview_request", "params": [], "returns": "f64" }
      ]
    }
  }
}
```

The TypeScript layer wraps this into the public `requestReview()` function. The native layer creates a Perry promise, calls the platform API, and resolves the promise when done.

## Next Steps

- [Native Extensions](https://docs.perryts.com/plugins/native-extensions.html) — How native extensions work, creating your own
- [iOS Platform](https://docs.perryts.com/platforms/ios.html) — iOS platform guide
- [Android Platform](https://docs.perryts.com/platforms/android.html) — Android platform guide
