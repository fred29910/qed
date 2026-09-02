<!-- Perry docs bundle: tui.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/tui/overview.md -->

# Terminal UI Overview

`perry/tui` is a native terminal-UI engine built into the Perry runtime. It targets the same use cases as [ink](https://github.com/vadimdemedes/ink) (interactive CLIs, dashboards, REPLs, log viewers) but compiles to native code — no Node, no React reconciler, no fiber tree. Your code runs as a single static binary that does a double-buffered ANSI diff each frame.

## When to use `perry/tui`

| You want… | Use |
|---|---|
| An interactive CLI tool (prompts, menus, live progress) | **`perry/tui`** |
| A long-running terminal dashboard / log viewer | **`perry/tui`** |
| A native desktop / mobile app | [`perry/ui`](https://docs.perryts.com/ui/overview.html) |
| A one-shot script that just prints to stdout | Plain `console.log` |

`perry/tui` enters the terminal's [alternate screen buffer](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-The-Alternate-Screen-Buffer) (so your scrollback isn't polluted), captures raw-mode keypresses, and re-renders only the cells that changed between frames. The cell grid is a packed `Vec<Cell>` so an 80×24 terminal fits in ~15 KB — well within L2.

## Quick Start

The smallest interactive `perry/tui` program — a counter that increments on `+`, decrements on `-`, and quits on `q`:

```typescript,no-test
import { Box, Text, useState, useInput, run, exit } from "perry/tui";

run(() => {
    const [n, setN] = useState(0);

    useInput((s: string) => {
        if (s === "+") setN(n + 1);
        if (s === "-") setN(n - 1);
        if (s === "q") exit();
    });

    return Box([Text("count: " + n)]);
});
```

Compile and run:

```bash
perry compile app.ts -o app && ./app
```

The component closure is called every render. Hooks (`useState`/`useInput`/etc.) bind to a per-frame call-site index so the second render's `useState(0)` at the same position reads back what the first render wrote — same model as React. The run loop re-renders when any state setter is called and idles between renders.

## Mental Model

Perry's TUI uses the same authoring model as ink:

- **Components are functions** that return a widget tree. The function is called every render; the tree it returns is diffed against the previous frame's tree and only changed terminal cells get rewritten.
- **State lives in hooks** (`useState`, `useRef`, `useMemo`). A change triggers a re-render automatically.
- **Layout uses flexbox** (powered by [Taffy](https://github.com/DioxusLabs/taffy)) — `flexDirection: "row" | "column"`, `gap`, `padding`, `justifyContent`, `alignItems`, `flexGrow`, etc.

If you've used ink, the only real difference at the surface is the **factory call form** — `Box({…opts}, [children])` instead of `<Box>…</Box>` JSX. JSX works for user-defined component functions today (`<App />` calls `App(props)`), but the `<Box>` / `<Text>` intrinsics still need the function-call form until a compile-time JSX→intrinsic rewriter lands.

## Architecture in one paragraph

`run(component)` enters the alt screen, enables raw mode on stdin, spawns a reader thread, and loops: reset hook index → call the component closure → diff the returned widget tree against the front buffer → emit minimal ANSI to reconcile → drain pending keypresses (dispatching to `useInput` handlers and the focus ring) → if any state changed, immediately re-render; else idle 16 ms. Exit happens when `exit()` (or `useApp().exit()`) flips a flag the loop checks at the top of every iteration. On exit, raw mode is restored and the alt screen is left so your terminal returns to exactly the state it was in before the program ran.

## What's next

- [Widgets](https://docs.perryts.com/tui/widgets.html) — `Box`, `Text`, `Input`, `List`, `Select`, `Spinner`, `ProgressBar`, `Table`, `Tabs`, and the per-widget style props.
- [Hooks](https://docs.perryts.com/tui/hooks.html) — `useState`, `useEffect`, `useMemo`, `useRef`, `useApp`, `useStdout`, `useFocus`, `useInput`.
- [Examples](https://docs.perryts.com/tui/examples.html) — counter, chat REPL, file picker, log viewer.


---

<!-- source: docs/src/tui/widgets.md -->

# Widgets

`perry/tui` ships ~10 widgets that cover the typical interactive-CLI surface. All of them are factory functions returning a widget handle — pass them to `Box` as children, or to `render(widget)` / `run(() => widget)` as the root.

## `Box(opts?, children?)`

A flexbox container. Holds any number of children laid out by direction, gap, padding, and alignment rules.

```typescript,no-test
import { Box, Text } from "perry/tui";

// Bare children — vertical column by default.
Box([Text("first"), Text("second")]);

// With style.
Box({ flexDirection: "row", gap: 2, padding: 1 }, [
    Text("left"),
    Text("right"),
]);
```

### Style props

| Prop | Type | Notes |
|---|---|---|
| `flexDirection` | `"row" \| "column"` | Default `"column"`. |
| `justifyContent` | `"start" \| "center" \| "end" \| "space-between" \| "space-around"` | Main-axis distribution. |
| `alignItems` | `"start" \| "center" \| "end" \| "stretch"` | Cross-axis alignment. |
| `gap` | `number` | Cells of space between children. |
| `padding` | `number \| { top, right, bottom, left }` | Uniform or per-side. |
| `width` | `number \| string` | Cells, or `"50%"` of parent. |
| `height` | `number \| string` | Cells, or percent. |
| `flexGrow` | `number` | `1` = fill remaining space. |
| `flexShrink` | `number` | `1` = shrink when overflowing. `0` = never shrink. |
| `flexBasis` | `number \| string` | Base size before grow/shrink. |

Children can be a literal array (`[Text("a"), Text("b")]`) or any runtime expression that evaluates to an array — `messages.map(m => Text(m))` works the same.

## `Text(content, style?)`

A text node. Single-line; multi-line strings render with `\n` preserved.

```typescript,no-test
Text("plain");
Text("bold!", { bold: true });
Text("error", { color: "red", bold: true });
Text("subtle", { dimColor: true, italic: true });
Text("removed", { strikethrough: true });
Text("selected", { inverse: true });
Text("custom", { color: "#ff8800", backgroundColor: "#222" });
```

### Style props

| Prop | Type | SGR | Notes |
|---|---|---|---|
| `color` (alias `fg`) | named color or `#rrggbb` | 30-37 / 38;2 | Foreground. |
| `backgroundColor` (alias `bg`) | named color or `#rrggbb` | 40-47 / 48;2 | Background. |
| `bold` | `boolean` | 1 | |
| `dimColor` (alias `dim`) | `boolean` | 2 | |
| `italic` | `boolean` | 3 | |
| `underline` | `boolean` | 4 | |
| `inverse` (alias `reverse`) | `boolean` | 7 | Swaps fg/bg. |
| `strikethrough` | `boolean` | 9 | |

Named colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, plus their `bright*` variants. Truecolor (`#rrggbb`) works on every modern terminal.

## `Spacer()`

A zero-content widget with `flexGrow: 1` baked in. Push siblings to the edges of a flex container without spelling out the grow factor:

```typescript,no-test
Box({ flexDirection: "row" }, [
    Text("left"),
    Spacer(),
    Text("right"),
]);
```

## `Input(value, cursor?)`

A single-line text-input widget. Render a string with an optional inline cursor position (0-indexed); pair with `useState` for the buffer and `useInput` to drive it.

```typescript,no-test
const [buf, setBuf] = useState("");
const [cur, setCur] = useState(0);
useInput((s) => { /* … update buf + cur on keypress … */ });
return Input(buf, cur);
```

`perry/tui` doesn't ship a full line editor — it gives you the rendering primitive and you wire the keys yourself. See the chat REPL in [Examples](https://docs.perryts.com/tui/examples.html) for a typical input loop.

## `TextArea(value)`

A multi-line text widget. Same shape as `Input` but accepts newlines.

## `List(items, selected?)`

A vertically-laid list of strings, with optional highlighted-row index.

```typescript,no-test
List(["Apple", "Banana", "Cherry"], 1);  // "Banana" highlighted
```

## `Select(items, selected?)`

Like `List` but with selection indicators (`▸` next to the focused row).

```typescript,no-test
const [idx, setIdx] = useState(0);
useInput((s) => {
    if (s === "\x1b[A" /* up */ ) setIdx(Math.max(0, idx - 1));
    if (s === "\x1b[B" /* down */) setIdx(Math.min(items.length - 1, idx + 1));
});
return Select(items, idx);
```

## `Spinner(frame)`

A static spinner character — `- \ | /` cycling through frames 0–3. Caller bumps `frame` from a state counter to animate.

```typescript,no-test
const [tick, setTick] = useState(0);
// On every Enter (or however you want to advance):
setTick(tick + 1);
return Box([Spinner(tick), Text(" working…")]);
```

`Spinner(0)` is a static `-` — useful as a stable bullet if you don't want animation.

For true wall-clock animation, see `AnimatedSpinner({ interval, frames })` which runs its own internal tick (it advances when the render loop polls between frames).

## `ProgressBar(filled, total, width?)`

A simple horizontal bar.

```typescript,no-test
ProgressBar(7, 10);          // ████████░░ at default width
ProgressBar(50, 100, 40);    // 40-cell wide bar
```

## `Table({ headers, rows, selected? })`

A bordered table. `headers` is a string array; `rows` is an array of string arrays.

```typescript,no-test
Table({
    headers: ["Name", "Status", "Latency"],
    rows: [
        ["api-east", "OK", "12ms"],
        ["api-west", "DEGRADED", "412ms"],
    ],
    selected: 1,
});
```

## `Tabs({ tabs, active, body })`

A horizontal tab bar over a body widget. `body` is an array parallel to `tabs` — only the active tab's body is rendered.

```typescript,no-test
const [active, setActive] = useState(0);
Tabs({
    tabs: ["Files", "Search", "Settings"],
    active,
    body: [filesView, searchView, settingsView],
});
```

---

For state + event hooks (the React-shape `useState`/`useInput`/`useApp`/etc.), see [Hooks](https://docs.perryts.com/tui/hooks.html). For complete worked examples, see [Examples](https://docs.perryts.com/tui/examples.html).


---

<!-- source: docs/src/tui/hooks.md -->

# Hooks

`perry/tui` implements the React-shape hook API on top of a call-site-indexed slot pool. Each `useXxx` call gets the slot at its position in the component body; the run loop resets the index at the top of every frame, so the second render's `useState` at the same position reads back what the first wrote.

This is the same rule-of-hooks model ink/React use: **call hooks in the same order on every render**. Don't call them inside `if`/loops — the slot index would skew and you'd read the wrong slot. Slot kinds are tagged (`State` / `Effect` / `Memo` / `Ref` / `Focus`); calling `useState` at a position previously used by `useMemo` re-tags the slot rather than corrupting it, but the value resets.

## `useState(initial)`

Per-frame state cell. Returns `[value, setter]`.

```typescript,no-test
const [count, setCount] = useState(0);
// Later, from an input handler:
setCount(count + 1);
```

The setter writes through to the slot's bits and flips a global `STATE_DIRTY` flag — the run loop sees it after `useInput` drains and immediately re-renders without sleeping.

Setting the same value twice (bit-identical) is a no-op — `STATE_DIRTY` stays clear and the loop idles. This avoids the "render storm" pattern where unconditional `setX(prev)` calls would loop forever.

### Stale-closure gotcha

The setter captured by a `useInput` handler reads `value` from **that frame's closure**, not from the slot. If many bytes arrive in one frame (paste, typing fast), the handler fires N times with the same `value`:

```typescript,no-test
const [n, setN] = useState(0);
useInput((s) => { if (s === "+") setN(n + 1); });
// User pastes "+++" — handler fires 3× with n=0, all three set the slot to 1.
```

If you need a functional setter for this case, use `useRef` as a mirror:

```typescript,no-test
const buf = useRef("");
const [, redraw] = useState(0);
useInput((s) => {
    if (s.length === 1 && s >= " " && s <= "~") {
        buf.set(buf.get() + s);     // canonical buffer (no stale capture)
        redraw(buf.get().length);   // trigger re-render
    }
});
```

## `useEffect(fn, deps?)`

Run a side effect after first render, and again whenever a dep changes.

```typescript,no-test
useEffect(() => {
    // Run-once on mount.
    fetchInitialData();
}, []);

useEffect(() => {
    // Re-run whenever `query` changes.
    runSearch(query);
}, [query]);

useEffect(() => {
    // No deps array → run every render. Rarely what you want.
});
```

Deps are compared by bit-identity using an FNV-1a hash of the deps' NaN-boxed values. An empty array `[]` hashes to a stable non-zero value, giving the React "run once" behaviour; passing no array runs the effect every render.

The effect closure runs synchronously inside the component call. Cleanup-on-dep-change (returning a cleanup function) is **not** wired yet — the return value is ignored.

## `useMemo(fn, deps)`

Cache the result of `fn()` keyed by `deps`. Same hash convention as `useEffect`.

```typescript,no-test
const sorted = useMemo(
    () => items.slice().sort((a, b) => a.priority - b.priority),
    [items],
);
```

Recomputes on first call or when `deps` change. Otherwise returns the cached value.

## `useRef(initial)`

A stable mutable cell that doesn't trigger re-renders. Use for values you want to mutate but don't want to drive the UI.

```typescript,no-test
const renderCount = useRef(0);
renderCount.set(renderCount.get() + 1);   // does NOT flip STATE_DIRTY
```

`.get()` reads, `.set(v)` writes. Identity is stable across renders — calling `useRef(0)` at the same position returns the same handle every time, so closures captured in `useEffect` / `useInput` always see the latest value.

Common pattern: use `useRef` as the canonical buffer for input that gets typed at terminal speed, and pair with a throwaway `useState` to trigger redraws (see the stale-closure gotcha above).

## `useApp()`

Returns a handle for imperative control of the run loop.

```typescript,no-test
const app = useApp();
// Later:
app.exit();                    // tells run() to break at the top of the next iteration
await app.waitUntilExit();     // blocks until EXIT_FLAG is set (rare; usually `run` itself blocks)
```

The handle is stable — calling `useApp()` on every render returns the same singleton. Wrap it in `useRef` if you want to stash it for a callback that outlives the render.

## `useStdout()`

Terminal dimensions and a raw-write escape hatch.

```typescript,no-test
const stdout = useStdout();
const cols = stdout.columns();    // terminal width in cells (falls back to 80 if not a TTY)
const rows = stdout.rows();       // height in cells (fallback 24)
stdout.write("raw bytes\n");      // bypass the cell-grid diff
```

Use `columns`/`rows` to size dividers, truncate content to fit, or pick a layout direction. `write` is rarely needed — almost everything should go through widgets so the cell-grid diff can render it efficiently.

## `useFocus(autoFocus, isActive)`

Register the calling widget as a focus candidate. Returns `1.0` when this widget is the currently focused one, else `0.0` (treat as truthy/falsy).

```typescript,no-test
const isFocused = useFocus(1 /* autoFocus */, 1 /* isActive */);
return Box({ flexDirection: "row" }, [
    Text("> ", isFocused ? { color: "cyan", bold: true } : { dimColor: true }),
    Text("name input"),
]);
```

- `autoFocus`: pass `1` for one widget to take focus on first render. Subsequent `useFocus` calls with `autoFocus=1` are ignored once focus has been claimed.
- `isActive`: pass `0` to remove this widget from the Tab cycle (e.g. a disabled field).

Tab and Shift-Tab cycle focus automatically — no boilerplate. The run loop's input drain handles the `\x09` / `\x1b[Z` byte sequences before forwarding them to your `useInput` handler.

For imperative focus control, pair with `useFocusManager()`:

```typescript,no-test
const focus = useFocusManager();
// Later:
focus.focusNext();
focus.focusPrevious();
focus.focus(id);   // by focus id (1-based, in registration order)
```

## `useInput(handler)`

Register a keypress handler. Called once per byte chunk arriving on stdin, in raw mode.

```typescript,no-test
useInput((s: string) => {
    if (s === "\x03") app.exit();               // Ctrl+C
    if (s === "\r" || s === "\n") onSubmit();   // Enter
    if (s === "\x7f" || s === "\b") onErase();  // Backspace
    if (s === "\x1b[A") onUpArrow();            // ANSI up
    if (s.length === 1 && s >= " " && s <= "~") onPrintable(s);
});
```

The `s` argument is the raw byte chunk as a string. ANSI escape sequences like arrow keys arrive as a single chunk (`\x1b[A`, `\x1b[B`, `\x1b[C`, `\x1b[D`); printable characters as one byte; control codes (Ctrl+C, Tab, Enter, Backspace) as their literal byte.

**Tab handling**: Tab (`\x09`) and Shift-Tab (`\x1b[Z`) cycle the focus ring *before* the handler is called. The handler still sees the byte, so you can branch on it if you want custom Tab behaviour — but for the typical "Tab moves focus" case the framework already did it.

Only one handler is registered at a time (last `useInput` call wins). For multiple focusable widgets, dispatch from one handler by checking `useFocus`'s return.

## Equivalence with ink

| ink | `perry/tui` | Notes |
|---|---|---|
| `useState(0)` | `useState(0)` | Identical. |
| `useEffect(fn, [])` | `useEffect(fn, [])` | Cleanup return not yet wired. |
| `useMemo(fn, [])` | `useMemo(fn, [])` | Identical. |
| `useRef(0)` | `useRef(0)` | `.get()`/`.set(v)` instead of `.current`. |
| `useApp().exit()` | `useApp().exit()` | Identical. |
| `useStdout().columns` (prop) | `useStdout().columns()` (method) | Function call, not property. |
| `useFocus({ autoFocus })` | `useFocus(1, 1)` | Positional args. |
| `useInput(handler)` | `useInput(handler)` | Same signature; raw byte chunks. |
| `<App />` | `run(() => App())` | JSX user components work (`<App />` lowers to `App(props)`); built-in `<Box>` JSX is still deferred. |


---

<!-- source: docs/src/tui/examples.md -->

# Examples

End-to-end `perry/tui` programs covering the typical interactive-CLI shapes. Each example also lives in `test-files/test_perry_tui_inkcompat_*.ts` in the repo and is exercised by CI on every PR.

## Counter

The smallest meaningful program: `+` / `-` increment/decrement, `q` quits, the count renders to one row.

```typescript,no-test
import { Box, Text, useState, useInput, run, exit } from "perry/tui";

// Captured so we can print the final count after run() returns.
let finalValue = 0;

run(() => {
    const [n, setN] = useState(0);
    finalValue = n;

    useInput((s: string) => {
        if (s === "+") setN(n + 1);
        if (s === "-") setN(n - 1);
        if (s === "q") exit();
    });

    return Box([Text("count: " + n)]);
});

console.log("FINAL=" + finalValue);
```

Pipe `+++-q` and the program prints `FINAL=2`. The `useEffect`-less `useState(0)` initialises the slot on first frame; the handler captures `n` from the frame it was registered in, so each setter call computes from the value that frame saw.

## Chat REPL with stable input buffer

A Claude-Code-shaped chat UI: header row, message history, prompt with cursor, help footer. Demonstrates `useState` for the message list, `useRef` as a stale-closure-resistant input buffer, `useInput` for keypresses, `useApp().exit()` for Ctrl+C handling.

```typescript,no-test
import {
    Box, Text, Spinner,
    useState, useEffect, useInput, useApp, useStdout, useRef,
    run,
} from "perry/tui";

const CANNED = [
    "Sure, I can help with that.",
    "Read the file, check for null, write a test.",
    "Got it. Anything else?",
];

run(() => {
    const app = useApp();
    const stdout = useStdout();
    const [messages, setMessages] = useState([] as string[]);
    const inputRef = useRef("");
    const [, redraw] = useState(0);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        setMessages([
            "[bot] Hi! Type a message and press Enter. Ctrl+C quits.",
        ]);
    }, []);

    useInput((s: string) => {
        if (s === "\x03") { app.exit(); return; }
        if (s === "\r" || s === "\n") {
            const buf = inputRef.get();
            if (buf.length === 0) return;
            const reply = CANNED[messages.length % CANNED.length];
            setMessages(messages.concat(["[you] " + buf, "[bot] " + reply]));
            inputRef.set("");
            setTick(tick + 1);
            return;
        }
        if (s === "\x7f" || s === "\b") {
            const buf = inputRef.get();
            if (buf.length > 0) {
                inputRef.set(buf.substring(0, buf.length - 1));
                redraw(buf.length - 1);
            }
            return;
        }
        if (s.length === 1) {
            const c = s.charCodeAt(0);
            if (c >= 0x20 && c <= 0x7e) {
                inputRef.set(inputRef.get() + s);
                redraw(c);
            }
        }
    });

    const cols = stdout.columns();
    const rows = messages.map((m: string) => {
        const isUser = m.indexOf("[you]") === 0;
        return Text(m, { color: isUser ? "yellow" : "green" });
    });
    const history = Box({ flexDirection: "column", flexGrow: 1 }, rows);

    let bar = "";
    for (let i = 0; i < cols - 2; i = i + 1) bar = bar + "─";
    const divider = Text(bar, { dimColor: true });

    const promptRow = Box({ flexDirection: "row" }, [
        Spinner(tick),
        Text(" › " + inputRef.get(), { bold: true }),
        Text("█", { color: "cyan" }),
    ]);

    return Box({ flexDirection: "column", padding: 1 }, [
        Text("Perry-Code (demo)", { bold: true, color: "cyan" }),
        history,
        divider,
        promptRow,
        Text("Enter=send · Backspace=erase · Ctrl+C=quit", { dimColor: true }),
    ]);
});
```

The key insight is `inputRef` as the canonical buffer: when the user types fast (or pastes), many bytes arrive in one frame; the handler fires N times with the same stale `input` if it lived in `useState`. `useRef.set()` mutates the cell directly, so each byte builds on the previous; the throwaway `redraw` `useState` just flips `STATE_DIRTY` so the loop repaints.

## Multi-step prompt with `useFocus`

A two-field form (name, email) with Tab/Shift-Tab navigation. Demonstrates `useFocus` with `autoFocus` + the automatic Tab cycling.

```typescript,no-test
import { Box, Text, useState, useFocus, useInput, run, exit } from "perry/tui";

run(() => {
    const nameFocused = useFocus(1, 1);  // auto-focus first
    const emailFocused = useFocus(0, 1);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    useInput((s: string) => {
        if (s === "\x03") exit();
        // Tab/Shift-Tab handled by the runtime — we don't see them here
        // unless we want to (they DO get dispatched after focus cycles).
        if (s.length === 1 && s >= " " && s <= "~") {
            if (nameFocused) setName(name + s);
            else if (emailFocused) setEmail(email + s);
        }
    });

    return Box({ flexDirection: "column", padding: 1, gap: 1 }, [
        Box({ flexDirection: "row" }, [
            Text(nameFocused ? "▸ " : "  ", { color: "cyan" }),
            Text("Name:  " + name),
        ]),
        Box({ flexDirection: "row" }, [
            Text(emailFocused ? "▸ " : "  ", { color: "cyan" }),
            Text("Email: " + email),
        ]),
        Text("Tab to switch · Ctrl+C to quit", { dimColor: true }),
    ]);
});
```

## Log viewer with `useStdout`

Sizes content to the terminal width using `useStdout().columns()`. Truncates each log line to fit; uses `useEffect` with `[]` to seed log data on mount.

```typescript,no-test
import { Box, Text, useState, useEffect, useStdout, useInput, run, exit } from "perry/tui";

run(() => {
    const stdout = useStdout();
    const cols = stdout.columns();
    const [lines, setLines] = useState([] as string[]);

    useEffect(() => {
        setLines([
            "2026-05-11 09:01:23 INFO  api-east started",
            "2026-05-11 09:01:24 INFO  api-west started",
            "2026-05-11 09:01:25 WARN  api-east latency degraded (412ms)",
            "2026-05-11 09:01:26 ERROR api-east connection refused",
        ]);
    }, []);

    useInput((s: string) => {
        if (s === "q" || s === "\x03") exit();
    });

    const rows = lines.map((line: string) => {
        const truncated = line.length > cols - 2 ? line.substring(0, cols - 5) + "..." : line;
        const color = line.indexOf("ERROR") >= 0 ? "red"
                    : line.indexOf("WARN") >= 0 ? "yellow"
                    : "white";
        return Text(truncated, { color });
    });

    return Box({ flexDirection: "column", padding: 1 }, rows);
});
```

## Notes on running these locally

```bash
perry compile myapp.ts -o myapp
./myapp
```

The binary enters the alt screen, takes over the terminal until you press Ctrl+C (or whatever exit key the program defines), and restores everything cleanly on exit. Your scrollback is untouched.

For piped (non-interactive) testing — useful for CI assertions — send your test input on stdin and grep stdout for the values your program prints after `run()` returns:

```bash
echo "+++-q" | ./myapp | grep "FINAL="
```

`run()` won't process inputs faster than the loop's 16 ms idle tick, so very fast piped input can deliver multiple bytes per frame. If your handler captures state via closure, design for that — either compute fresh state on every byte (with `useRef`) or accept that paste-style input behaves as a single bulk action.
