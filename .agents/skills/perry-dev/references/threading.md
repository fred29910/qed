<!-- Perry docs bundle: threading.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/threading/overview.md -->

# Multi-Threading

Perry gives you real OS threads with a one-line API. No worker setup, no message ports, no structured clone overhead. Just `parallelMap`, `parallelFilter`, and `spawn`.

```typescript
async function overviewHeader(): Promise<void> {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]
    const records = [
        { score: 50, id: 1 },
        { score: 90, id: 2 },
        { score: 85, id: 3 },
    ]
    const threshold = 80

    // Process a million items across all CPU cores
    const results = parallelMap(data, (item: number) => item * item)

    // Filter a large dataset in parallel
    const valid = parallelFilter(records, (r: { score: number; id: number }) => r.score > threshold)

    // Run expensive work in the background
    const answer = await spawn(() => {
        let acc = 0
        for (let i = 0; i < 100_000; i++) acc += i
        return acc
    })

    console.log(`overview-header results=${results.length} valid=${valid.length} answer=${answer}`)
}
```

This is something **no JavaScript runtime can do**. V8, Bun, and Deno are all locked to one thread per isolate. Perry compiles to native code — there are no isolates, no GIL, no structural limitations. Your code runs on real OS threads with the full power of every CPU core.

## Why This Matters

JavaScript's single-threaded model is its biggest performance bottleneck. Here's how runtimes try to work around it:

| Runtime | "Multi-threading" | Reality |
|---------|-------------------|---------|
| **Node.js** | `worker_threads` | Separate V8 isolates. Data copied via structured clone. ~2MB RAM per worker. Complex API. |
| **Deno** | `Worker` | Same as Node — isolated heaps, message passing only. |
| **Bun** | `Worker` | Same architecture. Faster structured clone, still isolated. |
| **Perry** | `parallelMap` / `spawn` | Real OS threads. Lightweight (8MB stack). One-line API. Compile-time safety. |

The fundamental problem: V8 uses a garbage-collected heap that **cannot be shared** between threads. Every "worker" is an entirely separate JavaScript engine instance with its own heap, its own GC, and its own copy of your data.

Perry doesn't have this limitation. It compiles TypeScript to native machine code. Values are transferred between threads using zero-cost copies for numbers and efficient serialization for objects — no separate engine instances, no multi-megabyte overhead per thread.

## Three Primitives

### `parallelMap` — Data-Parallel Processing

Split an array across all CPU cores. Each element is processed independently. Results are collected in order.

```typescript
async function overviewParallelMap(): Promise<void> {
    const prices = [100, 200, 300, 400, 500, 600, 700, 800]
    const adjusted = parallelMap(prices, (price: number) => {
        // Heavy computation runs on a worker thread
        let result = price
        for (let i = 0; i < 1000000; i++) {
            result = Math.sqrt(result * result + i)
        }
        return result
    })

    console.log(`overview-parallel-map len=${adjusted.length}`)
}
```

Perry automatically:
1. Detects the number of CPU cores
2. Splits the array into chunks (one per core)
3. Spawns OS threads to process each chunk
4. Collects results in the original order
5. Returns a new array

For small arrays, Perry skips threading entirely and processes inline — no overhead for trivial cases.

### `parallelFilter` — Data-Parallel Filtering

Filter a large array across all CPU cores. Like `.filter()` but parallel:

```typescript
async function overviewParallelFilter(): Promise<void> {
    const cutoffDate = 1_700_000_000
    const users = [
        { lastLogin: 1_710_000_000, score: 150, name: "alice" },
        { lastLogin: 1_690_000_000, score: 50, name: "bob" },
        { lastLogin: 1_720_000_000, score: 120, name: "carol" },
    ]

    // Filter across all cores — order is preserved
    const active = parallelFilter(users, (user: { lastLogin: number; score: number; name: string }) => {
        return user.lastLogin > cutoffDate && user.score > 100
    })

    console.log(`overview-parallel-filter active=${active.length}`)
}
```

Same rules as `parallelMap`: closures cannot capture mutable variables (compile-time enforced), and values are deep-copied between threads.

### `spawn` — Background Threads

Run any computation in the background and get a Promise back. The main thread continues immediately.

```typescript
async function overviewSpawnBg(): Promise<void> {
    // Start heavy work in the background
    const handle = spawn(() => {
        let sum = 0
        for (let i = 0; i < 100_000; i++) {
            sum += Math.sin(i)
        }
        return sum
    })

    // Main thread keeps running — UI stays responsive
    console.log("Computing...")

    // Get the result when you need it
    const result = await handle
    console.log(`Done: len=${typeof result}`)
}
```

`spawn` returns a standard Promise. You can `await` it, pass it to `Promise.all`, or chain `.then()` — it works exactly like any other async operation.

## Practical Examples

### Parallel Image Processing

```typescript
async function overviewImage(): Promise<void> {
    const pixels = [
        { r: 100, g: 120, b: 140 },
        { r: 50, g: 60, b: 70 },
        { r: 200, g: 210, b: 220 },
    ]

    // Each pixel processed on a separate core
    const processed = parallelMap(pixels, (pixel: { r: number; g: number; b: number }) => {
        const r = Math.min(255, pixel.r * 1.2)
        const g = Math.min(255, pixel.g * 0.8)
        const b = Math.min(255, pixel.b * 1.1)
        return { r, g, b }
    })

    console.log(`overview-image processed=${processed.length}`)
}
```

### Parallel Cryptographic Hashing

```typescript
async function overviewCrypto(): Promise<void> {
    // Hash thousands of items across all cores
    const passwords = ["pass1", "pass2", "pass3"]
    const hashed = parallelMap(passwords, (password: string) => {
        // Stand-in for a real hash: deterministic FNV-1a over the bytes.
        let h = 2166136261
        for (let i = 0; i < password.length; i++) {
            h ^= password.charCodeAt(i)
            h = (h * 16777619) >>> 0
        }
        return h
    })

    console.log(`overview-crypto hashed=${hashed.length}`)
}
```

### Multiple Independent Computations

```typescript
async function overviewMultiple(): Promise<void> {
    const dataA = [1, 2, 3]
    const dataB = [4, 5, 6]
    const dataC = [7, 8, 9]

    // Three independent tasks run simultaneously on three OS threads
    const task1 = spawn(() => {
        let acc = 0
        for (const v of dataA) acc += v * v
        return acc
    })
    const task2 = spawn(() => {
        let acc = 0
        for (const v of dataB) acc += v * v
        return acc
    })
    const task3 = spawn(() => {
        let acc = 0
        for (const v of dataC) acc += v * v
        return acc
    })

    // All three run concurrently
    const [result1, result2, result3] = await Promise.all([task1, task2, task3])
    console.log(`overview-multiple ${result1} ${result2} ${result3}`)
}
```

### Keeping UI Responsive

```typescript
const responsiveButton = Button("Start Analysis", async () => {
    status.set("Analyzing...")

    // Heavy computation runs on a background thread
    // UI stays responsive — user can still interact
    const value = await spawn(() => {
        let acc = 0
        for (let i = 0; i < 1_000_000; i++) acc += i
        return acc
    })

    status.set(`Done: ${value}`)
})

const responsiveText = Text(`Status: ${status.value}`)
```

### Captured Variables

Closures can capture outer variables. Captured values are automatically deep-copied to each worker thread:

```typescript
async function overviewCaptured(): Promise<void> {
    const prices = [100, 200, 300, 400]
    const taxRate = 0.08
    const discount = 0.15

    // taxRate and discount are captured and copied to each thread
    const finalPrices = parallelMap(prices, (price: number) => {
        const discounted = price * (1 - discount)
        return discounted * (1 + taxRate)
    })

    console.log(`overview-captured len=${finalPrices.length}`)
}
```

Numbers and booleans are zero-cost copies (just 64-bit values). Strings, arrays, and objects are deep-copied automatically.

## Safety

Perry enforces thread safety **at compile time**. You don't need to think about race conditions, mutexes, or data corruption.

### No Shared Mutable State

Closures passed to `parallelMap` and `spawn` **cannot capture mutable variables**. The compiler rejects this:

```text
// Reject example — Perry rejects this at compile time:

let counter = 0;

// COMPILE ERROR: Closures passed to parallelMap cannot
// capture mutable variable 'counter'
parallelMap(data, (item) => {
    counter++;  // Not allowed
    return item;
});
```

This eliminates data races by design. If you need to aggregate results, use the return values:

```typescript
async function overviewReduceInstead(): Promise<void> {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]

    // Instead of mutating a shared counter, return values and reduce
    const results = parallelMap(data, (item: number) => item * item)
    const total = results.reduce((sum: number, r: number) => sum + r, 0)

    console.log(`overview-reduce-instead total=${total}`)
}
```

The one explicit shared-state escape hatch is `SharedArrayBuffer`: a SAB captured
into a `spawn` / `parallelMap` closure aliases the same physical bytes across
agents, and the `Atomics` API (including a real blocking `Atomics.wait` /
`Atomics.notify` / `Atomics.waitAsync`) operates on it for cross-thread
coordination. Only the `SharedArrayBuffer` itself is shared — build any typed-array
view over it per-agent rather than capturing the view directly.

### Workers Are Synchronous

The closure passed to `parallelMap`, `parallelFilter`, or `spawn` cannot be
`async`, contain `await` (directly or in a nested closure), or call another
thread primitive — the compiler rejects all three. Async machinery is pumped
by whichever thread runs it, so a worker doing async work would drain
completions and timers belonging to other threads and alias their heaps.
Do the async part on the main thread and `await` the `spawn` result there —
the standard pattern shown above is unaffected.

### Module-Scope Objects Stay Home

Worker closures may read module-scope **primitives** (numbers, strings,
booleans), but not module-scope bindings that hold heap objects — object and
array literals, `const f = () => ...` helpers, `Map`/`Set`, class instances.
Module-level bindings live in process-wide slots that are read in place; they
do **not** go through the capture deep-copy, so the worker would alias the
main thread's heap. The compiler rejects such reads. Two easy fixes: bind the
value to a function-scope local first (`const copy = theGlobal;`) so the
closure captures the local and it is deep-copied, or declare module-level
helpers with `function name(...)` (static code — always fine to call from a
worker). `SharedArrayBuffer` module globals are exempt: cross-thread sharing
is their purpose.

### Independent Thread Arenas

Each worker thread has its own memory arena. Objects created on one thread can never be accessed from another thread. Values cross thread boundaries only through deep-copy serialization, which Perry handles automatically and invisibly.

File-system descriptors are also thread-affine. Numeric fds from `fs.openSync`
are just copied numbers in another thread, where the fd registry does not know
them, so fd operations fail with `EBADF`. `fs.promises.FileHandle` objects cross
thread boundaries as detached handles with `fd === -1`. Pass file paths to
`spawn`/`parallelMap` and reopen files inside the worker when it needs file I/O.

## How It Works

Perry's threading model is built on three pillars:

**1. Native Code, Not Interpreted**

Perry compiles TypeScript to native machine code via LLVM. There's no interpreter, no VM, no isolate. A function pointer is just a function pointer — it's valid on any thread.

**2. Thread-Local Memory**

Each thread gets its own memory arena (bump allocator) and garbage collector. No synchronization overhead during computation. When a thread finishes, its arena is freed automatically.

**3. Serialized Transfer**

Values crossing thread boundaries are serialized to a thread-safe intermediate format and deserialized on the target thread. The cost depends on the value type:

| Value Type | Transfer Cost |
|-----------|--------------|
| Numbers, booleans, null, undefined | Zero-cost (64-bit copy) |
| Strings | O(n) byte copy |
| Arrays | O(n) deep copy of elements |
| Objects | O(n) deep copy of fields |
| Closures | Pointer + captured values |
| `fs` numeric fds / `FileHandle` | Thread-affine; reopen by path |

For numeric workloads — the most common parallelizable tasks — the threading overhead is negligible.

## Next Steps

- [parallelMap Reference](https://docs.perryts.com/threading/parallel-map.html) — detailed API and performance tips
- [parallelFilter Reference](https://docs.perryts.com/threading/parallel-filter.html) — parallel array filtering
- [spawn Reference](https://docs.perryts.com/threading/spawn.html) — background threads and Promise integration


---

<!-- source: docs/src/threading/parallel-map.md -->

# parallelMap

**Signature**: `parallelMap<T, U>(data: T[], fn: (item: T) => U): U[]` — imported from `perry/thread`.

Processes every element of an array in parallel across all available CPU cores. Returns a new array with the results in the same order as the input.

## Basic Usage

```typescript
function parallelMapBasic(): void {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8]
    const doubled = parallelMap(numbers, (x: number) => x * 2)
    // [2, 4, 6, 8, 10, 12, 14, 16]
    console.log(`parallel-map-basic len=${doubled.length}`)
}
```

## How It Works

```
Input: [a, b, c, d, e, f, g, h]     (8 elements, 4 CPU cores)

  Core 1: [a, b] → map → [a', b']
  Core 2: [c, d] → map → [c', d']
  Core 3: [e, f] → map → [e', f']
  Core 4: [g, h] → map → [g', h']

Output: [a', b', c', d', e', f', g', h']   (same order as input)
```

Perry automatically detects the number of CPU cores and splits the array into equal chunks. Elements within each chunk are processed sequentially; chunks run concurrently across cores.

## Capturing Variables

The mapping function can reference variables from the outer scope. Captured values are deep-copied to each worker thread automatically:

```typescript
function parallelMapCapture(): void {
    const prices = [100, 200, 300]
    const exchangeRate = 1.12

    const converted = parallelMap(prices, (price: number) => {
        // exchangeRate is captured and copied to each thread
        return price * exchangeRate
    })

    console.log(`parallel-map-capture len=${converted.length}`)
}
```

### What Can Be Captured

| Type | Supported | Transfer |
|------|-----------|----------|
| Numbers | Yes | Zero-cost (64-bit copy) |
| Booleans | Yes | Zero-cost |
| Strings | Yes | Byte copy |
| Arrays | Yes | Deep copy |
| Objects | Yes | Deep copy |
| `const` variables | Yes | Copied |
| `let`/`var` variables | Only if not reassigned | Copied |

Numeric fds and `fs.promises.FileHandle` objects are thread-affine. A captured fd
is not registered in worker threads, and a captured `FileHandle` is detached
with `fd === -1`. For file-backed parallel work, capture path strings and open
the file inside the mapper.

### What Cannot Be Captured

Mutable variables — variables that are reassigned anywhere in the enclosing scope — are rejected at compile time:

```text
// Reject example — Perry rejects this at compile time:

let total = 0;

// COMPILE ERROR: Cannot capture mutable variable 'total'
parallelMap(data, (item) => {
    total += item;   // Would be a data race
    return item;
});
```

Instead, return values and reduce:

```typescript
function parallelMapReduce(): void {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]
    const results = parallelMap(data, (item: number) => item * 2)
    const total = results.reduce((sum: number, x: number) => sum + x, 0)
    console.log(`parallel-map-reduce total=${total}`)
}
```

## Performance

### When to Use parallelMap

Use `parallelMap` when the computation per element is **significantly heavier** than the cost of copying the element across threads.

**Good candidates** (CPU-bound work per element):

```typescript
function parallelMapGoodCandidates(): void {
    const data = [1.0, 2.0, 3.0, 4.0]
    const documents = ["alpha beta", "gamma delta", "epsilon"]
    const inputs = ["a", "bb", "ccc"]

    // Heavy math
    const out1 = parallelMap(data, (x: number) => {
        let acc = x
        for (let i = 0; i < 1_000; i++) acc = Math.sqrt(acc * acc + i)
        return acc
    })

    // String processing on large strings
    const out2 = parallelMap(documents, (doc: string) => {
        const words = doc.split(" ")
        return { count: words.length, first: words[0] }
    })

    // Cryptographic operations
    const out3 = parallelMap(inputs, (input: string) => {
        let h = 0
        for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
        return h
    })

    console.log(`parallel-map-good-candidates ${out1.length} ${out2.length} ${out3.length}`)
}
```

**Poor candidates** (trivial work per element):

```typescript
function parallelMapPoorCandidate(): void {
    const numbers = [1, 2, 3, 4, 5]

    // Too simple — threading overhead outweighs the gain
    const a = parallelMap(numbers, (x: number) => x + 1)

    // For trivial operations, use regular map
    const result = numbers.map((x: number) => x + 1)

    console.log(`parallel-map-poor-candidate ${a.length} ${result.length}`)
}
```

### Small Array Optimization

For arrays with fewer elements than CPU cores, Perry skips threading entirely and processes elements inline on the main thread. There's zero overhead for small inputs.

### Numeric Fast Path

When elements are pure numbers (no strings, objects, or arrays), Perry transfers them between threads at virtually zero cost — just 64-bit value copies with no serialization.

## Examples

### Matrix Row Processing

```typescript
function parallelMapMatrix(): void {
    // Process each row of a matrix independently
    const rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    const rowSums = parallelMap(rows, (row: number[]) => {
        let sum = 0
        for (const val of row) sum += val
        return sum
    })
    // [6, 15, 24]
    console.log(`parallel-map-matrix sums=${rowSums[0]},${rowSums[1]},${rowSums[2]}`)
}
```

### Batch Validation

```typescript
function parallelMapValidation(): void {
    const users = [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "invalid" },
        { name: "Charlie", email: "charlie@example.com" },
    ]

    const validationResults = parallelMap(users, (user: { name: string; email: string }) => {
        const emailValid = user.email.includes("@") && user.email.includes(".")
        const nameValid = user.name.length > 0 && user.name.length < 100
        return { name: user.name, valid: emailValid && nameValid }
    })

    console.log(`parallel-map-validation len=${validationResults.length}`)
}
```

### Financial Calculations

```typescript
function parallelMapMonteCarlo(): void {
    const portfolios = [
        { id: 1, base: 100 },
        { id: 2, base: 200 },
        { id: 3, base: 150 },
    ] // thousands of portfolios

    // Monte Carlo simulation across all cores
    const riskScores = parallelMap(portfolios, (portfolio: { id: number; base: number }) => {
        let totalRisk = 0
        for (let sim = 0; sim < 1000; sim++) {
            // simulateReturns stand-in: deterministic pseudo-random walk.
            let s = portfolio.base + sim
            s = ((s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
            totalRisk += s
        }
        return totalRisk / 1000
    })

    console.log(`parallel-map-monte-carlo len=${riskScores.length}`)
}
```


---

<!-- source: docs/src/threading/parallel-filter.md -->

# parallelFilter

**Signature**: `parallelFilter<T>(data: T[], predicate: (item: T) => boolean): T[]` — imported from `perry/thread`.

Filters an array in parallel across all available CPU cores. Returns a new array containing only the elements where the predicate returned a truthy value. Order is preserved.

## Basic Usage

```typescript
function parallelFilterBasic(): void {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const evens = parallelFilter(numbers, (x: number) => x % 2 === 0)
    // [2, 4, 6, 8, 10]
    console.log(`parallel-filter-basic len=${evens.length}`)
}
```

## How It Works

```
Input: [a, b, c, d, e, f, g, h]     (8 elements, 4 CPU cores)

  Core 1: [a, b] → test → [a]       (b filtered out)
  Core 2: [c, d] → test → [c, d]    (both kept)
  Core 3: [e, f] → test → []        (both filtered out)
  Core 4: [g, h] → test → [h]       (g filtered out)

Output: [a, c, d, h]                 (concatenated in original order)
```

Each core independently tests its chunk of elements. Results are merged in the original element order after all threads complete.

## Why Not Just Use `.filter()`?

Regular `.filter()` runs on a single thread. For large arrays with expensive predicates, `parallelFilter` distributes the work:

```typescript
function parallelFilterVsFilter(): void {
    const data = [1, 2, 3, 4, 5, 6, 7, 8]

    // Single-threaded — one core does all the work
    const a = data.filter((item: number) => item > 3)

    // Parallel — all cores share the work
    const b = parallelFilter(data, (item: number) => item > 3)

    console.log(`parallel-filter-vs-filter ${a.length} ${b.length}`)
}
```

The tradeoff: `parallelFilter` has overhead from copying values between threads. Use it when the predicate is expensive enough to justify that cost.

## Capturing Variables

Like `parallelMap`, the predicate can capture outer variables. Captures are deep-copied to each thread:

```typescript
function parallelFilterCapture(): void {
    const candidates = [
        { name: "Alice", score: 90, age: 28 },
        { name: "Bob", score: 80, age: 35 },
        { name: "Carol", score: 95, age: 25 },
    ]
    const minScore = 85
    const maxAge = 30

    // minScore and maxAge are captured and copied to each thread
    const qualified = parallelFilter(candidates, (c: { name: string; score: number; age: number }) => {
        return c.score >= minScore && c.age <= maxAge
    })

    console.log(`parallel-filter-capture len=${qualified.length}`)
}
```

Mutable variables cannot be captured — the compiler rejects this at compile time.

## Examples

### Filtering Large Datasets

```typescript
function parallelFilterLarge(): void {
    // Stand-in for "millions of records" — same shape, smaller list.
    const transactions = [
        { amount: 15000, country: "US", user: { homeCountry: "DE" }, timestamp: { hour: 4 } },
        { amount: 200, country: "DE", user: { homeCountry: "DE" }, timestamp: { hour: 12 } },
        { amount: 50000, country: "FR", user: { homeCountry: "DE" }, timestamp: { hour: 3 } },
    ]

    const suspicious = parallelFilter(transactions, (tx: {
        amount: number
        country: string
        user: { homeCountry: string }
        timestamp: { hour: number }
    }) => {
        return tx.amount > 10000
            && tx.country !== tx.user.homeCountry
            && tx.timestamp.hour < 6
    })

    console.log(`parallel-filter-large len=${suspicious.length}`)
}
```

### Combined with parallelMap

```typescript
function parallelFilterCombined(): void {
    const users = [
        { name: "Alice", isActive: true, age: 28, score: 90 },
        { name: "Bob", isActive: false, age: 35, score: 80 },
        { name: "Carol", isActive: true, age: 17, score: 95 },
        { name: "Dave", isActive: true, age: 40, score: 60 },
    ]

    // Step 1: Filter to relevant items (parallel)
    const active = parallelFilter(users, (u: { isActive: boolean; age: number }) => u.isActive && u.age >= 18)

    // Step 2: Transform the filtered results (parallel)
    const profiles = parallelMap(active, (u: { name: string; score: number }) => ({
        name: u.name,
        score: u.score * 2,
    }))

    console.log(`parallel-filter-combined active=${active.length} profiles=${profiles.length}`)
}
```

### Predicate with Heavy Computation

```typescript
function parallelFilterHeavy(): void {
    const certificates = [
        { id: 1, fingerprint: "aa", revoked: false },
        { id: 2, fingerprint: "bb", revoked: true },
        { id: 3, fingerprint: "cc", revoked: false },
    ]

    // Each predicate call does significant work — perfect for parallelization.
    const valid = parallelFilter(certificates, (cert: { id: number; fingerprint: string; revoked: boolean }) => {
        // Stand-in for a real chain verification: hash the fingerprint a bit
        // then sanity-check the revocation flag.
        let h = 0
        for (let i = 0; i < cert.fingerprint.length; i++) {
            h = (h * 31 + cert.fingerprint.charCodeAt(i)) >>> 0
        }
        return h !== 0 && !cert.revoked
    })

    console.log(`parallel-filter-heavy len=${valid.length}`)
}
```

## Performance

Use `parallelFilter` when:
- The array has many elements (hundreds or more)
- The predicate function does meaningful work per element
- You need to keep the UI responsive during filtering

For trivial predicates on small arrays, regular `.filter()` is faster (no threading overhead).


---

<!-- source: docs/src/threading/spawn.md -->

# spawn

**Signature**: `spawn<T>(fn: () => T): Promise<T>` — imported from `perry/thread`.

Runs a closure on a new OS thread and returns a Promise that resolves when the thread completes. The main thread continues immediately — UI and other work are not blocked.

## Basic Usage

```typescript
async function spawnBasic(): Promise<void> {
    const result = await spawn(() => {
        // This runs on a separate OS thread.
        let sum = 0
        for (let i = 0; i < 100_000_000; i++) {
            sum += i
        }
        return sum
    })

    console.log(result) // 4999999950000000
}
```

## Non-Blocking

`spawn` returns immediately. The main thread doesn't wait:

```typescript
async function spawnNonBlocking(): Promise<void> {
    console.log("1. Starting background work")

    const handle = spawn(() => {
        // Runs on a background thread — heavier work elided here.
        let n = 0
        for (let i = 0; i < 10_000_000; i++) n++
        return n
    })

    console.log("2. Main thread continues immediately")

    const result = await handle
    console.log(`3. Got result: ${result}`)
}
```

Output:
```
1. Starting background work
2. Main thread continues immediately
3. Got result: <computed value>
```

## Multiple Concurrent Tasks

Spawn multiple tasks and they run truly concurrently — one OS thread per `spawn` call:

```typescript
async function spawnMultiple(): Promise<void> {
    const t1 = spawn(() => analyseChunk(0, 1_000_000))
    const t2 = spawn(() => analyseChunk(1_000_000, 2_000_000))
    const t3 = spawn(() => analyseChunk(2_000_000, 3_000_000))

    // All three run simultaneously on separate OS threads.
    const results = await Promise.all([t1, t2, t3])

    console.log(`Region A: ${results[0]}`)
    console.log(`Region B: ${results[1]}`)
    console.log(`Region C: ${results[2]}`)
}

function analyseChunk(start: number, end: number): number {
    let acc = 0
    for (let i = start; i < end; i++) acc += i & 0xff
    return acc
}
```

Unlike Node.js `worker_threads`, each `spawn` is a lightweight OS thread (~8MB stack), not a full V8 isolate (~2MB heap + startup cost).

## Capturing Variables

Like `parallelMap`, `spawn` closures can capture outer variables. They are deep-copied to the background thread:

```typescript
async function spawnCapture(): Promise<void> {
    const config = { iterations: 1000, seed: 42 }
    const dataset = [1, 2, 3, 4, 5, 6, 7, 8]

    const result = await spawn(() => {
        // config and dataset are deep-copied to this thread.
        let acc = config.seed
        for (let i = 0; i < config.iterations; i++) {
            acc = (acc * 1103515245 + 12345) & 0x7fffffff
        }
        for (const v of dataset) acc ^= v
        return acc
    })

    console.log(`spawn-capture: ${result}`)
}
```

Mutable variables cannot be captured — this is enforced at compile time.

### File System Handles

Do not capture numeric fds or `fs.promises.FileHandle` objects for file I/O in
`spawn`. Perry's fd registry is per thread: a numeric fd captured from the main
thread is not open in the worker, and a captured `FileHandle` arrives detached
with `fd === -1`. Capture a path string instead, then call `fs.openSync` or
`fs.promises.open` inside the spawned function.

## Returning Complex Values

`spawn` can return any value type. Complex values (objects, arrays, strings) are serialized back to the main thread automatically:

```typescript
async function spawnComplexReturn(): Promise<void> {
    const stats = await spawn(() => {
        const values = [3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0]
        let sum = 0
        let max = values[0]
        let min = values[0]
        for (const v of values) {
            sum += v
            if (v > max) max = v
            if (v < min) min = v
        }
        return {
            mean: sum / values.length,
            min,
            max,
            count: values.length,
        }
    })

    console.log(`mean=${stats.mean} min=${stats.min} max=${stats.max} count=${stats.count}`)
}
```

## UI Integration

`spawn` is ideal for keeping native UIs responsive during heavy computation:

```typescript
const analyzeButton = Button("Analyze", async () => {
    status.set("Processing...")

    // Background thread — UI stays responsive
    const data = await spawn(() => {
        let count = 0
        for (let i = 0; i < 1_000_000; i++) {
            if ((i & 0xff) === 0) count++
        }
        return { count }
    })

    result.set(`Found ${data.count} patterns`)
    status.set("Done")
})
```

Without `spawn`, the analysis would freeze the UI. With `spawn`, the user can still scroll, tap other buttons, or navigate while the computation runs.

## Compared to Node.js worker_threads

```javascript
// ── Node.js: ~15 lines, separate file needed ──────────
// worker.js
const { parentPort, workerData } = require("worker_threads");
const result = heavyComputation(workerData);
parentPort.postMessage(result);

// main.js
const { Worker } = require("worker_threads");
const worker = new Worker("./worker.js", {
    workerData: inputData,
});
worker.on("message", (result) => {
    console.log(result);
});
worker.on("error", (err) => { /* handle */ });


// ── Perry: 1 line ─────────────────────────────────────
// const result = await spawn(() => heavyComputation(inputData));
```

No separate files. No message ports. No event handlers. No structured clone. One line.

## Examples

### Background File Processing

```typescript
async function spawnBgFile(): Promise<void> {
    // Read and process a "large" file without blocking. We inline a tiny CSV
    // so the snippet runs hermetically — the docs' real version would call
    // readFileSync from "fs".
    const content = "id,value\n1,10\n2,20\n3,30\n"
    const analysis = await spawn(() => {
        const lines = content.split("\n").filter((l: string) => l.length > 0).slice(1)
        let total = 0
        for (const line of lines) {
            const parts = line.split(",")
            total += parseInt(parts[1], 10)
        }
        return { rows: lines.length, total }
    })

    console.log(`spawn-bg-file rows=${analysis.rows} total=${analysis.total}`)
}
```

### Parallel API Calls with Processing

```typescript
async function spawnApiThenProcess(): Promise<void> {
    // The docs example fetches a remote API; for a hermetic test we
    // just hand-roll the same pipeline shape with synthetic data.
    const rawData = { items: [1, 2, 3, 4, 5] }

    // CPU-intensive processing happens off the main thread
    const processed = await spawn(() => {
        let total = 0
        for (const v of rawData.items) total += v * v
        return { total, count: rawData.items.length }
    })

    console.log(`spawn-api-then-process total=${processed.total} count=${processed.count}`)
}
```

### Deferred Computation

```typescript
async function spawnDeferred(): Promise<void> {
    const params = { size: 8 }

    // Start computation early, use result later
    const precomputed = spawn(() => {
        const table: number[] = []
        for (let i = 0; i < params.size; i++) table.push(i * i)
        return table
    })

    // ... do other setup work ...

    // Result is ready (or we wait for it)
    const table = await precomputed
    console.log(`spawn-deferred len=${table.length} last=${table[table.length - 1]}`)
}
```
