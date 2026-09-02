<!-- Perry docs bundle: testing.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/testing/test-registration.md -->

# Test Registration (dark tests)

> **A new test file must be registered in its suite's registry, or it will not
> run.** Most of Perry's suites glob their inputs, but four do not — they read an
> explicit list. A file added to one of those without its registry line is not a
> failing test, it is *no test at all*.

`scripts/check_test_registration.py` enforces this. It runs in the `lint` job on
every pull request, takes about a fifth of a second, and needs no compiler, no
Node and no build.

```bash
python3 scripts/check_test_registration.py             # the gate
python3 scripts/check_test_registration.py --list      # what is in scope, and what is not
python3 scripts/check_test_registration.py --self-test # prove the gate can still fail
```

## Why this exists

A dark test is invisible in exactly the way that matters. The PR is green. The
reviewer sees a witness in the diff and a passing CI run next to it and reads
the two together as "covered". Nothing says otherwise, because nothing ran.

It happened four times against `test-parity/gc_repsel_corpus.txt` alone:

| PR | What went dark |
|----|----------------|
| #7192 | a `test_gap_gc_*` stale-root witness, dark from merge |
| #7216 | a second one, same shape |
| #7252 | `test_gap_gc_call_argument_rooting`, caught only once #7192/#7216's own registration assert reached `main` |
| #7270 / #7271 | two more (rest-argument and same-module call-argument rooting), caught by the maintainer at merge |

Two partial gates already existed and neither could catch the pull request that
needed it. `scripts/gc_repsel_matrix.sh` auto-detects unregistered
`test_gap_repsel_*` / `test_gap_specabi_*` files, and `gc-moving-witnesses.yml`
adds `test_gap_gc_*` — but both sit behind a full release build of the compiler,
behind a changed-paths relevance filter, and in workflows that are not in branch
protection's required contexts. This script is the cheap half of those checks,
pulled out to somewhere it can block a merge, and generalised to the other three
places in the tree with the same shape.

## Registry-driven suites

Run `--list` for the authoritative version with every exclusion and its reason.

| Registry | Candidate files | Runner |
|----------|-----------------|--------|
| `test-parity/gc_repsel_corpus.txt` | `test-files/test_gap_{gc,repsel,specabi}_*.ts` | `scripts/gc_repsel_matrix.sh` (`gc-stress`, `gc-moving-witnesses`, `gc-ptr-shape-off-witness`) |
| `test-features/feature_matrix.toml` | `test-features/probes/**/*.ts` | `scripts/gen_feature_matrix.py` (`feature-matrix`) |
| `benchmarks/compiler_output/workloads.toml` | `benchmarks/compiler_output/fixtures/**/*.ts` | `scripts/compiler_output_regression.py` (`compiler-output-regression`) |
| a `mod` declaration in the parent module | `crates/*/**/tests/**/*.rs` below a suite root | `cargo test` |

The last one is the Rust analogue and it is worth spelling out: cargo
auto-discovers `crates/<crate>/tests/<suite>.rs`, but a file one level deeper —
a suite's module directory, or a `#[cfg(test)]` submodule under `src/` — only
compiles if a `mod` declaration names it. Without one, rustc never parses the
file. It is not dead code; it is not code. No warning fires.

Everything else is glob-driven and cannot go dark. `--list` names those too, so
"considered and safe" is distinguishable from "never looked at".

## What the gate does, and what it refuses to do

Per CLAUDE.md's *four ways a gate can be unable to fail*:

- **It cannot pass vacuously.** Every mechanism declares a floor on its
  candidate set and fails if the glob stops matching. "0 dark files over 0
  candidates" and "0 dark files over 157 candidates" print the same verdict and
  mean opposite things, so the summary always names the counts:
  `checked 157 files against 4 registries`.
- **It is proven able to fail.** `--self-test` plants an unregistered file into
  each of the four mechanisms — over the real registries, via an in-memory
  overlay, so nothing touches your working tree — asserts the gate names it,
  then removes it and asserts the gate goes green again. It also asserts a
  collapsed candidate set fails, a stale exclusion fails, and a registry entry
  whose file is gone fails.
- **Exclusions are named, not counted.** A numeric threshold cannot tell a new
  dark file from an old one: fix one, add one, and the tally is unchanged. Every
  non-registered candidate is listed in the script with a reason. A stale
  exclusion — one that matches no file on disk — is itself a failure, so an
  excuse cannot outlive the file it excuses.
- **It runs where it blocks.** It is a step in `lint`, which is already a
  required context. That placement is deliberate: forgetting to add a new job to
  branch protection is hazard 2, and `gc-root-dominance` sat red and blocking
  nothing for days because of it. This gate adds no new job, so there is no
  branch-protection step left to forget.

## When it fires

You will see something like:

```
TEST REGISTRATION: a test file exists that nothing runs.

  - DARK TEST test-files/test_gap_gc_rest_argument_rooting.ts
      exists on disk but is not registered in test-parity/gc_repsel_corpus.txt, so
      scripts/gc_repsel_matrix.sh (gc-stress, gc-moving-witnesses) never runs it.
      Register it there, or add it to this script's `gc-repsel-corpus` exclusions
      with a reason.
```

Two ways out, and only two:

1. **Register it.** Add the line to the named registry. This is almost always
   the right answer — you wrote the file to run.
2. **Exclude it, with a reason.** If the file is genuinely a helper (a fixture
   imported by a registered test, a vendored dependency, a workload driven by a
   *different* registry), add it to that mechanism's `exclusions` dict in
   `scripts/check_test_registration.py` and say why in prose. Reviewers read
   that text; "excluded" on its own is not an answer.

There is deliberately no third way. No threshold to bump, no `--allow-dark`, no
environment variable.

## Not covered

`tests/*.sh`, `tests/*.py` and `tests/*.ts` have no registry to diff against —
143 of the 171 files there are referenced by nothing in the tree. That is a
separate archaeology problem (triage each one: wire it up, or delete it), not an
unregistered-file problem, and inventing a registry for it retroactively would
make this gate red on day one for reasons that have nothing to do with the four
dark witnesses it was written for.


---

<!-- source: docs/src/testing/geisterhand.md -->

# Geisterhand — In-Process UI Testing

Geisterhand (German for "ghost hand") embeds a lightweight HTTP server inside your Perry app that lets you interact with every widget programmatically. Click buttons, type into text fields, drag sliders, toggle switches, capture screenshots, and run chaos-mode random fuzzing — all via simple HTTP calls.

It works on **all 5 native platforms** (macOS, iOS, Android, Linux/GTK4, Windows) with zero external dependencies. The server starts automatically when you compile with `--enable-geisterhand`.

---

## Quick Start

```bash
# 1. Compile with geisterhand enabled (libs auto-build on first use)
perry app.ts -o app --enable-geisterhand

# 2. Run the app
./app
# [geisterhand] listening on http://127.0.0.1:7676

# 3. In another terminal — interact with the app
curl http://127.0.0.1:7676/widgets            # List all widgets
curl -X POST http://127.0.0.1:7676/click/3     # Click button with handle 3
curl http://127.0.0.1:7676/screenshot -o s.png # Capture window screenshot
```

### Custom Port

The default port is **7676**. Use `--geisterhand-port` to change it (this implies `--enable-geisterhand`, so you don't need both flags):

```bash
perry app.ts -o app --geisterhand-port 9090
# or with perry run:
perry run --geisterhand-port 9090
```

### With `perry run`

```bash
perry run --enable-geisterhand
perry run macos --geisterhand-port 8080
perry run ios --enable-geisterhand
```

---

## API Reference

All endpoints return JSON unless noted otherwise. All responses include `Access-Control-Allow-Origin: *` for browser-based tools. OPTIONS requests are supported for CORS preflight.

### Health Check

```
GET /health
→ {"status":"ok"}
```

Use this to wait for the app to be ready before running tests.

### List Widgets

```
GET /widgets
```

Returns a JSON array of all registered widgets:

```json
[
  {"handle": 3, "widget_type": 0, "callback_kind": 0, "label": "Click Me", "shortcut": ""},
  {"handle": 4, "widget_type": 1, "callback_kind": 1, "label": "Type here...", "shortcut": ""},
  {"handle": 5, "widget_type": 2, "callback_kind": 1, "label": "", "shortcut": ""},
  {"handle": 6, "widget_type": 3, "callback_kind": 1, "label": "Enable", "shortcut": ""},
  {"handle": 7, "widget_type": 5, "callback_kind": 0, "label": "Save", "shortcut": "s"},
  {"handle": 8, "widget_type": 8, "callback_kind": 0, "label": "", "shortcut": ""}
]
```

Supports query parameter filters:
- `GET /widgets?label=Save` — filter by label substring (case-insensitive)
- `GET /widgets?type=button` — filter by widget type name or code
- `GET /widgets?label=Save&type=5` — combine filters

#### Widget Types

| Code | Type | Description |
|------|------|-------------|
| 0 | Button | Push button with onClick |
| 1 | TextField | Text input field |
| 2 | Slider | Numeric slider |
| 3 | Toggle | On/off switch |
| 4 | Picker | Dropdown selector |
| 5 | Menu | Menu item |
| 6 | Shortcut | Keyboard shortcut |
| 7 | Table | Data table |
| 8 | ScrollView | Scrollable container |

#### Callback Kinds

| Code | Kind | Description |
|------|------|-------------|
| 0 | onClick | Triggered on click/tap |
| 1 | onChange | Triggered on value change |
| 2 | onSubmit | Triggered on submit (e.g., pressing Enter) |
| 3 | onHover | Triggered on mouse hover |
| 4 | onDoubleClick | Triggered on double-click |
| 5 | onFocus | Triggered on focus |

A single widget may appear multiple times in the list with different callback kinds. For example, a button with both `onClick` and `onHover` handlers produces two entries (same handle, different `callback_kind`).

### Click a Widget

```
POST /click/:handle
→ {"ok":true}
```

Fires the widget's `onClick` callback. Works with buttons, menu items, shortcuts, and table rows.

```bash
curl -X POST http://127.0.0.1:7676/click/3
```

### Type into a TextField

```
POST /type/:handle
Content-Type: application/json

{"text": "hello world"}
```

Sets the text field's content and fires its `onChange` callback with the new text as a NaN-boxed string.

```bash
curl -X POST http://127.0.0.1:7676/type/4 \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello world"}'
```

### Move a Slider

```
POST /slide/:handle
Content-Type: application/json

{"value": 0.75}
```

Sets the slider position and fires `onChange` with the numeric value.

```bash
curl -X POST http://127.0.0.1:7676/slide/5 \
  -H 'Content-Type: application/json' \
  -d '{"value":0.75}'
```

### Toggle a Switch

```
POST /toggle/:handle
→ {"ok":true}
```

Fires the toggle's `onChange` callback with a boolean value.

```bash
curl -X POST http://127.0.0.1:7676/toggle/6
```

### Set State Directly

```
POST /state/:handle
Content-Type: application/json

{"value": 42}
```

Directly sets a `State` cell's value, bypassing widget callbacks. This triggers any reactive bindings attached to the state (bound text labels, visibility, forEach loops, etc.).

```bash
curl -X POST http://127.0.0.1:7676/state/2 \
  -H 'Content-Type: application/json' \
  -d '{"value":42}'
```

### Hover

```
POST /hover/:handle
→ {"ok":true}
```

Fires the widget's `onHover` callback. Useful for testing hover-dependent UI (tooltips, color changes, etc.).

### Double-Click

```
POST /doubleclick/:handle
→ {"ok":true}
```

Fires the widget's `onDoubleClick` callback.

### Trigger Keyboard Shortcut

```
POST /key
Content-Type: application/json

{"shortcut": "s"}
```

Finds a registered menu item whose shortcut matches and fires its callback. Shortcut strings are case-insensitive and match the key string passed to `menuAddItem` (e.g., `"s"` for Cmd+S, `"S"` for Cmd+Shift+S, `"n"` for Cmd+N).

```bash
curl -X POST http://127.0.0.1:7676/key \
  -H 'Content-Type: application/json' \
  -d '{"shortcut":"s"}'
```

Returns `{"ok":true}` if a matching shortcut was found, or 404 if no match.

### Scroll a ScrollView

```
POST /scroll/:handle
Content-Type: application/json

{"x": 0, "y": 100}
```

Sets the scroll offset of a ScrollView widget. Both `x` and `y` are in points.

```bash
curl -X POST http://127.0.0.1:7676/scroll/8 \
  -H 'Content-Type: application/json' \
  -d '{"x":0,"y":200}'
```

### Capture Screenshot

```
GET /screenshot
→ (binary PNG image, Content-Type: image/png)
```

Captures the app window as a PNG image. The response is raw binary data, not JSON.

```bash
curl http://127.0.0.1:7676/screenshot -o screenshot.png
```

Screenshot capture is synchronous from the caller's perspective — the HTTP request blocks until the main thread completes the capture (timeout: 5 seconds).

**Platform-specific capture methods:**

| Platform | Method | Notes |
|----------|--------|-------|
| macOS | `CGWindowListCreateImage` | Retina resolution, reads from window ID |
| iOS | `UIGraphicsImageRenderer` | Draws view hierarchy into image context |
| Android | JNI `View.draw()` on Canvas | Creates Bitmap, compresses to PNG |
| Linux (GTK4) | `WidgetPaintable` + `GskRenderer` | Renders to texture, saves as PNG bytes |
| Windows | `PrintWindow` + `GetDIBits` | Inline PNG encoder (stored zlib blocks) |

### Chaos Mode

Chaos mode randomly interacts with widgets at a configurable interval — useful for stress testing, finding edge cases, and crash hunting.

#### Start

```
POST /chaos/start
Content-Type: application/json

{"interval_ms": 200}
```

```bash
# Fire random inputs every 200ms
curl -X POST http://127.0.0.1:7676/chaos/start \
  -H 'Content-Type: application/json' \
  -d '{"interval_ms":200}'
```

If `interval_ms` is omitted, a default interval is used. The chaos thread randomly selects a registered widget and fires an appropriate input based on widget type:

| Widget Type | Random Input |
|-------------|-------------|
| Button | Fires onClick (no args) |
| TextField | Random alphanumeric string, 5-20 characters |
| Slider | Random float between 0.0 and 1.0 |
| Toggle | Random true/false |
| Picker | Random index 0-9 |
| Menu | Fires onClick (no args) |
| Shortcut | Fires onClick (no args) |
| Table | Fires onClick (no args) |

#### Status

```
GET /chaos/status
→ {"running":true,"events_fired":247,"uptime_secs":12}
```

Returns whether chaos mode is active, how many random events have been fired, and uptime in seconds.

#### Stop

```
POST /chaos/stop
→ {"ok":true,"chaos":"stopped"}
```

### Error Responses

All endpoints return errors as JSON with an appropriate HTTP status code:

```json
{"error": "widget handle 99 not found"}
```

Common errors:
- `404` — widget handle not found
- `400` — malformed JSON body or missing required field
- `405` — unsupported HTTP method

---

## Platform Setup

### macOS

No extra setup needed. The server binds to `0.0.0.0:7676` and is accessible on `localhost`.

```bash
perry app.ts -o app --enable-geisterhand
./app
curl http://127.0.0.1:7676/widgets
```

### iOS Simulator

The iOS Simulator shares the host's network stack — access the server directly on `localhost`:

```bash
perry app.ts -o app --target ios-simulator --enable-geisterhand
xcrun simctl install booted app.app
xcrun simctl launch booted com.perry.app
curl http://127.0.0.1:7676/widgets
```

### iOS Device

For physical iOS devices, you need a network route to the device (same Wi-Fi network) or use `iproxy` from `libimobiledevice`:

```bash
perry app.ts -o app --target ios --enable-geisterhand
# Install and launch via Xcode/devicectl
# Then connect via the device's IP:
curl http://192.168.1.42:7676/widgets
```

### Android (Emulator or Device)

Use `adb forward` to bridge the port. Ensure `INTERNET` permission is in your manifest (or add it to `perry.toml`):

```toml
[android]
permissions = ["INTERNET"]
```

```bash
perry app.ts -o app --target android --enable-geisterhand
# Package into APK and install
adb forward tcp:7676 tcp:7676
curl http://127.0.0.1:7676/widgets
```

### Linux (GTK4)

Install GTK4 development libraries first:

```bash
# Ubuntu/Debian
sudo apt install libgtk-4-dev libcairo2-dev

perry app.ts -o app --target linux --enable-geisterhand
./app
curl http://127.0.0.1:7676/widgets
```

### Windows

```bash
perry app.ts -o app --target windows --enable-geisterhand
./app.exe
curl http://127.0.0.1:7676/widgets
```

---

## Test Automation

Geisterhand turns your Perry app into a testable HTTP service. Here are practical patterns for automated testing.

### Shell Script Tests

A simple end-to-end test using bash:

```bash
#!/bin/bash
set -e

# Build with geisterhand
perry app.ts -o testapp --enable-geisterhand

# Start the app in background
./testapp &
APP_PID=$!
trap "kill $APP_PID 2>/dev/null" EXIT

# Wait for the app to be ready
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:7676/health && break
  sleep 0.1
done

# Get widgets
WIDGETS=$(curl -sf http://127.0.0.1:7676/widgets)
echo "Registered widgets: $WIDGETS"

# Find the button labeled "Submit"
SUBMIT_HANDLE=$(echo "$WIDGETS" | jq -r '.[] | select(.label == "Submit") | .handle')

# Click it
curl -sf -X POST "http://127.0.0.1:7676/click/$SUBMIT_HANDLE"

# Take a screenshot after interaction
curl -sf http://127.0.0.1:7676/screenshot -o after-click.png

echo "Test passed"
```

### Python Test Example

```python
import subprocess, time, requests, json

# Start the app
proc = subprocess.Popen(["./testapp"])
time.sleep(1)  # Wait for startup

try:
    # List widgets
    widgets = requests.get("http://127.0.0.1:7676/widgets").json()

    # Find widgets by label
    buttons = [w for w in widgets if w["widget_type"] == 0]
    fields = [w for w in widgets if w["widget_type"] == 1]

    # Type into the first text field
    if fields:
        requests.post(
            f"http://127.0.0.1:7676/type/{fields[0]['handle']}",
            json={"text": "test@example.com"}
        )

    # Click the first button
    if buttons:
        requests.post(f"http://127.0.0.1:7676/click/{buttons[0]['handle']}")

    # Capture screenshot for visual regression
    png = requests.get("http://127.0.0.1:7676/screenshot").content
    with open("test-result.png", "wb") as f:
        f.write(png)

    # Assert the app is still healthy
    assert requests.get("http://127.0.0.1:7676/health").json()["status"] == "ok"
    print("All tests passed")
finally:
    proc.terminate()
```

### Stress Testing with Chaos Mode

Run chaos mode against your app to find crashes, freezes, or unexpected state:

```bash
# Build and launch
perry app.ts -o app --enable-geisterhand
./app &

# Wait for startup
sleep 1

# Start aggressive chaos (every 50ms)
curl -X POST http://127.0.0.1:7676/chaos/start \
  -H 'Content-Type: application/json' \
  -d '{"interval_ms":50}'

# Let it run for 30 seconds
sleep 30

# Check stats
curl -sf http://127.0.0.1:7676/chaos/status
# {"running":true,"events_fired":600,"uptime_secs":30}

# Take a screenshot to see final state
curl http://127.0.0.1:7676/screenshot -o chaos-result.png

# Stop chaos
curl -X POST http://127.0.0.1:7676/chaos/stop

# Check the app is still alive
curl -sf http://127.0.0.1:7676/health
```

### Visual Regression Testing

Capture screenshots at key interaction points and compare against baselines:

```bash
# Initial state
curl http://127.0.0.1:7676/screenshot -o baseline.png

# Interact
curl -X POST http://127.0.0.1:7676/click/3
curl -X POST http://127.0.0.1:7676/type/4 -d '{"text":"Hello"}'

# Capture after interaction
curl http://127.0.0.1:7676/screenshot -o current.png

# Compare (using ImageMagick)
compare baseline.png current.png diff.png
```

### CI Pipeline Integration

```yaml
# GitHub Actions example
jobs:
  ui-test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build with geisterhand
        run: perry app.ts -o testapp --enable-geisterhand

      - name: Run UI tests
        run: |
          ./testapp &
          sleep 2
          # Run your test script
          ./tests/ui-test.sh
          kill %1

      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: screenshots
          path: "*.png"
```

---

## Example App

A complete Perry UI app demonstrating every widget type Geisterhand can
interact with — verified by CI:

```typescript
// demonstrates: Geisterhand-targetable Perry UI app — every common widget
// docs: docs/src/testing/geisterhand.md
// platforms: macos, linux, windows

// A complete Perry UI app exercising every widget type Geisterhand
// (the UI fuzzer) can interact with. The doc-tests harness compiles
// and runs this on every PR, so the snippet on the docs page can never
// drift from the real perry/ui API.

import {
    App, VStack, HStack,
    Text, Button, TextField, Slider, Toggle, Picker,
    State, stateOnChange,
    pickerAddItem,
    textSetString,
} from "perry/ui"

// State for reactive UI
const counterState = State(0)
const textState = State("")

// Labels
const title = Text("Geisterhand Demo")
const counterLabel = Text("Count: 0")

// Bind counter state to label via the free-function listener
stateOnChange(counterState, (val: number) => {
    textSetString(counterLabel, `Count: ${val}`)
})

// Button — widget_type = 0
const incrementBtn = Button("Increment", () => {
    counterState.set(counterState.value + 1)
})
const resetBtn = Button("Reset", () => {
    counterState.set(0)
})

// TextField(placeholder, onChange) — widget_type = 1
const nameField = TextField("Enter your name", (text: string) => {
    textState.set(text)
    console.log(`Name: ${text}`)
})

// Slider(min, max, onChange) — widget_type = 2
const volumeSlider = Slider(0, 100, (value: number) => {
    console.log(`Volume: ${value}`)
})

// Toggle(label, onChange) — widget_type = 3
const darkModeToggle = Toggle("Dark Mode", (on: boolean) => {
    console.log(`Dark mode: ${on}`)
})

// Picker(onChange); items added with pickerAddItem.
const sizePicker = Picker((index: number) => {
    console.log(`Size index: ${index}`)
})
pickerAddItem(sizePicker, "Small")
pickerAddItem(sizePicker, "Medium")
pickerAddItem(sizePicker, "Large")

// Layout
const buttonRow = HStack(8, [incrementBtn, resetBtn])
const stack = VStack(12, [
    title, counterLabel, buttonRow,
    nameField, volumeSlider, darkModeToggle, sizePicker,
])

App({
    title: "Geisterhand Demo",
    width: 400,
    height: 480,
    body: stack,
})
```

After compiling with `--enable-geisterhand` and running:

```bash
# See all interactive widgets
curl -s http://127.0.0.1:7676/widgets | jq .
# [
#   {"handle":3,"widget_type":0,"callback_kind":0,"label":"Increment"},
#   {"handle":4,"widget_type":0,"callback_kind":0,"label":"Reset"},
#   {"handle":5,"widget_type":1,"callback_kind":1,"label":"Enter your name"},
#   {"handle":6,"widget_type":2,"callback_kind":1,"label":""},
#   {"handle":7,"widget_type":3,"callback_kind":1,"label":"Dark Mode"}
# ]

# Click Increment 3 times
for i in 1 2 3; do curl -sX POST http://127.0.0.1:7676/click/3; done
# Counter label now shows "Count: 3"

# Type a name
curl -sX POST http://127.0.0.1:7676/type/5 -d '{"text":"Perry"}'

# Set slider to 80%
curl -sX POST http://127.0.0.1:7676/slide/6 -d '{"value":0.8}'

# Toggle dark mode on
curl -sX POST http://127.0.0.1:7676/toggle/7

# Screenshot
curl -s http://127.0.0.1:7676/screenshot -o demo.png
```

---

## Architecture

Geisterhand operates as three cooperating components connected by thread-safe queues:

```
                    ┌──────────────────────────┐
                    │      HTTP Server         │
                    │   (background thread)    │
                    │   tiny-http on :7676     │
                    │                          │
                    │  GET /widgets            │
                    │  POST /click/:h          │
                    │  POST /type/:h           │
                    │  ...                     │
                    └────────┬─────────────────┘
                             │
                    queue actions via
                    Mutex<Vec<PendingAction>>
                             │
                             ▼
┌────────────────────────────────────────────────┐
│                 Main Thread                     │
│                                                 │
│  perry_geisterhand_pump() ← called every 8ms   │
│  by platform timer (NSTimer / glib / WM_TIMER)  │
│                                                 │
│  Drains PendingAction queue:                    │
│  • InvokeCallback → js_closure_call0/1          │
│  • SetState → perry_ui_state_set                │
│  • CaptureScreenshot → perry_ui_screenshot_*    │
└────────────────────────────────────────────────┘
                             │
                    widget callbacks registered
                    at creation time via
                    perry_geisterhand_register()
                             │
                             ▼
┌────────────────────────────────────────────────┐
│            Global Widget Registry              │
│         Mutex<Vec<RegisteredWidget>>           │
│                                                │
│  { handle, widget_type, callback_kind,         │
│    closure_f64, label }                        │
└────────────────────────────────────────────────┘
```

### Lifecycle

1. **Startup**: When `--enable-geisterhand` is used, the compiled binary calls `perry_geisterhand_start(port)` during initialization. This spawns a background thread running a `tiny-http` server.

2. **Widget Registration**: As UI widgets are created (Button, TextField, Slider, etc.), each one calls `perry_geisterhand_register(handle, widget_type, callback_kind, closure_f64, label)` to register its callback in the global registry. This is gated behind `#[cfg(feature = "geisterhand")]` so normal builds have zero overhead.

3. **HTTP Requests**: When a request arrives (e.g., `POST /click/3`), the server looks up handle 3 in the registry, finds the associated closure, and pushes a `PendingAction::InvokeCallback` onto the pending actions queue.

4. **Main-Thread Dispatch**: The platform's timer (NSTimer on macOS, glib timeout on GTK4, WM_TIMER on Windows, etc.) calls `perry_geisterhand_pump()` every ~8ms. This drains the pending actions queue and executes callbacks on the main thread, which is required for UI safety.

5. **Screenshot Capture**: Screenshots use `Condvar` synchronization — the HTTP thread queues a `CaptureScreenshot` action, then blocks waiting on a condition variable. The main thread's pump executes the platform-specific capture, stores the PNG data, and signals the condvar. Timeout: 5 seconds.

### Thread Safety

- **Widget Registry**: Protected by `Mutex`. Read by the HTTP server (to list widgets and look up handles), written by the main thread (during widget creation).
- **Pending Actions Queue**: Protected by `Mutex`. Written by HTTP server thread, drained by main thread in `pump()`.
- **Screenshot Result**: Protected by `Mutex` + `Condvar`. HTTP thread waits, main thread signals.
- **Chaos Mode State**: Uses `AtomicBool` (running flag) and `AtomicU64` (event counter) for lock-free status checks.

### NaN-Boxing Bridge

When geisterhand needs to pass values to widget callbacks, it must create properly NaN-boxed values:

- **Strings** (for TextField): Calls `js_string_from_bytes(ptr, len)` to allocate a runtime string, then `js_nanbox_string(ptr)` to wrap it with STRING_TAG (0x7FFF).
- **Numbers** (for Slider): Passes the raw `f64` value directly (numbers are their own NaN-boxed representation).
- **Booleans** (for Toggle/chaos): Uses `TAG_TRUE` (0x7FFC000000000004) or `TAG_FALSE` (0x7FFC000000000003).

---

## Build Details

### Auto-Build

When you pass `--enable-geisterhand` (or `--geisterhand-port`), Perry automatically builds the required libraries on first use if they're not already cached:

```
cargo build --release \
  -p perry-runtime --features perry-runtime/geisterhand \
  -p perry-ui-{platform} --features perry-ui-{platform}/geisterhand \
  -p perry-ui-geisterhand
```

Platform crate selection is automatic based on `--target`:

| Target | UI Crate |
|--------|----------|
| (default/macOS) | `perry-ui-macos` |
| `ios` / `ios-simulator` | `perry-ui-ios` |
| `android` | `perry-ui-android` |
| `linux` | `perry-ui-gtk4` |
| `windows` | `perry-ui-windows` |

### Separate Target Directory

Geisterhand libraries are built into `target/geisterhand/` (via `CARGO_TARGET_DIR`) to avoid interfering with normal builds. This means your first geisterhand build takes a moment, but subsequent builds reuse the cached libraries.

### Feature Flags

All geisterhand code is behind `#[cfg(feature = "geisterhand")]` feature gates:

- **`perry-runtime/geisterhand`**: Compiles the `geisterhand_registry` module — widget registry, action queue, pump function, screenshot coordination.
- **`perry-ui-{platform}/geisterhand`**: Adds `perry_geisterhand_register()` calls to widget constructors and `perry_geisterhand_pump()` to the platform timer.

When the feature is not enabled, no geisterhand code is compiled — zero binary size overhead and zero runtime cost.

### Linking

The compiled binary links three additional static libraries:
1. `libperry_runtime.a` (geisterhand-featured build, replaces the normal runtime)
2. `libperry_ui_{platform}.a` (geisterhand-featured build, replaces the normal UI lib)
3. `libperry_ui_geisterhand.a` (HTTP server + chaos mode)

### Manual Build

If auto-build fails or you want to cross-compile manually:

```bash
# Build geisterhand libs for macOS
CARGO_TARGET_DIR=target/geisterhand cargo build --release \
  -p perry-runtime --features perry-runtime/geisterhand \
  -p perry-ui-macos --features perry-ui-macos/geisterhand \
  -p perry-ui-geisterhand

# Build for iOS (cross-compile)
CARGO_TARGET_DIR=target/geisterhand cargo build --release \
  --target aarch64-apple-ios \
  -p perry-runtime --features perry-runtime/geisterhand \
  -p perry-ui-ios --features perry-ui-ios/geisterhand \
  -p perry-ui-geisterhand
```

---

## Security

Geisterhand binds to `0.0.0.0` on the configured port (default 7676). This means it is **accessible from the local network** — any device on the same network can interact with your app, capture screenshots, or trigger chaos mode.

**Do not ship geisterhand-enabled binaries to production or to end users.**

Geisterhand is a development and testing tool only. The feature-gate system ensures it cannot accidentally be included in normal builds — you must explicitly pass `--enable-geisterhand` or `--geisterhand-port`.

---

## Troubleshooting

### "Connection refused" on port 7676

- Ensure you compiled with `--enable-geisterhand` or `--geisterhand-port`
- Check that the app has fully started (look for `[geisterhand] listening on...` in stderr)
- Verify the port isn't in use by another process: `lsof -i :7676`

### Widget handles not found

- Handles are assigned at widget creation time. If you query `/widgets` before the UI is fully constructed, some widgets may not be registered yet.
- Wait for `GET /health` to return `{"status":"ok"}` before interacting.

### Screenshot returns empty data

- Screenshot capture has a 5-second timeout. If the main thread is blocked (e.g., by a long-running synchronous operation), the screenshot will time out and return empty data.
- On macOS, ensure the app has a visible window (minimized windows may not capture correctly).

### Auto-build fails

- Ensure you have a working Rust toolchain (`rustup show`)
- For cross-compilation targets, install the appropriate target: `rustup target add aarch64-apple-ios`
- Check that the Perry source tree is accessible (auto-build searches upward from the `perry` executable for the workspace root)

### Chaos mode crashes the app

That's the point — chaos mode found a bug. Check the app's stderr output for panic messages or stack traces. Common causes:
- Callback handlers that assume valid state but receive unexpected values
- Missing null checks on state values
- Race conditions in state updates


---

<!-- source: docs/src/testing/node-compat-matrix.md -->

# Node builtin-module Compatibility Matrix

Perry reimplements the `node:*` module surface natively. The **compatibility
matrix** (`scripts/node_compat_matrix.mjs`) measures — against a *pinned,
verified* Node — how faithfully Perry reproduces each builtin's **export
shape**, for **both** import forms (`M` and `node:M`).

Its value is **breadth**: every builtin, both forms, one pinned oracle. It is
the systematic version of tracker
[#812](https://github.com/PerryTS/perry/issues/812) ("42-module behavioral
matrix"). Deep *behavioral* parity lives in the hand-authored node-suite
(`run_parity_tests.sh`); this harness is a wide, shallow **shape** sweep.

## To check one module fast

```bash
node scripts/node_compat_matrix.mjs --module fs
```

That is the command to reach for while iterating on a single builtin. The
pinned Node download happens once and is cached under `.cache/node-pin/`, so
subsequent runs are just Perry compile + run. Narrow further:

```bash
node scripts/node_compat_matrix.mjs --module fs,path,crypto            # a few modules
node scripts/node_compat_matrix.mjs --module fs --method readFileSync,promises  # only these exports
node scripts/node_compat_matrix.mjs --only fs.readFileSync,path.join   # combined mod.export form
```

A `--method`/`--only` subset narrows the fingerprint to those exports for a
sub-second "did my change fix `node:fs.readFileSync`?" loop. Because it changes
the fingerprint semantics, it is a **print-only diagnostic** — it is refused
for `--check`/`--update-baseline`.

## Full sweep and the CI gate

```bash
node scripts/node_compat_matrix.mjs                 # whole matrix + summary table
node scripts/node_compat_matrix.mjs --check         # exit 1 on regressions vs the baseline
node scripts/node_compat_matrix.mjs --update-baseline   # rewrite the committed baseline
```

The harness needs the release binary (`cargo build --release -p perry`). The
baseline lives at `test-parity/node-compat-matrix.baseline.json`; the CI job
`.github/workflows/node-compat-matrix.yml` runs `--check` nightly in its own
job (so the pinned-Node download never slows the main test job).

A baseline is **scoped to the platform and Node line it was generated
against** — platform-dependent surfaces (`os`, `path/win32`, `dgram`, `fs`,
`inspector`) and version-dependent export shapes only compare meaningfully
within that scope. `--check` therefore **refuses** to run when the baseline's
`platform`/`nodeVersion` header does not match the current run (a
cross-platform comparison would surface phantom regressions or mask real
ones), and refuses a vacuously green pass when a full sweep processed fewer
modules than the baseline records. The committed baseline is `darwin-arm64`, so
the nightly gate runs on a `macos-14` (Apple Silicon) runner to match it; move
the baseline to another platform by regenerating it there and pointing the job
at a matching runner.

`--check` fails when a baselined cell got **strictly worse** (per a severity
order: `match` → `shape-diff` → `perry-unresolved`) or when a **prefix-parity**
invariant that previously held broke. Improvements are always accepted and are
folded in by `--update-baseline`. A `--module` selector scopes
`--check`/`--update-baseline` to just that slice — a single-module refresh
never rewrites the whole baseline.

## The pin

The oracle is the **official nodejs.org dist tarball** for the host platform, a
*binary* pin (not a source checkout — we measure shape against the runtime Node
actually ships). It is recorded in `external-tools.json` under `tools.node`
with a `sha512` SRI per platform, matching that file's existing convention. The
runner downloads it, verifies the SRI, and caches it under `.cache/node-pin/`
(gitignored). nodejs.org also publishes `SHASUMS256.txt` (sha256), which is
cross-checked against every pinned asset at pin time.

Currently pinned: **Node 26.5.1** (the latest CURRENT stable). This is a
separate concern from `.node-version` (26.5.0), which pins the gap-suite /
node-suite oracle; the compat matrix carries its own "latest stable" pin.

## The fingerprint

For a module `M` and a form, the probe does:

```typescript,no-test
import * as ns from "M"          // or "node:M"
// sorted list of `<exportName>:<typeof export[name]>` over Object.keys(ns),
// plus `default:<typeof ns.default>`, wrapped in a __FP__...__FP__ sentinel.
```

Two fingerprints are **equal** iff the two module namespaces have the same
export names with the same `typeof` for each, and the same default-export
`typeof`. It is a **shape** fingerprint (names + typeofs), not deep behavior.
The sentinel line means environmental warnings on stdout/stderr never touch the
compare — no output-normalization needed.

Each `(module, form)` cell gets a status:

| status | meaning |
| --- | --- |
| `match` | Perry fingerprint == oracle fingerprint |
| `shape-diff` | both resolved, fingerprints differ (a real shape gap) |
| `perry-unresolved` | Node resolved, Perry did not compile/run |
| `perry-extra` | Perry resolved a form the oracle did not |
| `both-unresolved` | neither resolved (neutral) |
| `skip` | curated skip — see `test-parity/node-compat-matrix.skip.json` |

Modules that cannot be meaningfully fingerprinted by a bare `import * as m`
(side-effectful on import, or shape depends on constructor args) go in the skip
JSON **with a reason** rather than silently passing.

## The prefixed / unprefixed invariant

For builtins where Node resolves both `M` and `node:M`, Node treats the forms
identically and Perry's `is_native_module` strips the `node:` prefix — so those
two forms **must** agree. The runner records `prefixParity` for that scope, and
a `false` value is a **real Perry bug** that fails `--check` if parity previously
held.

Node also exposes prefix-only builtins such as `node:test`. The matrix still
probes their bare spelling, but records `prefixParity: null` because Node has no
two-form invariant there. If Perry accepts the bare alias, that cell is reported
as `perry-extra`: a documented leniency, not prefix parity.

## Bumping the pinned Node

1. Edit `tools.node.version` in `external-tools.json` and refresh the
   per-platform `sha512` SRI (download each dist tarball, verify its sha256
   against that version's `SHASUMS256.txt`, then record the recomputed sha512).
2. `node scripts/node_compat_matrix.mjs --update-baseline`.
3. **Review the diff.** A Node bump legitimately changes fingerprints (new
   exports, typeof changes); confirm the deltas are Node's, not Perry
   regressions, before committing.


---

<!-- source: docs/src/testing/ci-tiers.md -->

# CI tiers: what runs on a PR, on a merge, and before a release

Perry's CI is one workflow — `.github/workflows/test.yml` — with **three tiers**.
The tier a run belongs to, and the exact set of jobs it executes, is decided by
one script, `scripts/ci_plan.py`, in the workflow's first job (`plan`). Every other
job is `needs: plan` and gated on `fromJSON(needs.plan.outputs.plan).jobs.<name>`.

```
python3 scripts/ci_plan.py --table       # the job x tier matrix below
python3 scripts/ci_plan.py --self-test   # the policy's own invariants
```

| tier | trigger | what it is for | fan-in job |
|---|---|---|---|
| **pr** | every `pull_request` push | the required gate. Small, fast, must be green on `main`. | `pr-gate` — **the only required status context** |
| **sweep** | every `push` to `main` (coalesced) **+ a two-hourly cron backstop** | post-merge truth for `main`: the PR tier unscoped plus the medium-weight jobs that do not fit the PR budget | `main-gate` |
| **full** | nightly `schedule`, `v*` tags, `workflow_dispatch`, PRs labelled `run-extended-tests` | everything, incl. parity, compile-smoke, doc-tests, package smokes, the 8-shard auto-optimize gap suite | `full-suite-gate` — what `release-packages.yml` waits for |

## The job × tier matrix

Generated by `python3 scripts/ci_plan.py --table`; the `lint` job checks that this
copy is current.

| job | pr | sweep | full |
|---|:-:|:-:|:-:|
| `lint` | always | yes | yes |
| `check` | yes | yes | yes |
| `warnings` | yes | yes | yes |
| `cargo-test` | yes | yes | yes |
| `cargo-test-perry` |  |  | yes |
| `gap-suite` | 6x fast | 3x fast | 8x full |
| `gc-stress` | 1x pr | 4x all | 4x all |
| `e2e-scoped` | yes |  |  |
| `security-audit` | deps only | yes | yes |
| `windows-build` |  | yes | yes |
| `windows-arm64-build` |  | yes | yes |
| `compiler-output-regression` |  | yes | yes |
| `repsel-census` |  | yes | yes |
| `harmonyos-smoke` |  | yes | yes |
| `binary-size` |  |  | yes |
| `parity` |  |  | yes |
| `compile-smoke` |  |  | yes |
| `native-abi-evidence-packet` |  |  | yes |
| `drizzle-mysql-smoke` |  |  | yes |
| `ink-link-smoke` |  |  | yes |
| `effect-basic-smoke` |  |  | yes |
| `doc-tests` |  |  | yes |

Within the **pr** tier the changed-file list narrows the plan further:

- **docs-only** (only `docs/`, `*.md`, `benchmarks/`, `npm/`, `packaging/`,
  `.claude/`, … — see `NON_CORE_GLOBS` in `ci_plan.py`) → only `lint` runs.
- **core** (anything that can change the compiler, the runtime, or a test outcome)
  → the whole PR tier.
- **deps** (a lockfile, manifest, `deny.toml`, `package.json`, `.claude/`, `skills/`,
  …) → additionally the `security-audit` reusable workflow.

`e2e-scoped` runs integration suites selected by the diff, but its
`SUITE_EXCLUSIONS` check is deliberately not scoped: whenever that list is
nonempty, every core PR reruns each excluded exact test and fails if it no
longer fails. This catches fixes made in HIR, transform, or another dependency
without adding Rust setup to docs-only PRs.

An empty or failed file listing is treated as **core** and a failed `plan` job fails
the gate outright — a broken planner must never turn into "everything skipped,
therefore green".

## Why it looks like this (measured 2026-08-16)

The organisation runs on GitHub's Free plan: **20 concurrent hosted jobs, 5 of them
macOS**, for the whole org. Before this shape, every PR push fanned out to **14
workflows / 48 jobs / ~650 runner-minutes**, and `main` saw ~66 PR pushes and ~58
merges a day. That is 1.5–2× total capacity, so:

- job queue waits were 3–7 h (`conformance-smoke` shards: median 4 h);
- **0 of 66** PR runs of the `Tests` workflow reached a conclusion in the sample
  window — 8 failed, 56 were cancelled by the next push;
- the required contexts included two jobs (`parity`, `compile-smoke`) that never ran
  on a PR and one (`conformance-smoke-complete`) that had been red on `main` for
  days, so **every one of the last 12 merges was an admin bypass** with `lint` and
  `cargo-test` still queued.

The always-red required-gate incident was tracked in
[#8092](https://github.com/PerryTS/perry/issues/8092). #8087 restored `lint`,
#8095 made the textual and native LLVM paths record the same stable ELF source
identity so `cargo-test` could pass on Linux, and #8187 replaced the fragmented
required-context list with the single `pr-gate` fan-in described above.

Two specific costs dominated:

- `conformance-smoke` was 8 shards × ~60 min = **480 job-minutes per push**, and 96 %
  of each shard's test time was ~10 tests at ~200 s each — the auto-optimize path
  rebuilding a feature-stripped runtime per distinct feature set, redundantly in
  every shard. The harness's `PERRY_SKIP_BUILD=1` mode runs the same tests against
  one prebuilt release compiler at ~1.5 s each; that is the `fast` gap mode the PR
  and sweep tiers use. The 8-shard auto-optimize mode is kept in the full tier
  because it is the only arm that sees auto-optimize-only link bugs.
- Every job saved a fresh ~0.5–1.3 GB sccache tarball on every PR push (~200 GB/day
  into a 10 GB repo cache budget), evicting every useful entry within the hour —
  and PR-scoped caches are not even readable by other PRs. sccache now saves only
  from main-line runs; PRs restore the newest main-line blob. `cache-warm.yml` is
  gone: the sweep is the cache-producing build on `main`.

A later release run exposed a separate serial bottleneck: its 246 `perry`
integration-test binaries had not reached their midpoint when `cargo-test` hit
its 180-minute cap. In the full tier, `cargo-test` now retains the `perry` bin/unit
target and every other package while `cargo-test-perry` assigns every `perry`
integration target exactly once across eight deterministic, count-balanced shards.
The shards restore the shared compiler cache but do not upload eight near-duplicate
copies. Their aggregate matrix result is a direct dependency of `full-suite-gate`.

The **satellite gates** (`gc-ratchet`, `gc-root-dominance`, `gc-native-roots`,
`gc-moving-witnesses`, `gc-parse-churn-gate`, `gc-ptr-shape-off-witness`,
`tls-budget`, `auto-opt-app-patterns`, `eh-transport`, `llvm-inprocess`, `ext-link`,
`container-tests`) keep their six-hourly / nightly main-line sweeps and their
release-tag arms (see [CI gate scheduling](https://docs.perryts.com/testing/ci-gate-scheduling.html) and
`scripts/gate_freshness.json`), but their **PR arm is opt-in**: apply the
`run-extended-tests` label to a PR and they run on it, along with the `full` tier
of `test.yml`. An unlabelled PR still gets a run of each — with every job skipped,
which costs no runner slot.

## Budgets

| tier | typical jobs | typical runner-minutes | target wall clock |
|---|--:|--:|--:|
| pr (core) | ~13 (6 gap shards) | ~200 | ≤ 30 min once queued |
| pr (docs-only) | 2 | ~5 | ≤ 5 min |
| sweep | ~19 | ~300 | not a target — it coalesces |
| full | ~30 | ~1500 | not a target |

`push` to `main` uses ONE constant concurrency group with `cancel-in-progress: false`:
GitHub keeps at most one running + one pending run per group and replaces the pending
run with the newest, so a burst of merges is tested at its tip instead of queueing 58
sweeps. **The push arm alone is not sufficient**: measured 2026-08-16..18, no push
sweep ever reached a runner — merges replaced the pending run faster than the
pending→running transition happened, even with an idle queue. The two-hourly cron
(`47 */2 * * *`; the planner maps any non-nightly cron to the sweep tier) is the
reliable arm; the push trigger stays for quiet periods. Sweep-only jobs are chained behind `check` so a sweep's fan-out does not take
every runner slot the moment a merge lands. Attribution of a sweep failure is by
window (`previous sweep SHA .. this sweep SHA`), exactly as for the six-hourly gates.

## Opting a PR into more

- **`run-extended-tests` label** — promotes the PR's `test.yml` run to the `full`
  tier AND enables the PR arm of every satellite gate. Use it for GC / codegen
  changes that should be measured before merge, and for anything touching a
  full-tier-only suite. Applying the label re-fires the runs (`labeled` trigger).
- **`skip-changelog` label** — skips the changeset step in `lint` (a `crates/`
  change must otherwise add a `changelog.d/<PR>-<slug>.md` fragment).
- **`workflow_dispatch`** on any branch: `tier` (`pr` / `sweep` / `full`) and
  `update_gap_snapshot`.

## Re-baselining the gap snapshot

`test-parity/gap_snapshot.json` is a both-direction snapshot: any divergence — a
test that started failing OR started passing — is red. When `main` has legitimately
moved (a triaged regression, an oracle change), regenerate it **from CI**, not from
a laptop (the required baseline is Linux, `fast` mode):

```bash
gh workflow run test.yml --ref <branch> -f tier=pr -f update_gap_snapshot=true
# wait for the run, then:
gh run download <run-id> -n gap-snapshot-update -D /tmp/snap
cp /tmp/snap/gap_snapshot.json test-parity/gap_snapshot.json
# fill in `issue` / `reason` for every new entry, then commit
```

New entries land as `category: untriaged`; give each an issue and a reason before
merging. A crash may never be parked in the snapshot (`run_gap_tests.sh` refuses).

## Branch protection

Required status checks on `main`: **`pr-gate`** only. Adding, removing or renaming a
job in `test.yml` never needs a branch-protection edit again; the fan-in job carries
the verdict. `gate-freshness.yml` (`scripts/gate_freshness.json`) watches that each
main-line sweep produces a *completed* result within its budget; the gate's own run
carries whether that result passed or failed.

## Release

`release-packages.yml`'s `await-tests` dispatches `test.yml` with `tier=full` on the
pinned release branch and polls the SHA for a run whose **`full-suite-gate`** job
succeeded — a green sweep or PR-tier run on the same SHA does not count. See
[Releasing](https://docs.perryts.com/contributing/releasing.html).

`parity` runs as 8 shards (`run_parity_tests.sh --shard N/8`) after the unsharded
job was killed by GitHub's 6-hour job cap on 2026-08-16. `parity_known_failures.py`
runs inside each shard (it is shard-safe by design); the threshold minimums and the
per-module matrix trend run once in `parity-aggregate` over the merged report
(`scripts/parity_report_merge.py`, which refuses a missing shard rather than
shrinking the suite).


---

<!-- source: docs/src/testing/ci-gate-scheduling.md -->

# CI gate scheduling: why the heavy gates sweep `main` instead of gating every merge

This page explains one deliberate choice: **the expensive post-merge gates run on a
staggered six-hourly schedule against `main`, not once per merge.** Their
pull-request arm is untouched — every PR is still measured before it can merge.

If you are about to "fix" one of those workflows by putting `push: branches: [main]`
back, read this first. That trigger is what broke them.

## The failure: starvation (#7856)

On 2026-08-11, **every** heavy gate in this repo had produced zero results on `main`
for over two days. They were not failing and not cancelled. They never reached a
runner.

The measurement that matters is not "macOS is slow". It is the ratio between how
many jobs a merge enqueues and how many the repo can run at once:

| quantity | measured 2026-08-11 15:07 UTC |
|---|--:|
| workflow runs created that day (by 15:07) | **600** (392 `pull_request` + 208 `push`) |
| pushes to `main` per day | **10** (08-09) → **32** (08-10) → **58** (08-11) |
| workflows triggering on `push: main` | **14**, totalling ~**29 jobs per merge** |
| jobs running repo-wide, right then | **9** (6 `ubuntu-latest`, 3 `macos-14`) |
| runs queued repo-wide, right then | **100+** |
| `gc-ratchet` `main` runs queued, of its last 25 | **22**, oldest waiting **9h18m** |
| `gc-ratchet` last successful `main` run | **2026-08-09**, two days earlier |

Reproduce the core of it with:

```bash
# What is actually running, repo-wide, at the job level:
gh api "repos/PerryTS/perry/actions/runs?status=in_progress&per_page=100" \
  -q '.workflow_runs[].id' \
| while read id; do
    gh api "repos/PerryTS/perry/actions/runs/$id/jobs?per_page=100" \
      -q '.jobs[] | select(.status=="in_progress") | (.labels|join(","))'
  done | sort | uniq -c

# How deep the queue is, and on which pools:
gh api "repos/PerryTS/perry/actions/runs?per_page=100" -q '.workflow_runs[].id' \
| while read id; do
    gh api "repos/PerryTS/perry/actions/runs/$id/jobs?per_page=100" \
      -q '.jobs[] | select(.status=="queued") | (.labels|join(","))'
  done | sort | uniq -c
```

Demand outran drain, the queue grew without bound, and the oldest entries — the
`main` runs, which are exactly the ones that gate nothing and therefore nobody is
watching — aged out.

## What this is NOT

**It is not the concurrency bug, and it is not macOS runner availability.** Both
were the obvious reading, and both are wrong. Getting this right matters, because
each wrong reading has a "fix" that would make things worse.

**Not the concurrency block — *as it stood in #7856*.** `gc-ratchet.yml`'s
`concurrency:` comment records two prior attempts (#7205): a shared group with
unconditional `cancel-in-progress` cancelled three consecutive `main` runs, and
scoping `cancel-in-progress` to pull requests did not fix it either, because GitHub
allows at most one *pending* run per group. Keying the group on `github.sha` for push
events **did** fix cancellation. The failure mode simply moved: runs stopped
cancelling each other and started queueing forever instead.

> **⚠️ SUPERSEDED BY #7966 — this paragraph used to end "Those blocks are correct. Do
> not 'fix' them again." That sentence was true when written and false three days
> later, and it is exactly the sentence that would send the next reader past the real
> bug.**
>
> The `github.sha` arm is guarded on `github.event_name == 'push'`. #7856 — the change
> this very document describes — moved the main-line arm from `push: branches: [main]`
> to `schedule:`. The guard stopped matching, the expression fell through to
> `github.ref` (constant `refs/heads/main`), and **#7205 came straight back on the arm
> #7856 created.** Measured 2026-08-12, identically on all ten gates: oldest run
> `queued` holding the group, the next two `cancelled` with `jobs: 0`, newest
> `pending`. `gate-freshness` itself was cancelled the same way.
>
> Groups are now keyed on `github.run_id` for every non-pull-request event, which is
> the only context value unconditionally distinct across scheduled runs.
> `scripts/gc_gate_wiring_check.py` (in the required `lint` context) now rejects a
> `schedule:` workflow whose concurrency group lacks `github.run_id`, so this cannot
> relapse a fourth time silently.
>
> **The lesson is about the sentence, not the YAML.** "Do not fix this again" is a
> claim about the future, and a scheduling change three days later invalidated it. A
> repaired invariant should be written down as an *executable check*, not as an
> instruction to the next human to stop looking.

**Not macOS capacity.** This was the natural inference — the gates that went dark
are the macOS ones — but the job-level numbers refute it. At the moment of
measurement the queue held **45 `ubuntu-latest` jobs against 14 `macos-14` jobs**,
and `zizmor` (`ubuntu-latest`) was queued in the very same second as `gc-ratchet`
(`macos-14`). Ubuntu was starved harder in absolute terms.

Two specific claims in #7856 do not survive checking, and are recorded here so the
next person does not re-derive them:

- **`gc-root-dominance` does not run on `ubuntu-latest`.** It runs `macos-14`, in
  two jobs. Its healthy-looking run count was pull-request runs, which drain because
  they supersede each other; its `main` arm was queued like all the others. The
  ubuntu-vs-macOS contrast that localised the problem to macOS was comparing a PR
  arm against a `main` arm, not Linux against Darwin.
- **Moving `gc-ratchet` to Linux is not available as a remedy.** Its baseline is
  captured under the `darwin-arm64` platform key and the checker *refuses* a
  platform mismatch rather than comparing numbers that are not comparable. Moving it
  would turn the gate red, not relieve it. `tls-budget`'s macOS arm is likewise
  irreducible: `_tlv_get_addr` is a Mach-O artefact and the measurement does not
  exist elsewhere.

The consequence of both corrections is the same: **rebalancing pools cannot help.**
Only reducing total job demand can. That is what this change does.

## The change

For ten heavy gates, the post-merge arm became a staggered six-hourly sweep plus
release tags:

```yaml
on:
  pull_request:          # unchanged — every PR is still measured
  schedule:
    - cron: "7 */6 * * *"   # staggered; see the table below
  push:
    tags: ["v*"]         # releases stay individually gated
  workflow_dispatch:
```

Cron minutes are staggered so the ten do not re-create the thundering herd they were
meant to relieve, and none sits at `:00`, where GitHub's scheduler is most contended
and most likely to delay a run:

| workflow | cron | runner of the heavy job |
|---|---|---|
| `gc-ratchet` | `7 */6 * * *` | `macos-14` |
| `gc-moving-witnesses` | `12 */6 * * *` | `ubuntu-latest` |
| `gc-root-dominance` | `17 */6 * * *` | `macos-14` (×2) |
| `auto-opt-app-patterns` | `22 */6 * * *` | `ubuntu-latest` |
| `tls-budget` | `27 */6 * * *` | `macos-14` |
| `eh-transport` | `32 */6 * * *` | `macos-15` |
| `gc-native-roots` | `37 */6 * * *` | matrix |
| `llvm-inprocess` | `42 */6 * * *` | `macos-15` |
| `gc-ptr-shape-off-witness` | `47 */6 * * *` | `ubuntu-latest` |
| `gc-parse-churn-gate` | `57 */6 * * *` | `ubuntu-latest` |

That removes **19 jobs from every merge** (counting matrix expansion). At the cadence
measured above that is ~1,100 job-starts/day of demand replaced by ~76 — a **93% cut
on this slice**, which is what lets the remaining queue drain.

### What was deliberately left alone

- **`security-audit`** is a *required* status context and stays on every merge.
- **`zizmor`** and **`cache-warm`** are single cheap ubuntu jobs; `cache-warm` is
  what makes everything else fast.
- **`container-tests`** (6 jobs on every merge, ~350 job-starts/day) is the
  next-largest lever but is not a GC gate; left for a maintainer decision.
- **Every gate's actual content** — no probe, threshold, baseline, or matrix cell
  was touched. This change alters *when* the post-merge arm runs, nothing else.
- **The in-job relevance filters** were left where they are. Hoisting them to
  `on.pull_request.paths` would save PR-side slots, but a path-filtered workflow
  reports *no* status rather than a passing one, which can wedge a required context.
  Not worth the risk here.

> **Superseded for the PR arm (2026-08-16, CI tiers).** The PR arm of every gate
> in the table above is now **opt-in via the `run-extended-tests` label** — an
> unlabelled PR still gets a run, but every job in it is skipped at the job level
> (`if:`), which costs no runner slot and cannot wedge anything because none of
> these is a required context (the only required context is `test.yml`'s
> `pr-gate`). The six-hourly `main` sweeps, the tag arms and `gate-freshness` are
> unchanged. Rationale and the measured numbers: [CI tiers](https://docs.perryts.com/testing/ci-tiers.html).

### The cost, stated plainly

**Attribution latency.** A regression that slips past the PR arm used to be pinned
to one commit; now the next sweep names it against a window of commits. Each sweep
prints the SHA it tested, so the window is `previous sweep SHA .. this sweep SHA` —
bisect within that. In exchange the gate produces an answer at all, which for the
two days before this change it did not. Four completed runs a day beat 58 that never
start.

## Staleness alerting

The starvation was silent *by construction*: an empty result set looks exactly like
a healthy one nobody checked. Rescheduling the gates does not fix that — a cron that
silently stops firing fails the same way.

`gate-freshness.yml` runs every two hours on `ubuntu-latest` and calls
`scripts/check_gate_freshness.py`, which asks the Actions API for each gate's most
recent **completed** non-PR result on the default branch and fails when it is older
than that gate's budget in `scripts/gate_freshness.json`. Age starts when the result
completed, not when the run joined the queue. A completed failure counts as execution
evidence here and remains red in its own workflow; treating it as starvation too
conflates two diagnoses. On failure the checker opens — or updates, never duplicates
— a single sticky issue, and closes it once every gate is fresh again.

Reusable workflows do not get a separate Actions run: their jobs belong to the
caller. The `security-audit.yml` manifest entry therefore reads `test.yml` runs and
requires all five `security-audit / ...` jobs to complete. A caller that fails in an
unrelated job is still fresh security-audit evidence; a caller that skips even one of
the five is not.

```bash
python3 scripts/check_gate_freshness.py --self-test   # proves it can still fail
python3 scripts/check_gate_freshness.py --dry-run     # real API, no issue writes
```

Budgets are the schedule interval plus headroom for a 90-minute job and a queue that
is still draining. A gate whose budget you have to keep raising is a gate that is
still starving; raise the *capacity* or lower the *demand* instead.

**The checker is sabotage-tested, not merely exercised.** `--self-test` plants a
stale gate, a fresh gate, a recent failed result, a gate with no completed result,
queued/in-progress/cancelled runs, and a gate whose only recent results are
`pull_request` runs (the exact shape that made `gc-root-dominance` look healthy while
its `main` arm was dark), and asserts the verdict for each. A green `--self-test`
means the detector works, not that nothing was tried.

## The queue in front of the schedule (#7966)

A six-hourly sweep only helps if the queue drains faster than six hours. On
2026-08-12 it did not, and the reason was not the gates:

| metric | value |
|---|---|
| queued runs | 1,529 |
| concurrent runs observed | 12–14 |
| queued by event | 794 `pull_request`, 181 `push`, 19 `schedule` |
| distinct head branches among queued PR runs | 63 |
| **branches that still existed** | **2** |

GitHub does not reliably cancel a queued run when its pull request merges and the
branch auto-deletes. Perry squash-merges, auto-deletes branches, and fans each PR out
to ~11 workflows, so roughly **790 runs — 51% of the entire queue — were work for
already-merged PRs**, holding runner slots ahead of ten `main` gates that had not
completed in 32+ hours. No amount of scheduling cadence recovers from that; the
garbage has to be removed.

`ci-queue-reaper.yml` runs `scripts/reap_stale_ci_runs.py` every 30 minutes. It
cancels a run only when all of these hold: `event == "pull_request"`, `status ==
"queued"`, and the head branch has **no open pull request**. A `push`, `schedule`,
tag or `workflow_dispatch` run is therefore structurally out of reach, and an
in-flight run is left alone because it has already consumed the scarce thing. The
predicate keys on open PRs rather than on branch existence, which is what keeps fork
PRs safe — a fork's head branch never appears in this repo's refs.

**It cannot bootstrap.** The reaper queues like everything else, so it will not dig
the repo out of an already-saturated queue. The first drain is a manual
`python3 scripts/reap_stale_ci_runs.py --apply` (dry run is the default); the
schedule keeps it clear afterwards.

## Why "the gate was dark" is not the same as "the gate would have caught it"

#7966 landed alongside #7965, a 2.2–4.8× regression that reached `main` while
`gc-ratchet` was dark. The tempting conclusion — the dark gate let it through — does
not survive checking, and recording why matters more than the incident:

- `gc-ratchet`'s gating metrics are heap/cycle/copy/promote/freed counts. **There is
  no full-mark-sweep or major-cycle count**, and the counter that actually found
  #7965 (`collection_kind: "full"` going 0 → 2) is not one of them. No gate in the
  repo ratchets a collection-*kind* count.
- The two dimensions that did move — wall time and RSS — are explicitly
  `"gating": false` in the `shared_ci` profile CI runs, with the rationale recorded
  in `tolerances.json`. They gate only under `pinned_host`, which CI never uses.
- The workloads that showed it (`retain`, `deeplist`, …) are the gc-handoff corpus,
  not `gc-ratchet`'s fixed 14 probes.

So the human counter census was not a lucky substitute for a starved gate; **it was
the only instrument that covered that dimension at all.** Restoring gate freshness
does not close #7965's third ask, and a freshness dashboard that is entirely green
would still not have caught it.
