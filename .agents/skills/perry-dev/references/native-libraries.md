<!-- Perry docs bundle: native-libraries.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/native-libraries/overview.md -->

# Native bindings — overview

Perry compiles TypeScript to native executables. When user code says
`import { createConnection } from "mysql2"`, the call doesn't bottom out
in JavaScript-engine glue — it lands on a Rust function that's been
linked into the binary as `extern "C"`. This page is the map of how
that works end-to-end.

Native bindings are an escape hatch for native and system boundaries, not
Perry's default npm compatibility mechanism. Pure JavaScript and TypeScript
packages should be compiled from their upstream source, and missing shared
Node.js or Web APIs should be implemented once in the runtime. The in-tree
well-known table still contains compatibility shims while those migrations are
completed; see [Bundled native-binding governance](https://docs.perryts.com/native-libraries/governance.html) for the
policy and the decision recorded for every extension crate.

## The big picture

There are four layers, from most stable to most flexible:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: User TypeScript                                        │
│    import { createConnection } from "mysql2";                     │
│    const c = await createConnection({ host, user, password });    │
│    const [rows] = await c.query("SELECT 1");                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ resolved at compile time → maps to
                              │ js_mysql2_* extern "C" symbols
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Bindings packages                                      │
│    Three sources, queried in this order:                          │
│                                                                   │
│    a. node_modules/<name>/ with perry.nativeLibrary               │
│       → the user installed an external binding via                │
│         `bun add @scope/<name>`. Wins over (b) and (c).           │
│                                                                   │
│    b. node_modules/<name>/ selected by compilePackages            │
│       → compile the installed JavaScript/TypeScript source.        │
│                                                                   │
│    c. well-known table (well_known_bindings.toml)                 │
│       → Perry ships a runtime API or transitional compatibility  │
│         shim. The governance inventory records its destination.  │
│                                                                   │
│    d. nothing matches → resolution error at compile time.         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ all wrapper crates depend on this:
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: perry-ffi crate (the stable ABI)                       │
│    pub fn alloc_string(s: &str) -> JsString                       │
│    pub fn read_string(JsString) -> Option<&'static str>           │
│    pub struct JsValue(u64); JsPromise; JsClosure; ...             │
│                                                                   │
│    9 surface dimensions: strings, async/Promise, handle           │
│    registry, JsValue/objects/arrays, binary bytes, closures,     │
│    GC root scanner, BigInt, Buffer, JSON-stringify, event-pump.  │
│                                                                   │
│    Wrapper authors depend ONLY on perry-ffi. perry-runtime's     │
│    internals (NaN-box tags, struct layouts) can change between    │
│    releases without breaking wrappers.                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ implementation detail of:
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: perry-runtime / perry-stdlib internals                 │
│    StringHeader / ArrayHeader / ObjectHeader layouts, NaN-      │
│    boxing tags, generational GC, arena allocator, async runtime,│
│    the 30+ in-tree native modules (perry/ui, perry/thread, ...).│
│    Free to change between Perry releases — the perry-ffi semver  │
│    is the only stable contract.                                  │
└─────────────────────────────────────────────────────────────────┘
```

The whole point: **anyone can publish a binding**. A third-party crate
ships an npm package containing a Rust crate, a `package.json` with a
`perry.nativeLibrary` block, and prebuilt staticlibs. Users
`bun add` it. Perry's compiler picks it up automatically. No PR to the
Perry repo, no central registry approval, no `@perryts/` namespace
required.

## Worked example: `import { createConnection } from "mysql2"`

Step by step, what happens when you `perry compile` a program with
that import:

### 1. Module resolution

Perry's resolver
([`crates/perry/src/commands/compile/resolve.rs`](https://github.com/PerryTS/perry/blob/main/crates/perry/src/commands/compile/resolve.rs))
walks each search path looking for `node_modules/mysql2/`:

- **If `node_modules/mysql2/package.json` exists with a
  `perry.nativeLibrary` block**: parse the manifest, treat the package
  as a native binding. Skip layers (c) and (d).
- **If `mysql2` is selected through `perry.compilePackages`**: compile the
  installed JavaScript package source. This is the intended long-term path for
  `mysql2` and other source packages.
- **Otherwise**: consult the
  **well-known table** at
  [`crates/perry/well_known_bindings.toml`](https://github.com/PerryTS/perry/blob/main/crates/perry/well_known_bindings.toml).
  The table maps `mysql2` → `perry-ext-mysql2` (a Rust crate that
  ships in the Perry install). The user didn't `npm install` anything;
  Perry handles it.
- **If nothing matches**: compile error pointing at the import line.

### 2. ABI version check

If the resolved binding has a `perry.nativeLibrary.abiVersion` field
(required from v0.6.0 onwards; warning-only in v0.5.x), Perry verifies
the declared semver range covers the bundled `perry-ffi` version. A
binding declaring `"0.5"` loads under any `0.5.x` Perry; one declaring
`"^1.0"` loads only under `1.x`. Mismatches are a hard compile error
with a recipe pointing at the offending package.

See [`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html) for the full schema.

### 3. Symbol mapping

The manifest's `functions[]` block lists every `extern "C"` symbol
the staticlib exports plus their TypeScript-visible signature:

```json
{
  "functions": [
    {
      "name": "js_mysql2_create_connection",
      "params": ["jsvalue"],
      "returns": "promise"
    },
    {
      "name": "js_mysql2_connection_query",
      "params": ["i64", "string", "jsvalue"],
      "returns": "promise"
    }
  ]
}
```

Perry's codegen translates the user's TS-side calls
(`mysql.createConnection(config)`, `c.query(sql, params)`) into direct
calls to these symbols, with the right argument coercion (JsValue
NaN-box ↔ f64 ABI shim, string-pointer extraction, etc.).

Those manifest entries are native ABI descriptors, not TypeScript
types. A descriptor like `f32` or `usize` chooses the native slot used
for the C call and still appears to user code as a JavaScript
`number`; `buffer+len` consumes one Buffer/Uint8Array-shaped argument
and emits `(ptr, usize)` native slots; `handle<T>` and `promise<T>`
carry metadata while remaining opaque runtime handles at the boundary.
See [`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html) for the full descriptor
vocabulary and the legacy string aliases that remain accepted.

### 4. Linking

The staticlib (`libperry_ext_mysql2.a` for the well-known case, or a
prebuilt artifact in `node_modules/mysql2/prebuilt/<target>/` for the
external case) joins the link line alongside `libperry_runtime.a` and
`libperry_stdlib.a`. The `js_mysql2_*` symbol references in the
user's compiled code resolve at link time.

If the binding ships only Rust source (no prebuilt), Perry runs
`cargo build --release` on the wrapper at compile time. Slow first
build, then cached.

### 5. Runtime

User code runs. Calls into `js_mysql2_*` happen at native speed —
function call overhead is one register-pass for the receiver handle
plus one each per param. Promise resolution / closure invocation /
async work bridge through perry-ffi's surface (`JsPromise`,
`JsClosure`, `spawn_blocking + tokio::Handle::current().block_on`).
The wrapper sees Perry's NaN-boxed JsValues directly; user TypeScript
sees a normal Promise / object / array.

## What perry-ffi guarantees

The 9 surface dimensions perry-ffi exposes today are:

| Surface | What it does | Documented at |
|---|---|---|
| Strings | `JsString` / `alloc_string` / `read_string` / `read_bytes` / `alloc_bytes` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| Async / Promise | `JsPromise` (`new` / `resolve` / `reject_string` as `Error` / `reject_with`), `spawn_blocking` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| Handles | `register_handle` / `get_handle` / `with_handle` / `take_handle` / `iter_handles_of` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| JsValue + objects/arrays | `JsValue`, `js_array_alloc/push/get/set`, `js_object_alloc_with_shape`, `js_object_get_field`, `js_object_set_field`, `build_object_shape` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| Closures | `JsClosure::call0..4` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| GC root scanner | `gc_register_root_scanner` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| BigInt | `BigIntHeader`, `alloc_bigint_from_str`, `read_bigint_limbs` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| Buffer | `BufferHeader`, `alloc_buffer`, `read_buffer_bytes` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| JSON-stringify | `json_stringify(JsValue) -> Option<String>` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |
| Event pump | `notify_main_thread` | [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) |

A wrapper that uses anything outside this list (e.g. reaches into
`perry_runtime::*` types directly) is **off-contract** — its build
will break the next time those types change. Stay on perry-ffi.

The [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) page is the source of truth for what's in each
surface. The semver promise: **breaking changes to anything documented
there bump perry-ffi major**, regardless of what `perry-runtime` does
internally.

## Code organization

```text
crates/
  perry-ffi/              ← Layer 2: the stable ABI surface
  perry-runtime/          ← Layer 1: NaN-boxing, GC, arena, JS objects
  perry-stdlib/           ← Layer 1: in-tree wrappers (perry/ui, fs,
                            crypto helpers, etc. — anything genuinely
                            coupled to runtime internals)
  perry-ext-<name>/       ← Layer 3: selectively linked runtime APIs and
                            compatibility shims. Their retained/migration
                            decisions live in workspace-architecture.json.

External native bindings (Layer 3, third-party — Rust + perry-ffi):
  PerryTS/tursodb-bindings    → bun add @perryts/tursodb
  PerryTS/iroh-bindings       → bun add @perryts/iroh
  <anyone>/whatever-bindings  → user publishes themselves

External pure-TypeScript drivers (compiled via compilePackages):
  PerryTS/postgres            → bun add @perryts/postgres
  PerryTS/mysql               → bun add @perryts/mysql
  PerryTS/mongodb             → bun add @perryts/mongodb
  PerryTS/redis               → bun add @perryts/redis
```

The split between **well-known** in-tree wrappers and **external** is a
packaging convention, not a technical distinction. Both depend only on
perry-ffi; both ship `extern "C"` symbols Perry's codegen calls. The policy
difference is intentional: an in-tree wrapper needs a shared runtime reason to
remain in core. Ordinary source packages should migrate to
`compilePackages`, while domain-specific native integrations should migrate to
external packages with independent releases.

The two existing external native wrappers (`tursodb`, `iroh`) cover
functionality that doesn't have an in-tree perry-stdlib equivalent —
they're net-new bindings that originated as third-party packages.
That validates the contract: perry-ffi is sufficient to write a real
wrapper without forking Perry.

## Three paths to a database driver (postgres / mysql / mongodb / redis)

Perry currently ships parallel database-driver families. The bundled native
drivers remain compatibility bridges; compiling real JavaScript/TypeScript
drivers is the migration target:

| Path | Install | Resolver layer | What it is |
|---|---|---|---|
| **Well-known native binding** | nothing (bundled) | (c) | Compatibility path: `import 'mysql2'` / `import 'pg'` / `import 'mongodb'` route to in-tree Rust wrappers. They remain available until the source-package migration gates pass. |
| **`@perryts/{postgres,mysql,mongodb,redis}`** | `bun add @perryts/postgres` | (a) | Pure-TypeScript wire-protocol drivers — no Rust, no native dep. Use Perry's [`compilePackages`](https://docs.perryts.com/packages/porting.html) to compile the TS to native via LLVM. Also run unmodified on Node.js / Bun. Independent semver. |
| **External native binding** | `bun add @perryts/tursodb` | (a) | Third-party Rust crate using `perry-ffi`, manifest at `package.json::perry.nativeLibrary`. Today: `@perryts/tursodb`, `@perryts/iroh`. |

Resolution precedence (per layer (a) → (b) → (c) above): an installed
`@perryts/mysql` does **not** override `import 'mysql2'` because the
package names are different. If you `bun add @perryts/mysql` and also
`import 'mysql2'` in the same program, both drivers ship in the
binary — they're independent. To opt out of the well-known `mysql2`
shim, just don't import `mysql2`.

**When to pick which:**

- **Well-known native (`mysql2` / `pg` / `mongodb`)** — current zero-install
  compatibility path; its feature set tracks Perry's release cadence and it is
  scheduled to yield to compiled package source.
- **`@perryts/postgres` / `@perryts/mysql` / `@perryts/mongodb` / `@perryts/redis`** —
  you want to read / fork / patch the driver in plain TypeScript;
  you want the same code running on Node.js or Bun for fallback;
  you need a feature ahead of Perry's next release.
- **External native binding** — you're wrapping a Rust crate that
  doesn't have a JS-only equivalent (Tursodb's embedded SQLite-
  compatible engine, Iroh's QUIC transport).

## Concrete how-tos

| If you want to … | Read |
|---|---|
| **Use a currently bundled compatibility shim** | `import` it directly, or explicitly select the installed package in `perry.compilePackages` to exercise the preferred source path. |
| **Use a third-party native binding** | `bun add <package>`, then `import`. Perry's resolver finds it via `node_modules/<pkg>/package.json`. |
| **Find which packages ship out-of-the-box** | `perry native list` |
| **Write your own native binding** | `perry native init my-bindings` scaffolds the Cargo crate + `package.json` + `release.yml` for prebuilds. Then read [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) for the perry-ffi surface and [`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html) for the manifest schema. |
| **Verify your binding's manifest matches its `.a`** | `cd my-bindings && perry native validate` (runs `cargo build --release`, walks `nm -gP` over the staticlib, diffs against `functions[]`, reports missing or undeclared symbols). |
| **Override a well-known binding** | Install your fork into `node_modules/<name>/` with a `perry.nativeLibrary` block. Resolution layer (a) wins over layer (c). |
| **See what stdlib APIs Perry implements** | Auto-generated from the manifest: [`docs/src/api/reference.md`](https://docs.perryts.com/api/reference.html). The `perry types` command writes a current snapshot to `.perry/types/stdlib/index.d.ts` for editor squiggles. |

## Authoring a binding — the 60-second tour

```sh
# Scaffold
perry native init my-pdf --description "PDF rendering bindings" \
  --upstream-dep 'pdfium-render = "0.8"'
cd my-pdf

# Edit src/lib.rs — add your `js_*` functions, all using only
# `perry_ffi::*` types
$EDITOR src/lib.rs

# Edit src/index.ts — declare the TS surface user code imports
$EDITOR src/index.ts

# Edit package.json — list every js_* export in the
# perry.nativeLibrary.functions[] block
$EDITOR package.json

# Verify
perry native validate
# ✅ manifest matches the staticlib

# Publish
git tag v0.1.0 && git push --tags  # the scaffolded release.yml
                                    # builds prebuilts for all targets
                                    # and attaches them to the release
npm publish
```

A user can now `bun add my-pdf` and `import { renderPdf } from "my-pdf"`
in their Perry program.

## Versioning policy

- **`perry-ffi`** semver: tracks Perry's minor today (`perry-ffi = "0.5"`
  for Perry `0.5.x`). Backwards-incompatible changes to anything
  documented in [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) bump perry-ffi *major* —
  independent of `perry-runtime`. Wrappers declare ABI `0.5` and use a tested
  Perry `0.5.x` revision of the crate; see [Consumption today](#consumption-today-v05x).
- **Manifest spec v1**: locked at `abiVersion: "0.5"`; missing field
  is warning-only in v0.5.x, hard error from v0.6.0. Schema changes
  bump the spec version (`v2`) and ship alongside a new manifest
  schema file.
- **Wrappers**: each ships independent semver; users `bun update` a
  binding without touching Perry.

## Consumption today (v0.5.x)

`perry-ffi` owns its public ABI types, but it is not currently available from
crates.io. Publishing it requires publishing the optional `perry-runtime`
dependency and its workspace dependency chain first. External wrappers use
the repository dependency that `perry native init` emits:

```toml
[dependencies]
perry-ffi = { git = "https://github.com/PerryTS/perry", branch = "main" }
```

Pin a tested Perry tag or commit for a released wrapper rather than following
`main` indefinitely. Leave the optional `runtime-link` feature off in a
production wrapper. It is primarily for wrapper test binaries that need Cargo
to pull in the runtime symbol provider; Perry supplies the runtime archive at
an application's final link step. See
[`abi.md`](https://docs.perryts.com/native-libraries/abi.html#versioning-and-dependency-setup) for the exact contract.

## Limits

- Bindings are **build-time linked**. Perry doesn't `dlopen` plugins
  at runtime — the staticlib joins the link line, the binary stands
  on its own.
- Bindings can't bring their own JS runtime — they extend Perry's,
  not replace it. A binding that wants its own GC / event loop /
  threading is out of scope.
- Cross-target prebuilds are the binding author's responsibility.
  The scaffolded GitHub Actions workflow handles the common matrix
  (x86_64+aarch64 macOS/Linux + Windows); other targets need
  manual additions.

## Next pages

- [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) — the perry-ffi surface, reference grade.
- [`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html) — the `perry.nativeLibrary`
  schema, every field documented.
- [API reference](https://docs.perryts.com/api/reference.html) — auto-generated list of every
  stdlib symbol Perry implements.


---

<!-- source: docs/src/native-libraries/authoring-guide.md -->

# Authoring a native binding

Step-by-step guide to writing and publishing a Rust binding that
Perry programs can `import` like any npm package.

For the architectural picture this fits into, see
[Native bindings — overview](https://docs.perryts.com/native-libraries/overview.html).

## Prerequisites

- A Rust crate you want to expose to TypeScript (e.g. `pdfium-render`,
  `image`, your own internal library).
- Rust toolchain installed.
- `perry` on your `PATH` (the [`perry native`](https://docs.perryts.com/cli/commands.html#native)
  subcommand ships with the install).
- A GitHub account if you want the prebuild release-CI scaffold to
  Just Work.

## 1. Scaffold

```sh
perry native init my-bindings \
  --description "Native bindings for <upstream crate>" \
  --upstream-dep '<crate-name> = "<version>"' \
  --github-owner <your-handle>

cd my-bindings
```

This creates:

```
my-bindings/
├── Cargo.toml                           # perry-ffi dep + your upstream
├── src/
│   ├── lib.rs                           # one example #[no_mangle] fn
│   └── index.ts                         # TS surface user code imports
├── package.json                         # perry.nativeLibrary block
├── README.md
├── LICENSE                              # MIT, swap if needed
├── .gitignore
└── .github/workflows/release.yml        # multi-target prebuild on tag
```

## 2. Add bindings

Each TypeScript-visible function should forward to one `extern "C"` Rust export.

### `src/lib.rs`

The example template starts with one `js_<name>_hello` function.
Replace it with your bindings — one `#[no_mangle] pub extern "C" fn`
per TypeScript-visible call, using **only** types from `perry_ffi`:

```rust
use perry_ffi::{alloc_string, StringHeader};

/// `pdf.parse(buf) -> string` — extract text from a PDF buffer.
///
/// # Safety
///
/// `buf_ptr` must be null or valid for `buf_len` bytes. Perry passes
/// this pair from a `buffer+len` manifest parameter.
#[no_mangle]
pub unsafe extern "C" fn js_pdf_parse(buf_ptr: *const u8, buf_len: usize) -> *mut StringHeader {
    let bytes = if buf_ptr.is_null() {
        &[]
    } else {
        std::slice::from_raw_parts(buf_ptr, buf_len)
    };
    match pdfium_render::Pdfium::default().load_pdf_from_byte_slice(bytes, None) {
        Ok(doc) => {
            let text = doc.pages().iter().map(|p| p.text().unwrap()).collect::<String>();
            alloc_string(&text).as_raw()
        }
        Err(_) => std::ptr::null_mut(),
    }
}
```

Key rules:
- **Don't `use perry_runtime::*`**. perry-runtime's internals (NaN-box
  tags, struct layouts) change between Perry releases. perry-ffi is
  the stable contract.
- **Use `unsafe extern "C"` for any function that takes pointer args**.
  `*const StringHeader` etc. require unsafe at the call site.
- **Document `# Safety` for unsafe fns** — at minimum say "the
  pointer must be null or a Perry-runtime `<Header>`".
- **Async returns `*mut Promise`**. Pattern: `JsPromise::new()` →
  `spawn_blocking(move || { tokio::runtime::Handle::current().block_on(async {...}); promise.resolve(...) })`
  → return `promise.as_raw()`.

### `src/index.ts`

Declare the FFI symbol from your manifest, then export the TypeScript
surface user code imports. Perry's FFI dispatch keys on the call-site
identifier, so the wrapper body must explicitly call the `js_*` symbol
listed in `perry.nativeLibrary.functions[]`.

```typescript
declare function js_pdf_parse(buf: Uint8Array): string;

/**
 * Extract text from a PDF buffer.
 */
export function parse(buf: Uint8Array): string {
  return js_pdf_parse(buf);
}
```

### `package.json`

The `perry.nativeLibrary` block tells Perry's compiler about every
`extern "C"` export plus the build config. Schema details in
[`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html).

```json
{
  "name": "my-bindings",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "perry": {
    "nativeLibrary": {
      "abiVersion": "0.5",
      "functions": [
        {
          "name": "js_pdf_parse",
          "params": [{ "kind": "buffer+len" }],
          "returns": "string"
        }
      ],
      "targets": {
        "macos":   { "crate": "native", "lib": "perry_ext_my_bindings" },
        "linux":   { "crate": "native", "lib": "perry_ext_my_bindings" },
        "windows": { "crate": "native", "lib": "perry_ext_my_bindings" }
      }
    }
  }
}
```

Every entry in `functions[]` must:
- have a `name` matching exactly the symbol the staticlib exports
  (Perry's `perry native validate` verifies this for you)
- declare `params` and `returns` so codegen knows the calling convention

Manifest descriptors are native ABI descriptors, not TypeScript
surface types. Existing strings such as `"string"`, `"number"`,
`"i64"`, and `"void"` still work. Use the explicit vocabulary when
you need native precision or metadata: `"f32"`, `"u32"`, `"u64"`,
`"usize"`, `"buffer_len"`, `{ "kind": "buffer+len" }`,
`{ "kind": "handle", "type": "MyThing" }`, and
`{ "kind": "promise", "result": "jsvalue" }`.

Handles are opaque Perry native handle objects in JavaScript, not raw
numbers. Legacy `"handle"` and `"handle<T>"` descriptors still parse
as borrowed handles; structured descriptors can add ownership,
nullability, thread affinity, debug names, and an owned-return
finalizer:

```json
{
  "kind": "handle",
  "type": "MyThing",
  "ownership": "owned",
  "thread": "creator",
  "finalizer": "my_thing_free",
  "debugName": "MyThing"
}
```

The finalizer symbol must use `void(ptr, ptr)` ABI and must only free
native resources. It can run from GC finalization, so it must not call
Perry JS APIs or allocate JS values. Use `"ptr"` when an API
intentionally accepts a raw pointer payload instead of a managed
handle.

## 3. Verify

```sh
perry native validate
```

This runs `cargo build --release`, locates the resulting `.a`,
walks `nm -gP` over its symbols, and diffs against the manifest's
`functions[]`. The output flags two failure modes:

- **❌ declared function has NO matching symbol** — your manifest
  lists a function the staticlib doesn't export. Either you typo'd
  the name, or you forgot `#[no_mangle]`.
- **⚠ `js_*` symbol NOT in the manifest** — your staticlib exports
  a function user code can't reach. Either add it to `functions[]`,
  rename it (drop the `js_` prefix), or remove it.

A green run looks like:

```text
perry native validate
======================
  package:    my-bindings
  abiVersion: 0.5
  staticlib:  ./target/release/libperry_ext_my_bindings.a
  declared functions:           1
  exported `js_*` symbols:      1
  ✅ manifest matches the staticlib.
```

## 4. Test in a Perry program

In a separate directory:

```sh
mkdir test-app && cd test-app
perry init
bun add file:../my-bindings   # or any path your tooling supports
```

Add to your TS:

```typescript
import { parse } from "my-bindings";
const buf = await Bun.file("input.pdf").bytes();
console.log(parse(buf));
```

Then `perry compile main.ts -o main && ./main`.

## 5. Publish

### Tag a release

```sh
git tag v0.1.0
git push --tags
```

The scaffolded `.github/workflows/release.yml` builds prebuilt
staticlibs for x86_64 + aarch64 macOS/Linux + Windows on tag and
attaches them to the GitHub release. Add or remove targets in the
workflow's `matrix` block as needed.

### npm publish

```sh
npm publish
```

The scaffolded `package.json` includes the right `files: [...]` list
to bundle `src/` + `Cargo.toml` + the README. If you also vendor the
prebuilt artifacts in the npm tarball, add them to the `files` block.

### Two distribution models

There are two ways your users get the staticlib:

| Model | What ships in the npm tarball | Trade-off |
|---|---|---|
| **Vendor prebuilts** | `src/`, `Cargo.toml`, AND `prebuilt/<target>/lib<name>.a` for every target | Bigger npm tarball; install is fast (no compile); user doesn't need a Rust toolchain |
| **Source-only** | `src/`, `Cargo.toml`, no prebuilts | Tiny tarball; first `perry compile` runs `cargo build --release` (slow); user needs Rust |

Vendoring is the friendlier default for npm consumers. Source-only
makes sense if your matrix is too big for one tarball or if you're
publishing a private wrapper to a small audience.

The manifest's `targets.<target>.prebuilt` field tells Perry where to
find a prebuilt for the user's compile target:

```json
{
  "perry": {
    "nativeLibrary": {
      "targets": {
        "macos":   { "prebuilt": "./prebuilt/macos/libperry_ext_my_bindings.a" },
        "linux":   { "prebuilt": "./prebuilt/linux/libperry_ext_my_bindings.a" },
        "windows": { "prebuilt": "./prebuilt/windows/perry_ext_my_bindings.lib" }
      }
    }
  }
}
```

If a `prebuilt` field is present, Perry treats the archive as required
for that target and fails with a diagnostic when it cannot be resolved
or linked. Omit `prebuilt` and provide `crate` / `lib` when the target
should build from source instead.

### Backend-aware packaging

Graphics or compute wrappers can describe backend-owned artifacts
without adding app-specific APIs to Perry. Put backend metadata under
the target that can actually use it:

```json
{
  "perry": {
    "nativeLibrary": {
      "targets": {
        "ios": {
          "prebuilt": "./prebuilt/ios/libdemo.a",
          "backends": {
            "metal": {
              "frameworks": ["Metal", "QuartzCore"],
              "shaderSources": ["shaders/default.metal"],
              "shaderOutputs": ["prebuilt/default.metallib"],
              "resources": ["resources/metal"]
            }
          }
        },
        "linux": {
          "prebuilt": "./prebuilt/linux/libdemo.a",
          "backends": {
            "vulkan": {
              "libs": ["vulkan"],
              "shaderOutputs": ["prebuilt/default.spv"]
            }
          }
        },
        "windows": {
          "prebuilt": "./prebuilt/windows/demo.lib",
          "backends": {
            "d3d12": {
              "libs": ["d3d12", "dxgi", "dxguid"],
              "shaderOutputs": ["prebuilt/default.dxil"]
            }
          }
        }
      }
    }
  }
}
```

Perry validates the backend/target pairing early: Metal is Apple-only,
Vulkan is available on macOS/Linux/Windows/Android/HarmonyOS, and D3D12
is Windows-only. Precompiled shader outputs and resources are copied
under `NativeLibraries/<package>/<backend>/` in app bundles.

## 6. Update over time

- **A new perry-ffi feature lands**: bump your `Cargo.toml`'s
  `perry-ffi` version, rebuild prebuilts, tag a new release. Users
  `bun update` to pick it up. Perry's manifest spec stays at v1
  unless the schema changes.
- **A new Perry minor**: same — `perry-ffi`'s semver moves with
  Perry's minor. The git-URL consumption (v0.5.x) means rebuilding
  against `main` picks it up automatically.
- **Breaking change to the `js_*` surface you exported**: bump your
  package's major version (`1.0.0` → `2.0.0`). Users who pin a
  major aren't affected.

## Common patterns

### Async one-shot (HTTP request, DB query)

```rust
use perry_ffi::{alloc_string, spawn_blocking, JsPromise, JsValue, Promise};

#[no_mangle]
pub extern "C" fn js_my_fetch(url_ptr: *const StringHeader) -> *mut Promise {
    let promise = JsPromise::new();
    let raw = promise.as_raw();
    let url = unsafe { read_str(url_ptr) }.unwrap_or_default();

    spawn_blocking(move || {
        let outcome = tokio::runtime::Handle::current().block_on(async move {
            reqwest::get(&url).await.and_then(|r| Ok(r.text())).await
        });
        match outcome {
            Ok(body) => promise.resolve(JsValue::from_string_ptr(alloc_string(&body).as_raw())),
            Err(e)   => promise.reject_string(&format!("fetch: {}", e)),
        }
    });
    raw
}
```

`reject_string(message)` rejects with a real JavaScript `Error`: consumers can
use `error instanceof Error`, `error.message`, and `error.stack`. Use
`reject(value)` only when the API intentionally rejects with a non-Error value,
or `reject_with(...)` when the Error needs structured fields built on the main
thread.

### Sync handle-based class

Use a `handle` descriptor for synchronous resource-style APIs. The
native function receives or returns the raw resource pointer as `i64`,
while TypeScript callers see only the opaque handle object.

```rust
use perry_ffi::{get_handle, register_handle, Handle};

pub struct MyThing { val: u64 }

#[no_mangle]
pub extern "C" fn js_my_thing_new() -> Handle {
    register_handle(MyThing { val: 0 })
}

#[no_mangle]
pub extern "C" fn js_my_thing_get(h: Handle) -> f64 {
    get_handle::<MyThing>(h).map(|t| t.val as f64).unwrap_or(0.0)
}
```

### Event listeners (`.on(event, cb)`)

```rust
use perry_ffi::{
    gc_register_root_scanner, get_handle_mut, iter_handles_of, register_handle,
    Handle, JsClosure, RawClosureHeader, StringHeader,
};

pub struct EventEmitter {
    listeners: Vec<i64>,  // closure pointers, kept alive by the GC scanner below
}

static SCANNER_REGISTERED: std::sync::Once = std::sync::Once::new();

fn ensure_scanner() {
    SCANNER_REGISTERED.call_once(|| {
        gc_register_root_scanner(|mark| {
            iter_handles_of::<EventEmitter, _>(|emitter| {
                for &cb in &emitter.listeners {
                    if cb != 0 {
                        let nan_boxed = f64::from_bits(0x7FFD_0000_0000_0000 | (cb as u64 & 0x0000_FFFF_FFFF_FFFF));
                        mark(nan_boxed);
                    }
                }
            });
        });
    });
}

#[no_mangle]
pub extern "C" fn js_emitter_on(h: Handle, cb: i64) -> Handle {
    ensure_scanner();
    if let Some(e) = get_handle_mut::<EventEmitter>(h) {
        e.listeners.push(cb);
    }
    h
}

#[no_mangle]
pub extern "C" fn js_emitter_emit(h: Handle, arg: f64) -> bool {
    if let Some(e) = get_handle_mut::<EventEmitter>(h) {
        for &cb in e.listeners.clone().iter() {
            let closure = unsafe { JsClosure::from_raw(cb as *const RawClosureHeader) };
            let _ = unsafe { closure.call1(arg) };
        }
        true
    } else {
        false
    }
}
```

The GC scanner is **load-bearing**: without it, a malloc-triggered
GC between `.on(cb)` and `.emit()` will sweep the closure and the
next emit calls freed memory. Always register a scanner if your
handles store closure pointers.

## When to extend the perry-ffi surface

If your binding genuinely needs something perry-ffi doesn't expose,
file an issue against
[`PerryTS/perry`](https://github.com/PerryTS/perry/issues) describing:

- the binding you're writing,
- the perry-runtime function/type you'd otherwise reach into,
- why a higher-level perry-ffi entry would generalize.

The bar for adding to perry-ffi is high — every helper is a forever
commitment — but real wrappers driving real needs is exactly the
right input. The recent additions (BigInt + Buffer in v0.5.556,
JSON-stringify + event-pump in v0.5.567 followups) all came from
specific wrappers needing them.

Don't reach into `perry_runtime::*` directly to "unblock" your
wrapper today — it'll break the next time those internals change.

## See also

- [`overview.md`](https://docs.perryts.com/native-libraries/overview.html) — the architectural picture.
- [`abi.md`](https://docs.perryts.com/native-libraries/abi.html) — perry-ffi reference.
- [`manifest-v1.md`](https://docs.perryts.com/native-libraries/manifest-v1.html) — the manifest schema in full.
- [`PerryTS/tursodb-bindings`](https://github.com/PerryTS/tursodb-bindings)
  and
  [`PerryTS/iroh-bindings`](https://github.com/PerryTS/iroh-bindings)
  for end-to-end real-world examples.


---

<!-- source: docs/src/native-libraries/abi.md -->

# `perry-ffi` — the stable ABI for native bindings

This page documents the contract between native bindings packages
(`@perryts/iroh`, `@perryts/tursodb`, `perry-ext-dotenv`, …) and
the Perry runtime they execute inside.

> **New here?** Start with [Native Bindings — Overview](https://docs.perryts.com/native-libraries/overview.html)
> for the architectural picture and the
> [Authoring Guide](https://docs.perryts.com/native-libraries/authoring-guide.html) for the step-by-step. This page
> is reference-grade detail.

`perry-ffi` is deliberately smaller and more stable than
`perry-runtime`. It owns the public ABI types and helpers that wrapper
crates use while leaving runtime internals—field offsets, allocator
hooks, and NaN-boxing implementation details—free to change.

## Versioning and dependency setup

`perry-ffi` ships its own semver, currently tracking Perry's minor:
the `0.5.x` ABI accompanies Perry `0.5.x`. The crate is not currently
available from crates.io: publication is blocked on publishing its optional
`perry-runtime` dependency and that dependency's workspace chain first.
External wrappers therefore use the repository dependency emitted by
`perry native init`:

```toml
[dependencies]
perry-ffi = { git = "https://github.com/PerryTS/perry", branch = "main" }
```

For a released wrapper, pin a tested Perry tag or commit instead of allowing
an unreviewed `main` update to change the build underneath the release.

The crate defines its own `#[repr(C)]` ABI types, including
`StringHeader`, `ArrayHeader`, `ObjectHeader`, `BigIntHeader`,
`BufferHeader`, `ClosureHeader`, `Promise`, and
`NativeAsyncCompletion`. Do not import those types from
`perry-runtime`.

The optional `runtime-link` feature is for wrapper tests that need the
Perry runtime's symbol implementations in their test binary. External
wrappers should normally leave it disabled: Perry links the runtime archive
when it builds the final application.

A wrapper's `package.json` declares the ABI range it was built against:

```json
{
  "perry": {
    "nativeLibrary": {
      "abiVersion": "0.5",
      "...": "..."
    }
  }
}
```

Perry validates this range when it resolves the package. An invalid
range or a range that excludes Perry's bundled `perry-ffi` version is
a compilation error. During the `0.5.x` cycle only, omitting
`abiVersion` emits a warning and continues; from `0.6.0`, omission is
also an error. A backwards-incompatible change to this ABI requires a
major `perry-ffi` version change, independently of `perry-runtime`.

## Current surface (`0.5.x`)

The table below groups the main public APIs. The
[`perry-ffi` exports][ffi-src] and their Rust documentation are the
source of truth for exact signatures and safety requirements.

| Area | Public surface |
| --- | --- |
| Strings and bytes | `JsString`, `alloc_string`, `read_string`, `alloc_bytes`, `read_bytes` |
| JavaScript values | `JsValue`, its value constants and conversions, `alloc_object`, `alloc_null_proto_object`, `build_object_shape` |
| Arrays and objects | `js_array_alloc/get/length/push/set`, `js_object_alloc_with_shape/get_field/set_field`, `object_field_by_name` |
| Closures | `JsClosure::call0` through `call4`, `alloc_closure`, capture accessors, arity registration |
| Buffers and BigInts | `alloc_buffer`, `read_buffer_bytes`, `alloc_bigint_from_str`, `read_bigint_limbs` |
| Async work | `JsPromise`, `JsNativeAsyncCompletion`, `spawn_async`, `spawn_blocking`, `spawn_blocking_with_reactor`, `run_pending` |
| Native state and GC | The typed handle registry, mutable root scanners, and `TransientRootScope` |
| Errors and integration | Error/warning helpers, `json_stringify`, auxiliary event-pump hooks, and `RawNetVtable` registration |

### Strings

```rust
pub struct JsString(/* opaque */);

pub fn alloc_string(s: &str) -> JsString;
pub fn read_string(handle: JsString) -> Option<&'static str>;

impl JsString {
    pub unsafe fn from_raw(ptr: *mut StringHeader) -> Self;
    pub fn as_raw(self) -> *mut StringHeader;
    pub fn is_null(self) -> bool;
}
```

`alloc_string` copies UTF-8 into a new runtime-owned string.
`read_string` returns `None` for a null handle or invalid UTF-8. The
returned bytes are borrowed from the runtime arena; do not free them or
retain a raw pointer beyond the lifetime guaranteed by the calling
context.

Use `perry_ffi::StringHeader` in exported signatures:

```rust
pub extern "C" fn js_my_module_thing() -> *mut perry_ffi::StringHeader
```

### Async promise rejection

`JsPromise::reject_string(message)` copies the message and rejects with a real
JavaScript `Error` allocated on the runtime's main thread. Its `.message` and
`.stack` are available to ordinary handlers, and `instanceof Error` succeeds.
`JsPromise::reject(value)` remains the escape hatch for APIs that deliberately
reject with an arbitrary JavaScript value. Use `JsPromise::reject_with` to
construct a structured rejection value safely on the main thread.

### ABI boundaries and thread safety

- Use the exported constructors, accessors, and `JsValue` conversions.
  Do not depend on private runtime field offsets or hard-code pointer
  tags.
- JavaScript heap allocation is tied to Perry's main-thread arena. If
  worker-thread work must produce an object, array, or other complex
  `JsValue`, carry plain `Send` data back and construct the value with
  `JsPromise::resolve_with` on the main thread.
- Register native values that retain JavaScript references with the
  handle/root-scanner APIs. Use `TransientRootScope` for temporary
  values that must survive an allocation or collection point.
- Respect the `unsafe` contracts on raw pointer constructors and FFI
  entry points. `perry-ffi` stabilizes the interface; it cannot prove
  that a caller supplied a live pointer of the declared type.
- Keep `runtime-link` out of production wrapper dependencies unless
  the crate genuinely needs a Cargo-level `perry-runtime` link. It is
  normally enabled only in wrapper tests.

Any new ABI helper should be documented and covered by a focused test
in `crates/perry-ffi` in the same change.

## Reference example: `perry-ext-dotenv`

The smallest in-tree wrapper demonstrates string input and output:

```rust
use perry_ffi::{alloc_string, read_string, JsString, StringHeader};

#[no_mangle]
pub unsafe extern "C" fn js_dotenv_config_path(
    path_ptr: *const StringHeader,
) -> f64 {
    let handle = JsString::from_raw(path_ptr as *mut _);
    let path = read_string(handle).unwrap_or(".env");
    // … read file, set env vars, return 1.0 / 0.0 …
}

#[no_mangle]
pub unsafe extern "C" fn js_dotenv_parse(
    content_ptr: *const StringHeader,
) -> *mut StringHeader {
    let handle = JsString::from_raw(content_ptr as *mut _);
    let Some(content) = read_string(handle) else {
        return std::ptr::null_mut();
    };
    let parsed = parse_dotenv_content(content);
    let json = serde_json::to_string(&parsed).unwrap_or_else(|_| "{}".into());
    alloc_string(&json).as_raw()
}
```

Source: [`crates/perry-ext-dotenv/src/lib.rs`][dotenv-src]. The crate's
normal dependency is `perry-ffi`; its dev-dependency enables
`runtime-link` so the FFI round-trip test can link runtime symbols.

## Tooling and implementation status

The native-library work tracked by [#466] has landed:

- manifests declare their native functions and ABI version;
- incompatible declared ABI ranges are rejected during resolution;
- `perry native init`, `perry native validate`, and
  `perry native list` provide authoring and inspection workflows;
- the well-known bindings table routes supported package imports; and
- wrappers can depend on the repository's stable `perry-ffi` API instead of
  `perry-runtime` internals.

Issue #466 is retained as the historical design record. Open a new
issue for a missing ABI helper or a new native-library capability.

[#466]: https://github.com/PerryTS/perry/issues/466
[ffi-src]: https://github.com/PerryTS/perry/blob/main/crates/perry-ffi/src/lib.rs
[dotenv-src]: https://github.com/PerryTS/perry/blob/main/crates/perry-ext-dotenv/src/lib.rs


---

<!-- source: docs/src/native-libraries/zero-config-and-faithfulness.md -->

# Zero-config bindings and faithfulness

This note describes Perry's default routing for installed npm dependencies and
the compatibility marker used by bundled `perry-ext-*` bindings.

## Resolution behavior

For a bare import, Perry first checks whether the module is in its native
module manifest. Unless the root package was explicitly selected through
`perry.compilePackages`, a native module is served by its bundled binding and
file resolution does not walk into the installed package source.

Other reachable packages are AOT-compiled by default. When the host
`package.json` omits `perry.compilePackages`, Perry enumerates installed
packages, skips natively shimmed packages, and routes the remaining usable
TypeScript/JavaScript source through the compiler. Packages marked as Node
native addons are excluded from wildcard selection: this preserves guarded
optional acceleration such as `msgpackr-extract`, while a statically imported
pure source subpath can still be promoted into the AOT graph. Reaching an
actual `.node` binary still fails, and listing the addon by exact name retains
the actionable whole-package hard error. This is equivalent to:

```json
{
  "perry": {
    "compilePackages": "auto"
  }
}
```

`"all"`, `true`, and a literal `"*"` array entry have the same universal
routing meaning. An explicit package list constrains routing; `false` or `[]`
opts out entirely and restores the listed-only V8-free gate.

When no allow policy is present, universal auto routing also receives the
universal compile allow. Explicit trust policy is never discarded:

- `perry.allow.compilePackages` can constrain the packages admitted by auto
  routing;
- `perry.allow.compilePackages: false` or `[]` fails closed;
- `PERRY_ALLOW_PERRY_FEATURES=0` clears the allowlist and fails closed;
- `PERRY_ALLOW_PERRY_FEATURES=1` remains the one-off universal override.

## The compatibility marker

Each row in `crates/perry/well_known_bindings.toml` may declare:

```toml
[bindings.example]
crate = "perry-ext-example"
lib = "perry_ext_example"
compat = "partial"
```

The two values are:

- `full`: an exhaustively audited drop-in for the pinned npm package's public
  API and observable behavior;
- `partial`: a subset or a wrapper that has not yet passed that audit.

An absent or unknown value is `partial`. Aliases inherit the target binding's
effective marker; missing targets and alias cycles fail closed as partial.

The current third-party wrappers remain partial. Several superficially small
wrappers still differ materially from their pinned packages: the UUID wrapper,
for example, lacks exports including `parse` and `stringify`; nanoid flattens a
curried API and omits exports; and dotenv implements only part of its current
surface. A `full` marker should be added only after the implementation and
conformance tests cover the complete pinned surface.

Ordinary packages that have completed their source migration are not listed in
the native manifest or this table. They must be installed in the application,
and Perry compiles their package source through the normal automatic routing
path. `slugify` is the first completed migration under this policy.

## Diagnostics and strict mode

When a partial binding wins while a copy of its root package exists in
`node_modules`, text-mode builds emit one informational note per package. The
note points to `perry.compilePackages`, which makes the installed JavaScript
source win instead.

For CI that must never substitute a partial wrapper, set:

```sh
PERRY_REQUIRE_FAITHFUL_BINDINGS=1 perry compile src/main.ts
```

Only enabled values (`1` or `true`, case-insensitive) activate strict mode.
Under strict mode Perry refuses the partial auto-preference and identifies the
binding and importing module. Add the root package to both
`perry.compilePackages` and the applicable allow policy to compile the real
source, or disable strict mode to accept the bundled subset.

Registered subpaths are classified before root fallback. Thus an import such
as `mysql2/promise` uses that alias row and inherits `mysql2`'s compatibility,
while the installed-copy probe and `compilePackages` suggestion correctly use
the root package name `mysql2`.

Both `PERRY_REQUIRE_FAITHFUL_BINDINGS` and `PERRY_ALLOW_PERRY_FEATURES` are
included in the build-cache environment fingerprint, so changing either policy
cannot reuse an artifact produced under different routing rules.


---

<!-- source: docs/src/native-libraries/upstream-pins.md -->

# Well-known binding upstream pins

Every third-party npm package that ships a bundled native wrapper in
`crates/perry/well_known_bindings.toml` carries a **provenance pin**: the exact
upstream release the wrapper ports, its tarball content hash, and the date the
wrapper was last reviewed against it. This is the same discipline the
socket-registry fleet applies to its vendored upstream references, adapted for
npm dists.

```toml
[bindings.ioredis]
crate = "perry-ext-ioredis"
lib = "perry_ext_ioredis"
tracking = "#466"

[bindings.ioredis.upstream]
version   = "5.11.1"          # pinned npm release (immutable dist)
sha256    = "56b4e71e…"       # sha256 of the registry tarball at pin time
repo      = "https://github.com/luin/ioredis"
ref       = "fb224a76…"       # publisher's gitHead for the release, when known
ported-at = "5.11.1"          # release the wrapper was last REVIEWED against
date      = "2026-07-30"
```

## The lock-step rule

**`ported-at` must equal `version`.** Re-pinning a binding to a newer upstream
release without re-reviewing the wrapper against the upstream diff reds the
`binding_pins.mjs --check` gate — and the perry binary itself refuses to load a
skewed table. An upstream release can never go silently stale, and a pin bump
can never outrun the review it demands: bumping `version` forces you to advance
`ported-at`, which forces the review.

## Exempt entries

Three kinds of row carry no pin:

- **Node builtins** (`node-builtin = true`): `zlib`, `events`, `net`, `http`,
  `https`, `http2`, `streams`. Their upstream is Node core, not an npm dist.
- **Aliases** (`alias-of = "<binding>"`): a package subpath (`mysql2/promise`)
  or a bare-name alias (`fetch` → `node-fetch`) that shares its target's
  provenance.
- **Perry-owned packages** (`@perryts/*`, `perry/*`).

Note that a distinct npm package served by a shared wrapper crate is **not** an
alias — `redis` and `iovalkey` both use `perry-ext-ioredis` but are separately
published and versioned, so each carries its own pin.

## Tooling — `scripts/binding_pins.mjs`

```sh
# Provision or bump one pin to a specific version (default: latest stable)
node scripts/binding_pins.mjs --set ioredis 5.11.1

# Provision every currently-unpinned binding at its latest stable
node scripts/binding_pins.mjs --backfill

# Offline gate (CI): pins present, lock-stepped, crates exist. Exit 1 on any
# violation. No network.
node scripts/binding_pins.mjs --check

# Advisory: additionally flag pins whose upstream has a newer stable release
# that has soaked >= N days (default 7). Network. Run in the weekly update.
node scripts/binding_pins.mjs --check --refresh --soak-days 7

# Materialize the upstream repo at the pinned ref into gitignored upstream/<name>
# for port review (diff the old pin against a candidate new tag)
node scripts/binding_pins.mjs --materialize ioredis
```

Never hand-edit `version` / `sha256` / `ref` — the tarball hash can't be
recomputed at edit time. Use `--set`, which fetches the registry tarball,
hashes it, records the publisher's `gitHead`, and stamps `ported-at`/`date`.

## Cadence

The `--check` gate runs on every PR (offline). The weekly dependency-update
job runs `--check --refresh`, so a newly-soaked upstream release surfaces as an
actionable advisory — re-pin with `--set`, review the wrapper against the diff
(`--materialize` helps), and land the bump with `ported-at` advanced. This
mirrors the fleet's `vendor-actions.mts --check` weekly cadence.
