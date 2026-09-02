<!-- Perry docs bundle: cli-optimization.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/cli/fast-math.md -->

# Fast-math and FP contraction

Off by default. Opt in to permit LLVM optimizations on f64 arithmetic
that produce observably different results from Node's V8 in exchange for
faster code on a narrow class of numeric workloads.

## TL;DR

| Mode | Bit-exact with Node | Speed |
| --- | --- | --- |
| Default | Yes (~94% of random FP programs match Node bit-for-bit; the residual ~6% comes from the LLVM SLP vectorizer at `-O3`, not from fast-math) | Same as Node within noise on realistic FP code |
| `--fp-contract=on` or `fast` | No where FMA fusion changes rounding | Can emit FMA for multiply-add shapes without enabling reassociation |
| `--fast-math` | No (~70%; ~30% of random FP programs diverge by 1 ULP). Implies `--fp-contract=fast` unless explicitly overridden. | ~7x faster on tight `sum += constant` loops; ~0% difference on dot products, array reductions, or any data-dependent FP-heavy code (M-series ARM64 numbers; x86_64 may differ) |

If your program does scientific computing, signal processing, or any
hand-tuned numeric kernel that benefits from autovectorization or FMA
fusion, `--fast-math` may help. For everything else (UI, business logic,
crypto, networking, framework code), it changes nothing observable
except correctness — leave it off.

## Three ways to enable it

CLI flag wins over env var, env var wins over package.json:

```bash
# 1. Per-build CLI flag
perry --fast-math myapp.ts

# 2. Per-shell environment
PERRY_FAST_MATH=1 perry myapp.ts

# 3. Per-project package.json (most common)
{
  "perry": {
    "fastMath": true
  }
}
```

## Floating-point contraction

Contraction is separate from reassociation:

```bash
# Permit FMA contraction only.
perry --fp-contract=on myapp.ts

# Permit the frontend's most aggressive contraction mode without reassociation.
perry --fp-contract=fast myapp.ts

# Keep reassociation from --fast-math but block FMA contraction.
perry --fast-math --fp-contract=off myapp.ts
```

The same setting is available through `PERRY_FP_CONTRACT=off|on|fast`
or `"perry": { "fpContract": "on" }` in package.json. Explicit package,
env, or CLI `fpContract` values override the `--fast-math` implied
default.

## What it actually changes

Two LLVM per-instruction fast-math flags can be emitted on every
`fadd` / `fsub` / `fmul` / `fdiv` / `frem` / `fneg`:

- **`reassoc`** — permits the optimizer to reorder associative chains.
  `(a + b) + c` may become `a + (b + c)`. This is what the loop-vectorizer
  needs to break a serial accumulator dependency chain into 4 parallel
  accumulators. Worst-case observable behavior: tiny ULP-level
  differences in long sum chains over operands of widely-different
  magnitudes; rewrites like `(a / b) * b → (a * b) / b` (algebraically
  equal, IEEE-different).

- **`contract`** — controlled by `--fp-contract`; permits fused multiply-add.
  `a * b + c` may become a
  single FMA instruction with one rounding step instead of two. ARM and
  modern x86 both have hardware FMA. Worst-case observable behavior:
  intermediate `a * b` no longer rounds independently, so code that
  depends on the rounding structure (Kahan summation, compensated
  arithmetic) sees different bits.

## What it deliberately does NOT enable

The full clang `-ffast-math` is **off** even with `--fast-math`. In
particular, these flags stay clear:

- `nnan` / `ninf` — these tell LLVM to assume no NaN/Inf inputs, which
  is catastrophic for Perry: NaN-boxing uses NaN bit patterns for every
  non-number value (strings, objects, null, undefined, booleans).
  Enabling them caused LLVM to replace `TAG_NULL` / `TAG_UNDEFINED`
  constants with `0.0` at codegen time. Tried at v0.2.x commit
  `083ce16`, reverted two days later in `b5a8c83f`. Will not return.
- `nsz` (no signed zeros) — would make `(a + 0) → a` a valid rewrite
  even when `a` is `-0`. `Object.is(-0, 0)` is observable in JS.
- `arcp` (allow reciprocal) — would rewrite `a / b → a * (1 / b)`,
  which loses precision when `b` is far from a power of two.
- `afn` (approximate functions) — would let LLVM substitute lower-
  precision math intrinsics.

For reference, Rust nightly's `#![feature(float_algebraic)]` enables
`reassoc + contract + nsz + arcp`. Perry's `--fast-math` is
strictly more conservative than that.

## Performance numbers

Benchmarks on Apple Silicon (M-series, ARM64), `min` of 3 runs each,
LLVM 19, perry 0.5.569. Run `scripts/perf_bench.sh` to reproduce.

| Benchmark | Default | `--fast-math` | Ratio | Node |
| --- | ---: | ---: | ---: | ---: |
| `sum_loop` (100M `sum += 1`) | 96 ms | 13 ms | **7.4× faster** | 53 ms |
| `dot_product` (10M `sum += a[i]*b[i]`) | 13 ms | 13 ms | 1.00× | 12 ms |
| `array_sum` (10M `sum += xs[i]`) | 10 ms | 10 ms | 1.00× | 11 ms |

Read these together: `--fast-math` produces a large speedup ONLY on
loops where the accumulator step is constant or trivially-redundant
enough that LLVM can split it into parallel partial sums. Real FP
workloads rarely look like `sum += 1` and so rarely benefit. The default
mode beats Node on `array_sum` and matches it on `dot_product` without
giving up bit-exact parity.

## Correctness numbers

`scripts/fp_fuzz.mjs` — randomly generates TS programs exercising the
six patterns most likely to trip per-instruction FMFs (left-fold,
tree-fold, right-fold reductions; FMA-shaped chains; algebraic
identities like `(a/b)*b`; cancellation predicates). Each program is
compiled with both Node and Perry, and stdout is diffed byte-for-byte.

| Mode | Pass rate (100 random programs, seed=200) |
| --- | --- |
| Default | 94/100 |
| `--fast-math` | ~70/100 |

The 6/100 default-mode failures are residual divergences from sources
not gated by per-instruction FMFs — most originate in the LLVM SLP
vectorizer at `-O3`, which can apply pairwise reduction even without
the `reassoc` permission. Tracked separately; out of scope for this
flag.

## Object-cache interaction

Perry's per-module `.o` cache (in `node_modules/.cache/perry/objects/`,
or wherever `--cache-dir` points) keys on the
`fast_math` and `fp_contract` settings alongside source hash and other
compile options. Toggling either invalidates affected cache entries —
`perry --fast-math` or `perry --fp-contract=on` right after `perry`
does a clean recompile of every module that contains f64 arithmetic. No
`--no-cache` necessary.

(This is a deliberate fix. During the original investigation, an early
version of the flag forgot to enter the cache key, and the result was
that toggling the flag appeared to do nothing because all `.o` files
came from the cache. If you ever see fast-math defaults that *seem*
not to take effect, suspect the cache key first.)

## Migration notes

- **For library authors:** if your TS library publishes benchmark
  numbers, document which mode you measured under. The 7× sum-loop case
  is the only place the gap is large; if your benchmark doesn't look
  like that, the numbers are mode-independent and you can publish one
  set.
- **For app authors:** there is no migration. Default behavior is the
  pre-flag behavior with `--fast-math` removed; bit-exact results are
  *more* compatible with Node, not less.
- **For determinism-critical code** (lockstep simulations, financial
  reconciliation, hash function correctness): leave the default. Even
  with `--fast-math` off there's a residual ~6% divergence rate on
  random FP code, which is too high for true determinism work — but
  it's an order of magnitude better than the ~30% with the flag on.


---

<!-- source: docs/src/cli/dynamic-dispatch.md -->

# Dynamic Stdlib Dispatch (`--lockdown`)

Perry can refuse compile-time *dynamic dispatch* on Node-core stdlib
namespaces. A call site like

```typescript,no-test
const m = "exit";
(process as any)[m](0);
```

is the standard string-based obfuscation pattern used by malicious npm
packages: `process["bind" + "ing"]("dns")`, `globalThis[atob("ZXZhbA==")]()`,
`fs[methodName]()` where `methodName` is computed at runtime.

**Default: allowed.** Since [#5263](https://github.com/PerryTS/perry/issues/5263)
the refusal is *off* by default. Dynamic `fs[name]` over a namespace Perry has
already statically linked can only *select among the methods that were linked*
— it is dynamic selection of a known set, not a way to reach arbitrary code —
so it is safe to allow, and legitimate packages depend on it (graceful-fs
stores its retry queue on `fs[Symbol.for('graceful-fs.queue')]`; fs-extra wraps
the known `fs[method]` functions). Dynamic reads resolve the linked member by
name; writes the program performs persist and read back — **string** keys via a
module-keyed override side-table, **symbol** keys on the cached namespace object
(so graceful-fs's `fs[Symbol.for('graceful-fs.queue')] = queue` round-trips).

**The refusal is re-armed by [`--lockdown`](https://docs.perryts.com/cli/lockdown.html)** — the
supply-chain gate — and by an explicit opt-out (below). Under those, the
site below fails to compile with `error[U006]`. The pass is purely
compile-time (**zero runtime cost**). Issue
[#503](https://github.com/PerryTS/perry/issues/503) tracks the original design.

## What's checked (when the refusal is armed)

The refusal is armed under `--lockdown` (or `perry.lockdown: true` /
`PERRY_LOCKDOWN=1`), or by an explicit `perry.allowDynamicStdlibDispatch: false`
/ `PERRY_ALLOW_DYNAMIC_STDLIB=0`. When armed, dynamic dispatch is refused when
**all** of the following hold:

1. The receiver resolves to a known Node-core stdlib namespace:
   `process`, `fs`, `crypto`, `child_process`, `net`, `os`, `path`, `http`,
   `https`, `http2`, `stream`, `url`, `util`, `events`, `dns`, `tls`,
   `querystring`, `zlib`, `async_hooks`, `readline`, `string_decoder`,
   `tty`, `worker_threads`.
2. The index expression is *not* a string literal — `fs["readFileSync"]`
   is treated identically to `fs.readFileSync` and always passes.
3. The user has not opted out (see below).

User-code reflection on user-defined objects is unaffected:

```typescript,no-test
const me = { greet: (n: string) => "hi " + n };
const k = "greet";
me[k]("world"); // ✓ user object, not a stdlib namespace
```

## Opt-outs (when armed)

When the refusal is armed and a site is refused, the error message lists the
available opt-outs in priority order:

### 1. Replace with a static call

The preferred fix. The check exists precisely because static calls are
auditable.

```typescript,no-test
process.exit(0);                // ✓
fs.readFileSync("/tmp/x");       // ✓
```

### 2. `// @perry-allow-dynamic` annotation (host code only)

For legitimate one-off dispatch in your own code, drop a line comment
on or immediately above the offending site:

```typescript,no-test
const k = pickHandler();
// @perry-allow-dynamic
(process as any)[k](0);
```

Contiguous comment lines above the call also count, so the annotation
can sit alongside an `// @ts-ignore` or similar.

The annotation is honored **only in host source files** (anything not
under `node_modules/`). A dependency cannot grant itself the opt-out by
writing `// @perry-allow-dynamic` next to its own call — that would
defeat the supply-chain defense the check exists for. Dependencies opt
in via the host's per-package allow list (below) or the global flag. This
host-only rule was implemented by closed issue
[#996](https://github.com/PerryTS/perry/issues/996).

### 3. Per-package allow list in `package.json`

To opt one or more npm dependencies out, list them under
`perry.allowDynamicStdlibDispatch` in the **host** application's
`package.json`:

```json
{
  "perry": {
    "allowDynamicStdlibDispatch": ["legacy-dep", "@scope/other-dep"]
  }
}
```

Modules whose source path lives under
`node_modules/<pkg>/…` are matched against this list. Host code is
*not* covered — opting host code out requires the global flag below
or the site annotation.

### 4. Global opt-out

To disable the check across the entire build, set the boolean form:

```json
{ "perry": { "allowDynamicStdlibDispatch": true } }
```

…or set the env var for a one-off build:

```bash
PERRY_ALLOW_DYNAMIC_STDLIB=1 perry build src/main.ts
```

CI can enforce the check by setting `PERRY_ALLOW_DYNAMIC_STDLIB=0`,
which beats any package.json opt-out.

## Why allowed by default (and gated under lockdown)

Dynamic member access over a *linked* stdlib namespace can only reach the
methods Perry already linked statically — it is dynamic *selection* among a
known set, not a way to construct or reach arbitrary code. The
dispatch-by-string obfuscation it could otherwise hide is only meaningful when
paired with the arbitrary-code surfaces that `--lockdown` already forbids
(`eval`/`Function`, `child_process`, native archives). So the refusal belongs
with the rest of the lockdown gate, not always-on: default builds allow it (so
graceful-fs, fs-extra, and similar legitimate patterns compile), while
security-sensitive builds opt into `--lockdown` and get the refusal back. An
explicit `perry.allowDynamicStdlibDispatch: false` / `PERRY_ALLOW_DYNAMIC_STDLIB=0`
re-arms just this check without the rest of lockdown.

See [`#503`](https://github.com/PerryTS/perry/issues/503) for design
discussion and the broader supply-chain hardening series ([`#495`–`#506`]
(https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).


---

<!-- source: docs/src/cli/allow-js-runtime.md -->

# JS Runtime Opt-In (`perry.allowJsRuntime`)

Perry refuses to link `perry-jsruntime` — the QuickJS-based runtime
that executes interpreted `.js` files from `node_modules/` — unless
the host application has explicitly opted in. This protects Perry's
primary structural advantage over Node: a Perry binary normally
contains *no* JS evaluator at all.

The check fires at compile time. **Zero runtime cost.**

## How a build hits this

The Perry compiler routes any `.js`/`.cjs`/`.mjs` file from
`node_modules/` through `perry-jsruntime`'s QuickJS sandbox instead of
the native LLVM backend. Most npm packages are pure-JS, so transitive
deps can pull the runtime in without the host author noticing — a
silent regression of Perry's main hardening pitch.

When that happens without an opt-in, the build fails with:

```text
Error: build pulled in `perry-jsruntime` (QuickJS-based eval-equivalent
runtime) via the following file(s):
  - /path/to/node_modules/evilpkg/index.js [evilpkg]

`perry-jsruntime` is treated as a privileged dependency on par with
adding a JIT to the binary — it re-introduces arbitrary runtime code
execution and defeats Perry's structural advantage over Node. Refusing
to link by default. (#499)
```

The diagnostic lists every file that triggered the pull-in, capped at
the first eight, with the owning npm package (when the path resolves
through `node_modules/<pkg>/`).

## Opt-in mechanisms

Three equivalent ways, listed in priority order:

### 1. `perry.allowJsRuntime` in `package.json` (persistent)

```json
{
  "perry": {
    "allowJsRuntime": true
  }
}
```

Recommended for production builds where you've reviewed the JS deps
and decided to ship them. The setting lives in source control next
to the dependency list it affects.

### 2. `--enable-js-runtime` CLI flag (per-invocation)

```bash
perry build src/main.ts --enable-js-runtime
```

Treated as an explicit per-build opt-in. Useful for local
development or one-off builds against a host that intentionally
doesn't set `allowJsRuntime: true`.

### 3. `PERRY_ALLOW_JS_RUNTIME=1` env var (CI-friendly)

```bash
PERRY_ALLOW_JS_RUNTIME=1 perry build src/main.ts
```

`=1`/`true` opts in; `=0`/`false` keeps the refusal on even if
`package.json` opted in — useful as a CI gate that fails closed when
someone tries to merge an opt-in by accident.

## Lockdown mode

This refusal is part of the deny-set for the implemented `--lockdown` compile
flag (closed issue
[`#496`](https://github.com/PerryTS/perry/issues/496)). In lockdown mode, no
opt-in is honored — the build always refuses `perry-jsruntime` linkage.

## See also

- [`#499`](https://github.com/PerryTS/perry/issues/499) — design discussion.
- The wider supply-chain hardening series
  ([`#495`–`#506`](https://github.com/PerryTS/perry/issues?q=is%3Aissue+label%3Aenhancement+security)).
