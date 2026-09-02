<!-- Perry docs bundle: internals-compiler.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/internals/gc-rooting-invariant.md -->

# The GC rooting invariant (codegen)

Read this before you emit a call from a lowering.

## The rule

> **Any GC-managed value that is live across a collection point must be
> reachable from a root before that point.**
>
> A value read out of a root and held in an SSA register across a call **is not
> rooted**. It is a copy, and the collector cannot see copies.

Perry's GC moves objects. When an evacuating minor runs, it walks the roots,
copies live objects to old-gen, and **rewrites every reference it can reach**.
Anything it cannot reach keeps the old address. That address now points into
from-space, which is about to be reused.

A "collection point" is any of:

- an allocation (`js_object_alloc`, `js_array_alloc`, `js_closure_alloc`, string
  concatenation, boxing — anything that can take an arena block);
- a call that can allocate, which in practice means **almost every runtime
  helper**. `js_object_set_field_by_name` allocates: it performs the keys-array
  transition. `js_object_get_property` allocates: it can run a getter, which is
  user code;
- `js_gc_loop_safepoint`, the back-edge poll (only emitted under
  `PERRY_GC_MOVING_LOOP_POLLS`, ON by default again, kill switch `=0`);
- `js_gc_collect` — a JS-level `gc()`. Since #7558 this runs a full mark-sweep
  on **precise roots** like everything else, so a value live across it and not
  reachable from a root is *freed*. It used to force the conservative
  native-stack scan (#4977), which hid exactly this shape; it does not any more.
  Note that a `gc()`-only window is invisible to `--moving-only`, because a full
  mark-sweep frees rather than moves — check such a function without that flag.

The safe default is that **a call collects unless you have read the runtime
source and proved otherwise**. The checker described below encodes exactly this
bias: its `NONCOLLECTING` set is the only place a call is declared safe, and
every entry names the runtime line that proves it.

## Why this class of bug is so expensive

Every violation presents the same way and none of it points at the code that is
wrong:

- the symptom is `TypeError: value is not a function`, or a SIGSEGV, **cycles
  later and somewhere else** — wherever the stale pointer is finally
  dereferenced;
- **no runtime GC probe can see it.** At the moment of the collection there is
  nothing for the collector to find, so a from-space scan, a verify-roots pass
  and a rate-1 seeded run all come back clean. `PERRY_GC_VERIFY_EVACUATION` checks that
  reachable slots were forwarded; it cannot check a register it does not know
  exists;
- it is **visible by default only where a poll is emitted.** The back-edge poll
  is on by default again, but `emit_gc_loop_safepoint` emits it only into loops
  `loop_purity::loop_may_allocate` says can allocate — so a default run covers
  this class exactly when execution reaches such a loop, and covers nothing in
  a program whose hot path is a proven alloc-free loop. `PERRY_GC_MOVING_LOOP_POLLS=0`
  removes the coverage entirely.

Four instances shipped in a single day. The detection lag, not the fix, was the
cost every time.

## The six ways it has actually broken

### 1. Slot index past the frame (#7184)

The root store was emitted, and it looked right. But the slot index fell outside
the frame pushed by `js_shadow_frame_enter`, so `js_shadow_slot_bind`
bounds-checked it and **silently returned**. The value was never rooted; the IR
says it was.

*Tell:* a `js_shadow_slot_bind(i32 N, …)` where `N >= the frame size`. There is
no diagnostic — the bind is a no-op by design, because a bounds-check that
panicked would be worse.

### 2. Root store after a collecting call (#7192)

The store was in-frame and correct, but emitted **after** a call that allocates.
Between the allocation and the store, the value lived only in a register.

```llvm
%obj = call ptr @js_object_alloc(i32 4)
%ret = call double @js_call_function(double %a)   ; can evacuate %obj
store ptr %obj, ptr %slot                          ; stores the OLD address
call void @js_shadow_slot_bind(i32 0, ptr %slot)   ; roots a dangling pointer
```

*Tell:* the resulting slot is *rooted* and *dangling* at the same time, which is
why it survives every "is it rooted?" check.

### 3. Method receiver across the argument list (#7206)

The receiver was loaded out of its root, then the argument expressions were
lowered — each of which can allocate — and only then was the call emitted with
the receiver still in the register loaded before the arguments.

*Tell:* a `load` from a root slot, followed by any lowering of a sub-expression,
followed by a use of the loaded register. **Re-read the root after every
collection point** instead of caching the load.

### 4. Computed-read base across the key expression (#7206)

`base[key]` — the base was materialized, then the *key* expression was lowered
(allocating a string, say), then the element read used the stale base.

*Tell:* two operands where one is evaluated first and used last.

### 5. Runtime-cache class (#7226, #7239)

A thread-local or static cell holding a GC pointer that no registered scanner
rewrites. Unlike the register-class bugs above (which go bad intermittently when a
collection lands in a narrow window), an unregistered runtime cache becomes
stale at the first moving collection after it is populated and stays stale
until rewritten.

Real instances: `js_value_typeof` interned its eight result strings in
thread-local `Cell<*mut StringHeader>`s with no registered scanner (#7226);
`json/raw_json.rs`'s cached `"rawJSON"` key (#7226); and the ten runtime caches
in #7239 — `CACHED_ENV`, `CACHED_PERMISSION`, `CACHED_REPORT`, `ERROR_CONSTRUCTOR_PTR`,
`INPUT_HANDLER`, `RESIZE_CALLBACK`, `FRAME_CALLBACKS`, `CURRENT_NEW_TARGET`,
`ACCESSOR_RECEIVER_OVERRIDE`, and `PENDING_FETCH_SIGNAL`.

*Tell:* a thread-local or static cell holding a GC pointer. A test that fails 10/10,
not intermittently, suggests this class rather than a stale register.

**`scripts/gc_root_dominance_check.py` is structurally blind to this class** — it
reads emitted LLVM IR and cannot see a runtime table. The instruments that catch it
are `PERRY_GC_SCHEDULE_SEED=1 PERRY_GC_SCHEDULE_RATE=1 PERRY_GC_PROTECT_FROMSPACE=1 PERRY_GC_PROTECT_FROMSPACE_DEPTH=800`
on a real workload. When adding a cache of a heap pointer, register it in
`gc_register_mutable_root_scanner` in `gc/mod.rs` in the same commit.

### 6. The root decision trusted a structural type inference (`?? null`)

`const masks = opts?.masks ?? null`, from a Three.js world builder. Optional
chaining lowers the left side to an `Any`-typed conditional, and the `??`
inference rule (`analysis/value_types.rs`, with an AST-level twin in
`lower_types.rs`) answered the RIGHT operand's type for an unknown left, so the
binding was declared `Null`. `collectors/pointer_locals.rs` distrusts declared
types on purpose (#7846) and proves pointer-ness from the initializer — but its
generic `expr_value_type` fallback ran that same inference and took `Null` as
proof. No shadow slot, so no `ptr addrspace(1)` retype and nothing for
`root_reload` to reload: the array's NaN-boxed address sat in a plain
`alloca double` across the loop back-edge poll, the copying minor moved the
array, and `masks[0]` read from-space (SIGBUS under
`PERRY_GC_PROTECT_FROMSPACE=1`, silent garbage otherwise).

An explicit `number[] | null` annotation changed the HIR type and nothing else.
A plain ternary was rooted all along, because the collector's `Conditional` arm
fails closed when either branch is unclassifiable — which is how the `??` path
was isolated. The fix is both halves: `coalesce_type` keeps an unknown left
unknown, and the collector's `Logical` arm requires both operands to classify
before it answers, so a root decision never again rides on the inference.

*Tell:* a local whose HIR type is `Null`, `Void` or `Number` while its
initializer reads a property, calls, or coalesces. `--unrooted-allocas` was
silent here: the stored value's provenance is a property read
(`js_object_get_field_*`, an inline-cache slot load), which its heap-source
vocabulary does not include — the same one-load gap #7664 closed for string
handles, still open for field reads.

## How to check your work

### 1. The static checker — run this one

**Scope: emitted-LLVM rooting hazards only** — a stale register or an unrooted
alloca in generated code. Within that scope it is the only instrument that sees
a defect before it crashes, which is why it runs first.

**It is blind to three classes, all found the hard way. A clean report is not
evidence for any of them:**

- **Runtime tables and interning caches** (#7231) — it reads emitted IR and
  cannot see a runtime cell. Tell: fails 10/10 rather than intermittently.
- **Unrooted locals in runtime Rust** (#7249) — same reason. It read
  `0 violations` on both sides of a real bug whose fix was a one-line
  `GcSuppressScope` in the `globalThis` bootstrap.
- **Anything its symbol sets do not name** (#7284) — `POLL_CAPABLE_RUNTIME` is
  an *exact emitted-symbol* set. It carried `js_object_get_field_by_name`, which
  codegen never emits, next to `js_object_set_field_by_name`, which it emits
  verbatim. Property sets classified `MOVING: YES`, property gets `MOVING: no`,
  and 31 stale uses were dropped by `--moving-only`. **Audit these sets against
  what codegen actually emits, the way #7227 audits `ALLOC_RE`.**

For the classes above, the instruments that catch them are the schedule/quarantine
arms below and a *dependency-scale* workload — #7280 records 25 curated corpus
files passing while 20 lines of stock zod fail.

**A fourth class was on this list until #7663 and is now covered: the lowering
that actually ships.** The corpus used to be compiled under `PERRY_RS4GC=0` —
the shadow stack — because the checker anchored on `@js_shadow_slot_bind` and
the native lowering emits zero of them. That made a green `gc-root-dominance` a
statement about a lowering that has not been the default on any walkable-frame
target since #7370. **Run both**, and know which one you ran:

```bash
cargo build --release -p perry -p perry-runtime-static -p perry-stdlib-static

# SHADOW (PERRY_RS4GC=0): still the lowering on arm64_32 watchOS and ARM64
# Windows. Anchors on root stores.
./scripts/gc_root_dominance_corpus.sh ir-corpus
python3 scripts/gc_root_dominance_check.py ir-corpus --moving-only \
  --allowlist scripts/gc_root_dominance_allowlist.json -v

# NATIVE (PERRY_RS4GC=1): the default everywhere else. Anchors on
# `gc.statepoint` `"gc-live"` bundles. Needs an LLVM `opt` -- codegen emits
# `ptr addrspace(1)` root allocas and LLVM inserts the safepoints later, so the
# corpus is `--trace llvm` output plus the production statepoint rewrite.
./scripts/gc_root_dominance_corpus.sh ir-corpus-native --lowering native
python3 scripts/gc_root_dominance_check.py ir-corpus-native --statepoints \
  --moving-only -v
```

Each mode **refuses the other's corpus** rather than reporting it clean: the
native corpus has zero root stores, so `--min-binds` fails there, and the
shadow corpus has zero safepoints, so `--min-statepoints` fails there.

### What `--statepoints` checks, and how it differs

Under native roots a value is a root at a safepoint iff it appears in that
`gc.statepoint`'s `"gc-live"` bundle, and its identity below the safepoint is
the `gc.relocate` result. So "the root store must dominate every later
collection point" becomes:

> No register naming a GC object may be USED below a safepoint unless it is the
> relocated value.

The line that does the work is **tracked vs untracked**. LLVM relocates
`ptr addrspace(1)` SSA values and rewrites their dominated uses, so those are
never stale. Everything else is invisible to it — and Perry NaN-boxes, so a
JSValue spends most of its life as a `double`. Two verdict classes, because
they have two different fixes:

| class | means | fix |
|---|---|---|
| `unrooted` | no `ptr addrspace(1)` value in the register's cast chain is in the safepoint's live bundle. Nothing marks or rewrites the object. | root it |
| `stale` | the object IS in the bundle and is relocated, but a raw copy of its pre-move address is used below | re-derive from the relocated value (`OperandProtection::Reload`) |

Two things this mode gets for free that the shadow modes cannot:
**`NONCOLLECTING` is not consulted** — LLVM already decided which calls are
safepoints and put the answer in the IR, so a wrong entry in that hand-kept
list cannot hide a hazard here; and every safepoint **names its wrapped
callee**, so `--moving-only` classifies against the real symbol rather than
`llvm.experimental.gc.statepoint.p0`.

It parses the emitted LLVM IR, builds per-function CFGs, computes real
Cooper/Harvey/Kennedy dominance, and reports every **collection point** that can
run between the instruction producing a GC value and the root store that
publishes it — that is, a collection point the value's root store does **not**
dominate, which is exactly the rule at the top of this page. Dominance is what
makes the report sound in both directions: the producing instruction must
dominate the bind, so the register being rooted really is the one that
instruction produced on every path. It is one-sided: an unrecognised call counts
as collecting, so a gap in its model costs a false positive, never a missed bug.

For a single file you are iterating on:

```bash
PERRY_GC_MOVING_LOOP_POLLS=1 PERRY_INLINE_SHADOW_SLOT=0 \
  ./target/release/perry compile mycase.ts -o /tmp/mycase --trace llvm
python3 scripts/gc_root_dominance_check.py .perry-trace/llvm -v
```

Both env knobs matter, for different reasons.

`PERRY_GC_MOVING_LOOP_POLLS=1` is what puts `js_gc_loop_safepoint` in the IR. It
is the only collection point a **back edge itself** introduces — a loop whose
body calls nothing that collects still collects, once per iteration, and only
with this on. So a bug that needs a collection between two points of an
otherwise inert loop body cannot appear in the corpus without it.

It is **not** what makes the `MOVING` classification work, and it is not the
only collection point that can run inside a loop — a `POLL_CAPABLE_RUNTIME`
helper called from a loop body is in-loop too. `movers`
(`gc_root_dominance_check.py`, the `movers` property on `Violation`, `StaleUse`
and `UnrootedAlloca`) counts `js_gc_loop_safepoint`, anything in
`poll_reaching`, **and** anything in `POLL_CAPABLE_RUNTIME` — the runtime
helpers that can re-enter JS, such as `js_object_set_field_by_name`,
`js_object_get_field_ic_miss` and `js_closure_call1`. Those are moving with no
poll anywhere near them.

So: turn the knob on, because it widens what the corpus can express, but do not
read a poll-free function as safe.

### `POLL_CAPABLE_RUNTIME` is by EXACT emitted symbol, and that has bitten twice

`movers` is a set-membership test on the callee name, so an entry that names a
symbol codegen does not emit classifies nothing, forever, and looks exactly
like coverage while doing it. Two rounds of this have now been measured:

1. **A real symbol codegen never emits.** The set carried
   `js_object_get_field_by_name` next to `js_object_set_field_by_name`, which
   reads as symmetric coverage of property access. It is not: codegen emits the
   SET verbatim but lowers every GET to `js_object_get_field_by_name_f64`,
   `js_object_get_field_ic_miss` or
   `js_typed_feedback_object_get_field_by_name_f64`, none of which were in the
   set. Property sets classified `MOVING: YES`, property gets classified
   `MOVING: no`, and 31 `--stale-registers` hits on the gate corpus were dropped
   by `--moving-only` as a result — including the shape that faults
   deterministically under `PERRY_GC_PROTECT_FROMSPACE=1
   PERRY_GC_PROTECT_FROMSPACE_DEPTH=800` at zod's `clone`. The protector and the
   checker disagreed; the checker was wrong.
2. **Ten names that were not symbols at all.** `js_apply_function`,
   `js_array_for_each`, `js_array_sort`, `js_call_closure`, `js_call_value`,
   `js_function_call`, `js_invoke_closure`, `js_object_get_property`,
   `js_object_set_property`, `js_string_replace` — extrapolated spellings, none
   of them an `extern "C" fn` anywhere in the runtime. Four of the ten were four
   different ways of saying "call a JS closure", so the single most obviously
   poll-capable operation in the language was covered zero times; the real
   entry points are `js_closure_callN`, which `RECEIVER_SINKS` in the same file
   already spelled correctly.

3. **A real symbol that was simply not in the set** (#7616 / #7453). The two
   rounds above are both a NAME WITH NO REFERENT, and both audits look only in
   that direction. `new URL(input, base)` held a raw `*mut StringHeader` from
   `js_url_coerce_string` across the lowering of `base`; #7453's fix added
   `url_coerce_string` to `ALLOC_RE` — its comment says *"that gap is why the
   checker did not flag #7453"* — and stopped one list short, so the shape was
   never catchable under the mode CI runs. Re-planting that exact code and
   running every mode (#7616):

   | mode | clean | sabotaged |
   |---|--:|--:|
   | `--moving-only` (dominance) | 0 | **0** |
   | `--unrooted-allocas --moving-only` | 0 | **0** |
   | `--stale-registers --moving-only` | 2 | **2** |
   | `--statepoints --moving-only` (the lowering that ships) | 2 | **2** |
   | `--stale-registers` (unfiltered) | 24 | 35 |
   | `--statepoints` (unfiltered) | 15 | 21 |

   Every gated arm blind, both unfiltered arms not — *including* `--statepoints`,
   added in #7663 precisely because the other three were blind to the shipping
   lowering. Adding the one name takes the sabotaged arms to 13 and 8 and leaves
   the clean arms at 2 and 2.

4. **A poll-capable symbol NO audit can ask for** (#8809). `--audit-poll-reach`
   walks only symbols `ALLOC_RE` matches, so a helper that allocates but spells
   it neither `_alloc` nor `_new` nor `_create` is outside its domain entirely.
   `js_private_brand_add` is one: it reaches `js_object_set_field_by_name` in
   three lines, and its own body says *"the marker-key allocation can evacuate
   both the receiver and any live value"* — it opens a `RuntimeHandleScope` for
   exactly that reason. Unlisted, the window `new C()` opens around it
   classified `MOVING: no`, and every `--moving-only` arm dropped a real stale
   instance handle. Round 3's instrument is structurally blind here, which is
   the standing residual: **when you add a runtime helper that can re-enter JS
   or allocate through a path that can, add it to `POLL_CAPABLE_RUNTIME` in the
   same commit.** Nothing will ask you to.

`--audit-poll-capable` is the gate for rounds 1–2 and `--audit-poll-reach` is
the gate for round 3; round 4 has no gate. `gc-root-dominance.yml` runs both
alongside `--audit-alloc-re` before the build.

**Those pre-build audits are also the job's single point of failure, and it has
already cost ten days.** `--audit-poll-reach` went red on `main` on 2026-08-15
over three unlisted symbols and stayed red; because it runs *before* the
compiler build, not one of the four gated arms below it executed until #8809.
Two rooting regressions landed inside that window, and the opt-in PR arm did
not see either (neither PR carried `run-extended-tests`). A red audit is not a
warning about the checker's bookkeeping — it is the whole gate off. `--audit-poll-capable` fails on any entry
that names no exported `extern "C" fn js_*`. When it goes red, **replace** the
phantom with the symbol codegen actually emits rather than deleting it —
deleting turns the audit green and leaves the hole.

`--audit-poll-reach` fails when a symbol `ALLOC_RE` matches reaches a
`POLL_CAPABLE_RUNTIME` symbol through the runtime's own call graph without being
listed itself. It is deliberately NOT "every poll-capable symbol must be
listed" — 297 exported symbols call one directly, and deciding that is a
coverage change with its own hit count. It asserts only that **the checker's two
lists must not disagree about the same symbol**: if ALLOC_RE says a call's
result is a heap value to track, and the runtime shows that call invoking
something this set already grants can re-enter JS, the premise for listing it is
one the set already granted. The reach relation is a fixpoint over exported
symbols (a one-hop version reported 52 names, and re-running after adding them
found 10 more), and comments and string literals are stripped first so a name
mentioned in prose cannot become a premise.

Checking a *plausible* name is not enough. Confirm against emitted IR:

```bash
grep -ho 'call [^@]*@js_[A-Za-z0-9_.$]*(' ir-corpus/*.ll \
  | sed -E 's/.*@([A-Za-z0-9_.$]+)\($/\1/' | sort | uniq -c | sort -rn
```

`PERRY_INLINE_SHADOW_SLOT=0` makes every root store the `js_shadow_slot_bind`
call form the checker anchors on.

`--stale-registers` (#7206) additionally catches values that are *never* rooted
— read out of a root and held in a register across a collection point. That is
the mode that found cases 3 and 4. It ships and works, but **the gate command
above does not pass it**: the bind-anchored scan is the arm that is baselined by
the allowlist, so cases 3 and 4 only surface when you run this mode by hand.

`--unrooted-allocas` (#7207) covers the remaining shape, and is the one the
bind-anchored check is structurally blind to: the value lives in a plain
`alloca_entry` for its whole lifetime, so there is no `js_shadow_slot_bind` to
anchor on and a scan that starts from binds calls the function clean. It found
`lower_call/new.rs`'s inline-ctor `this_slot` independently of any runtime
probe.

**The gate runs this mode as of #7236, and the corpus reads 0.** It could not
before: #7210 measured 66 hits and triaged every one as a false positive, #7235
split the heap-source predicate by movability (98 → 2 on a grown corpus), and
the 2 residuals were one bug — `collectors/pointer_locals.rs` classified
`Type::Symbol` as an immediate, so a `Symbol` local got no shadow slot at all.
Run it by hand when you touch an `alloca_entry` site:

```bash
python3 scripts/gc_root_dominance_check.py .perry-trace/llvm \
  --unrooted-allocas --moving-only -v
```

### 2. The runtime instruments — second, and mind the depth

From #7196:

- `PERRY_GC_SCHEDULE_RATE=1` (with a seed) — collect at every candidate
  safepoint, allocation-paced (#7728): one candidate per
  `PERRY_GC_SCHEDULE_ALLOC_KB` (default 4) of new nursery material. Slow,
  thorough. Add `PERRY_GC_SCHEDULE_ALLOC_KB=0` for the literal every-poll mode
  when the window you are hunting executes only once — it is far slower.
- `PERRY_GC_PROTECT_FROMSPACE=1` — `mprotect` from-space after evacuation so a
  stale read faults immediately instead of reading plausible garbage.
- `PERRY_GC_FROMSPACE_SCAN_ABORT` — now actually runs.
- `PERRY_GC_SCHEDULE_SEED=<u64>` (+ `PERRY_GC_SCHEDULE_RATE`, default `0.05`) —
  collect on a deterministic pseudo-random schedule. At `RATE=1` it collects at
  every safepoint: slow, thorough, maximum pressure. Drop the rate when that is
  *too* blunt — on a workload whose timing it distorts enough to kill somewhere
  uninteresting — and the schedule thins out without losing the property that
  matters. The schedule is a pure function of `(seed, per-thread safepoint
  ordinal)`, so a seed that fails is a reproducer, which is what turns "1 run in
  60" into something you can bisect against.
  `scripts/gc_schedule_fuzz.sh <binary> [seed-count]` sweeps seeds and prints a
  reproduce command per failure.

> **A rate is not a substitute for a schedule.** Re-running one binary 60 times
> re-runs one schedule 60 times; with zero failures in `N` runs the 95% upper
> bound on the true rate is only ~`3/N`, so 120 clean runs bound a 1.7% bug at
> 2.5% — no evidence at all. Varying *when* collections fire is the only cheap
> way to explore the space the bug actually lives in.

> **`PERRY_GC_PROTECT_FROMSPACE_DEPTH` defaults to 4, and that default produces
> FALSE GREENS.** Four levels of retained from-space is not enough to still be
> holding the block your stale pointer is in by the time it is dereferenced.
> **Use 800.** A clean run at the default depth means nothing.

Depth is a **detection-window** knob, not a sensitivity knob, and the
difference matters when the two instruments disagree. A page-set enters the
quarantine only because an evacuating minor actually retired it as from-space
(`arena/quarantine.rs`, and the knob gates only
`copying_reset_from_spaces_and_flip`), so *any* fault on a quarantined address
is a genuine stale read no matter how deep the ring is. Raising the depth
removes false NEGATIVES — evicting a set hands its blocks back to Eden, where
the same read silently succeeds — and cannot manufacture a false positive. So
"the protector faulted, but only at DEPTH=800" is never grounds to doubt the
protector; when it disagrees with the static checker, look at the checker first.
That is how the zod `clone` disagreement was settled.

And when a fault does fire, **walk UP the stack**. The reporter names the frame
that DEREFERENCED the stale value, which is usually not the frame that owns the
register — the value commonly arrives as an argument from a caller that let it
go stale.

And remember the ceiling on all of these: if the collection happens while the
only copy is in a register, there is nothing at that moment for any runtime
probe to notice. These instruments catch the *consequence*, later. The static
checker catches the *cause*, now.

## The mirror image: a missing write barrier (#8185)

Everything above is about a value the collector cannot **find**. The write
barrier is about an edge the collector is never **told about**. The two are
duals, and — this is the part that keeps catching people — **their detectors
are swapped**.

| | rooting bug | missing/deleted write barrier |
|---|---|---|
| what goes wrong | a live value is invisible to the root scan | an old→young edge is absent from the remembered set |
| when it goes wrong | at the collection, silently | not at the store at all; at some *later* minor |
| the detector | the runtime instruments (`PERRY_GC_SCHEDULE_RATE`, `PERRY_GC_PROTECT_FROMSPACE`), plus the static checker for the IR-visible half | a **static IR assertion**, and nothing else |
| the blind spot | the static checker cannot see a runtime-side cache of a heap pointer (see §5) | **every runtime probe we have** |

### Why no runtime probe can see it

A dropped barrier corrupts nothing at the moment of the store. The store still
writes the right bits into the right slot; the object graph is correct. All
that happens is that a remembered-set entry goes unwritten, so the set is
merely *incomplete*. Turning that into an observable failure needs a
conjunction the program has to supply on its own:

1. the parent has to survive into old-gen (or be tenured) **before** the store;
2. the child has to still be in the nursery **at the next minor**;
3. a **minor** collection — not a full mark-sweep, which retraces everything
   and papers over the whole class — has to land in that window; and
4. that edge has to be the *only* path to the child, or some other root finds
   it anyway and the collection is clean.

Miss any one and the minor collects correctly, the program prints the right
answer, and the probe reports success. Nothing was tried.

The individual knobs are worse than merely insensitive — three of them are
aimed at a different property entirely, and it is easy to read their green as
evidence:

- `PERRY_GC_FORCE_EVACUATE` / `PERRY_GC_VERIFY_EVACUATION` verify
  **rewriting**: that every live slot pointing at a forwarded object was
  updated. A slot the collector never traced is not a slot it failed to
  rewrite. Remembering and rewriting are different properties, and the verifier
  only asks about the second one.
- `PERRY_GEN_GC=0` reverts to full mark-sweep, which **does not consult the
  remembered set at all**. It does not make the bug visible; it makes the bug
  unreachable. A green run here is the strongest-looking and emptiest evidence
  of the three.
- `PERRY_GC_SCHEDULE_RATE=1` + `PERRY_GC_PROTECT_FROMSPACE` catch a *stale read
  of a moved object* — condition (4)'s aftermath, on the rooting side of the
  duality. They fault on a dangling from-space pointer, not on a live object
  that was never traced.

  And check the knob you are about to cite is a knob. `scripts/check_gc_env_knobs.py`
  is in `lint` precisely because this drifts: a matrix arm naming a variable
  nothing parses runs the DEFAULT configuration and reports success — hazard 4
  again, one level up. Every name in this document is one the gate has
  confirmed a live parser owns.

This is CLAUDE.md's hazard 4 ("the gate runs but its subject never did") with
the subject inverted: **the absence of a barrier cannot be observed by running
the program.** There is no execution in which "the barrier did not run" is a
distinguishable event.

**Recorded, because it is the whole reason the IR assertions exist (#8183):** a
**release** build with the write barrier deleted from the dynamic-key write
IC's reference arm passes the entire adversarial matrix — old→young edge
fixtures, `PERRY_GC_FORCE_EVACUATE=1 PERRY_GC_VERIFY_EVACUATION=1`,
`PERRY_GEN_GC=0`, and forced collection with from-space protection at depth 400
— **byte-identical output, exit 0**, on both a gap fixture and a larger
adversarial one. The static IR test was the only thing that said no.

### What a PR that adds or moves a store on a GC slot owes

Its barrier evidence is a **static IR assertion**, not a behavioural test. Four
things it has to pin, each because a sabotage that skipped it was *not* caught:

1. **The bookkeeping is present** in the pointer-capable arm — the write
   barrier, the layout note, and the string addref. Any one of the three going
   missing is the #5094 / #7511 family of silent stranding.
2. **The arm is REACHED.** Assert a `br i1` *into* the block, not merely that a
   block with that label exists. #8183's third sabotage — routing reference
   values back to the outlined helper — left the arm behind as **dead IR** that
   every content assertion happily inspected, and initially passed. Presence of
   code is not proof it runs.
3. **The negative arm stays clean.** The pointer-free arm must *not* contain
   the bookkeeping. A barrier leaking into it means the discriminator stopped
   discriminating, and the "optimization" is measuring nothing.
4. **Sabotage runs, reported.** Delete each element in turn and record that the
   test goes red. A test that has never failed is a test whose failure mode is
   unknown.

And put it where it runs. `test.yml`'s per-PR `cargo-test` arm is `--lib
--bins` only; `crates/*/tests/*.rs` is nightly/tag (`e2e-scoped` runs only the
suites the diff happens to name). A barrier assertion parked in `tests/`
gates its own PR and no future one — which is exactly the PR that will move the
store. **In-crate `#[cfg(test)]` under `src/`, per #5960.**
`crates/perry-codegen/src/expr/class_field_barrier_tests.rs`,
`index_set_barrier_tests.rs` and `write_pic_barrier_tests.rs` are the shape.

### The `GC_STORE_AUDIT` marker, and what it does and does not prove

Every raw GC-relevant store site carries a nearby marker naming its verdict:

```rust
// GC_STORE_AUDIT(BARRIERED): the slot write is unconditional; the barrier
// below is guarded only by a live test that the stored bits carry no heap
// pointer, which is the barrier's own first test.
```

The classes are `BARRIERED`, `EXTERNAL_BARRIERED`, `ROOT`, `INIT`,
`POINTER_FREE`, `STACK`. `scripts/gc_store_site_inventory.py` (in `lint`) scans
the first-party store sites and fails when one has no marker — so a **new**
store site cannot land with the question unanswered.

Since #8185 landed its second half, the script verifies the **claim**, not
just the comment, for the two classes where a false claim strands objects:

- **`BARRIERED` in `perry-codegen`** is bound to an IR witness. Every call to
  the stem-taking barrier emitters (`emit_write_barrier_slot_generation_tested`,
  `…_value_and_generation_tested`, `emit_jsvalue_slot_store_pointer_tested`)
  must pass a string-literal stem, and the census in
  `crates/perry-codegen/src/expr/barrier_stem_census_tests.rs`
  (`VERIFIED_BARRIER_STEMS`) must list exactly that stem set — the lint script
  fails on drift in either direction, on a stem it cannot resolve to a
  literal, and on a `BARRIERED` marker in any codegen file not bound to a
  census stem. The census test itself (a `--lib` test, so per-PR) compiles a
  probe per stem and, for **every instance** of the stem's gate in the emitted
  IR, asserts a `cond_br` into `<stem>.barrier.<n>`, the
  `js_write_barrier_slot` call inside that block, and the branch predicate
  walked by def-chain back to the `GC_FLAG_TENURED` load and the
  incremental-count load — so `br i1 true` with the dead predicate left in
  place fails, and so does a barrier bypassed in one specialized clone but
  intact in another. Four IR-surgery sabotages (delete the call, hard-wire the
  gate, move the call out of its block, bypass the gate) run in the suite
  against every stem.
- **`BARRIERED` / `EXTERNAL_BARRIERED` in `perry-runtime` / `perry-stdlib`**
  are rustc-compiled, so there is no perry-emitted IR; the claim is verified
  against source structure instead. From the marker to the end of its
  enclosing function there must be a call to a barrier primitive (defined
  under `crates/perry-runtime/src/gc/`) or to a registered discharge helper
  (`RUNTIME_DISCHARGE_HELPERS` in the script), and every registered helper is
  itself re-verified each run to reach a primitive through the call graph —
  deleting the barrier *inside* `note_array_slot` turns every marker leaning
  on it red. Granularity is the enclosing function (two barriered stores and
  one barrier call in the same function still pass), and the script prints
  that limit.

What is still trusted: `ROOT`, `INIT`, `POINTER_FREE` and `STACK` verdicts are
human-audited only, and the script says so in its summary on every run —
`UNVERIFIED (human-audited only, by class): …`. A codegen caller that passes
`write_barrier_needed: false` where `true` was meant is a parameterization bug
neither layer catches. If the verifier's own inputs rot — the census file
missing, the registry parsing to zero entries, a scan matching fewer sites
than its floor — the script exits **2** rather than reading as a clean empty
pass (the `gc_rekeyed_key_tables.py` discipline), and its `--self-test` plants
fifteen shapes, each of which must be adjudicated.

## The corpus problem, and the two corpora (#7280)

**A hand-written corpus cannot express this class of bug at dependency scale,
and for a while nobody could tell, because it was green.**

`scripts/gc_root_dominance_corpus.sh` compiles ~124 `test-files/` sources
chosen for the lowerings they exercise. It reads **zero** in both modes the CI
gate runs — and it read zero while twenty lines of stock `zod` faulted
deterministically under `PERRY_GC_PROTECT_FROMSPACE_DEPTH=800`. #7280 puts it in
one sentence: *25 curated files pass while 20 lines of stock zod fail.*

That is not a size problem. Both corpora were measured on the same compiler with
`--stale-registers --moving-only`:

| corpus | stale uses | what dominates |
|---|---|---|
| curated, 124 sources / 144 modules | 116 | property-GET helper windows, `js_number_coerce`, `js_closure_callN` |
| dependency-scale, 81 modules / 62 MB | 370 | `js_object_assign_one` (object spread) 137, `js_new_function_construct` 102, `js_closure_call*` 30 |

The curated corpus produces 12 of the first population and 1 of the second. A
hand-written test allocates a couple of objects and calls a couple of helpers; a
library spreads objects into objects, boxes every mutable capture because its
closures outlive their frames, and builds values field by field out of data.
**The rooting hazards live in the shapes**, so a corpus without the shapes
cannot express them however many files it has.

So there is a second corpus, generated from a real npm dependency rather than
from anything written for the occasion:

```bash
npm ci --ignore-scripts                       # zod is a package.json devDependency
./scripts/gc_root_dominance_dep_corpus.sh ir-corpus-dep
python3 scripts/gc_root_dominance_check.py ir-corpus-dep --moving-only -v
```

`test-files/gc-dep-corpus/main.ts` is the only entry point; the rest of that
directory reaches the compiler by being imported from it, and the generator
**asserts that every `.ts` in the directory produced a module** — which is a
check a size floor could not be, since ~90 modules of `zod` swamp any count a
missing 40-line source would cross.

Nothing is sampled away: all 81 modules and all 62 MB are checked. Emitting
costs ~8s and the two gated arms ~4s, because those are linear in instruction
count. The `--stale-registers` budget is the expensive one (~5 min): its scan is
superlinear, and 62 MB is 62 MB.

## The CI gate

`.github/workflows/gc-root-dominance.yml` runs the checker on every PR over both
corpora. The whole job is a few minutes plus the compiler build; the two gated
checks are about three seconds each over ~2000 and ~12900 functions.

It is built to be able to fail, against all four hazards in CLAUDE.md:

- the checker's exit status is the job's — no `continue-on-error`, no pipe;
- `concurrency` cancels pull-request runs only, so `main` runs are never starved;
- `--min-files` / `--min-binds` / `--min-funcs` refuse a clean verdict over a
  corpus too thin to have exercised anything, and the run prints
  `checked N functions / M modules` so a silently-empty run is visible;
- `--self-test` proves it still fires on planted fixtures, and
  `--seeded-violations 40` splices collection points into the **real** corpus IR
  and requires all 40 to be reported — that is the arm that catches the checker
  silently losing the ability to read perry's output;
- `--audit-alloc-re` and `--audit-poll-capable` refuse a name that matches no
  exported runtime symbol, in the two tables that decide *whether a register has
  a heap-value source* and *whether the window around it is moving*. Both run
  before the build, because both are static and instant and both have shipped
  dead entries: nine in `ALLOC_RE` across two rounds, ten in
  `POLL_CAPABLE_RUNTIME`.

### The allowlist, and why it is not a number

Known-remaining violations live in `scripts/gc_root_dominance_allowlist.json`,
one entry each with a fingerprint, an issue, and a written justification.

A numeric threshold cannot tell a new violation from an old one: fix one bug,
introduce another, and the total is unchanged and the gate stays green. Worse,
under deadline the cheapest way to green a red build is to raise the number by
one, and nothing in the diff says what was conceded.

So the checker enforces three properties:

1. **an entry that matches nothing fails the build.** When you fix the bug,
   delete the entry in the same PR. That is the ratchet, and it is why a fixed
   bug cannot leave a tombstone that quietly widens coverage later.
2. **an entry suppresses at most its `count`.** A second violation of the same
   shape in the same function is new, and fails.
3. **a violation with no entry fails**, regardless of how many entries exist.

Adding an entry is a code-review event. Bumping a `count` to green a build is
the exact thing this file exists to prevent.

### Promoting this gate

**As of this writing the job is NOT in branch protection's required contexts**,
which means it cannot turn a merge red — hazard 2.

Both of the conditions #7198 named are now met:

- the bind-anchored dominance check is green on `main` with an **empty**
  allowlist (the #7211 entries were deleted when that predicate was fixed in
  #7226);
- `--unrooted-allocas --moving-only` reads **0** and is a step in the job
  (#7236). That was the outstanding one: it was 98 before #7235, 2 after, and 0
  once `Type::Symbol` stopped being classified as an immediate.

So the remaining step is for a **repo admin** to add `gc-root-dominance` to
branch protection's required contexts:

```
Settings → Branches → main → Require status checks to pass
  → add:  gc-root-dominance
```

A workflow cannot do this to itself, and neither can a PR. Until it is done,
this is documentation. Per CLAUDE.md's corollary, promote it **after** the job's
first green run on `main` with the `--unrooted-allocas` step included — a gate
that has never been green in its current shape blocks every open PR the day it
becomes required.

**`gc-root-dominance-statepoints` is a SEPARATE context and a separate
decision.** It was added by #7663 as a second job for exactly that reason: it
reads a different corpus, its floors are about safepoints rather than root
stores, and it should be promotable without dragging the shadow arms along.
Promote it on the same terms — after its first green run on `main`, never
before — and note that its `--max-unrooted` budget is a *ratchet under triage*,
not a calibrated zero: the residual is enumerated by shape in #7664. Lower it as
the population is fixed; a promotion that freezes the budget where it is has
bought a number, not an invariant.

## Rules of thumb

- **Root before you call, not after.** If a value must survive a call, its root
  store belongs above the call, unconditionally. Do not predicate it on a
  cleverness about which callees collect — #7211's `ClassExprFresh` tried that and
  only asked about author-supplied initializers, never about the lowering's own
  emitted `js_object_set_field_by_name` calls.
- **Re-read the root after every collection point.** Never cache a load out of a
  root slot across a call. `rooted_handle_get` exists for this.
- **Evaluate-then-allocate is the hazard.** Any lowering with two or more
  operands where one is materialized before another is lowered needs the first
  one rooted.
- **`--trace llvm` and read it.** Three seconds of the checker beats a day of
  bisecting a `not a function` five cycles downstream.
- **When in doubt, root it.** A redundant shadow slot costs a store. A missing
  one costs a day, and it costs it to whoever hits the crash, not to you.


---

<!-- source: docs/src/internals/rfc-rooting-by-construction.md -->

# RFC: rooting by construction

**Status:** adopted, migrating. The design below is the *borrow* formulation and
it is executed as `compile_fail` doctests in `crates/perry-codegen/src/rooting.rs`
— but it is **not what runs**. `FnCtx` has no interior mutability, so what runs
is the combinator formulation in the second half of that file, and the gap
between the two is measured rather than asserted: see
["What the combinator form does NOT catch"](#what-the-combinator-form-does-not-catch)
below. Campaign map and per-module ledger: **#7615**.
**Problem:** [The GC rooting invariant](https://docs.perryts.com/internals/gc-rooting-invariant.html) — #7154, #7184,
#7192, #7206, #7211.

## The case

Five instances of one bug in about a day. Each was found by a different means,
each took hours to localise, and each fix was two lines. The fixes are not the
cost; the *representability* is. Today a lowering author can write the wrong
thing, and nothing between their keyboard and a crash five GC cycles later
objects.

The current defences are all detection, and they run at increasing distance from
the mistake:

| defence | catches | latency |
|---|---|---|
| code review | what a reviewer happens to notice | minutes, unreliable |
| `gc_root_dominance_check.py` | dominance violations in emitted IR | one CI run |
| `PERRY_GC_SCHEDULE_SEED` / from-space protect | the *consequence*, if timing cooperates | a test run, flaky |
| a user's crash | everything, eventually | days |

The static checker is a genuine improvement and should stay. But it is still a
post-hoc pass over generated artefacts: it tells you the IR you produced is
wrong, not that the code you wrote cannot produce it. V8 made the opposite
choice with `Handle` / `HandleScope` / `DisallowGarbageCollection`, and the
reason is instructive — V8 has far more GC-touching call sites than perry, and
manages them with a type discipline rather than with a linter.

**The question this RFC answers: can perry's Rust codegen make an unrooted live
value across a collection point fail to compile?**

Short answer: yes, for four of the five real bugs, with a change that is
mechanical but wide.

## Why the type system is currently absent

Perry's codegen represents an SSA value as a **`String`**:

```rust
let obj = ctx.block().call(I64, "js_object_alloc", &[(I32, &tcid), (I32, &n)]);
// obj: String   -- the register name, e.g. "%r10"
ctx.block().call_void("js_object_set_field_by_name", &[(I64, &obj), ...]);
```

`String` is `Clone`, has no lifetime, and carries no information about what it
holds or whether it is still valid. Every value in the emitter — an `i32` loop
counter, a `double`, a GC pointer, a slot index — has the same type. There is
nothing for a rule to attach to. That is the root cause of the *class*, as
distinct from the root cause of any one bug.

There are ~2500 builder call sites (`~2080` `.call(`, `~416` `.call_void(`)
across 35 files in `crates/perry-codegen/src`.

## Proposed API

Three types and one rule.

```rust
/// A register holding a GC-managed value that is NOT rooted.
///
/// Borrows the emitter immutably. Not Clone, not Copy.
pub struct Raw<'e> {
    reg: String,
    _emitter: PhantomData<&'e Emitter>,
}

/// A shadow-slot root. Outlives collection points; cannot be read directly.
pub struct Rooted {
    slot: SlotIdx,   // only obtainable from ShadowFrame::alloc_slot
}

/// A register holding something the GC does not manage: i32, double, bool,
/// a slot index. Freely clonable, no lifetime, no borrow of the emitter.
#[derive(Clone)]
pub struct Plain(String);
```

The whole design rests on **splitting the emitter's methods by whether they can
collect**:

```rust
impl Emitter {
    /// Cannot collect. Takes &self, so outstanding `Raw` handles stay valid.
    pub fn emit_pure(&self, ...) -> Plain { ... }

    /// CAN collect. Takes &mut self, which ends every outstanding `Raw` borrow.
    pub fn emit_call(&mut self, sig: CollectingCall, args: &[Arg]) -> Raw<'_> { ... }
}

impl Rooted {
    /// Re-read the slot. The returned Raw is valid until the next &mut emit.
    pub fn get<'e>(&self, e: &'e Emitter) -> Raw<'e> { ... }
}

impl<'e> Raw<'e> {
    /// Consume this register into a root. The only way to make a Rooted.
    pub fn root(self, e: &mut Emitter, frame: &mut ShadowFrame) -> Rooted { ... }
}
```

The rule falls out of the borrow checker with no new machinery:

> A `Raw<'e>` holds a shared borrow of the emitter. Emitting anything that can
> collect requires `&mut`. Therefore **a `Raw` cannot be used across a
> collection point** — the compiler rejects it.

```rust
let obj = e.emit_call(OBJECT_ALLOC, &[..]);       // Raw<'_>, borrows e
e.emit_call(SET_FIELD, &[obj.arg(), ..]);         // needs &mut e
let boxed = obj.nanbox(&e);                       // ERROR: obj borrows e,
                                                  //        which is mutably
                                                  //        borrowed above
```

The fix is the correct code, and it is the shortest path out of the error:

```rust
let obj = e.emit_call(OBJECT_ALLOC, &[..]).root(&mut e, &mut frame);
e.emit_call(SET_FIELD, &[obj.get(&e).arg(), ..]);
let boxed = obj.get(&e).nanbox(&e);               // re-read, correct
```

Note that `Rooted::get` returning a fresh `Raw<'e>` also enforces the *second*
half of the contract that `temp_root.rs` documents today in prose: **re-read
after every collection point**, never cache the load. A cached `Raw` simply does
not survive the next `&mut`.

### Implementation note

`emit_pure` taking `&self` while appending to the instruction buffer needs
interior mutability — a `RefCell<Vec<Insn>>` inside `Emitter`. That is the one
piece of real machinery this design requires, and it is contained to the
builder. The `RefCell` is never held across a call into user code, so the
runtime borrow panics are not a practical hazard.

`CollectingCall` vs pure is decided by a table with the same one-sided bias the
checker already uses: **a callee is collecting unless it appears in a
`NON_COLLECTING` list whose every entry names the runtime line that proves it.**
That list already exists, in `gc_root_dominance_check.py`. It should move into
Rust and become the single source of truth both consume.

## Would it have caught the real bugs?

| bug | shape | caught? |
|---|---|---|
| **#7192** root store after a collecting call | `%obj` used after `js_call_function` | **Yes.** `Raw` used after `&mut` emit — borrow error. |
| **#7206a** method receiver across the argument list | receiver loaded, args lowered, receiver used | **Yes.** Lowering an argument is an `&mut` emit; the receiver `Raw` is dead. Author must hold a `Rooted` and `get()` after. |
| **#7206b** computed-read base across the key expression | base materialized, key lowered, base used | **Yes.** Identical mechanism. |
| **#7211** `ClassExprFresh` predicate asks the wrong question | rooted only if *initializers* can collect | **Yes, and most valuably.** There is no predicate to get wrong: `js_object_set_field_by_name` is a `CollectingCall`, so the class object's `Raw` cannot survive the loop. The author is forced to `root()` — the cleverness that caused the bug becomes unexpressible. |
| **#7184** slot index outside the pushed frame | `js_shadow_slot_bind(i32 N)` with `N >= frame size` | **Partly.** Not a liveness bug, so the borrow checker is silent. It *is* fixed by construction if `SlotIdx` is only obtainable from `ShadowFrame::alloc_slot()` and the frame's `enter(n)` count is derived from the number allocated, rather than both being written by hand. That is a worthwhile companion change and is cheap. |

Four of five by construction, the fifth by making the frame own its own slot
numbering. That is a strong enough result to justify the work.

### Re-tested against four bugs found after this RFC was written (2026-08-04)

#7341's from-space quarantine produced 31 real stale-pointer bugs and four of
them were fixed (#7373–#7376). Scoring them against this proposal is the
strongest available calibration, because none of them existed when the table
above was written.

| bug | layer | shape | caught? |
|---|---|---|---|
| **#7375** `await` polls a moved promise | 1 (codegen) | promise unboxed, pump helpers emitted, promise reused | **Yes.** The pump calls are `&mut` emits, so the `Raw` is dead at the back-edge. The author must hold a `Rooted` and `get()` per block — which is exactly the fix that landed. |
| **#7373** `JSON.parse` reads a moved input | 3 (runtime) | slice derived, `gc_check_trigger()`, slice used | **No.** Rust locals in `perry-runtime`; this RFC governs `perry-codegen` lowering only. |
| **#7374** `RegExp` flags stored stale | 3 (runtime) | string allocated, `gc_malloc`, pre-collection pointer stored | **No.** Same reason. |
| **#7376** `Symbol` description stored stale | 3 (runtime) | identical to #7374 | **No.** Same reason. |

**One of four.** That is not an argument against the RFC — the one it catches it
catches completely, and #7375 had survived a code comment explicitly reasoning
about the surrounding hazard ("unbox the promise in each block that uses it",
which solves LLVM dominance and not GC movement). It is an argument about
**where the remaining risk lives**: three of the four were layer 3, which this
mechanism cannot reach by construction.

**The sharper finding is that all four were the same defect shape.** Every one
had rooting already — the pattern's root, the receiver's root, the per-block
unbox, the registry for registered symbols. What was missing in each case was
**ordering the root relative to the collection point**. That is precisely the
property this RFC enforces: a `Raw` that dies at the next `&mut` emit makes
"used after a collection point" unrepresentable rather than reviewable.

So the design generalises, and the open question this evidence raises is not
whether to adopt it for codegen, but whether layer 3 needs the same discipline
in `perry-runtime` — where `RuntimeHandleScope` exists (675 uses across 169
files) but is **optional**, and where three of these four bugs lived. A handle
type that made the raw pointer unusable across an allocating call would have
caught all three by the same mechanism.

**Caveat on the sample.** These four are the clusters that were *tractable* from
a backtrace. The eight catches left open in #7341 fault on an argument that is
already stale on entry, so they are caller-side and this RFC would not catch
them either — the value crosses a function boundary, and `Raw<'e>` does not
survive one. Counting them would make the ratio worse, not better.

## Migration cost

The honest number is large but the distribution is favourable.

- **~2500 builder call sites**, 35 files. Most are *not* GC-managed: loop
  counters, `double` arithmetic, NaN-box bit twiddling, slot indices. Those
  become `Plain`, which is `Clone` and imposes nothing — it holds a register
  name, so it cannot be `Copy`, but it borrows nothing and outlives every `&mut`
  emit. A rough read of the call sites suggests **300–500 genuinely handle GC
  pointers** — the ones in `expr/`, `lower_call/`, and the object/array/closure
  literal paths.
- **8 `rooted_handle_begin` sites** exist today, so the *explicit* rooting
  surface is currently tiny. That is the point: the sites that need rooting and
  do not have it are the bugs.
- The work is mechanical and the compiler drives it: change a signature, follow
  the errors. It does not require understanding each lowering, only the local
  data flow the compiler points at.

**Incremental path, which matters more than the total:**

1. Land the types with an explicit, greppable escape hatch:
   `Raw::from_untrusted_register(String)` / `Raw::into_untrusted_register()`.
   Every un-migrated caller uses it. Zero behaviour change, zero risk.
2. Migrate one family at a time, highest-risk first: `expr/temp_root.rs`'s
   clients, then `lower_call/*`, then the literal paths. Each is its own PR.
3. `#[deny]` the escape hatch per-module as each module finishes, so migrated
   code cannot regress. **Done, as a test rather than an attribute**: Rust has
   no `#[deny]` for "do not call this `pub(crate)` function from this module",
   so `rooting::migration_ledger` `include_str!`s each finished module and
   fails the build if it names `expr::temp_root`.
4. Keep `gc_root_dominance_check.py` in CI permanently as the backstop for
   whatever still goes through the escape hatch — and as the check on the
   `NON_COLLECTING` table itself, which the type system trusts and cannot
   verify.

Steps 1 and 2-for-one-family are a plausible next PR. There is no point at which
a half-migrated tree is worse than today's.

## Performance

- **Emitted code: identical.** These are compile-time wrappers over register
  names; the IR is unchanged.
- **Compiler runtime: neutral to slightly negative.** `Raw` is a newtype over
  `String`, so no extra allocation. The `RefCell` adds a borrow flag check per
  `emit_pure`, which is noise next to the `format!` calls already in the
  builder.
- **Compiler build time: slightly up**, from monomorphisation over the added
  lifetime. `perry-codegen` is already one of the slow crates; this is worth
  measuring before the wide migration, not assuming.
- **Risk of *more* rooting than today:** yes, and that is a real cost worth
  naming. When the borrow checker forces a `root()`, the author will insert one
  rather than reason about whether it was needed, and some will be redundant.
  A redundant shadow slot is one store and one bind. Given that the alternative
  is the bug this document exists about, that is the right trade — but it should
  be measured on the benchmark suite after the first family migrates, not waved
  through.

## What the combinator form does NOT catch

**This section supersedes the next one for anything actually shipping**, because
the `Raw<'e>`/`Rooted` design above cannot be built on `FnCtx` — `ctx.block()`
needs `&mut`, so a handle that carries a shared reborrow of the emitter cannot
exist (#7459 found the same `E0499` in this document's own constructor; #7461
settled the shape that does work). What runs is the combinator form: never hand
out an unrooted register at all.

Measured on the first fully migrated module (`expr/url_main.rs`, #7615's slice 0)
by reintroducing a historic bug shape four ways and recording each outcome:

| reintroduced shape | compiles? | caught by |
|---|---|---|
| #7192 in the **borrow** form (`RootingEmitter`) | **no — `E0499`** | rustc, via `compile_fail` doctest |
| hold the `call_with_roots` result across a later lowering | yes | nothing |
| the **verbatim pre-#7453 code**, via a bare `ctx.block().call` | yes | **nothing** — including all three `gc_root_dominance_check.py` modes (#7616) |
| reach back into `expr::temp_root` | yes | the ledger test |
| hold the operand guard so it can be released on one arm (#7462) | yes | the ledger test |

So the honest claim is narrower than "the mistake fails to compile":

- The API **produces no unrooted register**, so the correct form is the only one
  it can express and the wrong one requires leaving it.
- `RootedSlot` has **no `read`**. Fusing the re-read into the consuming call is
  what makes "load early, use late" — the second half of #7114/#7375 —
  unwritable rather than merely discouraged.
- `with_operands_rooted` **owns the release on every path including `?`**, so
  #7462's release-on-one-arm is not a program.
- The escape hatch is **denied per module** by a `cargo test` ledger, which is
  the checkable form of this document's step 3.

Getting an actual compile error for the ordering mistake still requires step 1's
`RefCell`'d emitter. That is a real, separable piece of work and nothing below
should be read as claiming it is done.

## What it cannot catch

Stating these plainly, because a safety mechanism believed to be total is worse
than one known to be partial:

- **A miscategorised callee.** If a genuinely-allocating helper is listed in
  `NON_COLLECTING`, the type system will cheerfully allow a `Raw` across it. The
  table is trusted input. This is why the checker must stay: it derives its
  verdict from the emitted IR, so the two failure modes are not correlated.
- **The escape hatch**, for as long as any caller uses it.
- **Confusion of two emitters, or of two shadow frames.** `PhantomData<&'e
  Emitter>` records a *lifetime*, not an *instance*, and `&'e T` makes `Raw<'e>`
  **covariant** in `'e` — a longer-lived `Raw` shortens to any compatible `'e`.
  Nothing in the type names *which* emitter it came from, so a `Raw` minted by
  one emitter type-checks against a different `&mut Emitter` whose borrow
  region fits. The same hole exists for `Rooted`, which carries a bare
  `SlotIdx` and so does not name the `ShadowFrame` that allocated it; a
  `Rooted` outliving its frame's pop, or read against a sibling frame, is
  accepted. Closing this needs invariant branding (a generic `Id` parameter
  over an invariant lifetime, `GhostToken`-style) rather than `PhantomData`
  alone, and `Rooted` needs to borrow its frame. That is a real cost to price
  into step 1 — as written, the design catches *ordering* mistakes, not
  *provenance* ones.
- **Runtime-side rooting.** `RuntimeHandleScope` in `perry-runtime` is a
  separate discipline over hand-written Rust; nothing here touches it.
- **Anything interprocedural.** A lowering that returns a `Raw` to a caller that
  then collects is caught only if the lifetime actually propagates — which it
  does for direct returns, but not across a `String` boundary or a struct field
  that erases the lifetime.
- **Correctness of the shadow frame itself** — that `enter(n)` matches the slots
  used, that the frame is popped on every path including unwinds. The
  `SlotIdx`-from-`alloc_slot` change addresses the first; the rest is separate.
- **Values rooted in a side table rather than a slot.** As #7211 shows,
  `CLASS_OBJECT_VALUES` roots *its own copy* and leaves the register stale. The
  type system would treat such a value as unrooted, which is the correct and
  conservative answer — but it means some code that is arguably fine today will
  be forced to add a slot.

## Where this sits in the one GC correctness plan

**This RFC is one of three layers. It is not the whole answer, and on its own it
cannot be.** Written 2026-08-03, after 40 GC/rooting commits landed in three days
and the blocking bug (#7280) still measured red 0/30. Every one of those fixes
was correct; none of them ended the class. That is the signature of fixing
instances rather than the shape.

**The shape, stated once:**

> A GC-managed pointer exists somewhere the collector does not know about,
> across a point where the collector can run.

"Somewhere it does not know about" has had **three different homes**, and each
needs a different mechanism. Conflating them is why the effort felt endless:

| # | Home | Example bugs | Mechanism | Status |
|---|---|---|---|---|
| 1 | **`perry-codegen`'s lowering code** (Rust that emits IR) | #7192, #7206, #7211 | **This RFC** — `Raw`/`Rooted` borrow discipline | proposed |
| 2 | **The emitted machine code's liveness** (registers at a safepoint) | #7280, #7271, #7252, #7243 | **Statepoints / stack maps** (#7108, #7174) | experiment done, blocked on layer 0 |
| 3 | **`perry-runtime`'s hand-written Rust** (`*mut ObjectHeader` locals, caches) | #7249, #7239, #7226, #7231 | `RuntimeHandleScope`, made non-optional | not started |

**Layer 0 — the enabler: in-process LLVM (#7241).** #7108 measured statepoints as
viable but concluded *"the text-IR-plus-stock-clang architecture is what rules the
cheapest design out"*: Perry emits textual `.ll` and shells out to a user-supplied
`clang`, so it controls neither the pass pipeline nor the stackmap emission.
#7241's Phase 0 removes exactly that constraint — it builds the pipeline via the
LLVM C API and independently verified that **`gc "statepoint-example"` constructs,
verifies and emits**. It also pins LLVM 22 (killing the Apple-clang-21-vs-22 parse
skew) and is opt-in behind a cargo feature, so the default build is byte-for-byte
unchanged.

**⇒ The dependency order is 0 → 2, with 1 and 3 independent of both.**

### What statepoints do to this RFC

Adopting layer 2 **deletes several of this document's "what it cannot catch"
entries rather than mitigating them**, because the shadow frame stops existing:

- *"Correctness of the shadow frame itself — that `enter(n)` matches the slots
  used, that the frame is popped on every path including unwinds"* — moot.
- *"Values rooted in a side table rather than a slot"* — moot; LLVM records the
  actual live location.
- The `SlotIdx`-from-`alloc_slot` companion change (#7184's shape) — moot.

What survives untouched is the part this RFC is uniquely good at: **catching the
mistake at the moment it is made, in the author's editor, rather than five GC
cycles later in someone else's program.** #7211 remains the decisive argument —
an author actively thinking about rooting, who wrote a four-clause predicate,
still got it wrong.

So layers 1 and 2 are **complements, not alternatives**: layer 2 makes the
emitted code correct by construction; layer 1 makes the *compiler's own code*
hard to write incorrectly. Neither touches layer 3.

### The costs, stated so they are decided rather than discovered

- **Stack maps** (#7108, measured): **438,848 B** of hot `__text` saved against
  **4.5–16.6 MB** of cold `.llvm_stackmaps` — 10–38× more metadata than text,
  exceeding the app's entire generated code section. It is *cold*, so the RSS
  cost is far below the file-size cost. The size model is
  `24 B × (safepoint, root) pairs` over 62,731 candidate safepoints, so
  **safepoint density is a direct lever** — but only once layer 0 gives us
  control of emission. **That lever is expected, not measured. It is the first
  thing layer 2 must prove.**
- **In-process LLVM** (#7241): ~171 MB added to a static-linked build when the
  feature is enabled; LLVM 22 dev libs for contributors who enable it; zero cost
  by default.
- **Open weakness**: #7108's prototype has a known gap in the deep-stack walker.

### Interaction with the RSS goal

The evacuating minor is off by default (#7161) because #7154's use-after-free is
still live (#7280). The measured **-65% RSS** (320 MB → 111 MB) turns out to come
from the *16 MB nursery cap*, which is gated on the same flag — **not** from the
copying itself. So there is a route to the memory win that does not require the
risky path. It is deliberately sequenced last: measuring it against a collector
whose "minors" fall back to a conservative full scan (#7255) would bake that cost
in and make it look inherent. See #7056.

## Recommendation

Adopt, incrementally, starting with step 1 and one family. The decisive argument
is #7211: an author who was *actively thinking about GC rooting*, who wrote a
four-clause predicate to decide whether to root, still got it wrong — because
the predicate asked about the user's expressions and not about the lowering's
own emitted calls. No amount of care or review reliably catches that. A type
that makes the value unusable after the call does, and it does so at the moment
the mistake is made rather than five GC cycles later in someone else's program.

**Prototyped and adopted since.** The design is in
`crates/perry-codegen/src/rooting.rs`, its `compile_fail` doctests are executed
by `cargo test`, and `expr/url_main.rs` is migrated end to end as the template
every subsequent slice copies. Steps 3 and 4 of the incremental path above are
in place: the escape hatch is denied per module by the ledger test, and
`gc_root_dominance_check.py` stays as the backstop — though #7616 records that
it is blind to precisely the shape this RFC exists for, which is an argument for
finishing the migration rather than for trusting the checker.

Step 1 is *not* done and should not be assumed: the greppable escape-hatch
types were never needed, because the combinator form migrates one call site at a
time without them. The `RefCell`'d emitter that would make the ordering mistake
a compile error remains unbuilt. **#7615 is the campaign map** — 88 modules,
694 raw-pointer sites, 262 hazard sites, ten slices.


---

<!-- source: docs/src/internals/node-api-host.md -->

# Node-API host design

Status: implemented contract for [#8523](https://github.com/PerryTS/perry/issues/8523).
The implementation follows the completed `bun:ffi` callback work in #6562.
This document is the representation, lifetime, ABI, loader, and shipping
contract kept alongside the implementation and its gates.

## Implementation status

The optional `perry-runtime/node-api-host` feature contains the version-8 host:
opaque handle scopes and references, GC root rewriting and weak clearing,
object metadata/finalization, values and descriptors, native callbacks,
buffers/views, promises, async work, threadsafe functions, cleanup hooks, and
the authenticated module loader. The compiler enables it only after the graph
reaches a `.node` file owned by an exact host `perry.nativeAddons` entry.

Approved addons are screened for direct libuv/V8/NAN/Node C++ imports, copied
to the relocatable `<executable>.perry-native` sidecar, hashed into its manifest
and build cache, and loaded only after every payload hash is verified.
`require()` and `process.dlopen()` share that authorization and cache. Linker
exports come from the checked-in version-8 symbol inventory and are absent when
the addon graph is empty, preserving the zero-byte default path.

The integration gate compiles and executes a direct C addon, verifies its
imports resolve from the host executable, authenticates and then deliberately
corrupts its sidecar, and enforces both size bounds. Pinned published-package
gates compare `@napi-rs/snappy` 1.0.2 sync/async results with Node and compare
the real `@parcel/watcher` 2.5.1 `watcher.node` snapshot stream with Perry's
facade. CI treats missing npm tools or network for those differentials as a
failure; local offline runs explain their skip unless `PERRY_REQUIRE_NPM_E2E=1`
is set.

The host lets a Perry executable load a prebuilt Node-API (`.node`) addon
without embedding Node, V8, JavaScriptCore, or another JavaScript engine. It is
an opt-in compatibility route for the long tail of addons. A package with a
Perry facade remains on that facade: the host never supersedes a
`well_known_bindings.toml` entry.

## Decisions at a glance

| Area | Decision |
|---|---|
| Advertised API | Node-API version 8 |
| `napi_env` | One environment per Perry agent/realm, owned by its JavaScript thread |
| `napi_value` | Opaque host token containing an index and generation for an environment-local handle slot; never a Perry heap address |
| Handle roots | Open handle scopes are mutable GC roots and are rewritten after evacuation |
| `napi_ref` | Strong references root their value; zero-count references use Perry's existing weak-target machinery |
| Finalizers | Address-keyed object metadata is rekeyed on moves and death-pruned after marking; callbacks are queued and run on the owning main thread outside GC |
| Exceptions | Perry throws are trapped inside the host, stored in the environment, and returned as `napi_pending_exception`; no unwind crosses addon code |
| Off-thread API | Only TSFN call/acquire/release operations are legal; every other operation verifies the owning thread |
| Module entry | Prefer `napi_register_module_v1`; support constructor-time `napi_module_register` for legacy addons |
| Unsupported ABI | NAN, V8, direct `uv_*`, and mobile targets are rejected before initialization |
| Shipping | Relocatable sidecar directory beside the executable; no extract-at-first-run path |
| Policy | Exact package-name allowlist in `package.json` under `perry.nativeAddons` |
| Size gate | No addon in the graph means no host archive references, no exported Node-API symbols, and a zero-byte executable delta |

Version 8 is the baseline selected by Node's own v22 headers when an addon does
not request a newer version. It includes BigInt, dates, detach, type tags,
async cleanup, and the complete TSFN surface needed by current napi-rs and
node-addon-api packages, while avoiding a false claim for the version 9 and 10
extras. A module whose `node_api_module_get_api_version_v1()` returns more than
8 is rejected before its initializer runs, with the requested and supported
versions in the diagnostic.

## Environment and handle representation

`napi_env` points to a host-owned `Env` that is not a GC object. It contains:

- a unique environment id and the owning `ThreadId`;
- the open handle-scope stack and handle-slot slab;
- references, native callback records, deferred promises, async work, and
  threadsafe functions owned by the environment;
- a rooted pending-exception slot and stable `napi_extended_error_info`
  storage;
- instance data, environment cleanup hooks, the current module filename, and
  a `can_call_into_js` state;
- the environment lifecycle (`loading`, `running`, `closing`, or `closed`).

The environment is created for the Perry agent before the first addon loads
and destroyed after the event pump has stopped accepting work. Different
Perry agents never share an environment or a heap value.

### `napi_value`

A `napi_value` is an opaque pointer to a non-moving host token. The token holds
`(env_id, slot_index, generation)`. The indexed `HandleSlot` holds the Perry
NaN-box bits, its owning scope, its generation, and a live bit. Thus addon code
never observes a raw `ObjectHeader`, `StringHeader`, or other moving heap
address.

Tokens are stable for the lifetime of the environment and are not reused.
Slots may be reused only after their generation advances. Every entry point
validates all three token fields before reading a value. This makes an illegal
handle use after scope close return `napi_invalid_arg`, rather than aliasing a
new value or dereferencing reclaimed memory.

Each `ScopeFrame` records the slot indices created in that scope and whether an
escapable scope has already escaped a value. Closing a scope invalidates its
slots. `napi_escape_handle` copies the selected value into a fresh slot in the
parent scope and may succeed once. Module initialization and every native
callback get an implicit scope, so an addon is not required to open a scope
before creating ordinary return values.

All live scope slots are visited by `scan_node_api_roots_mut`, registered in
`gc_init()` with a descriptive name. The scanner uses mutable NaN-box visits,
so a copied minor or old-generation evacuation rewrites each slot in place.
The pending exception, strong references, callbacks, deferred resolutions, and
queued main-thread completions are visited by the same scanner. The new tables
must be classified in `scripts/gc_runtime_root_holders.json` in the commit that
introduces them.

The following invariant applies at every host call site:

> A Perry heap value is written into a live handle slot before any operation
> that can allocate or call JavaScript, and is reread from that slot after the
> operation.

In particular, the host never caches `HandleSlot.value_bits` in a Rust local
across property access, conversion, callback invocation, or allocation.

### References, including weak references

`napi_ref` is a stable host record, also tagged with its environment id and a
generation. A positive reference count stores its value in a strong slot
visited by `scan_node_api_roots_mut`.

Weak references are in version 1; deferring them would exclude common
node-addon-api and napi-rs patterns. A zero-count reference roots a hidden
Perry `WeakRef` holder, not the target. Perry already skips and rewrites that
holder's weak target slot and clears it during every collection. Consequently:

1. `napi_create_reference(..., 0, ...)` creates the hidden weak holder while
   the input handle is still rooted.
2. `napi_reference_ref` reads the weak target. If it has been collected it
   returns `napi_ok` with count zero without resurrecting it; otherwise the
   target moves into the strong slot before the weak holder is released.
3. `napi_reference_unref` changing `1 -> 0` creates a weak holder before
   clearing the strong slot.
4. `napi_get_reference_value` returns a null C pointer when a weak target has
   been collected, matching Node-API; that is distinct from a handle for the
   JavaScript value `null`.

Values that cannot be held weakly (for example, number primitives) remain
strongly retained even at refcount zero, matching Node's reference behavior.
Deleting a reference invalidates the record and releases either root.
Refcounts use checked arithmetic and return `napi_generic_failure` on overflow,
underflow, or an already-deleted record.

## Native-owned data and finalization

Wrap data, externals, type tags, and finalizer records live in a per-agent
`NODE_API_OBJECT_META` table keyed by the owning Perry user address. A table
entry contains native pointers and identifiers only; it never keeps its owner
alive.

The table has both halves required by a moving collector:

- `scan_node_api_object_meta_keys_mut` visits keys as metadata. It follows
  forwarding records and rekeys entries without marking the owner.
- `prune_dead_node_api_object_meta_owners` is registered in
  `gc::dead_owner::DEAD_KEY_PRUNES`. Both post-trace and copied-minor fan-out
  remove entries whose owners are proven dead.

The rekey site and death prune receive matching entries in
`scripts/gc_rekeyed_key_tables.json`. Merely registering a strong root scanner
would be incorrect here because it would make every wrapped object immortal.

Death pruning moves finalizer records into a native pending queue. It does not
call addon code while the collector is marking, rewriting, sweeping, or
holding an arena borrow. The next main-thread safepoint drains the queue inside
an implicit handle scope with `can_call_into_js = true`. That is the stable
version-8 `napi_finalize` contract and is why finalizer invocation depends on
the completed native-to-JavaScript callback boundary. The experimental
`node_api_basic_env` restriction and `node_api_post_finalizer` pairing are
deferred with the rest of that experimental surface.

`napi_wrap` installs at most one wrap record per object. `napi_unwrap` reads it.
`napi_remove_wrap` atomically removes it, returns the native pointer, and
prevents its finalizer from running. `napi_add_finalizer` may add multiple
independent records. When it returns a `napi_ref`, that record also identifies
the finalizer. Deleting that reference before collection removes the host's
tracking record, so the callback may never run; deleting it from inside the
already-queued callback only releases the reference.

External buffers and array buffers use the same finalizer queue. Environment
shutdown first prevents new work, drains TSFNs and async completions, runs
cleanup hooks, then enqueues and drains all remaining environment-owned
finalizers exactly once. A finalizer record has an atomic state
`registered -> queued -> running -> complete`, so explicit removal, collection,
and shutdown cannot double-call it.

No finalizer ordering is promised between different objects. Records attached
to one object are queued in registration order. Environment cleanup hooks use
Node's LIFO order; async cleanup hooks hold shutdown open until their removal
callback is invoked.

## Status codes and pending exceptions

Every exported entry point is a plain `extern "C"` boundary and uses one common
prologue/epilogue:

1. validate the environment, lifecycle, owner thread, input pointers, and
   handle generations without panicking;
2. reject JavaScript-capable work when `can_call_into_js` is false;
3. run every operation that may throw through `exception::js_call_catching`;
4. on a Perry throw, root the thrown value in `Env.pending_exception` and
   return `napi_pending_exception`;
5. write output parameters only on the statuses for which Node-API defines an
   output;
6. update stable per-environment extended-error storage before returning.

`napi_throw` and its error helpers only set the pending slot. They do not call
`js_throw` while the addon is on the stack. When a native callback returns to
the host trampoline, the trampoline ignores its return value if an exception
is pending, closes the callback scope, and then raises the rooted exception on
the Perry side of the C boundary. This guarantees that neither Perry's system
unwinder nor its `setjmp` transport crosses third-party frames.

`napi_is_exception_pending` is a pure query.
`napi_get_and_clear_last_exception` creates a handle for the rooted exception
before clearing the environment slot. With no pending exception it writes a
null C pointer. While an exception is pending, ordinary APIs return
`napi_pending_exception`; the exception query/clear and error-information
operations remain available.

The error-info message is owned by the environment and remains valid until the
next Node-API call on that environment. `engine_error_code` is zero and
`engine_reserved` is null. `napi_fatal_error` writes the length-bounded location
and message directly to stderr and aborts. `napi_fatal_exception` transfers the
error to Perry's uncaught-exception path on the main thread.

## Functions and native classes

`napi_create_function` allocates a Perry closure whose captured host record
contains the native callback pointer, addon data pointer, name, and environment
id. A shared rest-argument trampoline constructs a stack-local
`napi_callback_info` containing rooted argument handles, `this`, callback data,
and the current `new_target`. It calls the addon callback inside an implicit
handle scope and converts the returned token back to a Perry value before
closing that scope.

`napi_call_function` uses Perry's general callable dispatch, not a closure-only
shortcut, so proxies, bound functions, and compiled JavaScript functions keep
their normal semantics. `napi_new_instance` uses the general construction path
and arms Perry's new-target state for the duration of the call.

`napi_define_class` allocates a synthetic class id and registers its constructor
and prototype in the existing class-id chain. Instance methods/accessors are
defined on the prototype and `napi_static` descriptors on the constructor.
The constructor's callback record owns the class id, and the default instance
is allocated and stamped before the native constructor runs. If the constructor
returns an object, normal JavaScript constructor replacement rules apply.

The registration also populates the runtime's dynamic-parent/prototype tables,
so a compiled class may extend a native-defined constructor and a native class
may extend another native class. `napi_instanceof` delegates to Perry's normal
`instanceof` operation, including `Symbol.hasInstance`, rather than comparing
only the immediate class id. The Stage 1 gate must include native base-class
subclassing because this crosses the runtime's historically weak dynamic-extends
path.

Property descriptors preserve `napi_writable`, `napi_enumerable`, and
`napi_configurable`. Getter and setter records use the same native callback
trampoline. A descriptor specifying incompatible `value`/`method`/accessor
fields is rejected before any property is changed.

## Buffers, views, and external memory

Perry `Buffer`, typed-array, array-buffer, and data-view byte storage is born
tenured and does not move. A returned native data pointer therefore remains
stable for the lifetime required by Node-API, while the wrapper itself remains
an ordinary rooted handle.

The host reuses the existing buffer/view registries for type identity, backing
array-buffer identity, offsets, and detach propagation. Creating an external
array buffer or buffer creates a zero-copy wrapper over the supplied bytes and
attaches its callback to `NODE_API_OBJECT_META`. A detached array buffer reports
zero length and null data, and all existing views observe the detach. Buffer
APIs reject detached storage where Node does.

`napi_adjust_external_memory` updates a signed per-environment counter and the
collector's external-memory pressure accounting. It neither allocates an
equivalent Perry buffer nor silently ignores the request. Underflow clamps at
zero for pressure accounting while the API's returned cumulative value remains
the checked signed total.

## Async work and threadsafe functions

`napi_create_async_work` creates an explicit state machine:

```text
created -> queued -> running -> completing -> complete -> deleted
                 \-> cancelled -> completing
```

Queueing uses `perry_ffi::spawn_blocking`. The execute callback runs on a worker
without access to Perry heap state. Completion is posted through the existing
main-thread event pump and runs inside an implicit scope. Cancellation succeeds
only before execution claims the work; completion still runs with
`napi_cancelled`. Deletion before completion marks the public handle deleted
but retains the internal record until neither worker nor completion owns it.

A TSFN owns a strong function reference (when a function is supplied), its
context, bounded or unbounded queue, thread count, ref/unref state, and finalizer.
Foreign threads may only call, acquire, or release it. They never touch a
`napi_value` or the Perry collector. `napi_call_threadsafe_function` copies the
opaque data pointer into the queue and notifies the main thread. A blocking call
waits for capacity; a blocking call from the owner thread with a full bounded
queue returns `napi_would_deadlock`.

The main-thread drain invokes `call_js_cb`, which may then use the environment
and supplied JavaScript callback. Abort release drains remaining items by
calling `call_js_cb` with null environment/function as required by Node-API.
The TSFN finalizer runs after the queue is empty and the thread count reaches
zero. A ref'd TSFN contributes to Perry's event-loop keepalive count; unref
removes that contribution without destroying the function.

`napi_async_init`, `napi_make_callback`, and `napi_async_destroy` bridge to the
existing `async_hooks` resource/context machinery. Callback scopes are a
validated nesting counter around that context; mismatch returns
`napi_callback_scope_mismatch`.

## Threading rules

The following calls are legal from a foreign thread:

- `napi_call_threadsafe_function`
- `napi_acquire_threadsafe_function`
- `napi_release_threadsafe_function`
- `napi_fatal_error` (it does not return)

All other entry points require the environment's owner thread, including
`napi_get_threadsafe_function_context`, TSFN ref/unref, reference operations,
and cleanup-hook registration. Entry points without an explicit `napi_env`
recover the owner from their validated opaque record. Misuse returns
`napi_generic_failure`, records a diagnostic when an environment is available,
and never reads or writes Perry heap state.

The execute half of async work is a foreign thread under this rule. The
complete half, module initialization, cleanup hooks, finalizers, native
callbacks, and TSFN `call_js_cb` all run on the owner thread.

## Module loading

The compile graph records every approved `.node` file as a native-addon module
instead of trying to read it as UTF-8. At runtime, one loader operation does the
following:

1. canonicalize the manifest-selected sidecar path beneath the executable's
   sidecar root;
2. return the cached exports object if that canonical file is already loaded;
3. set an environment-local `currently_loading` guard and load with
   `RTLD_NOW | RTLD_LOCAL` on Unix or safe `LoadLibraryExW` search flags on
   Windows;
4. reject an unresolved `uv_*`, V8, NAN, or non-Node-API Node symbol with the
   exact symbol and addon path in the error;
5. if present, call `node_api_module_get_api_version_v1` and reject versions
   above 8;
6. prefer `napi_register_module_v1(env, exports)`; otherwise use the descriptor
   captured by `napi_module_register` while the library constructor ran;
7. use the initializer's returned object, or the supplied exports object when
   the initializer returns null without an exception;
8. cache the rooted exports and library handle together.

`napi_module_register` outside an active load is an error. Multiple descriptors
from one library are rejected. An initializer exception closes the library,
discards the half-built cache entry, and propagates the rooted exception only
after control has returned from addon code.

Static `require()` of an approved addon lowers directly to this loader.
`process.dlopen(module, filename[, flags])` calls the same operation and writes
the resulting exports onto the supplied CommonJS module object. Unsupported
flags are rejected rather than ignored. Runtime-computed paths may load only a
file present in the compile-time addon manifest; the allowlist is not a general
`dlopen` capability.

The environment stores the active canonical module filename during
initialization. It is the future source for the version 9
`node_api_get_module_file_name` API, even though the version 8 host does not
export that symbol.

## Linking and exported symbols

The Node-API implementation lives behind a `node-api-host` runtime feature.
The compiler enables it only when the collected graph contains an approved
addon. A checked-in symbol inventory is the single source for Rust export
retention, platform linker flags, unresolved-symbol validation, and the CI
assertion.

- macOS removes `-Wl,-no_exported_symbols` only for an addon build and supplies
  an exported-symbols list containing the approved `_napi_*` names.
- Linux uses one `--export-dynamic-symbol=<name>` entry per approved symbol,
  not broad `--export-dynamic`.
- Windows supplies `/EXPORT:<name>` entries. The addon's standard delay-load
  hook resolves its `node.exe` imports against the current executable.

The loader itself uses the existing `bun_ffi` platform abstraction, extended
to report unresolved imports. Host symbols are retained and exported only when
the compile manifest is non-empty. A hello-world build therefore has exactly
the previous link command and runtime feature set.

## Opt-in and route precedence

The only opt-in is an exact package-name list in the project manifest:

```json
{
  "perry": {
    "nativeAddons": ["@swc/core", "oxc-parser"]
  }
}
```

Transitive packages cannot opt themselves in. The nearest project manifest is
authoritative, duplicate names are normalized, and subpaths inherit their
owning package's decision. Wildcards are not accepted.

Resolution order is:

1. a `well_known_bindings.toml` facade;
2. a package's explicit `perry.nativeLibrary`;
3. a project `perry.nativeAddons` entry;
4. ordinary JS/TS compilation;
5. the existing actionable unsupported-addon error.

Thus listing `better-sqlite3`, `sharp`, or `@parcel/watcher` does not bypass its
Perry facade. Node-API is faithful native execution, so an approved addon is
compatible with `PERRY_REQUIRE_FAITHFUL_BINDINGS=1`; partial hand-written
facade policy remains unchanged. NAN/V8 or direct-libuv imports remain hard
errors even when the package name is allowlisted.

Desktop/server targets are macOS, Windows, Linux, and the BSDs supported by
Perry's dynamic loader. iOS, tvOS, watchOS, visionOS, Android, HarmonyOS, and
WebAssembly reject `perry.nativeAddons` during target validation.

## Sidecar distribution

Addon builds emit a relocatable directory beside the executable:

```text
app
app.perry-native/
  manifest.json
  <package-name-hash>/
    watcher.node
    ...package-local shared libraries...
```

The compiler copies the selected platform package payload, preserving its
relative layout so `$ORIGIN`/`@loader_path` dependencies keep working. The
manifest records package name and version, target tuple, relative entry path,
SHA-256 for every copied file, and the Node-API policy version. Runtime loading
never consults the build machine's `node_modules` tree.

This sidecar model has no first-run write, so read-only install directories are
supported. Moving the executable requires moving its `.perry-native` sibling.
Missing or hash-mismatched files fail before `dlopen` with a packaging error.
The loader also requires the canonical entry path passed to the dynamic loader
to equal the canonical path of a payload file whose size and hash were just
verified. An existing file that is selected only by `entry`, but omitted from
`files`, is rejected.

The platform dynamic-loader APIs reopen that canonical pathname; they do not
provide one portable way to load from the file handle used for verification.
There is consequently an accepted time-of-check/time-of-use window between the
last payload hash and `dlopen`/`LoadLibraryExW`. Exploiting it requires write
access to the installed sidecar directory, which is outside this loader's
integrity boundary. Deployments must protect the executable and its sidecar
with the same ownership and write permissions (and platform signing where
applicable). The manifest checks detect packaging damage and tampering before
the first load; they are not a defense against a concurrent local writer.

For a macOS app bundle the directory is placed under `Contents/Frameworks`.
Every Mach-O sidecar and nested dylib is signed before the outer executable or
bundle is signed; notarization submits the complete bundle. For a loose command
line executable, release tooling signs each sidecar before the executable and
ships them in one archive. Perry does not strip quarantine attributes from
untrusted downloaded binaries at runtime.

Cross-compilation selects the target's platform package, never the host's.
Perry does not perform an unpinned registry download during compilation. The
target package must be materialized by the package manager/lockfile install;
when it is absent the diagnostic names the exact target tuple and candidate
optional package. This keeps registry credentials and dependency resolution in
the package manager while preventing a host `.node` file from entering a target
artifact.

## Cache identity

The compile-time addon manifest is sorted deterministically and contributes
the following to the build and link cache identities:

- policy schema version and advertised Node-API version;
- target tuple and normalized allowlist;
- selected package name/version and relative entry path;
- SHA-256 and size of every sidecar payload file;
- ordered exported-symbol inventory;
- shipping model (`sidecar-v1`).

The entry module's object-cache key also includes the canonical logical addon
ids it can load, because those ids appear in generated loader calls. Absolute
build paths do not enter any key or generated object. A sidecar hash change
must miss the top-level build cache even when all TypeScript and object files
are unchanged.

## Node-API surface inventory

The inventory is pinned to Node v26.5.1's
[`js_native_api.h`](https://github.com/nodejs/node/blob/v26.5.1/src/js_native_api.h)
and [`node_api.h`](https://github.com/nodejs/node/blob/v26.5.1/src/node_api.h).
`v1` means required before the host is usable. `later` means the declaration is
newer than the advertised version or experimental and is not exported.
`never` means Perry exports the version-8 symbol when necessary for binary
resolution, but it deterministically reports the stated unsupported facility.

### `js_native_api.h`: core through version 4

| Status | Entry points | Notes |
|---|---|---|
| v1 | `napi_get_last_error_info` | Stable per-environment storage |
| v1 | `napi_get_undefined`, `napi_get_null`, `napi_get_global`, `napi_get_boolean` | Singleton values receive ordinary scoped handles |
| v1 | `napi_create_object`, `napi_create_array`, `napi_create_array_with_length` | Perry object/array allocators |
| v1 | `napi_create_double`, `napi_create_int32`, `napi_create_uint32`, `napi_create_int64` | Perry NaN-box conversions |
| v1 | `napi_create_string_latin1`, `napi_create_string_utf8`, `napi_create_string_utf16` | Length-bounded; `NAPI_AUTO_LENGTH` supported |
| v1 | `napi_create_symbol`, `napi_create_function` | Native callbacks use host records |
| v1 | `napi_create_error`, `napi_create_type_error`, `napi_create_range_error` | `code` is installed when supplied |
| v1 | `napi_typeof` | Includes function, external, symbol, and bigint distinctions |
| v1 | `napi_get_value_double`, `napi_get_value_int32`, `napi_get_value_uint32`, `napi_get_value_int64`, `napi_get_value_bool` | Checked type/status behavior |
| v1 | `napi_get_value_string_latin1`, `napi_get_value_string_utf8`, `napi_get_value_string_utf16` | Query-length and NUL-termination semantics included |
| v1 | `napi_coerce_to_bool`, `napi_coerce_to_number`, `napi_coerce_to_object`, `napi_coerce_to_string` | User code is exception-trapped |
| v1 | `napi_get_prototype`, `napi_get_property_names` | General object semantics |
| v1 | `napi_set_property`, `napi_has_property`, `napi_get_property`, `napi_delete_property`, `napi_has_own_property` | String, symbol, and numeric keys |
| v1 | `napi_set_named_property`, `napi_has_named_property`, `napi_get_named_property` | UTF-8 names |
| v1 | `napi_set_element`, `napi_has_element`, `napi_get_element`, `napi_delete_element` | Arrays and exotic indexed objects |
| v1 | `napi_define_properties` | Data, method, and accessor descriptors |
| v1 | `napi_is_array`, `napi_get_array_length`, `napi_strict_equals` | No pointer-identity shortcut |
| v1 | `napi_call_function`, `napi_new_instance`, `napi_instanceof` | General Perry dispatch/construction |
| v1 | `napi_get_cb_info`, `napi_get_new_target`, `napi_define_class` | Callback-info lifetime is the native call |
| v1 | `napi_wrap`, `napi_unwrap`, `napi_remove_wrap`, `napi_create_external`, `napi_get_value_external` | Native object metadata table |
| v1 | `napi_create_reference`, `napi_delete_reference`, `napi_reference_ref`, `napi_reference_unref`, `napi_get_reference_value` | Strong and weak reference design above |
| v1 | `napi_open_handle_scope`, `napi_close_handle_scope`, `napi_open_escapable_handle_scope`, `napi_close_escapable_handle_scope`, `napi_escape_handle` | Strict nesting and generation validation |
| v1 | `napi_throw`, `napi_throw_error`, `napi_throw_type_error`, `napi_throw_range_error`, `napi_is_error` | Pending-slot model |
| v1 | `napi_is_exception_pending`, `napi_get_and_clear_last_exception` | Available while pending |
| v1 | `napi_is_arraybuffer`, `napi_create_arraybuffer`, `napi_create_external_arraybuffer`, `napi_get_arraybuffer_info` | Stable backing pointers |
| v1 | `napi_is_typedarray`, `napi_create_typedarray`, `napi_get_typedarray_info` | All eleven declared typed-array kinds |
| v1 | `napi_create_dataview`, `napi_is_dataview`, `napi_get_dataview_info` | Backing identity and offsets preserved |
| v1 | `napi_get_version` | Returns 8 |
| v1 | `napi_create_promise`, `napi_resolve_deferred`, `napi_reject_deferred`, `napi_is_promise` | Deferred records are environment-owned roots |
| never | `napi_run_script` | Returns `napi_generic_failure`; arbitrary runtime source execution would violate the no-runtime-engine model |
| v1 | `napi_adjust_external_memory` | Collector pressure accounting |

### `js_native_api.h`: versions 5 through 8

| Status | Version | Entry points | Notes |
|---|---:|---|---|
| v1 | 5 | `napi_create_date`, `napi_is_date`, `napi_get_date_value` | Perry `Date` identity/value |
| v1 | 5 | `napi_add_finalizer` | Queued post-GC finalization |
| v1 | 6 | `napi_create_bigint_int64`, `napi_create_bigint_uint64`, `napi_create_bigint_words` | Arbitrary precision |
| v1 | 6 | `napi_get_value_bigint_int64`, `napi_get_value_bigint_uint64`, `napi_get_value_bigint_words` | Exact `lossless` and word-count behavior |
| v1 | 6 | `napi_get_all_property_names` | Collection mode, filter, and key conversion honored |
| v1 | 6 | `napi_set_instance_data`, `napi_get_instance_data` | One record per environment; replacement overwrites without calling the previous finalizer |
| v1 | 7 | `napi_detach_arraybuffer`, `napi_is_detached_arraybuffer` | Existing detach propagation |
| v1 | 8 | `napi_type_tag_object`, `napi_check_object_type_tag` | 128-bit tag in object metadata |
| v1 | 8 | `napi_object_freeze`, `napi_object_seal` | Perry descriptor machinery |

### `js_native_api.h`: version 9, version 10, and experimental

| Status | Version | Entry points | Reason |
|---|---:|---|---|
| later | 9 | `node_api_symbol_for`, `node_api_create_syntax_error`, `node_api_throw_syntax_error` | Advertise only with a complete version-9 surface |
| later | 10 | `node_api_create_external_string_latin1`, `node_api_create_external_string_utf16` | Requires external string lifetime/accounting work |
| later | 10 | `node_api_create_property_key_latin1`, `node_api_create_property_key_utf8`, `node_api_create_property_key_utf16` | Version-10 fast-path aliases |
| later | experimental | `node_api_post_finalizer` | Not part of the advertised stable ABI |
| later | experimental | `node_api_create_object_with_properties`, `node_api_set_prototype` | Not part of the advertised stable ABI |
| later | experimental | `node_api_create_sharedarraybuffer`, `node_api_create_external_sharedarraybuffer`, `node_api_is_sharedarraybuffer` | Not part of the advertised stable ABI |

### `node_api.h`

| Status | Version | Entry points | Notes |
|---|---:|---|---|
| v1 | base | `napi_module_register`, `napi_fatal_error` | Legacy registration and abort path |
| v1 | base | `napi_async_init`, `napi_async_destroy`, `napi_make_callback` | Existing async-hooks integration |
| v1 | base | `napi_create_buffer`, `napi_create_external_buffer`, `napi_create_buffer_copy`, `napi_is_buffer`, `napi_get_buffer_info` | Perry `Buffer` identity and stable bytes |
| v1 | base | `napi_create_async_work`, `napi_delete_async_work`, `napi_queue_async_work`, `napi_cancel_async_work` | Explicit state machine above |
| v1 | base | `napi_get_node_version` | Returns Perry's semver components with release string `perry`; it does not claim a Node release |
| never | 2 | `napi_get_uv_event_loop` | Returns `napi_generic_failure` and a null loop; Perry has no libuv |
| v1 | 3 | `napi_fatal_exception`, `napi_add_env_cleanup_hook`, `napi_remove_env_cleanup_hook` | Main-thread lifecycle |
| v1 | 3 | `napi_open_callback_scope`, `napi_close_callback_scope` | Async context and strict nesting |
| v1 | 4 | `napi_create_threadsafe_function`, `napi_get_threadsafe_function_context`, `napi_call_threadsafe_function` | Event-pump-backed TSFN |
| v1 | 4 | `napi_acquire_threadsafe_function`, `napi_release_threadsafe_function`, `napi_unref_threadsafe_function`, `napi_ref_threadsafe_function` | Thread count and event-loop keepalive |
| v1 | 8 | `napi_add_async_cleanup_hook`, `napi_remove_async_cleanup_hook` | Shutdown waits for completion |
| later | 9 | `node_api_get_module_file_name` | Environment already records the future value |
| later | 10 | `node_api_create_buffer_from_arraybuffer` | Advertise with version 10 |

The addon-side initializer exports
`node_api_module_get_api_version_v1` and `napi_register_module_v1`; these are
looked up in the addon and are not host exports.

## Required gates

Implementation is not complete until the gates below can independently fail:

1. **Handle/GC gate:** scopes, strong and weak refs, wrap metadata, callbacks,
   and pending exceptions survive forced copied minors and full collections;
   stale handles fail generation validation; the root-holder and rekey-table
   audit scripts are clean.
2. **Exception gate:** a throwing getter, native callback, finalizer misuse,
   and TSFN callback all return through C before Perry raises; an instrumented
   addon asserts that no unwind entered its frames.
3. **Loader/export gate:** a real addon records the address of a called
   `napi_*` function and the test proves that address belongs to the Perry
   executable. The smoke call count must be greater than zero.
4. **Real-addon gate:** one node-addon-api addon and one napi-rs addon cover
   properties, classes, async work, TSFN, instance data, wrap/finalizers, and
   buffers. Unsupported NAPI version, NAN/V8, and `uv_*` fixtures assert their
   exact diagnostics.
5. **Watcher differential gate:** the real `@parcel/watcher` binary and Perry's
   facade observe the same fixture tree and emit identical coalesced streams;
   both sides assert that their native implementation actually ran.
6. **Distribution gate:** move the executable plus sidecar directory to a
   read-only location and load successfully; deletion or mutation of a
   sidecar fails the manifest hash check.
7. **Cache gate:** changing only addon bytes or policy misses the build cache;
   rebuilding unchanged inputs hits it.
8. **Size gate:** byte-identical hello-world outputs with an empty addon graph;
   report the host-only delta for an addon build and enforce the 0.6 MB budget.

The host is not enabled merely because its unit tests pass. The real-addon and
symbol-provenance gates are the acceptance boundary: a green run in which no
addon initializer or `napi_*` body executed is a failure.
