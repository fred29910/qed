<!-- Perry docs bundle: cli-security.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/cli/lockdown.md -->

# `--lockdown` — Refuse Arbitrary-Code-Execution Surfaces

A single flag that fails the build if any of the standard arbitrary-
code-execution vectors are reachable from the module graph. Most apps
need none of them; lockdown is a one-line opt-in to "this app is
**provably** free of arbitrary-code-execution vectors."

**Zero runtime cost.** The check runs at compile time, after `collect_modules`,
before any codegen work begins.

**Cross-platform.** Runs in the platform-agnostic `compile_command`
driver, so every backend (LLVM / WASM / ArkTS / HarmonyOS / Glance /
SwiftUI / JS) inherits the protection from one choke point.

## What lockdown refuses

| Surface                                  | Detected via                                      |
|------------------------------------------|----------------------------------------------------|
| `perry-jsruntime` (QuickJS) in graph     | `ctx.needs_js_runtime` flipped during collection. |
| `perry.nativeLibrary` archive reference  | `ctx.native_libraries` non-empty after resolution. |
| `child_process.*` call sites             | HIR walker covers every `ChildProcess*` variant + the general-shape `NativeMethodCall { module: "child_process", … }` fallback. |
| Dynamic stdlib dispatch (`fs[runtimeVar]`) | HIR lowering re-arms the `#503` refusal (`error[U006]`). Allowed by default since [#5263](https://github.com/PerryTS/perry/issues/5263); lockdown turns it back on. |

The `child_process`/jsruntime/nativeLibrary checks run together as a
combined post-collect diagnostic; the dynamic-dispatch refusal is enforced
during HIR lowering (it re-arms the always-existing `#503` pass). The failure
lists every offending surface so the reviewer can address it at once.

## Enabling lockdown (priority order)

1. **CLI flag**: `perry compile --lockdown src/main.ts`. Per-build.
2. **Env var**: `PERRY_LOCKDOWN=1`. CI-friendly. `=0` explicitly
   disables.
3. **`package.json`**: persistent.

   ```json
   {
     "perry": {
       "lockdown": true
     }
   }
   ```

Precedence: package.json → env → CLI (last wins, mirrors `--fast-math`).

## Diagnostic example

```text
Error: `--lockdown` refused the build because the following
arbitrary-code-execution surfaces are reachable:
  - perry-jsruntime (QuickJS-based eval-equivalent) is reachable
    from the module graph — see #499 docs for the matching opt-in
    gate
  - `perry.nativeLibrary` archives referenced by: @bloomengine/engine
  - `child_process.*` reached from 2 call site(s):
      - /repo/src/main.ts: child_process.execSync
      - /repo/lib/foo.ts: child_process.spawn
```

The child_process site list is capped at 12 entries; trailing sites
are summarised as `... and N more`.

## Composing with the rest of the security series

Lockdown is the umbrella mode for the wider supply-chain hardening
series ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)):

- [`#503`](https://github.com/PerryTS/perry/issues/503) /
  [`#5263`](https://github.com/PerryTS/perry/issues/5263) — refuses
  dynamic stdlib dispatch (`obj[runtimeVar]()`). **Allowed by default**
  (dynamic selection over a linked namespace can only reach already-linked
  members); lockdown re-arms the refusal. An explicit
  `perry.allowDynamicStdlibDispatch: false` / `PERRY_ALLOW_DYNAMIC_STDLIB=0`
  re-arms just this check without the rest of lockdown.
- [`#499`](https://github.com/PerryTS/perry/issues/499) — gates
  `perry-jsruntime` behind explicit host opt-in. Lockdown forces the
  gate to its strict default.
- [`#497`](https://github.com/PerryTS/perry/issues/497) — host
  allowlist for `perry.nativeLibrary` / `compilePackages`. Lockdown
  refuses *any* nativeLibrary reference, no allow-list needed.

## See also

- [`#496`](https://github.com/PerryTS/perry/issues/496) — design discussion.


---

<!-- source: docs/src/cli/allowed-hosts.md -->

# Compile-Time Egress Allowlist (`perry.allowedHosts`)

Perry can verify, at compile time, that every outbound network call
in your binary targets a host you've explicitly approved. When the
host application opts in via `perry.allowedHosts` in `package.json`,
every literal URL/host in a `fetch(...)`, `net.connect(...)`, or
`net.createConnection(...)` call must match one of the listed
patterns — otherwise the build fails before producing a binary.

**Zero runtime cost.** The check runs at compile time over the
lowered HIR. The resulting binary is the same size and shape as a
build without the gate.

## Why a compile-time check

Runtime allowlists are foot-shoots — a misconfiguration or a malicious
dep can bypass them. A compile-time check gives a stronger property:
`grep`-ing the binary's egress is reliable. If a dep tries to add a
new outbound host through a literal URL, the build fails and the
review catches it; if it tries to hide the host behind a variable,
the build still fails unless you've explicitly opted into dynamic
hosts.

## Configuration

In your host `package.json`:

```json
{
  "perry": {
    "allowedHosts": [
      "api.example.com",
      "*.cdn.example.com",
      "https://api.acme.com/v1/*"
    ]
  }
}
```

### Pattern syntax

- **Exact host** — `"api.example.com"` matches that hostname on any
  scheme/port/path.
- **Subdomain wildcard** — `"*.cdn.example.com"` matches every direct
  or transitive subdomain. The bare suffix does NOT match — `*.foo.com`
  does not match `foo.com`.
- **URL prefix** — `"https://api.acme.com/v1/*"` matches any URL
  starting with that literal prefix. Path-bound entries only gate
  path-bearing call sites — `net.connect("api.acme.com")` against a
  URL-prefix entry does NOT match (use a host-style entry for that).
- **Universal** — `"*"` matches everything (escape hatch for
  incremental migration; defeats the static guarantee).

## Dynamic URLs / hosts

Non-literal arguments — `fetch(someVar)`, `net.connect(port, hostVar)`,
template strings with substitutions — defeat the static `grep`-the-binary
guarantee. They're refused by default:

```typescript,no-test
const url = "https://api.example.com/x";
const resp = await fetch(url); // refused unless allowDynamicHosts: true
```

To allow them, set `perry.allowDynamicHosts: true`:

```json
{
  "perry": {
    "allowedHosts": ["api.example.com"],
    "allowDynamicHosts": true
  }
}
```

The code reviewer then has to trust the value of every variable that
reaches `fetch(...)` — explicit acknowledgment that the static
guarantee is being weakened.

## Opt-in semantics

If `perry.allowedHosts` is **not set**, the entire pass is disabled
and existing builds compile unchanged. The host opts in by setting
the array; once set, the gate is strict.

This is intentionally not "default-deny on greenfield" — that would
break every existing build that calls `fetch(...)`. Migration path:

1. Run the build once without the allowlist.
2. Inspect `audit.json` in the cache dir (default
   `node_modules/.cache/perry/audit.json`) (the [behavioral SBOM
   (`#495`)](https://docs.perryts.com/cli/perry-audit-sbom.html)) and see what egress the binary
   currently performs.
3. Populate `allowedHosts` with the surface you actually use.
4. Re-build. The gate now catches future regressions.

## Diagnostic shape

The build fails with one combined diagnostic naming every offending
site at once (better UX than failing on the first one and asking the
user to re-run):

```text
Error: egress allowlist refused 2 call site(s):
  - /repo/main.ts: fetch → "https://evil.com/leak" (literal host not in `perry.allowedHosts`)
  - /repo/lib/foo.ts: net.connect → "x.evil.com" (literal host not in `perry.allowedHosts`)

`perry.allowedHosts` provides a static guarantee that this binary's
outbound network surface matches the declared list. Refusing the build. (#502)

Options:
- Add the offending host(s) to `perry.allowedHosts` ...
- Set `"*"` in `allowedHosts` to disable host gating ...
- For non-literal URLs, set `perry.allowDynamicHosts: true` ...
```

The list is capped at 12 entries so pathological builds don't produce
60-line errors; trailing sites are summarised as `... and N more`.

## What's covered now

This first cut covers the highest-volume egress shape: `fetch(...)` +
`net.connect(...)` / `net.createConnection(...)`. Other shapes —
`http.get(...)`, `https.request(...)`, `WebSocket(...)` — lower
through the general-shape `NativeMethodCall` HIR variant and will
graft onto the same pass in a follow-up.

## See also

- [`#502`](https://github.com/PerryTS/perry/issues/502) — design discussion.
- [`perry audit --sbom`](https://docs.perryts.com/cli/perry-audit-sbom.html) (#495) — discover what
  egress your binary currently performs before populating the
  allowlist.
- The wider supply-chain hardening series
  ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).


---

<!-- source: docs/src/cli/capabilities.md -->

# Per-Package Capabilities (`perry.permissions`)

A compile-time HIR pass walks every imported dependency's source
modules, derives the capability tokens its stdlib call sites would
need, and refuses the build for any call site whose required token
isn't in the dependency's allow-list (or the `*` default). Host code
is always granted `*` unconditionally — gating host code is the
`--lockdown` mode (#496), not per-package policy. (#501)

**Zero runtime cost** — purely a compile-time refusal. **Cross-platform**:
runs in the platform-agnostic `compile_command` driver before any
backend (LLVM / WASM / ArkTS / HarmonyOS / Glance / SwiftUI / JS) is
invoked.

## Why

Most npm packages will never declare their own capabilities. The
prior art around runtime permission prompts (Deno, Bun) ships a
prompt; that doesn't help when an install-time `bun add` lands a
hostile dep that hides its egress until production. `perry.permissions`
moves the gate to compile time and to the host's `package.json`, so
the supply chain is *static* from the consumer's perspective.

## Host config

```json
{
  "perry": {
    "permissions": {
      "lodash": [],
      "axios": ["net:fetch"],
      "@scope/utils": ["crypto"],
      "*": []
    }
  }
}
```

- Keys are exact npm package names (`@scope/pkg` accepted) or the
  universal `"*"` default.
- Values are arrays of capability tokens (see below). Empty array
  means "this dep is only allowed to compute — no I/O".
- Absent map → pass is disabled and existing builds compile
  unchanged. Set any entry to enable.

## Capability tokens (MVP)

| Token | Stdlib surface |
|-------|----------------|
| `fs:read` | `fs.readFile`, `fs.readFileSync`, `fs.stat`, `fs.readdir`, … |
| `fs:write` | `fs.writeFile`, `fs.appendFile`, `fs.mkdir`, `fs.unlink`, `fs.rm`, … |
| `crypto` | `crypto.*`, `crypto.subtle.*` |
| `proc:env` | `process.env.*` reads |
| `proc:argv` | `process.argv` reads |
| `proc:exec` | `child_process.*` |
| `net:fetch` | `fetch`, `Request`, `Response`, `Headers` |
| `net:listen` | `net.createServer`, `http.createServer`, `https.createServer` |
| `net:connect` | `net.connect`, `net.createConnection`, raw socket clients |
| `*` | Grants every token above. Escape hatch — use sparingly. |

## Diagnostic

A failing build prints a combined diagnostic across every refused
call site (capped at the first 12 entries to keep output reasonable):

```text
Error: per-package capability policy refused 3 stdlib call site(s):
  - `axios` net:fetch at node_modules/axios/lib/http.js:42 requires `net:fetch`
  - `axios` fs:read at node_modules/axios/lib/cookies.js:11 requires `fs:read`
  - `mysterydep` proc:exec at node_modules/mysterydep/cli.js:7 requires `proc:exec`

`perry.permissions` provides a static guarantee that each
dependency only reaches the stdlib surfaces you've explicitly
granted it. Refusing the build. (#501)
```

The output names the owning package, the call kind, the source span,
and the missing token — enough to either (a) extend the allow-list,
(b) set `"*": ["<token>"]` for a wider default, or (c) replace the
dep with one that doesn't need the capability.

## Recommended workflow

1. **Start empty.** Set `"permissions": {}` to confirm your build
   is currently passing without the pass active.
2. **Flip the default to deny.** Add `"*": []` and rebuild. The
   diagnostic enumerates every capability your dep tree currently
   reaches.
3. **Grant minimum tokens per dep.** Use the diagnostic to populate
   `permissions` with the smallest token set each package needs.
4. **Lock in CI.** Once the build is green with the explicit
   permissions, leave it that way — new deps that want new tokens
   show up as build failures, surfacing in the PR review.

## Relationship to other security flags

- **`--lockdown` (#496)** — gates host code itself against the
  arbitrary-code-execution surfaces (perry-jsruntime,
  `perry.nativeLibrary` archives, `child_process.*`). Orthogonal:
  `perry.permissions` is per-dep, `--lockdown` is whole-binary.
- **`allowedHosts` (#502)** — narrows `net:fetch` from "any URL" to
  "URLs matching this allow-list." A dep with `net:fetch` permission
  still has to clear the egress allow-list at every call site.
- **`PERRY_SANDBOX_BUILDRS` (#505)** — sandboxes the *build-time*
  `build.rs` scripts. `perry.permissions` controls what the
  *runtime* binary can do.

## See also

- [`#501`](https://github.com/PerryTS/perry/issues/501) — design discussion.
- [`--lockdown`](https://docs.perryts.com/cli/lockdown.html)
- [Egress Allowlist (`allowedHosts`)](https://docs.perryts.com/cli/allowed-hosts.html)
- [`PERRY_SANDBOX_BUILDRS`](https://docs.perryts.com/cli/sandbox-buildrs.html)


---

<!-- source: docs/src/cli/allow-perry-features.md -->

# Host Allowlist for `nativeLibrary` and `compilePackages`

Perry refuses to honor two privileged dependency features — the two
attack surfaces Perry itself introduced over Node — unless the host
application has explicitly opted in to each consumer:

- `perry.nativeLibrary` — a transitive dep linking arbitrary native
  code into the binary.
- `perry.compilePackages` — compiling untrusted TS source from an npm
  package into the binary as if it were first-party code.

Both checks fire at compile time. **Zero runtime cost.**

## How a build hits this

### `nativeLibrary` (transitive dep declares it)

A package shipped with `perry.nativeLibrary` in its own `package.json`
is detected during dependency collection. Without an entry in the
host's `perry.allow.nativeLibrary`, the build fails:

```text
Error: package `@bloomengine/engine` declares `perry.nativeLibrary`
(links arbitrary native code into the binary) but is not in your host
`perry.allow.nativeLibrary`. Review the package, then add it to your
host `package.json`:

  {
    "perry": {
      "allow": { "nativeLibrary": ["@bloomengine/engine"] }
    }
  }
```

### `compilePackages` (host or workspace root declares it)

Every entry in `perry.compilePackages` must also be matched by an
entry in `perry.allow.compilePackages` — a two-key opt-in:

```text
Error: package `hono` is in `perry.compilePackages` but not in
`perry.allow.compilePackages` — compiling untrusted TS into the binary
is a privileged operation and requires explicit host opt-in. (#497)
```

## Opt-in mechanisms

### 1. Host `package.json` (persistent, recommended)

```json
{
  "perry": {
    "compilePackages": ["hono"],
    "nativeLibrary": "...",
    "allow": {
      "compilePackages": ["hono"],
      "nativeLibrary": ["@bloomengine/engine"]
    }
  }
}
```

### 2. Scope wildcard

`"@scope/*"` matches any package under `@scope/`:

```json
{
  "perry": {
    "allow": {
      "compilePackages": ["@nestjs/*", "reflect-metadata", "rxjs"]
    }
  }
}
```

### 3. Universal escape hatch

`"*"` matches every name. Use sparingly — defeats the purpose of the
allowlist.

```json
{ "perry": { "allow": { "compilePackages": ["*"] } } }
```

### 4. Environment variable

`PERRY_ALLOW_PERRY_FEATURES=1` opts every package into both
allowlists for the current build — emergency knob for one-off builds
where editing `package.json` isn't an option. `=0` enforces refusal
even when `package.json` opted in (fail-closed CI gate).

## Default-deny rationale

Both features escape Perry's structural guarantees:

- `nativeLibrary` lets a transitive dep ship arbitrary machine code
  that runs at the same trust level as the host application.
- `compilePackages` runs the dep's TypeScript through Perry's full
  native pipeline (HIR / codegen / linker) instead of routing it
  through QuickJS, eliminating the runtime sandbox.

Both are useful features, but they're *privileged* operations. The
allowlist makes that privilege explicit and auditable: a reviewer
diffing a PR can see exactly which deps have been granted native
access, and `git blame` records who approved each one.

## Node native addons are not `compilePackages`

`compilePackages` does not support npm packages whose JavaScript entry
point loads a Node native addon. Markers include `.node` files,
`binding.gyp`, `prebuilds/`, and `"gypfile"` in `package.json`.

Those packages are not just JavaScript with a dynamic `require()`.
Their native binary expects Node's addon ABI: Node-API/N-API, NAN, V8,
libuv, or Node internals. Perry does not host that ABI through
`compilePackages`, so the compiler rejects these packages early when
they are opted into `perry.compilePackages`.

Use `perry.nativeLibrary` for supported native code instead. A
Perry-native replacement should be a thin binding around the native
boundary, with unsupported targets declared explicitly in the
native-library manifest.

## See also

- [`#497`](https://github.com/PerryTS/perry/issues/497) — design discussion.
- The wider supply-chain hardening series
  ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).


---

<!-- source: docs/src/cli/emit-attest.md -->

# `--emit-attest` (binary attestation sidecar)

`perry compile --emit-attest main.ts -o myapp` writes
`myapp.attest.json` next to the executable. The sidecar holds the
SHA-256 of the *post-strip / post-codesign* binary plus provenance
metadata (perry version, git commit, build timestamp) so downstream
consumers can verify that the artifact they downloaded matches the
one the publisher built. (#504)

## Why

Publishing a Perry binary to a CDN, a release page, or an internal
artifact registry creates a window between "publisher built it" and
"user runs it." `--emit-attest` produces a JSON sidecar that anyone
can recompute on the downloaded artifact and compare. A tampered or
swapped binary fails verification with a verbose diagnostic that
reproduces both hashes.

## Emit

```bash
perry compile --emit-attest main.ts -o myapp
# → myapp
# → myapp.attest.json
```

Equivalent settings, last wins:

1. `perry.emitAttest: true` in host `package.json`.
2. `PERRY_EMIT_ATTEST=1` in the environment.
3. `--emit-attest` on the CLI.

`=0` / `false` explicitly disables (so a CI matrix can override a
host-level opt-in).

## Verify

```bash
perry verify --attest ./myapp
```

Streams SHA-256 of the binary on disk and compares against
`myapp.attest.json`. Output:

- **match** — prints `✓ attestation matches` plus the captured
  provenance (perry version, commit SHA, build timestamp). Exit 0.
- **mismatch** — prints both hashes, the sidecar's provenance, and
  exit 1.
- **missing sidecar** — prints actionable guidance pointing at
  `--emit-attest`. Exit 1.

The verifier runs offline (no tokio runtime, no network, no beta
consent prompt) — distinct from the existing
`perry verify` which goes through `verify.perryts.com` for runtime
verification.

## Manifest shape

```json
{
  "version": 1,
  "sha256": "abcd1234...",
  "size": 1048576,
  "perry_version": "0.5.999",
  "commit_sha": "0a1b2c3...",
  "built_at_unix": 1715990400,
  "binary_filename": "myapp"
}
```

`version: 1` reserves room for future top-level keys (CI signature
blob, sigstore bundle, reproducible-builds flags log) without
breaking existing parsers.

## When the hash is captured

The hash is computed *after* every post-link rewrite the platform
applies — `strip`, `codesign`, `install_name_tool` retag, ad-hoc
extended-attribute scrubs. That's the same byte sequence users
download, so the recomputed hash matches when the artifact is
intact.

## Cross-platform

The hook lives in the platform-agnostic `compile_command` driver,
so every backend (LLVM, WASM, ArkTS, HarmonyOS, Glance, SwiftUI,
JS) emits the sidecar consistently.

## Follow-ups (MVP scope)

The MVP captures hash + provenance. Full reproducible-builds and
sigstore-style remote signature publication are tracked separately
under the same issue.

## See also

- [`#504`](https://github.com/PerryTS/perry/issues/504) — design discussion.
- [`#505`](https://docs.perryts.com/cli/sandbox-buildrs.html) — companion build-time sandbox.
- [`#506`](https://docs.perryts.com/cli/emit-sandbox.html) — companion runtime sandbox profile.


---

<!-- source: docs/src/cli/emit-sandbox.md -->

# `--emit-sandbox` — Kernel-Enforced Sandbox Profile

When a Perry binary is built with `--emit-sandbox`, the compiler writes
a sandbox profile alongside the executable that the host can apply at
runtime. The profile is derived from the build's *reachable stdlib
surface* — a program that never imports `child_process` gets a profile
denying `fork`/`execve`; one that never imports `http`/`fetch`/`net`
gets a profile denying outbound network; etc.

**Zero per-call overhead in Perry's emitted code.** The kernel does
the syscall-entry check, which it already does for every syscall
regardless of sandbox state.

## Today: macOS only (MVP)

`perry compile --emit-sandbox main.ts -o myapp` writes:

- `myapp` — the executable.
- `myapp.sandbox` — a sandbox-exec profile derived from the build.

Apply at run time:

```bash
sandbox-exec -f myapp.sandbox myapp
```

Closed issue [#506](https://github.com/PerryTS/perry/issues/506) delivered this
macOS MVP. Linux `seccomp` + landlock, Windows AppContainer, and per-API
HIR-driven refinement remain unsupported follow-up work; #506 is the design
and implementation record, not an open tracker for those platforms.

## Enabling

Priority order, last wins (mirrors `--fast-math` / `--lockdown`):

1. **CLI flag**: `perry compile --emit-sandbox ...`
2. **Env var**: `PERRY_EMIT_SANDBOX=1` (and `=0` explicitly disables).
3. **`package.json`**: `{ "perry": { "emitSandbox": true } }`.

## What's derived from the build

| Build signal                          | Effect on profile                           |
|---------------------------------------|---------------------------------------------|
| `import "child_process"`              | Allow `process-fork` + `process-exec`       |
| Anything in `http` / `https` / `net` / `tls` / `dns` / `ws` / `axios` / `node-fetch` / `redis` / `ioredis` | Allow `network*` |
| `fetch(...)` reachable                | Same as above                               |
| `import "fs"`                         | Allow `file-write*` under `/tmp`, `/private/tmp`, `/private/var/folders` |
| `perry-jsruntime` linked              | Allow `dynamic-code-generation` (QuickJS JIT) |
| Always                                | Deny default. Allow `file-read*` on system locations + `/dev/null` + `/dev/urandom` so the dynamic linker reaches `main()`. |

The generated profile is a *starting point* — review and tighten
manually for production builds. Per-API HIR-driven refinement (which
would distinguish `fs.readFileSync`-only deps from `fs.writeFileSync`
deps, or `fetch("https://api.example.com/...")` from `fetch(url)`)
lands as a follow-up under the same flag.

## Header documents itself

The emitted profile starts with a documentation header that shows the
`sandbox-exec -f ... ...` invocation and cites #506 for context — so
downstream operators can see immediately how to apply it without
hunting through Perry docs.

## Composition with `--lockdown`

`--lockdown` (#496) is implemented, but it is intentionally orthogonal to
profile emission: it does not imply `--emit-sandbox`. Enable both flags when
you want compile-time surface refusal and the macOS kernel profile.

## What's NOT covered (MVP)

- Linux `seccomp` BPF filter + landlock FS scoping — follow-up.
- Windows AppContainer manifest — follow-up.
- Per-API HIR-driven refinement (`fs.readFileSync` ≠ `fs.writeFileSync`,
  literal-host extraction for `fetch`).
- Auto-loading the profile at process start via `sandbox_init` instead
  of the `sandbox-exec` wrapper.
- iOS / Android — already sandboxed by the platform at process launch;
  out of scope for this flag.

## See also

- [`#506`](https://github.com/PerryTS/perry/issues/506) — closed design and macOS MVP implementation record.
- The wider supply-chain hardening series
  ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).


---

<!-- source: docs/src/cli/sandbox-buildrs.md -->

# `PERRY_SANDBOX_BUILDRS`

Wraps `cargo build` invocations triggered by `perry.nativeLibrary`
resolution in macOS `sandbox-exec`, so `build.rs` scripts shipped by
third-party crates can't reach the network or write outside the build
output directory. Build-time only — **zero runtime cost** in the
produced binary. (#505)

## Why

`perry.nativeLibrary` resolution kicks off `cargo build` for any
source-distributed crate. A crate's `build.rs` runs with full developer
privileges, so a typical `bun add @vendor/native-thing` silently grants
the new dependency the ability to exfiltrate environment variables,
read SSH keys, or modify files outside the build tree. The flag flips
that to *opt-out* via an explicit allow-list rather than *opt-in* via
review.

## Opt-in

Off by default for backwards compatibility. Enable per build via
env var:

```bash
PERRY_SANDBOX_BUILDRS=1 perry compile main.ts -o myapp
```

CI typically sets the env var on every job; local development keeps
the legacy flow until ready.

## Profile contents

The generated `sandbox-exec` profile:

- `deny default` + `deny network*` — `build.rs` cannot phone home.
- `allow file-read*` everywhere (cargo / rustc need to read system
  libraries, source, dependency crates).
- `allow file-write*` scoped to `target/`, `~/.cargo`, `~/.rustup`,
  `/tmp`, and the per-build `TempDir`.
- `allow process-fork` + `process-exec` so rustc, cc, ld, and the
  build.rs binaries themselves can run.
- `allow sysctl-read` / `mach-lookup` / `iokit-open` for the platform
  queries cargo and rustc routinely issue.

## Pre-fetch workflow

The sandbox denies network, so cargo cannot reach `crates.io` from
inside it. Pre-fetch once outside the sandbox before the sandboxed
build:

```bash
cargo fetch --manifest-path node_modules/@foo/native-bar/Cargo.toml
PERRY_SANDBOX_BUILDRS=1 perry compile main.ts -o myapp
```

CI runners typically cache `~/.cargo` across jobs, so the pre-fetch is
free on subsequent builds.

## Per-package escape hatch

Some legitimate crates need network during `build.rs` (e.g. fetching
prebuilt artifacts from a CDN). Opt them out per-package in the **host**
`package.json`:

```json
{
  "perry": {
    "allowUnsandboxedBuild": ["@some-vendor/builds-with-network"]
  }
}
```

Host-controlled — transitive deps cannot opt themselves out. The
exemption lives in the host repository's `package.json` and shows up
in code review.

## Cross-platform scope

MVP is macOS-only (the `sandbox-exec` profile). Linux landlock
support is tracked separately; until that lands, `PERRY_SANDBOX_BUILDRS=1`
on Linux is a no-op (the build runs normally). Windows: out of scope.

## See also

- [`#505`](https://github.com/PerryTS/perry/issues/505) — design discussion.
- [`#504`](https://docs.perryts.com/cli/emit-attest.html) — companion binary attestation.
- [`#506`](https://docs.perryts.com/cli/emit-sandbox.html) — companion runtime sandbox profile.


---

<!-- source: docs/src/cli/perry-audit-sbom.md -->

# Behavioral SBOM (`perry audit --sbom`)

Every Perry compile writes a behavioral SBOM to `audit.json` in the
project's cache dir (default
`<project>/node_modules/.cache/perry/audit.json`) — a per-module manifest of the
stdlib symbols the build actually calls. The manifest is the
foundation for the rest of the supply-chain hardening series and gives
reviewers a way to see exactly what surface a dependency touches
without rebuilding the binary.

**Zero runtime cost.** The walk runs at compile time over the lowered
HIR; the file is written observationally and a missing-directory
error never fails the build.

## What's recorded

For each source module:

- **`source`** — canonical path the module was lowered from.
- **`package`** — owning npm package name when the source lives
  under `node_modules/<pkg>/...` (scope-aware: `@scope/pkg`).
  `null` for host source.
- **`stdlib`** — map of `<namespace>` → sorted unique method names.
  Captures both the general-shape `NativeMethodCall` lowering
  (`mysql2.createConnection`, `child_process.execSync`, …) and the
  dedicated specialized variants Perry uses for hot paths
  (`fs.readFileSync`, `path.join`, `process.env`, `tty.isatty`,
  `url.fileURLToPath`, …).

## Example

A `main.ts` like:

```typescript,no-test
import * as fs from "fs";
import * as path from "path";

const data = fs.readFileSync("/etc/hostname", "utf8");
const p = path.join("/tmp", "x");
console.log(data, p);
```

produces:

```json
{
  "version": 1,
  "modules": [
    {
      "source": "/repo/main.ts",
      "package": null,
      "stdlib": {
        "fs": ["readFileSync"],
        "path": ["join"]
      }
    }
  ]
}
```

The JSON output is byte-deterministic across builds (BTreeMap keys +
sorted method lists), so `perry audit --sbom > before.txt` + a
`package.json` change + a re-build + `perry audit --sbom > after.txt`
+ `diff before.txt after.txt` is a meaningful review tool — any new
capability a dependency reaches surfaces as added lines.

## CLI

`perry audit --sbom [PATH]`

- Reads the manifest from `audit.json` in the resolved cache dir
  (default `<PATH>/node_modules/.cache/perry/audit.json`; honors
  `--cache-dir` / `PERRY_CACHE_DIR` / perry.toml `[perry] cacheDir` /
  package.json `perry.cacheDir`), walking up
  the directory tree if needed (same shape `perry compile` walks up
  to find `package.json`).
- Default `PATH`: current directory.
- In `--format json` mode dumps the raw manifest pretty-printed.
- In text mode groups modules by owning npm package; host source is
  reported under `<host source>`.
- Returns a clear error if the manifest doesn't exist yet — `perry
  compile` or `perry run` writes it on every successful build.

## What's NOT yet recorded

Scope of this first cut (MVP):

- **Literal `fetch` / `http.get` URLs** — the compiler can enforce these through
  [`allowedHosts`](https://docs.perryts.com/cli/allowed-hosts.html), implemented by closed issue
  [`#502`](https://github.com/PerryTS/perry/issues/502), but audit manifest v1
  does not project them into a `literal_hosts` field.
- **Native-library symbol references** (FFI registry) — the registry exists in
  codegen, but audit manifest v1 does not project it into a `native_symbols`
  field.
- **`perry audit --sbom --diff`** — the bytes-deterministic JSON
  shape already enables the diff workflow via plain `diff` /
  `git diff`; a built-in `--diff` is a follow-up that picks a
  baseline (`audit.last.json` in the cache dir) and pretty-prints the
  change set.

The manifest shape is versioned (`version: 1`) so consumers can
detect when new top-level keys land.

## See also

- [`#495`](https://github.com/PerryTS/perry/issues/495) — design discussion.
- The wider supply-chain hardening series
  ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).
