<!-- Perry docs bundle: contributing.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/contributing/architecture.md -->

# Architecture

This is a brief overview for contributors. The rules for creating, retaining,
or removing workspace crates live in the [crate policy](https://docs.perryts.com/contributing/crate-policy.html).

## Compilation Pipeline

```
TypeScript (.ts)
    ↓ Parse (SWC)
    ↓ AST
    ↓ Lower (perry-hir)
    ↓ HIR (High-level IR)
    ↓ Transform (inline, closure conversion, async lowering)
    ↓ Codegen (LLVM)
    ↓ Object file (.o)
    ↓ Link (system cc)
    ↓
Native Executable
```

## Crate Map

| Crate | Purpose |
|-------|---------|
| `perry` | CLI driver, command parsing, compilation orchestration |
| `perry-parser` | SWC wrapper for TypeScript parsing |
| `perry-hir` | HIR types and data structures, plus AST→HIR lowering |
| `perry-transform` | IR passes: function inlining, closure conversion, async lowering |
| `perry-codegen` | LLVM-based native code generation |
| `perry-codegen-wasm` | WebAssembly code generation for `--target web` / `--target wasm` (HIR → WASM bytecode + JS bridge) |
| `perry-codegen-js` | Legacy JavaScript code generator (still present for the JS minifier; the JS-emit `--target web` path was consolidated into `perry-codegen-wasm`) |
| `perry-codegen-swiftui` | SwiftUI code generation for WidgetKit extensions |
| `perry-runtime` | Runtime library: NaN-boxed values, GC, arena allocator, objects, arrays, strings |
| `perry-ffi` | Stable interface used by native binding crates |
| `perry-stdlib` | Runtime-coupled Node.js and Perry standard-library implementations |
| `perry-ext-*` | Independently linked native bindings selected per program |
| `perry-ui` / `perry-ui-model` | Shared UI interface and public model metadata |
| `perry-ui-macos` | macOS UI (AppKit) |
| `perry-ui-ios` | iOS UI (UIKit) |

## Key Concepts

### NaN-Boxing

All JavaScript values are represented as 64-bit NaN-boxed values. The upper 16 bits encode the type tag:

| Tag | Type |
|-----|------|
| `0x7FFF` | String (lower 48 bits = pointer) |
| `0x7FFD` | Pointer/Object (lower 48 bits = pointer) |
| `0x7FFE` | Int32 (lower 32 bits = integer) |
| `0x7FFA` | BigInt (lower 48 bits = pointer) |
| Special constants | undefined, null, true, false |
| Any other | Float64 (the full 64 bits) |

### Garbage Collection

Generational mark-sweep GC, per-thread arena split into nursery + old-gen. Roots come from a precise shadow stack (emitted by codegen), a conservative native-stack scan, and 9 registered runtime scanners. Two-bit aging tenures objects after surviving 2 minor cycles; a write barrier maintains a remembered set for old → young pointers.

See [Internals → Memory Model](https://docs.perryts.com/internals/memory-model.html) for the full picture (NaN-boxing, heap layout, root discovery, generational behaviour, env-var escape hatches).

### Handle-Based UI

UI widgets are represented as small integer handles NaN-boxed with `POINTER_TAG`. Each handle maps to a native platform widget (NSButton, UILabel, GtkButton, etc.). Two dispatch tables route method calls and property accesses to the correct FFI function.

## Source Code Organization

The codegen crate is organized into focused modules:

```
perry-codegen/src/
  codegen.rs       # Main entry, module compilation
  types.rs         # Type definitions, context structs
  util.rs          # Helper functions
  stubs.rs         # Stub generation for unresolved deps
  runtime_decls.rs # Runtime function declarations
  classes.rs       # Class compilation
  functions.rs     # Function compilation
  closures.rs      # Closure compilation
  module_init.rs   # Module initialization
  stmt.rs          # Statement compilation
  expr.rs          # Expression compilation
```

The HIR lowering was split into 8 modules:

```
perry-hir/src/
  lower.rs           # Main lowering entry
  analysis.rs        # Code analysis passes
  enums.rs           # Enum lowering
  jsx.rs             # JSX lowering
  lower_types.rs     # Type lowering
  lower_patterns.rs  # Pattern lowering
  destructuring.rs   # Destructuring lowering
  lower_decl.rs      # Declaration lowering
```

## Next Steps

- [Building from Source](https://docs.perryts.com/contributing/building.html)
- See `CLAUDE.md` in the repository root for detailed implementation notes


---

<!-- source: docs/src/contributing/crate-policy.md -->

# Crate policy

Perry uses crates to isolate real build, linking, platform, and compatibility
seams. A crate is not a substitute for an internal Rust module: every workspace
member adds dependency-graph, CI, release, and maintenance cost.

## When a crate is justified

A crate should satisfy at least one of these conditions:

- it produces an independently consumed artifact;
- it implements a selectable codegen or platform target;
- it isolates a platform toolchain or a substantial optional dependency;
- it owns a stable interface used across otherwise independent modules;
- it is a tool, fixture, or test harness invoked independently;
- excluding it measurably avoids compiling or linking its implementation.

A crate is not justified only because it organizes source files, is large or
small, anticipates a future implementation, or re-exports its only dependency.
Apply the deletion test: if deleting the crate moves its implementation into
one existing owner, the seam is probably shallow; if its complexity would
spread across several callers or artifact pipelines, it is earning its place.

## Workspace categories

Every member is classified in `workspace-architecture.json`:

| Category | Meaning |
|---|---|
| `product` | A user-facing binary or primary product entry point. |
| `compiler-core` | Shared compiler representation or compilation phase. |
| `codegen-adapter` | Selectable output-target implementation. |
| `runtime-core` | Runtime, ABI, stdlib, or closely coupled runtime capability. |
| `binding` | Independently linked native library binding. |
| `platform-core` | Shared UI/platform contract. |
| `platform-adapter` | OS-specific implementation of a platform contract. |
| `artifact-wrapper` | Thin crate whose purpose is producing a named artifact. |
| `tool` | Independently invoked contributor or product tool. |
| `test-support` | Shared test implementation or harness. |
| `fixture` | Compileable documentation or integration fixture. |

Its `decision` records the reviewed direction: `keep`, `merge`, `externalize`,
`remove`, or `review`. Decisions describe the architecture roadmap; they do not
authorize deleting compatibility without the relevant migration and tests.
Binding entries also carry a `migration` that refines the general decision:
`core-runtime`, `compile-source`, `external-package`, or `remove`. The native
[binding governance policy](https://docs.perryts.com/native-libraries/governance.html) defines those
targets and their compatibility gates.

Choose the decision by applying the same seam test consistently:

- `keep`: the crate owns a justified artifact, adapter, stable contract, or
  independently executed tool/test surface;
- `merge`: the crate is a shallow source boundary with one natural owner and no
  independently selected artifact or toolchain;
- `externalize`: the crate is an optional integration with an independent
  version/release lifecycle and can consume Perry's stable interface;
- `remove`: the crate is obsolete, duplicated, or has no supported consumer;
- `review`: evidence is insufficient; name the missing usage or migration
  evidence before choosing a destructive direction.

Re-review a decision when a crate gains or loses an artifact target, a platform
toolchain, production consumers, or a stable interface. Size alone is never a
reason to split or merge it.

## Dependency rules

- Native bindings use `perry-ffi` as their production interface to Perry.
- A production dependency from `perry-ext-*` to `perry-runtime` is forbidden.
- Test binaries may enable `perry-ffi/runtime-link`; that edge provides runtime
  symbols for tests and is not part of the binding's distributed contract.
- Runtime and stdlib functionality must have one production implementation.
  Temporary bundled/external twins require an explicit migration path.
- Workspace dependencies are declared centrally when multiple members share
  the same internal crate or third-party version.

## Default build

The default workspace member is the `perry` CLI. Cargo builds the CLI's real
dependency closure, but it does not independently build every binding, platform
backend, fixture, or release-only static archive.

Use explicit commands for broader scopes:

```bash
# Product feedback loop
cargo check -p perry
cargo clippy -p perry --bins

# Every host-compatible workspace member (Bash)
mapfile -t excluded < <(python3 scripts/workspace_architecture.py \
  --print-excluded-scope host-compatible)
cargo_args=(--workspace)
for package in "${excluded[@]}"; do cargo_args+=(--exclude "$package"); done
cargo check "${cargo_args[@]}"
cargo clippy "${cargo_args[@]}"

# Inspect or validate the workspace architecture
python3 scripts/workspace_architecture.py --check --print-summary
python3 scripts/workspace_architecture.py --markdown
python3 scripts/workspace_architecture.py --json
```

`workspace-architecture.json` is the single source for Linux host exclusions;
the Clippy, test, and coverage scopes consume it instead of copying platform
lists. Cross-platform UI adapters remain in their target-specific CI and
release matrices; changing `default-members` does not remove that coverage.

## Inventory and baseline

The audit joins `cargo metadata` with the reviewed policy. Its JSON and Markdown
views reproduce each crate's category, decision, source path, Rust LOC,
production dependencies, internal consumers, default membership, and workspace
lint inheritance. LOC is reported live and is deliberately not committed.

The committed baseline records only structural signals: the 76 reviewed member
decisions, the default dependency closure, the `perry` CLI closure, and decision
counts. Any structural change must update the policy intentionally; ordinary
Rust source edits do not churn the baseline.

## Adding or removing a crate

A crate change must update all of the following in the same pull request:

1. explicit workspace membership;
2. `workspace-architecture.json` classification and decision;
3. shared workspace dependencies, when applicable;
4. CI/release selection for its category;
5. contributor or user documentation;
6. tests at the crate's external interface.

Run the architecture audit before requesting review. CI rejects implicit or
unclassified workspace members, unexpected default members, missing workspace
lints, and new binding-to-runtime production edges.


---

<!-- source: docs/src/contributing/building.md -->

# Building from Source

## Prerequisites

- Rust toolchain (stable, **≥ 1.94**): [rustup.rs](https://rustup.rs/). The
  workspace pins no toolchain file, so an older `stable` fails with a
  `sqlx@0.9.0 requires rustc 1.94.0` MSRV error from deep in the dependency
  graph. `rustup update stable` resolves it.
- System C compiler (`cc` on macOS/Linux, MSVC on Windows)
- **libclang** — the `libsqlite3-sys` build script runs `bindgen`. Missing it
  aborts the build with `Unable to find libclang`. Install `libclang-dev`
  (Debian/Ubuntu), `clang-devel` (Fedora) or `clang` (Arch). For a
  non-standard location set `LIBCLANG_PATH` to the directory holding
  `libclang.so`; if bindgen then reports `'stdarg.h' file not found`, also set
  `BINDGEN_EXTRA_CLANG_ARGS="-isystem <clang-resource-dir>/include"`.
- **LLVM 22 development files** — required by Perry's default in-process
  codegen backend. `llvm-config --version` must report LLVM 22. If
  `llvm-config` is not on `PATH`, set `LLVM_SYS_221_PREFIX` to the LLVM 22
  prefix. On Windows this variable is mandatory and must point at the
  extracted LLVM 22 development archive used by the build.

An external clang is not part of the normal in-process codegen path. Install a
matching clang only when working on a path that explicitly invokes it (for
example Windows host `--embed`) or when building with
`--no-default-features` to bisect the textual-IR backend.

## Build

```bash
git clone https://github.com/PerryTS/perry.git
cd perry

# Build the default product and its dependency closure
cargo build --release
```

The binary is at `target/release/perry`.

The workspace deliberately defaults to the `perry` CLI. Bindings, platform
adapters, test support, and release-only archives are selected explicitly by
their CI/release jobs. Workspace-wide host commands must use the centralized
platform exclusions described in the [crate policy](https://docs.perryts.com/contributing/crate-policy.html).

## Build taxonomy (dev / release / dist)

Perry has three build profiles, each tuned for a different job (#5422):

| Goal | Command | Profile |
|------|---------|---------|
| Fastest correctness feedback | `cargo check -p perry` | — |
| Optimized **local** development | `cargo build --profile perry-dev -p perry` | `perry-dev` |
| Release-compatible build | `cargo build --release` | `release` |
| Official distribution artifacts | `cargo build --profile dist ...` | `dist` |

- **`perry-dev`** inherits `release` but disables the expensive distribution
  settings (`lto = false`, `codegen-units = 16`, `opt-level = 1`,
  `incremental = true`, no strip) so the edit/build loop stays short. Output is
  at `target/perry-dev/perry`.
- **`dist`** mirrors `release` exactly (ThinLTO, `codegen-units = 1`,
  `opt-level = 3`, strip) and is the explicit, named profile the release
  workflows use for shipped artifacts. Output is at `target/dist/`.

After a `--timings` build, `scripts/cargo_timing_summary.py` prints the slowest
units so build-time regressions are visible.

### Compiler cache for ephemeral worktrees

Short-lived worktrees and coding agents can opt into a compiler cache shared
outside the repository. Install `sccache` in your user environment, then run
Cargo through the wrapper:

```bash
./scripts/cargo_cached.sh check -p perry

# Slim, optimized developer CLI
./scripts/cargo_cached.sh build --profile perry-dev -p perry \
  --no-default-features --features dev-cli
```

The wrapper disables Cargo incremental compilation because `sccache` cannot
cache incremental artifacts. It stores compiler objects under
`${XDG_CACHE_HOME:-$HOME/.cache}/perry/sccache` by default, not in the worktree;
set `SCCACHE_DIR` or `SCCACHE_CACHE_SIZE` to override its `12G` cache policy.
It does not install or configure `sccache` globally.

In a long-lived worktree, use ordinary `cargo` commands instead so the local
incremental cache remains available. Cache benefit depends on the compiler,
flags, dependencies, and how much prior work the cache can reuse.

## Build Specific Crates

```bash
# Runtime only (must rebuild stdlib too!)
cargo build --release -p perry-runtime -p perry-stdlib

# The .a static archives are emitted by separate wrapper crates (#5422), so a
# plain `cargo build` no longer produces them as a side effect. Build them
# explicitly when you need libperry_runtime.a / libperry_stdlib.a (e.g. to link
# compiled programs without the auto-optimize rebuild):
cargo build --release -p perry-runtime-static -p perry-stdlib-static

# Codegen only
cargo build --release -p perry-codegen
```

> **Important**: When rebuilding `perry-runtime`, you must also rebuild `perry-stdlib` because `libperry_stdlib.a` embeds perry-runtime as a static dependency.

## Slim developer CLI

The default build is the full official CLI. For compiler work you can build a
slimmer CLI that omits the publish / mobile / updater / native / audit commands
and the non-native codegen backends (#5422):

```bash
cargo build -p perry --no-default-features --features dev-cli
```

`dev-cli` keeps `compile` / `run` / `check` / `types` / `cache` / `dev`. Disabled
commands drop out of `--help`, and disabled `--target` backends report a clear
"built without the `<feature>` feature" error. See `crates/perry/Cargo.toml` for
the full feature list (`full-cli`, `publish-cli`, `backend-wasm`, …).

## Run Tests

```bash
# Product unit targets
cargo test -p perry --bins

# Inspect the nightly CI test scope (all Linux-compatible test crates)
python3 scripts/ci_test_scope.py --full </dev/null

# Specific crate
cargo test -p perry-hir
cargo test -p perry-codegen
```

## Compile and Run TypeScript

```bash
# Compile a TypeScript file
cargo run --release -- hello.ts -o hello
./hello

# Debug: print HIR
cargo run --release -- hello.ts --print-hir
```

## Development Workflow

1. Make changes to the relevant crate
2. `cargo check -p perry` for fast product feedback
3. Run tests for the crates affected by the change
4. Test with a real TypeScript file: `cargo run --release -- test.ts -o test && ./test`

## Project Structure

```
perry/
├── crates/
│   ├── perry/              # CLI driver
│   ├── perry-parser/       # SWC TypeScript parser
│   ├── perry-hir/          # HIR types, data structures, and lowering
│   ├── perry-transform/    # IR passes
│   ├── perry-codegen/      # LLVM native codegen
│   ├── perry-codegen-wasm/ # WebAssembly codegen (--target web / --target wasm)
│   ├── perry-codegen-js/   # JS minifier (formerly the web target's codegen)
│   ├── perry-codegen-swiftui/ # Widget codegen
│   ├── perry-runtime/      # Runtime library
│   ├── perry-stdlib/       # npm package implementations
│   ├── perry-ui/           # Shared UI types
│   ├── perry-ui-macos/     # macOS AppKit UI
│   ├── perry-ui-ios/       # iOS UIKit UI
│   └── perry-ext-*/        # Selectively linked native bindings
├── docs/                   # This documentation (mdBook)
├── CLAUDE.md               # Detailed implementation notes
└── CHANGELOG.md            # Version history
```

## Next Steps

- [Architecture](https://docs.perryts.com/contributing/architecture.html) — Crate map and pipeline overview
- See `CLAUDE.md` for detailed implementation notes and pitfalls


---

<!-- source: docs/src/contributing/releasing.md -->

# Releasing Perry

Maintainer runbook. Every release, including a patch, is gated on the exact
release-candidate commit by the full Tests workflow, Simulator Tests, and the
complete package-build matrix. A PR-tier or ordinary push-to-main run is not a
release gate.

## 1. Pre-release checklist (every release)

Start from a clean checkout that contains current `origin/main`. Do not release
from a detached HEAD or from a moving `main` branch. The npm-first pipeline
pins the candidate branch and commit SHA, retains the exact npm tarballs, and
refuses to tag if the branch moves or any public registry shasum differs.

```bash
# Confirm the checkout is current and clean.
git fetch origin
git rev-list --count HEAD..origin/main       # must print 0
git status --short                          # must print nothing

# Fast policy and script checks.
python3 scripts/ci_plan.py --self-test
BASE_SHA=origin/main scripts/run_lint_gates.sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:scripts
./scripts/regen_api_docs.sh
git diff --exit-code -- docs/src/api/reference.md docs/api/perry.d.ts

# Host-runnable behavioral checks. These improve turnaround, but do not
# replace the required cross-platform CI jobs.
cargo test --workspace --exclude perry-ui-ios --exclude perry-ui-tvos \
  --exclude perry-ui-watchos --exclude perry-ui-gtk4 \
  --exclude perry-ui-android --exclude perry-ui-windows
./run_parity_tests.sh
./scripts/run_doc_tests.sh
```

Prepare the release candidate. Perry's normal merges already advance the
workspace version, so use the version at the chosen commit; do not add another
bump merely to release it. The version must exist in the source before builds
start because it is embedded in Cargo and npm artifacts. `Cargo.toml` and
`CLAUDE.md` must agree, release-note fragments must exist, and the Git tag must
not exist locally or on origin. If that version was already tagged, land a new
version bump through the normal merge process first.

```bash
# Substitute the version already present in Cargo.toml.
VERSION=0.x.y
grep -m1 '^version' Cargo.toml
grep -F "**Current Version:** $VERSION" CLAUDE.md
find changelog.d -maxdepth 1 -type f -name '[0-9]*.md' | grep .
git ls-remote --tags origin "refs/tags/v$VERSION"  # must print nothing
git switch -c "release/v$VERSION"
git push -u origin "release/v$VERSION"
```

Run the two exact-SHA CI gates on that pinned branch and wait for both to pass:

```bash
gh workflow run test.yml --ref "release/v$VERSION" -f tier=full
gh workflow run simctl-tests.yml --ref "release/v$VERSION"
```

Freeze that candidate SHA. Unrelated merges to `main` after the branch is cut do
not invalidate successful gates and do not require another test cycle. Refresh
the candidate only for a release-blocking fix or a required version change.

Then use the npm-first pipeline. npm publication happens only in GitHub Actions
through Trusted Publisher/OIDC. There is no `npm login`, npm account session,
2FA approval, or long-lived npm token in CI or on the maintainer machine. The
local command uses GitHub authentication to dispatch/watch the workflow and
anonymous registry reads to verify the published bytes.

Socket is an optional pre-publish tarball scan, not an npm credential. When
enabled, Actions submits each of the exact nine `.tgz` files as a temporary
Socket full scan and evaluates the results against the `perryts` Socket
organization's security policy. Policy actions configured as `error` block
publication; `warn` findings are recorded but do not block. The same tarballs
that pass are then sent to npm. For the current release, omit `--socket-scan`;
the workflow records an explicit skipped receipt and continues.

To enable the gate later, store `SOCKET_API_TOKEN` as a repository or
organization Actions secret with permission to create/read full scans, read the
organization policy, and read quota. No GitHub Environment is required. The
value stays only in GitHub and must never be committed or exported locally:

```bash
gh secret set SOCKET_API_TOKEN --repo PerryTS/perry
```

Before the first nine-package release, an npm organization owner must confirm
that every name in `scripts/publish/constants.mts` exists and has this single
Trusted Publisher configuration:

- provider: GitHub Actions
- organization/repository: `PerryTS/perry`
- workflow filename: `release-packages.yml`
- environment: none
- allowed action: **`npm publish`**

npm permits only one trusted publisher per package. The canonical identity is
the existing `release-packages.yml` workflow above, with direct **`npm
publish`** enabled. Do not configure `npm-stage-publish.yml` as a second
publisher and do not add an environment name that the other packages do not
use.

In particular, verify the ARM64 Windows package:

```bash
npm view @perryts/perry-win32-arm64 name
```

If that returns `E404`, stop: npm does not allow a Trusted Publisher to be
configured for a package that does not exist, so OIDC cannot perform its first
publish. An `@perryts` owner must provision that package name once before this
nine-package OIDC-only flow can work, then configure the Trusted Publisher
fields above. The release pipeline intentionally refuses a partial set.

```bash
npm run publish:release     # one Release Packages run: exact-SHA gates/builds,
                            # publish + verify all 9 via OIDC, then create
                            # v0.x.y + the GitHub Release last
# Later, once the repository/org Socket secret exists:
npm run publish:release -- --socket-scan
npm run publish:status      # inspect the commit/run/package/Socket receipt
```

Publication sends the eight platform packages first and the wrapper last. If a
network or registry error interrupts it before the tag exists, rerun the failed
jobs (or `publish:release`) on the same candidate. Actions skips an
already-public package only when its immutable registry shasum matches the exact
CI tarball; otherwise it stops and requires a new version.

If the accumulated changelog fragments exceed the inline release-note budget,
the publisher keeps the GitHub Release body concise and uploads the complete
notes as the checksummed `release-notes-full.md` asset. No fragment is dropped.

Do not run `npm login`, `git tag`, or manually publish a GitHub Release. The
local command dispatches `release-packages.yml` with `cut_release=true`; that
workflow creates the tag only after all nine npm versions are public and their
registry shasums match the exact CI tarballs.

## 2. Additional major-release verification

The automated gates above apply to every release. For a major/minor release,
also perform the product-level platform checks that are not fully represented
by the automated suites:

| Platform | What to run | Runs in CI? |
|---|---|---|
| **macOS** (arm64 + x86_64) | Smoke-test installed archives on both architectures | Builds in release matrix; full tests on macOS arm64 |
| **Linux glibc** (x86_64 + aarch64) | Smoke-test the packaged binary on the oldest supported glibc | Builds in release matrix |
| **Linux musl** (x86_64 + aarch64) | Spot-check a compiled `hello.ts` on Alpine | Builds in release matrix |
| **Windows** (x86_64 + ARM64 MSVC) | Smoke-test installed archives on both architectures | Build plus full-tier Windows checks |
| **iOS Simulator** | Exercise a representative app with `xcrun simctl` | Required `simctl-tests.yml` |
| **visionOS Simulator** | `perry compile --target visionos-simulator ...`, launch in Apple Vision Pro Simulator | No (Xcode required) |
| **tvOS Simulator** | `perry compile --target tvos-simulator ...`, launch in Simulator | No (Xcode required) |
| **watchOS Simulator** | `perry compile --target watchos-simulator ...` — requires `rustup toolchain install nightly` + `cargo +nightly -Zbuild-std` | No (Xcode + nightly required) |
| **Android** | `perry compile --target android examples/widget_demo.ts`; install APK on emulator | No (NDK required) |
| **Web / WASM** | `perry compile --target web examples/wasm_ui_demo.ts`, open `out.html` in a browser | No |
| **Home-screen widgets** | `perry compile --target widgetkit ... && perry publish ios` | No |

Record the manual results in the release issue. These checks supplement CI;
they never waive a red required workflow.

### 2a. Simulator-run recipe (iOS / tvOS)

`perry-ui-ios` and `perry-ui-tvos` honor `PERRY_UI_TEST_MODE=1` — when set,
the app renders one frame, optionally writes a screenshot to
`$PERRY_UI_SCREENSHOT_PATH`, and exits cleanly. Combine with
`xcrun simctl` to verify a doc-example runs without a human:

```bash
# Compile for the simulator
perry compile --target ios-simulator docs/examples/ui/counter.ts -o counter.app

# Boot a device (one-time; reuse the UDID across runs)
xcrun simctl boot "iPhone 15"
open -a Simulator

# Install + launch with test mode
xcrun simctl install booted counter.app
PERRY_UI_TEST_MODE=1 \
  PERRY_UI_TEST_EXIT_AFTER_MS=500 \
  PERRY_UI_SCREENSHOT_PATH="$PWD/counter-ios.png" \
  xcrun simctl launch --console booted com.example.counter

# App exits 0 after rendering; screenshot lands at counter-ios.png
```

Same recipe works for `tvos-simulator` + `"Apple TV"` device. On watchOS the
Rust Tier-3 toolchain requires `+nightly -Zbuild-std` — see the
`watchos-simulator` row in the matrix above.

## 3. What CI does on the release

The `Release Packages` workflow (`.github/workflows/release-packages.yml`)
triggers on a published GitHub Release or manual `workflow_dispatch`. Matrix
runners build:

- `macos-14` / `macos-15` — arm64 + x86_64 Darwin binaries
- `ubuntu-24.04` / `ubuntu-24.04-arm` — glibc x86_64 + aarch64; the compiler,
  runtime, stdlib and extension archives build inside architecture-matched
  Debian 11 (glibc 2.31) containers, while GTK4 builds on the noble host and is added
  afterward (glibc 2.31 compiler floor; keep `GLIBC_BUILD_FLOOR` in
  `npm/perry/bin/detect.cjs` synchronized)
- `ubuntu-24.04` / `ubuntu-24.04-arm` — musl x86_64 + aarch64 (fully static)
- `windows-latest` / `windows-11-arm` — x86_64 + ARM64 MSVC

Artifacts are published to:

1. **npm** (`@perryts/perry` + eight per-platform optional-deps) — via OIDC
   Trusted Publisher
2. **Homebrew** — formula auto-update
3. **APT** (Debian/Ubuntu) — GPG-signed repository
4. **winget** — manifest auto-update
5. **hub.perryts.com** — worker notification so cloud build workers refresh

In the canonical npm-first flow, any failing host or cross build prevents npm
publication. The wrapper is not published when a platform package fails. Once a
version has become public, fix-forward with a new patch version rather than
amending an existing tag.

## 4. Release gates (what blocks a release)

`release-packages.yml` rejects a cut release unless `test.yml` has a successful
**`full-suite-gate`** and `simctl-tests.yml` has a successful run on the exact
candidate SHA. A green PR-tier or push-to-main sweep does *not* count. See [CI
tiers](https://docs.perryts.com/testing/ci-tiers.html). The full tier is:

- everything the PR gate and the post-merge sweep run (`lint`, `check`, `warnings`,
  `cargo test --workspace`, the gap suite, `gc-stress`, Windows x64 + ARM64 builds,
  compiler-output gates, `repsel-census`, `harmonyos-smoke`, `security-audit`),
  plus `binary-size` and
- `parity` — must clear the threshold in `test-parity/threshold.json` and add no
  new / stale known-failure entries
- `compile-smoke` — must compile every file under `test-files/`, plus the UI
  styling matrix, Fastify integration and memory-stability tests
- the gap suite in its 8-shard **auto-optimize** mode (the PR/sweep tiers use the
  prebuilt-runtime `fast` mode)
- `doc-tests` (macOS + Windows) — must compile + run every example under
  `docs/examples/`
- the package smokes (`drizzle-mysql-smoke`, `ink-link-smoke`, `effect-basic-smoke`)
  and `native-abi-evidence-packet`
- `full-suite-gate`, the fan-in which proves every required full-tier job above
  succeeded

None of these carries `continue-on-error` any more: a red suite in the full tier
blocks the release. If a suite is red for a reason that is not the release
candidate's fault, fix it on `main` first (or open an issue and consciously
re-add a job-level `continue-on-error: true` with that issue number) — do not
publish past it.

The release workflow then requires every host/cross package build, all nine
exact npm publishes, and public-registry sha1 verification. Socket is an
optional pre-publish gate and is currently skipped. `benchmark.yml`, docs,
container tests, Homebrew, APT, winget, and worker refresh are tag riders or
distribution steps: monitor them after the GitHub Release is created, but do
not mistake them for pre-tag gates.

## 4a. What tells you a release is overdue

Nothing in the sections above fires if a release simply never happens. That is
[#7491](https://github.com/PerryTS/perry/issues/7491): npm served a month-old
`latest` while the linker fix users were hitting had been on `main` for weeks. Every
gate was green, and all of them were right — they measure `main`, and `main` is not
what `npm install @perryts/perry` gives you. The only detector was a user reading the
versions tab.

`npm-publish-freshness.yml` runs daily and calls
`scripts/check_npm_publish_freshness.py`, which reads the full packument for every
package under `npm/` and compares it against `[workspace.package] version`:

| signal | budget | why |
|---|---|---|
| age of the published `latest` | 14 days | counted **only while the tree is ahead**, so a quiet week with nothing to release is not a failure. This is the signal that would have caught #7491 on day 15. |
| patch distance | 500 | every merge bumps the workspace patch, so this is a commit count in disguise. A backstop for a cadence spike inside an unexpired age budget — not a release-cadence rule. |
| platform packages match the launcher | none | `npm/perry/package.json.tmpl` pins its optionalDependencies to its own exact version, so a partial publish breaks installs while both halves sit inside their budgets. |

Budgets live in `scripts/npm_publish_freshness.json`. A failing run files one sticky
issue and updates it in place; it closes itself once the registry has caught up.

```bash
python3 scripts/check_npm_publish_freshness.py --self-test       # proves it can fail
python3 scripts/check_npm_publish_freshness.py --check-manifest  # offline
python3 scripts/check_npm_publish_freshness.py --dry-run         # real registry, no issue writes
```

An unreachable or unparseable registry is **red, not a skip** — this detector exists
because a silence read as health for a month, and a skip that exits 0 is that same
silence with a green badge. It is deliberately not a required status context: whether
a release has been cut is not something a PR author can fix.

## 5. If a release goes wrong

- **Wrong artifact published**: tag a new patch release with the fix; npm
  rejects re-publishes of the same version anyway.
- **Broken build before npm publication**: fix it and rebuild the complete
  nine-package set; the canonical flow will not tag a partial set.
- **Broken binary discovered after publication**: ship a follow-up patch version;
  neither npm versions nor release tags are mutable.
- **A post-tag distribution hook failed**: re-run the failed workflow. To retry
  the legacy release-packages distribution legs, dispatch it with
  `existing_tag=vX.Y.Z`; add `publish_npm=true` only when the idempotent npm leg
  itself also needs retrying.
