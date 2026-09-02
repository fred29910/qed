<!-- Perry docs bundle: language.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/language/supported-features.md -->

# Supported TypeScript Features

Perry compiles a practical subset of TypeScript to native code. This page lists what's supported.

## Primitive Types

```typescript
function primitives(): void {
    const n: number = 42;
    const s: string = "hello";
    const b: boolean = true;
    const u: undefined = undefined;
    const nl: null = null;

    console.log(`primitives: n=${n} s=${s} b=${b} u=${u} nl=${nl}`)
}
```

All primitives are represented as 64-bit NaN-boxed values at runtime.

## Variables and Constants

```typescript
function variables(): void {
    let x = 10;
    const y = "immutable";
    var z = true; // var is supported but let/const preferred

    console.log(`variables: x=${x} y=${y} z=${z}`)
}
```

Perry infers types from initializers — `let x = 5` is inferred as `number` without an explicit annotation.

## Functions

```typescript
function functionsDemo(): void {
    function add(a: number, b: number): number {
        return a + b;
    }

    // Optional parameters
    function greet(name: string, greeting: string = "Hello"): string {
        return `${greeting}, ${name}!`;
    }

    // Rest parameters
    function sum(...nums: number[]): number {
        return nums.reduce((a, b) => a + b, 0);
    }

    // Arrow functions
    const double = (x: number) => x * 2;

    console.log(`functions: add=${add(2, 3)} greet=${greet("Perry")} sum=${sum(1, 2, 3)} double=${double(5)}`)
}
```

## Classes

```typescript
class Animal {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    speak(): string {
        return `${this.name} makes a noise`;
    }
}

class Dog extends Animal {
    speak(): string {
        return `${this.name} barks`;
    }
}

// Static methods
class Counter {
    private static instance: Counter;
    private count: number = 0;

    static getInstance(): Counter {
        if (!Counter.instance) {
            Counter.instance = new Counter();
        }
        return Counter.instance;
    }
}
```

Supported class features:
- Constructors
- Instance and static methods
- Instance and static properties
- Inheritance (`extends`)
- Method overriding
- `instanceof` checks (via class ID chain)
- Singleton patterns (static method return type inference)

## Enums

```typescript
// Numeric enums
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

// String enums
enum Color {
    Red = "RED",
    Green = "GREEN",
    Blue = "BLUE",
}

const dir = Direction.Up;
const color = Color.Red;
```

Enums are compiled to constants and work across modules.

## Interfaces and Type Aliases

```typescript
interface User {
    name: string;
    age: number;
    email?: string;
}

type Point = { x: number; y: number };
type StringOrNumber = string | number;
type Callback = (value: number) => void;
```

Interfaces and type aliases are erased at compile time (like `tsc`). They exist only for documentation and editor tooling.

## Arrays

```typescript
function arraysDemo(): void {
    const nums: number[] = [1, 2, 3];

    // Array methods
    nums.push(4);
    nums.pop();
    const len = nums.length;
    const doubled = nums.map((x) => x * 2);
    const filtered = nums.filter((x) => x > 2);
    const sum = nums.reduce((acc, x) => acc + x, 0);
    const found = nums.find((x) => x === 3);
    const idx = nums.indexOf(3);
    const joined = nums.join(", ");
    const sliced = nums.slice(1, 3);
    nums.splice(1, 1);
    nums.unshift(0);
    const sorted = nums.sort((a, b) => a - b);
    const reversed = nums.reverse();
    const includes = nums.includes(3);
    const every = nums.every((x) => x > 0);
    const some = nums.some((x) => x > 2);
    nums.forEach((x) => console.log(x));
    const flat = [[1, 2], [3]].flat();
    const concatted = nums.concat([5, 6]);

    // Array.from
    const arr = Array.from([10, 20, 30]);

    // Array.isArray
    const value: any = [1, 2, 3]
    if (Array.isArray(value)) { /* ... */ }

    // for...of iteration
    for (const item of nums) {
        console.log(item);
    }

    console.log(`arrays: len=${len} doubled=${doubled.length} filtered=${filtered.length} sum=${sum} found=${found} idx=${idx} joined=${joined} sliced=${sliced.length} sorted=${sorted.length} reversed=${reversed.length} includes=${includes} every=${every} some=${some} flat=${flat.length} concatted=${concatted.length} arr=${arr.length}`)
}
```

## Objects

```typescript
function objectsDemo(): void {
    const obj: { name: string; version: number; [k: string]: any } = { name: "Perry", version: 1 };
    obj.name = "Perry 2";

    // Dynamic property access
    const key = "name";
    const val = obj[key];

    // Object.keys, Object.values, Object.entries
    const keys = Object.keys(obj);
    const values = Object.values(obj);
    const entries = Object.entries(obj);

    // Spread
    const copy = { ...obj, extra: true };

    // delete
    delete obj[key];

    console.log(`objects: val=${val} keys=${keys.length} values=${values.length} entries=${entries.length} copy=${copy.extra}`)
}
```

## Destructuring

```typescript
function destructuringDemo(): void {
    // Array destructuring
    const [a, b, ...rest] = [1, 2, 3, 4, 5];

    const user = { name: "Alice", age: 30, email: "a@example.com", id: 1 }
    const obj = { id: 2, role: "admin", level: 5 }

    // Object destructuring
    const { name, age, email = "none" } = user;

    // Rename
    const { name: userName } = user;

    // Rest pattern
    const { id, ...remaining } = obj;

    // Function parameter destructuring
    function process({ name, age }: { name: string; age: number }) {
        console.log(name, age);
    }

    process(user)
    console.log(`destructuring: a=${a} b=${b} rest=${rest.length} name=${name} age=${age} email=${email} userName=${userName} id=${id}`)
}
```

## Template Literals

```typescript
function templateLiteralsDemo(): void {
    const name = "world";
    const greeting = `Hello, ${name}!`;
    const multiline = `
  Line 1
  Line 2
`;
    const expr = `Result: ${1 + 2}`;

    console.log(`template-literals: greeting=${greeting} multiline_len=${multiline.length} expr=${expr}`)
}
```

## Spread and Rest

```typescript
function spreadRestDemo(): void {
    const arr1 = [1, 2]
    const arr2 = [3, 4]
    const defaults = { theme: "light", size: "md" }
    const overrides = { size: "lg" }

    // Array spread
    const combined = [...arr1, ...arr2];

    // Object spread
    const merged = { ...defaults, ...overrides };

    // Rest parameters
    function log(...args: any[]) { /* ... */ }

    log("a", "b", "c")
    console.log(`spread-rest: combined=${combined.length} merged=${merged.size}`)
}
```

## Closures

```typescript
function closuresDemo(): void {
    function makeCounter() {
        let count = 0;
        return {
            increment: () => ++count,
            get: () => count,
        };
    }

    const counter = makeCounter();
    counter.increment();
    console.log(counter.get()); // 1
}
```

Perry performs closure conversion — captured variables are stored in heap-allocated closure objects.

## Async/Await

```typescript
async function asyncAwaitDemo(): Promise<void> {
    interface Profile { id: number; name: string }

    async function fetchUser(id: number): Promise<Profile> {
        // The docs example uses fetch(...) here; we inline a synthetic
        // result so the snippet compiles and runs hermetically.
        return { id, name: `user-${id}` }
    }

    const data = await fetchUser(1);
    console.log(`async-await: id=${data.id} name=${data.name}`)
}
```

Perry compiles async functions to a state machine backed by Tokio's async runtime.

## Promises

```typescript
async function promisesDemo(): Promise<void> {
    const p = new Promise<number>((resolve, reject) => {
        resolve(42);
    });

    p.then((value) => console.log(value));

    // Promise.all
    const results = await Promise.all([
        Promise.resolve("a"),
        Promise.resolve("b"),
    ]);

    console.log(`promises: results=${results.length}`)
}
```

## Generators

```typescript
function generatorsDemo(): void {
    function* range(start: number, end: number) {
        for (let i = start; i < end; i++) {
            yield i;
        }
    }

    for (const n of range(0, 10)) {
        console.log(n);
    }
}
```

## Map and Set

```typescript
function mapSetDemo(): void {
    const map = new Map<string, number>();
    map.set("a", 1);
    map.get("a");
    map.has("a");
    map.delete("a");
    map.size;

    const set = new Set<number>();
    set.add(1);
    set.has(1);
    set.delete(1);
    set.size;

    console.log(`map-set: map_size=${map.size} set_size=${set.size}`)
}
```

## Regular Expressions

```typescript
function regexDemo(): void {
    const re = /hello\s+(\w+)/;
    const match = "hello world".match(re);

    if (re.test("hello perry")) {
        console.log("Matched!");
    }

    const replaced = "hello world".replace(/world/, "perry");

    console.log(`regex: match=${match !== null} replaced=${replaced}`)
}
```

## Error Handling

```typescript
function errorsDemo(): void {
    try {
        throw new Error("something went wrong");
    } catch (e: any) {
        console.log(e.message);
    } finally {
        console.log("cleanup");
    }
}
```

## JSON

```typescript
function jsonDemo(): void {
    const obj = JSON.parse('{"key": "value"}');
    const str = JSON.stringify(obj);
    const pretty = JSON.stringify(obj, null, 2);

    console.log(`json: str_len=${str.length} pretty_len=${pretty.length}`)
}
```

## typeof and instanceof

```typescript
function typeofInstanceofDemo(): void {
    const x: any = "hello"
    if (typeof x === "string") {
        console.log(x.length);
    }

    const obj: any = new Dog("Rex")
    if (obj instanceof Dog) {
        obj.speak();
    }
}
```

`typeof` checks NaN-boxing tags at runtime. `instanceof` walks the class ID chain.

## Modules

ES module syntax is fully supported: named exports, default exports, and
re-exports.

The exporting module:

```typescript
// Named exports
export function helper(x: number): number { return x + 1 }
export const VALUE = 42

// Default export
export default class MyClass {
    name: string
    constructor(name: string) {
        this.name = name
    }
}
```

The importing module:

```typescript
// Default + named imports from a sibling module
import MyClass, { helper, VALUE } from "./utils"

// Re-export
export { helper } from "./utils"
```

## BigInt

```typescript
function bigintDemo(): void {
    const big = BigInt(9007199254740991);
    const result = big + BigInt(1);

    // Bitwise operations
    const and = big & BigInt(0xFF);
    const or = big | BigInt(0xFF);
    const xor = big ^ BigInt(0xFF);
    const shl = big << BigInt(2);
    const shr = big >> BigInt(2);
    const not = ~big;

    console.log(`bigint: result_ok=${result !== null} and_ok=${and !== null} or_ok=${or !== null}`)
}
```

## String Methods

```typescript
function stringMethodsDemo(): void {
    const s = "Hello, World!";
    s.length;
    s.toUpperCase();
    s.toLowerCase();
    s.trim();
    s.split(", ");
    s.includes("World");
    s.startsWith("Hello");
    s.endsWith("!");
    s.indexOf("World");
    s.slice(0, 5);
    s.substring(0, 5);
    s.replace("World", "Perry");
    s.repeat(3);
    s.charAt(0);
    s.padStart(20);
    s.padEnd(20);

    console.log(`string-methods: ${s.toUpperCase()}`)
}
```

## Math

```typescript
function mathDemo(): void {
    Math.floor(3.7);
    Math.ceil(3.2);
    Math.round(3.5);
    Math.abs(-5);
    Math.max(1, 2, 3);
    Math.min(1, 2, 3);
    Math.sqrt(16);
    Math.pow(2, 10);
    Math.random();
    Math.PI;
    Math.E;
    Math.log(10);
    Math.sin(0);
    Math.cos(0);

    console.log(`math: floor=${Math.floor(3.7)} sqrt=${Math.sqrt(16)}`)
}
```

## Date

```typescript
function dateDemo(): void {
    const now = Date.now();
    const d = new Date();
    d.getTime();
    d.toISOString();

    console.log(`date: now_positive=${now > 0}`)
}
```

## Console

```typescript
function consoleDemo(): void {
    console.log("message");
    console.error("error");
    console.warn("warning");
    console.time("label");
    console.timeEnd("label");
}
```

## Garbage Collection

Perry includes a mark-sweep garbage collector. It runs automatically when memory pressure is detected (~8MB arena blocks), but you can also trigger it manually:

```typescript
function gcDemo(): void {
    gc(); // Explicit garbage collection
}
```

The GC uses conservative stack scanning to find roots and supports arena-allocated objects (arrays, objects) and malloc-allocated objects (strings, closures, promises, BigInts, errors).

## JSX/TSX

Perry's parser and HIR understand JSX syntax (parsed via SWC, lowered in
`crates/perry-hir/src/jsx.rs`) and `.tsx` files link through Perry's built-in
`jsx()` / `jsxs()` runtime path. You do not need a local
`react/jsx-runtime` package just to compile TSX.

```tsx
import { Box, Text } from "perry/tui";

function Greeting({ name }: { name: string }) {
  return <Text>{`Hello, ${name}!`}</Text>;
}

const page = <div className="card"><Greeting name="Perry" /></div>;
const app = <Box><Greeting name="TUI" /></Box>;
```

JSX elements are transformed to function calls via the `jsx()` / `jsxs()`
runtime. Perry's built-in adapter supports HTML-style intrinsic tags,
fragments, function components, and compile-time rewrites for `perry/tui`
`Box` / `Text` so those TUI JSX forms lower to the same native builders as the
function-call form.

Caveat: this is Perry's TSX runtime, not React DOM or full React reconciler
semantics. For `perry/ui`, or for `perry/tui` intrinsics whose JSX rewrite has
not landed yet, the function-call form remains the canonical native API.

## JavaScript (`.js`) Input

Perry is a TypeScript compiler, but TypeScript is a superset of JavaScript — so
Perry also compiles plain JavaScript. `.js`, `.cjs`, `.mjs`, and `.jsx` files are
parsed as JavaScript (decorators, JSX, and import attributes enabled) and lowered
through the exact same native pipeline as `.ts`. No type annotations are required.

```bash
perry compile src/main.js -o myapp
./myapp
```

There are no guarantees for every dynamic JavaScript pattern (the
[Limitations](https://docs.perryts.com/language/limitations.html) still apply — no `eval`, no general dynamic
`require()`), but most plain JavaScript projects compile and run.

## Node.js Compatibility

Perry implements a large, real (non-stub) slice of the Node.js standard library —
`fs`, `http`/`https`/`http2`, `net`/`tls`, `dns`/`dgram`, `crypto`, `stream`
(+ `stream/web`), `events`, `child_process`, `cluster`, `worker_threads`, `zlib`,
`process`, `async_hooks` / `AsyncLocalStorage`, `Atomics` / `SharedArrayBuffer`,
and the WHATWG web globals (`fetch`, `URL`, streams, `structuredClone`,
WebCrypto, …). Against Node's own test suite (node v26, 53 `node:*` modules)
Perry passes ~97% of cases, with overall Node/TypeScript compatibility around
95%. The per-module surface and remaining gaps are tracked in
`docs/runtime-parity-gaps.md`.

## Next Steps

- [Type System](https://docs.perryts.com/language/type-system.html) — Type inference and checking
- [Limitations](https://docs.perryts.com/language/limitations.html) — What's not supported yet


---

<!-- source: docs/src/language/type-system.md -->

# Type System

Perry erases types at compile time, similar to how `tsc` removes type annotations when emitting JavaScript. However, Perry also performs type inference to generate efficient native code.

## Type Inference

Perry infers types from expressions without requiring annotations:

```typescript
function inferenceBasics(): void {
    let x = 5;           // inferred as number
    let s = "hello";     // inferred as string
    let b = true;        // inferred as boolean
    let arr = [1, 2, 3]; // inferred as number[]

    console.log(`inference: x=${x} s=${s} b=${b} arr_len=${arr.length}`)
}
```

Inference works through:
- **Literal values**: `5` → `number`, `"hi"` → `string`
- **Binary operations**: `a + b` where both are numbers → `number`
- **Variable propagation**: if `x` is `number`, then `let y = x` is `number`
- **Method returns**: `"hello".trim()` → `string`, `[1,2].length` → `number`
- **Function returns**: user-defined function return types are propagated to callers

```typescript
function inferenceFunction(): void {
    function double(n: number): number {
        return n * 2;
    }
    let result = double(5); // inferred as number

    console.log(`inference-function: result=${result}`)
}
```

## Type Annotations

Standard TypeScript annotations work:

```typescript
interface Config {
    port: number;
    host: string;
}

function annotations(): void {
    let name: string = "Perry";
    let count: number = 0;
    let items: string[] = [];

    function greet(name: string): string {
        return `Hello, ${name}`;
    }

    const cfg: Config = { port: 8080, host: "localhost" }
    console.log(`annotations: ${greet(name)} count=${count} items=${items.length} port=${cfg.port}`)
}
```

## Utility Types

Common TypeScript utility types are erased at compile time (they don't affect code generation):

```typescript
type MyPartial<T> = { [P in keyof T]?: T[P] };
type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
type MyRecord<K extends string, V> = { [P in K]: V };
type MyOmit<T, K extends keyof T> = MyPick<T, Exclude<keyof T, K>>;
type MyReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never;
type MyReadonly<T> = { readonly [P in keyof T]: T[P] };
```

These are all recognized and erased — they won't cause compilation errors.

## Generics

Generic type parameters are erased:

```typescript
function identity<T>(value: T): T {
    return value;
}

class Box<T> {
    value: T;
    constructor(value: T) {
        this.value = value;
    }
}

function genericsDemo(): void {
    const box = new Box<number>(42);
    const id = identity<string>("hello")
    console.log(`generics: box.value=${box.value} id=${id}`)
}
```

At runtime, all values are NaN-boxed — the generic parameter doesn't affect code generation.

## Type Checking with `--type-check`

For stricter type checking, Perry can integrate with Microsoft's TypeScript checker:

```bash
perry file.ts --type-check
```

This resolves cross-file types, interfaces, and generics via an IPC protocol. It falls back gracefully if the type checker is not installed.

Without `--type-check`, Perry relies on its own inference engine, which handles common patterns but doesn't perform full TypeScript type checking.

## Union and Intersection Types

Union types are recognized syntactically but don't affect code generation:

```typescript
type StringOrNumber = string | number;

function process(value: StringOrNumber) {
    if (typeof value === "string") {
        console.log(value.toUpperCase());
    } else {
        console.log(value + 1);
    }
}
```

Use `typeof` checks for runtime type narrowing.

## Type Guards

```typescript
function isString(value: any): value is string {
    return typeof value === "string";
}

function typeGuardsDemo(): void {
    const x: any = "hello"
    if (isString(x)) {
        console.log(x.toUpperCase());
    }
}
```

The `value is string` annotation is erased, but the `typeof` check works at runtime.

## Next Steps

- [Supported Features](https://docs.perryts.com/language/supported-features.html) — Complete feature list
- [Limitations](https://docs.perryts.com/language/limitations.html) — What's not supported


---

<!-- source: docs/src/language/native-values.md -->

# Native Layout Values

Perry keeps ordinary TypeScript values ordinary. A `number` still has
JavaScript number semantics, and normal objects and arrays remain managed
values. At boundaries where byte width and C-compatible layout are part of
correctness, `perry/native` provides an explicit, opt-in contract.

```typescript,no-test
import {
  i8,
  i16,
  u8,
  u16,
  i32,
  u32,
  u64,
  f32,
  isize,
  type pod,
  type PodView,
  NativeArena,
  sizeof,
  alignof,
  offsetof,
} from "perry/native";

const opcode = u8(inputOpcode);
const delta = i8(inputDelta);
const port = u16(inputPort);
const flags = u32(inputFlags);
const sequence = u64(inputSequence);
const gain = f32(inputGain);

type PacketHeader = pod<{
  flags: u32;
  sequence: u64;
  gain: f32;
}>;

const header: PacketHeader = {
  flags: u32(inputFlags),
  sequence: u64(inputSequence),
  gain: f32(inputGain),
};

const byteLength = sizeof<PacketHeader>();
const alignment = alignof<PacketHeader>();
const sequenceOffset = offsetof<PacketHeader>("sequence");

const arena = NativeArena.alloc(byteLength * 16);
const headers: PodView<PacketHeader> = arena.podView(0, 16);

console.log(byteLength, alignment, sequenceOffset, headers.length);
arena.dispose();
```

## Supported scalar layouts

The public profile exposes the native representations the POD and native ABI
verifier supports:

| Type | Native representation |
|---|---|
| `i8` | signed 8-bit integer |
| `i16` | signed 16-bit integer |
| `u8`, `byte` | unsigned 8-bit integer (`byte` is a type alias) |
| `u16` | unsigned 16-bit integer |
| `i32` | signed 32-bit integer |
| `i64` | signed 64-bit integer |
| `u32` | unsigned 32-bit integer |
| `u64` | unsigned 64-bit integer |
| `usize` | target pointer-sized unsigned integer |
| `isize` | target pointer-sized signed integer |
| `f32` | IEEE-754 binary32 |
| `f64` | IEEE-754 binary64 |

These names replace the internal-looking `PerryI32`, `PerryU64`,
`PerryF32`, and related spellings in new application code. The old names
remain available as compatibility aliases.

Each scalar name is both a type and a checked conversion function. Integer
conversions accept only finite integral values in range; unsigned conversions
also reject negative values. Because standalone results remain
JavaScript-compatible numbers, `i64`, `u64`, `isize`, and `usize` reject values outside
the safe-integer range rather than returning an imprecise number. `f32` makes
binary32 rounding explicit and rejects values that are non-finite before or
after rounding; `f64` validates that its input is finite. A non-number throws a
`TypeError`; an unrepresentable number throws a `RangeError`.

```typescript,no-test
import { i8, i16, u8, u16, i32, u32, u64, isize, f32 } from "perry/native";

const delta = i8(dynamicDelta);
const offset16 = i16(dynamicOffset);
const opcode = u8(dynamicOpcode);
const port = u16(dynamicPort);
const offset = i32(dynamicOffset);
const count = u32(dynamicCount);
const sequence = u64(dynamicSequence);
const pointerDelta = isize(dynamicPointerDelta);
const ratio = f32(computation);
```

The scalar aliases establish representation inside a `pod` layout and at
supported native ABI boundaries. A matching checked conversion may initialize
a POD field from a dynamic value without forcing the whole record back to an
ordinary object; the conversion guard runs before the value enters the native
record. They do not change standalone TypeScript arithmetic: operators still
follow ordinary JavaScript number rules unless an explicit checked conversion
is used. The brand records intent for POD layout and native boundaries; it is
not a second runtime number object.

## POD records

`pod<T>` asks the compiler to verify a C-layout record. The supported field
set is deliberately narrow:

- the scalar aliases listed above;
- ordinary `number`, represented as `f64`;
- nested `pod` records; and
- compatible legacy `Perry*` native scalar markers.

Managed or pointer-bearing values such as `string`, normal arrays, class
instances, closures, promises, maps, and sets are rejected as POD fields.
Field order is source order. Perry computes target C alignment and padding;
`sizeof`, `alignof`, and `offsetof` become compile-time constants and require
an explicit POD type argument. `offsetof` also requires a string-literal field
path, with dotted paths accepted for nested records.

POD layout uses the target's native byte order. It does not define a portable
serialization format; use `DataView` or another explicit encoder when stored
or transmitted bytes require a specified endianness.

POD assignment has value semantics. `const copy = header` snapshots the
declared scalar fields into independent storage, so later property writes do
not alias the original. Passing a standalone POD to an ordinary function also
passes an independent value, even when the compiler would otherwise inline
that function. Nested object initializers are flattened recursively according
to the declared layout. `PodView<T>` is different: it is an explicit view over
arena storage and aliases that storage by design.

## Materialization and optimization guarantees

The checked value and layout behavior above is stable language contract. The
compiler may keep a proven POD local or scalar in native storage, but that is
an optimization rather than an observable promise. Passing values through an
ordinary TypeScript function, array, object, or other managed API may
materialize JavaScript-compatible numbers or objects. Materialization must
preserve the checked value; in particular, no `i64`, `u64`, `isize`, or
`usize` conversion can silently introduce an imprecise JavaScript number.

At a `perry.nativeLibrary` boundary, manifest descriptors restore the exact C
ABI width and signedness. A manifest POD may reference the exported TypeScript
`pod<T>` declaration; compilation and `perry native validate` reject drift in
field type or order before generating a call. See [Native Library Manifest
v1](https://docs.perryts.com/native-libraries/manifest-v1.html#functions).

## Arena ownership

`NativeArena.alloc` owns a fixed native allocation. `view` creates a typed
array view and `podView` creates a `PodView<T>` over that allocation. Byte
offsets, lengths, alignment, and disposal are checked by the existing native
memory verifier and runtime guards.

Call `dispose()` when the allocation is no longer needed. Access through a
view after disposal is an error. `PodView` is currently exposed as read-only;
mutable borrowed POD views are not yet part of the public contract.


---

<!-- source: docs/src/language/decorators.md -->

# Decorators

This page states Perry's stance on TypeScript decorators and shows the
recommended decorator-free pattern for porting Angular / NestJS / TypeORM
code.

## Stance

**Perry treats decorators as a legacy compatibility surface, not a
language primitive.** The TypeScript ecosystem has been steadily
migrating away from decorators since around 2020 — modern frameworks
like Drizzle, Hono, tRPC, Prisma, Zod, SolidJS, and Vue 3's Composition
API use plain functions and schema-as-code. Even Angular's Ivy compiler
already AOT-deletes most decorator metadata at build time, and TC39's
new stage-3 decorator spec deliberately drops the runtime type
reflection that NestJS and TypeORM rely on.

Perry still follows the modern direction: types are erased at compile
time (see [Limitations](https://docs.perryts.com/language/limitations.html)) and there is no runtime DI
container. A small legacy compatibility path exists for libraries that
only need AOT-lowerable decorator side effects and metadata.
Code that depends on richer decorator behavior still needs one of the
patterns below.

## What works today

Perry parses legacy / experimental TypeScript decorator syntax and
supports two paths:

- **Legacy class decorators, method decorators, property decorators,
  constructor parameter decorators, and method parameter decorators** for
  Nest-style DI and route metadata canaries. Decorator functions run for
  side effects, `Reflect.defineMetadata`, `Reflect.getMetadata`,
  `Reflect.getOwnMetadata`, `Reflect.hasMetadata`,
  `Reflect.hasOwnMetadata`, `Reflect.getMetadataKeys`,
  `Reflect.getOwnMetadataKeys`, `Reflect.deleteMetadata`, and
  `@Reflect.metadata(...)` are available. Perry emits
  `design:paramtypes` for decorated classes/methods and `design:type`
  for decorated properties. A member decorator receives the same
  `target` `tsc` hands it: `Class.prototype` for an instance member and
  the constructor for a static one, so the NestJS idiom
  `Reflect.defineMetadata(key, value, target.constructor)` lands on the
  class, and `Class.constructor === Function` as in node.
- **Compile-time-only transforms.** The bundled `@log` transform is the
  canonical example — it rewrites a decorated method into a wrapper that
  prints entry/exit at compile time, with zero runtime decorator
  machinery. See `crates/perry-hir/src/decorator_log.rs` for the
  implementation.

## What does not work

- Accessor decorators and descriptor replacement
- Decorator class replacement return values. If a class decorator
  returns anything other than `undefined`, Perry throws a `TypeError`
  at decorator application time. Real-world decorators like
  `@Memoize`, `@Throttle`, and GraphQL resolver wrappers that return
  wrapped classes need a Perry-aware port — the lowered class is fixed
  in the IR and cannot be replaced at runtime.
- General `Reflect.metadata(...)` helper calls outside decorator syntax
- `Symbol(...)` as a metadata key
- `emitDecoratorMetadata` beyond class/method `design:paramtypes` and
  property `design:type`
- Runtime DI containers that resolve dependencies by type
  beyond the reduced class-constructor canary (`tsyringe`, full NestJS
  injector behavior, Angular's root injector)
- `class-validator`, `type-graphql`, `TypeORM` runtime metadata flows

If your code depends on any of these, the port path is still explicit
wiring or a dedicated AOT transform, not relying on the full legacy
TypeScript decorator runtime.

## Recommended pattern: explicit construction

The Perry-native idiom is plain classes wired together in a single
`services.ts` module in dependency order. This is how a Go or Rust
program would compose services, and it is how decorator-free TS
frameworks (Hono, tRPC servers, Drizzle apps) already work.

```typescript,no-test
// services.ts
export const api = new ApiService();
export const rating = new RatingService(api);
export const chat = new ChatService(api, rating);
```

There is no container, no `@Injectable`, no `providedIn: 'root'` —
construction order *is* the dependency graph, and it is checked by the
TypeScript compiler.

## Migration recipe: an Angular service

The example below is a real service from sharity-app
(`src/app/services/rating.service.ts`, ~80 lines), shown in its
original Angular form and ported to Perry.

### Before — Angular

```typescript,no-test
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Rating } from '../models/user';

@Injectable({
  providedIn: 'root'
})
export class RatingService {
  private basePath = '/api/ratings';

  constructor(private api: ApiService) { }

  getUserRatings(userId: string): Observable<any> {
    return this.api.get(`${this.basePath}/user/${userId}`);
  }

  createRating(recipientId: string, rating: { stars: number; comment?: string }): Observable<any> {
    return this.api.post(this.basePath, {
      recipientId,
      stars: rating.stars,
      comment: rating.comment,
    });
  }

  calculateAverageRating(ratings: Rating[]): number {
    if (!ratings || ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, curr) => acc + curr.rating, 0);
    return sum / ratings.length;
  }
}
```

### After — Perry

Three mechanical changes:

1. **Drop `@Injectable`.** It carried no information that the class shape
   does not already carry.
2. **Replace `Observable<T>` with `Promise<T>`** for HTTP calls. Most
   Angular Observables-from-HTTP are single-value and behave like
   Promises. (For multi-value streams, use `AsyncIterable`.)
3. **Replace constructor-parameter properties** (`private api: ApiService`)
   with explicit field declarations. Perry supports parameter
   properties, but explicit fields read more clearly when the class is
   instantiated by hand rather than by a container.

```typescript,no-test
import { ApiService } from './api.service';
import { Rating } from '../models/user';

export class RatingService {
  private basePath = '/api/ratings';
  private api: ApiService;

  constructor(api: ApiService) {
    this.api = api;
  }

  async getUserRatings(userId: string): Promise<unknown> {
    return this.api.get(`${this.basePath}/user/${userId}`);
  }

  async createRating(
    recipientId: string,
    rating: { stars: number; comment?: string },
  ): Promise<unknown> {
    return this.api.post(this.basePath, {
      recipientId,
      stars: rating.stars,
      comment: rating.comment,
    });
  }

  calculateAverageRating(ratings: Rating[]): number {
    if (!ratings || ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, curr) => acc + curr.rating, 0);
    return sum / ratings.length;
  }
}
```

### Wiring

```typescript,no-test
// services.ts — single source of truth for service construction
import { ApiService } from './services/api.service';
import { RatingService } from './services/rating.service';

export const api = new ApiService();
export const rating = new RatingService(api);
```

```typescript,no-test
// any consumer
import { rating } from './services';

const avg = rating.calculateAverageRating(myRatings);
const list = await rating.getUserRatings('user-123');
```

That is the entire migration. The `@Injectable` decorator, the
`providedIn: 'root'` token, the implicit container lookup — all of it
collapses into one `new RatingService(api)` line in `services.ts`.

## What about Angular components, NestJS controllers, TypeORM entities?

Perry's reduced legacy path is enough for small Nest-style
constructor-injection and route-metadata canaries, but it is not full
Angular, NestJS, or TypeORM compatibility. The Path-B option of
recognizing `@Component` / `@Controller` / `@Entity` at the compiler
level (analogous to Angular Ivy's AOT step) is reserved for if and when
a concrete port needs it — see closed [issue #581][issue-581] for the design
discussion. For now, the recommendation is the same: drop the decorator
where possible, write the equivalent explicit construction, register
routes or schema as plain function calls / module-level constants.

[issue-581]: https://github.com/PerryTS/perry/issues/581

## Future direction

New feature work should prefer the [TC39 stage-3 form][tc39-decorators]
because it aligns better with Perry's "types erased, compile to native"
architecture. The legacy TypeScript path exists for compatibility and
will stay focused on narrow AOT-lowerable metadata cases rather than
becoming a full `tsc` decorator runtime.

[tc39-decorators]: https://github.com/tc39/proposal-decorators


---

<!-- source: docs/src/language/limitations.md -->

# Limitations

Perry compiles a practical subset of TypeScript. This page documents what's not supported or works differently from Node.js/tsc.

## No Runtime Type Validation

Declared TypeScript types are not enforced at runtime — Perry doesn't generate
type guards from annotations, so a parameter typed `string` will accept a number
without throwing.

```typescript
function someFunction(): number {
    return 42
}

function erasedTypes(): void {
    // These annotations are erased — no runtime effect
    const x: number = someFunction(); // No runtime check that result is actually a number
    console.log(`erased-types: x=${x}`)
}
```

Annotations are mostly erased, with one exception: when `emitDecoratorMetadata`
applies, the `design:type` / `design:paramtypes` reflection metadata is derived
from the annotations on decorated members and survives to runtime (see
[Decorators](https://docs.perryts.com/language/decorators.html)). Runtime type *discrimination* is available via
explicit `typeof` checks and `instanceof`.

## No eval() or Dynamic Code

Perry compiles to native code ahead of time. It cannot evaluate a code string
that is only known at runtime. A *constant* code string is the exception —
`eval("1 + 1")` and `new Function("a", "b", "return a + b")` are compiled to
real native functions (#1679). Only a body built from runtime data hits this
limit:

```typescript,no-test
// Constant body → compiled natively (works)
const add = new Function("a", "b", "return a + b");

// Runtime-built body → cannot be compiled ahead of time
function run(src: string) { return new Function(`return (${src})`)(); }
```

### Default: deferred runtime error + compile-time notice (#5206)

By default a runtime-unknown `eval(...)` / `new Function(<dynamic body>)` site
does **not** block the build. Perry compiles it to a value that throws a
descriptive `Error` *only if it is actually reached* (an `eval(...)` throws when
evaluated; a `new Function(...)` returns a function that throws when called),
and prints a single end-of-compile notice listing every degraded site:

```text
notice: 3 ahead-of-time-unsupported site(s) compiled to a deferred runtime error (throws only if reached):
  - eval(...)           src/foo.ts:12
  - import(...)          src/plugins/loader.ts:88
  - new Function(...)    src/cli/cmd/debug/agent.handler.ts:41
  Pass --strict-eval/--strict-dynamic-import (or set perry.strict = true) to make these a compile-time error instead.
```

This lets a single such call in a cold path ship without aborting the whole
build, while still failing loudly (and catchably) if that path runs.

### Dynamic `import()` with a runtime-computed specifier (#5230)

A dynamic `import(spec)` whose `spec` is only known at runtime (a plugin loader
building a path from a variable) is subject to the **same defer/notice/strict
policy** as `eval`. By default it compiles to a rejected `Promise` carrying a
descriptive `Error` (so `await import(spec)` throws *only if reached*), is
listed in the shared notice above under the `import(...)` kind, and does **not**
abort the build. This lets an app with a plugin-loader path compile and run its
core, with only the plugin-load path throwing if exercised.

Resolvable specifiers are unaffected and still compile + load: string literals
(`import("./mod.js")`), ternaries of resolvable arms, template literals over
`const` locals (`` import(`./${KIND}.js`) ``), finite string-literal-union
parameters, and directory globs.

```typescript,no-test
// Resolvable → compiled + loaded as today.
const real = await import("./real.js");

// Runtime-computed → deferred (default): throws only if this line runs.
async function loadPlugin(name: string) {
  return await import(name + ".js");
}
```

### Strict mode: refuse at compile time

To make every runtime-unknown site a hard compile-time error instead, opt into
strict-eval mode by any of:

- the `--strict-eval` flag on `perry compile`,
- `"perry": { "eval": "error" }` (or `"perry": { "strict": true }`) in
  `package.json`, or
- `[perry]` `eval = "error"` (or `strict = true`) in `perry.toml`.

`perry.eval` accepts `"defer"` (the default) or `"error"`. Precedence is
package.json/perry.toml config → `--strict-eval` (opts in). The legacy
`PERRY_ALLOW_EVAL=1` environment variable still works: it forces non-strict
(defer) mode for a one-off build, overriding any strict flag/config.

The same strict controls apply to runtime-computed dynamic `import()` (#5230).
The broad `perry.strict = true` covers both eval and dynamic import. For a knob
scoped to dynamic imports only, use `--strict-dynamic-import` or
`"perry": { "dynamicImport": "error" }` (accepts `"defer"` (default) or
`"error"`); the dedicated knob overrides the broad `perry.strict` for import
sites. `PERRY_ALLOW_EVAL=1` is the shared AOT escape hatch — it forces defer for
both eval and dynamic import.

Test262 rows that only observe parsing or executing a code string remain
intentional AOT exclusions, not runtime dynamic-code work. This includes the
`language/white-space/comment-{multi,single}-{form-feed,horizontal-tab,nbsp,space,vertical-tab}.js`
rows and the direct-eval reference row `language/types/reference/8.7.2-1-s.js`;
they map to the AOT eval tracker (#1677), eval classifier diagnostics (#1678),
and the limited literal `Function` folding work (#1679).

## Decorators

Perry parses decorator syntax, supports compile-time-only transforms
(see the bundled `@log` example), and has a reduced legacy TypeScript
compatibility path for class decorators, method decorators, constructor
parameter decorators, method parameter decorators, and property
decorators. That path emits `design:paramtypes` for decorated
classes/methods, `design:type` for decorated properties, and implements
`Reflect.defineMetadata`, `Reflect.getMetadata`,
`Reflect.getOwnMetadata`, `Reflect.hasMetadata`,
`Reflect.hasOwnMetadata`, `Reflect.getMetadataKeys`,
`Reflect.getOwnMetadataKeys`, `Reflect.deleteMetadata`, and
`@Reflect.metadata(...)`.

Accessor decorators, descriptor replacement, general
`Reflect.metadata(...)` calls outside decorator syntax, `Symbol`
metadata keys, and full Angular / NestJS / TypeORM runtime metadata flows
are not supported. See [Decorators](https://docs.perryts.com/language/decorators.html) for details and a
worked migration recipe.

## No Runtime Metadata Reflection

Perry implements a small metadata subset for legacy decorators. General
runtime reflection is not supported:

<!-- intentionally-rejects: this snippet documents code Perry refuses to compile -->
```text
Reflect.getMetadata("design:type", target, key);
Reflect.getMetadataKeys(target, key);
// Not supported as a general helper call outside decorator syntax
Reflect.metadata("design:type", String)(target, key);
```

## No User-Space CommonJS require()

Use static ESM imports in Perry source:

<!-- intentionally-rejects: the `require` and dynamic-`import` lines are code Perry refuses to compile -->
```text
// Supported
import { foo } from "./module";

// Not supported
const mod = require("./module");
const mod = await import("./module");
```

Perry has internal CommonJS compatibility paths for some npm package wrappers,
but user-written modules should use static `import` declarations.

> **JavaScript source compiles too.** Perry accepts `.js`, `.cjs`, `.mjs`, and
> `.jsx` files as compiler input — they are parsed as JavaScript and lowered
> through the same native pipeline as TypeScript, so no type annotations are
> required. The limitations on this page still apply (no `eval`, no general
> dynamic `require()`, etc.), but plain JavaScript projects compile and run in
> most cases.

## Prototype Manipulation

Dynamic prototype manipulation is supported for the common patterns:

```typescript,no-test
// Supported
MyClass.prototype.newMethod = function () {};   // prototype method assignment
Object.setPrototypeOf(obj, proto);              // incl. chains of any length
Object.setPrototypeOf(Derived, Base);           // transpiled __extends statics link
Object.getPrototypeOf(obj);                     // inspection
```

Prototype-method assignment routes through a dedicated registry
(`CLASS_PROTOTYPE_METHODS`) and `Object.setPrototypeOf` performs a real,
cycle-checked prototype mutation (a genuine cycle still throws `TypeError`).

Remaining known gaps:

- the assignment form `obj.__proto__ = x` on the dynamic write path stores a
  literal `"__proto__"` property instead of setting the prototype (use
  `Object.setPrototypeOf`);
- an object-literal `{ __proto__: [] }` sets the prototype without throwing,
  but the result is not yet visible to `instanceof` (`… instanceof Array`
  reports `false`).

## Weak References Retain Their Targets

`WeakMap`, `WeakSet`, `WeakRef`, and `FinalizationRegistry` are implemented and
their APIs behave as expected — `set` / `get` / `has` / `delete`, `add`,
`deref()`, and `register` / `unregister` all work and return the right values.
`WeakMap` and `WeakSet` use **reference** equality, so two distinct objects
never collide on the same slot.

The one caveat is that Perry's garbage collector does not yet treat these
references as *weak*, so targets are **retained rather than collected**. The
current runtime stores `WeakRef` targets and `FinalizationRegistry`
registrations in ordinary object/array fields (`crates/perry-runtime/src/weakref.rs`),
and the adjacent GC root scanners do not have a weak-slot clearing/finalizer
queue hook yet. In practice:

- `WeakRef.deref()` always returns the original target (it is never reported as
  collected).
- `FinalizationRegistry` records registrations but never fires its cleanup
  callback.
- `WeakMap` / `WeakSet` keep their keys alive (they behave like a
  reference-keyed `Map` / `Set`).

This is safe for **correctness** — code that reads through these APIs gets the
right values. It only matters if you depend on collection *timing* to reclaim
memory or to run finalizer side effects.

## Limited Proxy Trapping

Proxy support is not a full engine-level trap layer for every possible dynamic
object access. Prefer plain objects and explicit APIs unless a package only
needs Perry's supported Proxy surface.

## Threading Model

Perry supports real multi-threading via `parallelMap` and `spawn` from `perry/thread`. See [Multi-Threading](https://docs.perryts.com/threading/overview.html).

Threads do not share mutable state by default — closures passed to thread
primitives cannot capture mutable variables (enforced at compile time), and
values are deep-copied across thread boundaries. The exception is
`SharedArrayBuffer`: a SAB captured into a `spawn` / `parallelMap` closure now
**aliases the same physical bytes** across agents, and `Atomics`
(`add`/`load`/`store`/`compareExchange`/… plus a real blocking
`wait`/`notify`/`waitAsync`) operate on it for genuine cross-thread coordination.
Caveat: only the `SharedArrayBuffer` itself shares — a typed-array *view*
captured directly still deep-copies, so build the view per-agent from the shared
SAB.

## WebAssembly (#6558)

Perry ships **no WebAssembly engine** in the default build. The adopted
policy is that **WASM-dependent features degrade gracefully**. Closed issue
[#6558](https://github.com/PerryTS/perry/issues/6558) records that decision and
the per-module replacement policy; it is not an active promise to add a full
engine to the default binary.

The `WebAssembly` global is spec-shaped — every standard member exists with
the correct type and arity — and fails cleanly rather than crashing:

- `WebAssembly.compile` / `compileStreaming` / `instantiate` /
  `instantiateStreaming` return a Promise **rejected** with a
  `WebAssembly.CompileError` whose message points at #6558.
- `WebAssembly.validate(bytes)` returns `false` — the honest answer for
  "can I run this module here".
- `new WebAssembly.Module(...)` throws `CompileError` synchronously;
  `Instance` throws `LinkError`; `Table` / `Global` throw `RuntimeError`.
- `new WebAssembly.Memory({ initial })` genuinely works (a real zero-filled
  `ArrayBuffer` backs it, and `grow()` is supported), so feature-detection
  code that allocates a page succeeds.
- `CompileError` / `LinkError` / `RuntimeError` are real error constructors
  (`instanceof Error` and `instanceof WebAssembly.CompileError` both work).

In practice this means lazy wasm consumers — wasm-bindgen loaders like
`@silvia-odwyer/photon-node`, `@jsquash/webp` decoders, undici's llhttp
probe — hit their own catch/fallback paths and the app keeps running with
that feature degraded.

When the wasmi host is linked, `new WebAssembly.Module(bytes)` and the
synchronous `new WebAssembly.Instance(module, imports)` constructor execute
real modules in Perry's numeric function/import subset. This includes WASM
bytes exposed through the embedded `import ... with { type: "file" }` loader;
the JS-visible `memory.buffer` is synchronized before and after calls,
numeric multi-value results use the standard array shape, and exported
`externref` tables support `get`, `set`, and `grow`. Imported tables/memories,
globals, general reference-valued function signatures, and streaming remain
outside that subset.

Two spellings, two paths:

- **Namespace access** (`const WA = globalThis.WebAssembly; WA.compile(...)`,
  which is also what minified bundles evaluate through a namespace value)
  uses the graceful surface above and needs nothing at link time.
- **Literal static calls** (`WebAssembly.instantiate(bytes)` written against
  the global) lower to the opt-in wasmi host runtime (issue #76,
  `--enable-wasm-runtime`, auto-linked when usage is detected). These run
  real WebAssembly through the wasmi interpreter but require
  `libperry_wasm_host.a` to be built (`cargo build --release -p
  perry-wasm-host`); without it the build fails with that instruction.

## npm Package Compatibility

Not all npm packages work with Perry:

- **Natively supported**: ~50 popular packages (fastify, mysql2, redis, etc.) — these are compiled natively. See [Standard Library](https://docs.perryts.com/stdlib/overview.html).
- **`compilePackages`**: Pure TS/JS packages can be compiled natively via [configuration](https://docs.perryts.com/getting-started/project-config.html).
- **Not supported**: Packages requiring native addons (`.node` files), `eval()`, dynamic `require()`, or Node.js internals.

## Workarounds

### Dynamic Behavior

For cases where you need dynamic behavior, use the JavaScript runtime fallback:

<!-- intentionally-rejects: `jsEval` is a hypothetical helper used to illustrate the QuickJS escape-hatch shape; not a stable API -->
```text
import { jsEval } from "perry/jsruntime";
// Routes specific code through QuickJS for dynamic evaluation
```

### Type Narrowing

Since there's no runtime type checking, use explicit checks:

```typescript
function processValue(value: string | number) {
    // Instead of relying on type narrowing from generics
    if (typeof value === "string") {
        // String path
        console.log(`string path: ${value}`)
    } else if (typeof value === "number") {
        // Number path
        console.log(`number path: ${value}`)
    }
}
```

## Next Steps

- [Supported Features](https://docs.perryts.com/language/supported-features.html) — What does work
- [Type System](https://docs.perryts.com/language/type-system.html) — How types are handled
