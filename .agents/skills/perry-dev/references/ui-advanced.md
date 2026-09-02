<!-- Perry docs bundle: ui-advanced.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/ui/canvas.md -->

# Canvas

The `Canvas` widget provides a 2D drawing surface for custom graphics.

> **Availability**: the `Canvas` handle and method-dispatch surface compile and
> link on every backend, which was the scope closed by
> [#190](https://github.com/PerryTS/perry/issues/190). Full stateful 2D
> rasterization is currently supported by the web backend only. Native
> backends have canvas creation plus lower-level path/gradient/image
> infrastructure, but the HTML-style state setters and drawing calls used in
> the examples below are still classified `Unsupported` in
> `crates/perry-ui-test` and are stubbed or incomplete. The snippets are
> compile-link verified by the doc-tests harness against
> [`docs/examples/ui/canvas/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/ui/canvas/snippets.ts);
> that proves API routing, not visible native pixels. See that file for the
> full standalone program.

The drawing API is **method-based** on the canvas handle (matching the FFI
shape — `perry_ui_canvas_set_fill_color(handle, r, g, b, a)` etc.). Colors
are RGBA floats in `[0.0, 1.0]`.

## Creating a Canvas

```typescript
const canvas = Canvas(400, 300)
canvas.setFillColor(1.0, 0.4, 0.0, 1.0)
canvas.fillRect(10, 10, 100, 80)
```

`Canvas(width, height)` creates a canvas widget; subsequent draw operations
are method calls on the returned handle.

## Drawing Shapes

### Rectangles

```typescript
canvas.setFillColor(1.0, 0.0, 0.0, 1.0)    // red
canvas.fillRect(10, 10, 100, 80)

canvas.setStrokeColor(0.0, 0.0, 1.0, 1.0)  // blue
canvas.setLineWidth(2)
canvas.strokeRect(150, 10, 100, 80)
```

### Lines

```typescript
canvas.setStrokeColor(0.0, 0.0, 0.0, 1.0)
canvas.setLineWidth(1)
canvas.beginPath()
canvas.moveTo(10, 10)
canvas.lineTo(200, 150)
canvas.stroke()
```

### Circles and Arcs

```typescript
canvas.setFillColor(0.0, 1.0, 0.0, 1.0)
canvas.beginPath()
canvas.arc(200, 150, 50, 0, Math.PI * 2)  // x, y, radius, startAngle, endAngle
canvas.fill()
```

### Text

```typescript
canvas.setFillColor(0.0, 0.0, 0.0, 1.0)
canvas.setFont("16px sans-serif")
canvas.fillText("Hello Canvas!", 50, 50)
```

## Platform Notes

| Platform | Implementation | Status |
|----------|---------------|--------|
| Web | HTML5 Canvas | Wired |
| WASM | HTML5 Canvas via JS bridge | Wired |
| macOS | Core Graphics (CGContext) | Partial infrastructure; stateful API incomplete |
| iOS | Core Graphics (CGContext) | Partial infrastructure; stateful API incomplete |
| Linux | Cairo | Partial infrastructure; stateful API incomplete |
| Windows | GDI command buffer | Partial infrastructure; stateful API incomplete |
| Android | Canvas/Bitmap | Partial infrastructure; stateful API incomplete |

The native parity matrix currently marks `setFillColor`, `setStrokeColor`,
`setLineWidth`, `fillRect`, `strokeRect`, `arc`, `closePath`, `fill`,
stateful `stroke`, `setFont`, and `fillText` unsupported. `Canvas()` creation,
clear/begin/move/line primitives, the lower-level colored stroke and gradient
entries, and image drawing have native implementations, but that lower-level
surface does not make the HTML-style examples above fully functional.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Animation](https://docs.perryts.com/ui/animation.html) — Animating widget properties
- [Styling](https://docs.perryts.com/ui/styling.html) — Widget styling


---

<!-- source: docs/src/ui/menus.md -->

# Menus

Perry supports native menu bars, context menus, and toolbars across all
platforms. Every snippet below is excerpted from
[`docs/examples/ui/menus/snippets.ts`](../../examples/ui/menus/snippets.ts) —
CI compiles and runs it on every PR.

The menu API is **handle-based** and free-function: build menus with
`menuCreate()`, fill them with `menuAddItem` / `menuAddItemWithShortcut`, and
attach them with `menuBarAddMenu(bar, title, menu)`. Submenus go through
`menuAddSubmenu(parent, title, submenu)`.

## Menu Bar

```typescript
// Menus are created independently, then attached. Build child menus first,
// then hand them to `menuBarAddMenu(bar, title, menu)`.
const menuBar = menuBarCreate()

// File menu
const fileMenu = menuCreate()
menuAddItemWithShortcut(fileMenu, "New",         "n", () => status.set("file/new"))
menuAddItemWithShortcut(fileMenu, "Open…",       "o", () => status.set("file/open"))
menuAddSeparator(fileMenu)
menuAddItemWithShortcut(fileMenu, "Save",        "s", () => status.set("file/save"))
menuAddItemWithShortcut(fileMenu, "Save As…",    "S", () => status.set("file/saveAs"))
menuBarAddMenu(menuBar, "File", fileMenu)

// Edit menu
const editMenu = menuCreate()
menuAddItemWithShortcut(editMenu, "Undo", "z", () => status.set("edit/undo"))
menuAddItemWithShortcut(editMenu, "Redo", "Z", () => status.set("edit/redo"))
menuAddSeparator(editMenu)
menuAddItemWithShortcut(editMenu, "Cut",   "x", () => status.set("edit/cut"))
menuAddItemWithShortcut(editMenu, "Copy",  "c", () => status.set("edit/copy"))
menuAddItemWithShortcut(editMenu, "Paste", "v", () => status.set("edit/paste"))
menuBarAddMenu(menuBar, "Edit", editMenu)

// Submenu: View → Zoom
const viewMenu = menuCreate()
const zoomSubmenu = menuCreate()
menuAddItemWithShortcut(zoomSubmenu, "Zoom In",     "+", () => status.set("zoom/in"))
menuAddItemWithShortcut(zoomSubmenu, "Zoom Out",    "-", () => status.set("zoom/out"))
menuAddItemWithShortcut(zoomSubmenu, "Actual Size", "0", () => status.set("zoom/reset"))
menuAddSubmenu(viewMenu, "Zoom", zoomSubmenu)
menuBarAddMenu(menuBar, "View", viewMenu)

menuBarAttach(menuBar)
```

### Menu Bar Functions

| Function | Description |
|----------|-------------|
| `menuBarCreate()` | Create a new (empty) menu bar |
| `menuCreate()` | Create a new menu — used as a child of the bar or as a submenu |
| `menuBarAddMenu(bar, title, menu)` | Attach a top-level menu under `title` |
| `menuAddItem(menu, label, callback)` | Append an item without a shortcut |
| `menuAddItemWithShortcut(menu, label, shortcut, callback)` | Append an item with a keyboard shortcut |
| `menuAddSeparator(menu)` | Append a horizontal separator line |
| `menuAddSubmenu(parent, title, submenu)` | Nest a previously-created menu under a label |
| `menuBarAttach(bar)` | Install the bar as the application's main menu |

### Keyboard Shortcuts

The third argument to `menuAddItemWithShortcut` is the shortcut key:

| Shortcut | macOS | Other |
|----------|-------|-------|
| `"n"` | Cmd+N | Ctrl+N |
| `"S"` | Cmd+Shift+S | Ctrl+Shift+S |
| `"+"` | Cmd++ | Ctrl++ |

Uppercase letters imply Shift.

## Context Menus

Right-click menus are attached to widgets via `widgetSetContextMenu(widget, menu)`.
Build the menu the same way as a menu-bar entry, then bind it:

```typescript
const label = Text("Right-click me")
const ctx = menuCreate()
menuAddItem(ctx, "Copy",   () => status.set("ctx/copy"))
menuAddItem(ctx, "Paste",  () => status.set("ctx/paste"))
menuAddSeparator(ctx)
menuAddItem(ctx, "Delete", () => status.set("ctx/delete"))
widgetSetContextMenu(label, ctx)
```

## Toolbar

Add a toolbar to a window. `toolbarAddItem` takes an *identifier* (used by
AppKit to deduplicate items) and a *label*:

```typescript
const toolbar = toolbarCreate()
toolbarAddItem(toolbar, "new",  "New",  () => status.set("tb/new"))
toolbarAddItem(toolbar, "save", "Save", () => status.set("tb/save"))
toolbarAddItem(toolbar, "run",  "Run",  () => status.set("tb/run"))

// `toolbarAttach(toolbar, window)` mounts onto a specific window.
const win = Window("Toolbar Demo", 800, 600)
toolbarAttach(toolbar, win as unknown as number)
```

## Platform Notes

| Platform | Menu Bar | Context Menu | Toolbar |
|----------|----------|-------------|---------|
| macOS | NSMenu | NSMenu | NSToolbar |
| iOS | — (no menu bar) | UIMenu | UIToolbar |
| Windows | HMENU/SetMenu | — | Horizontal layout |
| Linux | GMenu/set_menubar | — | HeaderBar |
| Web | DOM | DOM | DOM |

> **iOS**: Menu bars are not applicable. Use toolbar and navigation patterns instead.

## Next Steps

- [Events](https://docs.perryts.com/ui/events.html) — Keyboard shortcuts and interactions
- [Dialogs](https://docs.perryts.com/ui/dialogs.html) — File dialogs and alerts
- [Layout](https://docs.perryts.com/ui/layout.html) — Toolbar and navigation patterns


---

<!-- source: docs/src/ui/tray.md -->

# Tray Icon

Perry ships a cross-platform system tray API on `perry/ui` (issue #490).
The same six functions work on every desktop target — macOS, Windows,
Linux/GTK4 — and link as no-ops on the mobile / embedded backends.

The API is **handle-based** and free-function: build a tray with
`trayCreate(iconPath)`, attach a context menu built with the existing
`menuCreate` / `menuAddItem` API via `trayAttachMenu(tray, menu)`, and
register a left-click callback with `trayOnClick`.

## Basic Usage

```typescript
// Build the tray BEFORE App() — the tray icon installs while the
// runtime is starting up, so it's already live when the main window
// appears.
const tray = trayCreate("")  // empty path → "●" placeholder
traySetTooltip(tray, "My App")

// Right-click (or left-click on macOS) opens the menu attached below.
const menu = menuCreate()
menuAddItem(menu, "Show", () => status.set("tray/show"))
menuAddSeparator(menu)
menuAddItem(menu, "Quit", () => status.set("tray/quit"))
trayAttachMenu(tray, menu)

// Optional: left-click handler. On macOS the menu pops on left-click,
// so this fires only when no menu is attached. On Windows / Linux,
// left-click and the menu are independent — typical usage is
// "left-click → show main window, right-click → menu".
trayOnClick(tray, () => {
    status.set("tray/click")
})
```

## API

| Function | Description |
|----------|-------------|
| `trayCreate(iconPath: string): Widget` | Create the tray icon. `iconPath` is a filesystem path to a PNG (or `.icns` on macOS, `.ico` on Windows). Pass `""` to use a "●" placeholder. |
| `traySetIcon(tray, iconPath)` | Hot-swap the icon image. Empty path is a no-op. |
| `traySetTooltip(tray, tooltip)` | Set the tooltip text shown on hover. |
| `trayAttachMenu(tray, menu)` | Attach a context menu (built with `menuCreate` / `menuAddItem`). Right-click — or left-click on macOS — opens the menu. |
| `trayOnClick(tray, callback)` | Register a left-click handler. On macOS the menu pops on left-click, so this only fires when no menu is attached; on Windows / Linux, left-click and menu are independent. |
| `trayDestroy(tray)` | Remove the icon. The handle stays valid (subsequent setters are no-ops) so existing closures don't crash. |

## Updating the Icon

```typescript
// Hot-swap the icon. The path can be a PNG (every platform), .icns
// (macOS), or .ico (Windows). Empty path is a no-op.
traySetIcon(tray, "./assets/tray.png")
```

## Removal

```typescript
// Remove the tray icon. After this, the handle is dead — set_icon /
// set_tooltip / attach_menu calls become no-ops.
trayDestroy(tray)
```

## Platform Notes

| Platform | Backend | Notes |
|----------|---------|-------|
| **macOS** | `NSStatusItem` from `NSStatusBar.system` | Icon appears top-right of the menu bar. Click auto-pops the attached menu. Tooltip routes through the button's `toolTip`. PNG and `.icns` paths supported. Icons are rendered as templates — single-color glyphs adapt to light/dark mode. |
| **Windows** | `Shell_NotifyIconW` + `TrackPopupMenu` | Icon appears in the notification area (bottom-right). Left-click → `onClick` callback. Right-click → menu. PNG and `.ico` paths supported (PNG via `LoadImageW` with `LR_LOADFROMFILE`). `trayCreate` must come after `App({...})` since the tray reuses the main window's `WndProc`. |
| **Linux/GTK4** | StatusNotifierItem (KSNI) over D-Bus | Works on KDE Plasma, GNOME-with-`appindicator`-extension, XFCE, Cinnamon, MATE, Budgie, LXQt out of the box. Vanilla GNOME without the extension keeps the service alive but the icon doesn't render — a one-line warning logs at create time. |
| **iOS / tvOS / visionOS / watchOS** | no-op | These platforms have no system-tray concept. Calls link cleanly and return `0` / no-op so cross-platform code compiles unchanged. |
| **Android** | no-op | Android's "tray" is the notifications shade, which is a different concept. The functions link as no-ops. |
| **HarmonyOS** | no-op | Auto-stubbed at compile time. |
| **Web** | no-op (warns) | Browser tabs have no tray equivalent. |

## Click vs. Menu

Different desktops have different click conventions; Perry exposes both
hooks so a single TypeScript app can do the right thing everywhere:

| Platform | Left-click | Right-click |
|----------|-----------|-------------|
| **macOS** | Pops the attached menu | Same as left-click |
| **Windows** | Fires `onClick` | Pops the attached menu |
| **Linux** | Fires `onClick` (KSNI `activate`) | Pops the attached menu |

The typical pattern: use `onClick` to "show / focus the main window" and
`attachMenu` for the user-facing actions. macOS users will see the menu
pop on every click, which is the platform-native behavior.

## Common Patterns

### Background app (no Dock icon, tray-only)

On macOS, set the activation policy to `"accessory"` so the app has no
Dock icon and lives only as a tray-resident process. (See the
[platform docs](https://docs.perryts.com/platforms/macos.html) for activation-policy details.)

### Building the menu after the tray

The menu lookup on every backend happens at click time, not at attach
time. This means you can rebuild the menu (`menuClear` + fresh
`menuAddItem` calls) between user clicks — the new menu wins on the
next click without re-attaching.

## Next Steps

- [Menus](https://docs.perryts.com/ui/menus.html) — Full menu / submenu / shortcut API used by `trayAttachMenu`
- [State Management](https://docs.perryts.com/ui/state.html) — Make tray menu items react to app state
- [Multi-Window](https://docs.perryts.com/ui/multi-window.html) — Show / hide windows from tray actions


---

<!-- source: docs/src/ui/dialogs.md -->

# Dialogs

Perry provides native dialog functions for file selection, alerts, and sheets.
Every snippet below is excerpted from
[`docs/examples/ui/dialogs/snippets.ts`](../../examples/ui/dialogs/snippets.ts) —
CI compiles and links the file on every PR, so the API drawn here is the API
the runtime exposes.

All file dialogs are **callback-based** (the OS-modal panel is non-blocking on
Apple platforms, so a synchronous return wouldn't be possible without freezing
the app's run loop). The callback receives an empty string when the user
cancels.

## File Open Dialog

```typescript
function pickFile(): void {
    openFileDialog((path: string) => {
        if (path.length > 0) {
            console.log(`Selected: ${path}`)
        } else {
            console.log("Open dialog cancelled")
        }
    })
}
```

## Folder Selection Dialog

```typescript
function pickFolder(): void {
    openFolderDialog((path: string) => {
        if (path.length > 0) {
            console.log(`Selected folder: ${path}`)
        }
    })
}
```

## Save File Dialog

```typescript
function pickSaveTarget(): void {
    saveFileDialog((path: string) => {
        if (path.length > 0) {
            console.log(`Will save to: ${path}`)
        }
    }, "untitled", "txt")
}
```

`saveFileDialog(callback, defaultName, extension)` pre-fills the name field
with `defaultName.<extension>`.

## Alert

Display a native alert dialog:

```typescript
function showSimpleAlert(): void {
    alert("Operation Complete", "Your file has been saved successfully.")
}
```

`alert(title, message)` shows a modal alert with an OK button.

## Alert with Buttons

```typescript
function confirmDelete(): void {
    alertWithButtons(
        "Delete Item?",
        "This action cannot be undone.",
        ["Cancel", "Delete"],
        (index: number) => {
            if (index === 1) {
                console.log("user confirmed delete")
            }
        },
    )
}
```

`alertWithButtons(title, message, buttons, callback)` invokes the callback
with the 0-based index of the button the user clicked. By convention put a
destructive label last and check the index in the callback.

## Sheets

Sheets are modal panels attached to a window. Build the body, hand it (with a
size) to `sheetCreate`, then `sheetPresent` it. To dismiss programmatically,
keep the handle around and call `sheetDismiss(handle)`:

```typescript
function showSheet(): void {
    let sheet = 0
    const body = VStack(16, [
        Text("Sheet Content"),
        Button("Close", () => sheetDismiss(sheet)),
    ])
    sheet = sheetCreate(body, 320, 200)
    sheetPresent(sheet)
}
```

## Platform Notes

| Dialog | macOS | iOS | Windows | Linux | Web |
|--------|-------|-----|---------|-------|-----|
| File Open | NSOpenPanel | UIDocumentPicker | IFileOpenDialog | GtkFileChooserDialog | `<input type="file">` |
| File Save | NSSavePanel | — | IFileSaveDialog | GtkFileChooserDialog | Download link |
| Folder | NSOpenPanel | — | IFileOpenDialog | GtkFileChooserDialog | — |
| Alert | NSAlert | UIAlertController | MessageBoxW | MessageDialog | `alert()` |
| Sheet | NSSheet | Modal VC | Modal Dialog | Modal Window | Modal div |

## Complete Example: minimal text editor

A real program that wires `openFileDialog` and `saveFileDialog` into a
state-bound `TextField`:

```typescript
// demonstrates: file-open / save dialogs wired to a tiny text editor
// docs: docs/src/ui/dialogs.md
// platforms: macos, linux, windows

import {
    App,
    VStack, HStack,
    Text, Button, TextField,
    State,
    openFileDialog, saveFileDialog, alert,
} from "perry/ui"
import { readFileSync, writeFileSync } from "fs"

const content = State("")
const filePath = State("")

App({
    title: "Text Editor",
    width: 800,
    height: 600,
    body: VStack(12, [
        HStack(8, [
            Button("Open", () => {
                openFileDialog((path: string) => {
                    if (path.length === 0) return
                    filePath.set(path)
                    content.set(readFileSync(path, "utf-8") as string)
                })
            }),
            Button("Save As", () => {
                saveFileDialog((path: string) => {
                    if (path.length === 0) return
                    writeFileSync(path, content.value)
                    filePath.set(path)
                    alert("Saved", `File saved to ${path}`)
                }, "untitled", "txt")
            }),
        ]),
        Text(filePath.value === "" ? "No file open" : `File: ${filePath.value}`),
        TextField("Start typing...", (value: string) => content.set(value)),
    ]),
})
```

## Next Steps

- [Menus](https://docs.perryts.com/ui/menus.html) — Menu bar and context menus
- [Multi-Window](https://docs.perryts.com/ui/multi-window.html) — Multiple windows
- [Events](https://docs.perryts.com/ui/events.html) — User interaction events


---

<!-- source: docs/src/ui/table.md -->

# Table

The `Table` widget displays tabular data with columns, headers, and row
selection.

> **Platform support:** real implementation lives on **macOS**
> (`NSTableView` + `NSScrollView`); the **Web** target uses an HTML
> `<table>`. **iOS**, **Android**, **Linux/GTK4**, **Windows**, **tvOS**,
> **visionOS**, and **watchOS** link no-op stubs so cross-platform code
> compiles everywhere — the table renders nothing and `tableGetSelectedRow`
> returns `-1`. For production lists on platforms without a real impl,
> use `LazyVStack` (see [Layout](https://docs.perryts.com/ui/layout.html)).

## Creating a Table

```ts
const basicTable = Table(10, 3, (row: number, col: number) => {
    return Text(`Row ${row}, Col ${col}`)
})
```

`Table(rowCount, colCount, renderCell)` creates a table. The render
callback receives `(row, col)` and must return a `Widget` (typically
`Text(...)`). The runtime resolves the returned handle as the cell
view, which lets cells render images, stacks, or composites — not just
plain strings.

## Column Headers

```ts
const userTable = Table(users.length, 3, (row: number, col: number) => {
    const user = users[row]
    if (col === 0) return Text(user.name)
    if (col === 1) return Text(user.email)
    return Text(user.role)
})

tableSetColumnHeader(userTable, 0, "Name")
tableSetColumnHeader(userTable, 1, "Email")
tableSetColumnHeader(userTable, 2, "Role")
```

## Column Widths

```ts
tableSetColumnWidth(userTable, 0, 150)  // Name column
tableSetColumnWidth(userTable, 1, 250)  // Email column
tableSetColumnWidth(userTable, 2, 100)  // Role column
```

## Row Selection

```ts
const selectedRow = State(-1)

tableSetOnRowSelect(userTable, (row: number) => {
    selectedRow.set(row)
    console.log(`Selected row: ${row}`)
})

// Read the currently selected row at any time:
const current = tableGetSelectedRow(userTable)
```

## Dynamic Row Count

Update the number of rows after creation:

```ts
tableUpdateRowCount(userTable, users.length)
```

## Complete Example

```ts
const selectedName = State("None")

const table = Table(users.length, 3, (row: number, col: number) => {
    const user = users[row]
    if (col === 0) return Text(user.name)
    if (col === 1) return Text(user.email)
    return Text(user.role)
})

tableSetColumnHeader(table, 0, "Name")
tableSetColumnHeader(table, 1, "Email")
tableSetColumnHeader(table, 2, "Role")
tableSetColumnWidth(table, 0, 150)
tableSetColumnWidth(table, 1, 250)
tableSetColumnWidth(table, 2, 100)

tableSetOnRowSelect(table, (row: number) => {
    selectedName.set(users[row].name)
})

App({
    title: "Table Demo",
    width: 600,
    height: 400,
    body: VStack(12, [
        table,
        Text(`Selected: ${selectedName.value}`),
    ]),
})
```

## Sort, filter, multi-select (issue #473)

Since v0.5.636 the macOS `Table` exposes a column-sort callback,
multi-row selection, and a passive filter-text slot the user wires to
their own row-hiding logic.

```typescript,no-test
import {
  Table,
  tableSetOnSortChange,
  tableSetAllowsMultipleSelection,
  tableGetSelectedRowsCount,
  tableGetSelectedRowAt,
  tableSetFilterText,
  tableGetFilterText,
} from "perry/ui";

const table = Table(rows.length, cols.length, renderCell);

tableSetAllowsMultipleSelection(table, 1);

tableSetOnSortChange(table, (col, ascending) => {
  // Re-sort your data array, then call tableReload(table)
  rows.sort((a, b) =>
    ascending ? a[col].localeCompare(b[col]) : b[col].localeCompare(a[col]),
  );
});

// Multi-select read-back
const n = tableGetSelectedRowsCount(table);
for (let i = 0; i < n; i++) {
  console.log("selected:", tableGetSelectedRowAt(table, i));
}

// Passive filter slot — your TS code reads it back and adjusts
// `tableUpdateRowCount(table, filteredRows.length)`.
tableSetFilterText(table, "alice");
console.log(tableGetFilterText(table));
```

These are real impls on macOS via `NSTableView.sortDescriptors` and
`selectedRowIndexes`; other platforms link safe-default stubs.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Layout](https://docs.perryts.com/ui/layout.html) — Layout containers
- [Events](https://docs.perryts.com/ui/events.html) — Event handling


---

<!-- source: docs/src/ui/animation.md -->

# Animation

Perry supports animating widget properties for smooth transitions. Every
snippet below is excerpted from
[`docs/examples/ui/animation/snippets.ts`](../../examples/ui/animation/snippets.ts) —
CI compiles and runs it on every PR.

`animateOpacity` and `animatePosition` are special: they're documented as
methods on the widget handle (the only methods perry/ui exposes), and the HIR
lowers them to `widgetAnimateOpacity` / `widgetAnimatePosition` calls under the
hood.

## Opacity Animation

```typescript
const fading = Text("Fading text")
// Animate from the widget's current opacity to `target` over `durationSecs`.
fading.animateOpacity(1.0, 0.3) // target, durationSeconds
```

## Position Animation

```typescript
const moving = Button("Moving", () => {})
// Animate by a delta (dx, dy) relative to the widget's current position.
moving.animatePosition(100, 200, 0.5) // dx, dy, durationSeconds
```

## Example: Fade-In Effect

When the first argument reads from a `State.value`, Perry auto-subscribes
the call to the state — toggling `visible` re-runs the animation.

```typescript
// demonstrates: auto-reactive animateOpacity driven by a State toggle
// docs: docs/src/ui/animation.md
// platforms: macos, linux, windows
// targets: ios-simulator, tvos-simulator, watchos-simulator, web, wasm

import { App, Text, Button, VStack, State } from "perry/ui"

const visible = State(false)

const label = Text("Hello!")
label.animateOpacity(visible.value ? 1.0 : 0.0, 0.3)

App({
    title: "Animation Demo",
    width: 400,
    height: 300,
    body: VStack(16, [
        Button("Toggle", () => {
            visible.set(!visible.value)
        }),
        label,
    ]),
})
```

## Platform Notes

| Platform | Implementation |
|----------|---------------|
| macOS | NSAnimationContext / ViewPropertyAnimator |
| iOS | UIView.animate |
| Android | ViewPropertyAnimator |
| Windows | WM_TIMER-based animation |
| Linux | CSS transitions (GTK4) |
| Web | CSS transitions |

## Next Steps

- [Styling](https://docs.perryts.com/ui/styling.html) — Widget styling properties
- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Events](https://docs.perryts.com/ui/events.html) — User interaction


---

<!-- source: docs/src/ui/on-frame.md -->

# Frame Callbacks (`onFrame`)

`onFrame` subscribes a callback to the next display-link "tick". Use it for
time-based rendering — animations driven from code, simulations, games,
real-time data visualizations, or custom `Canvas` transitions — where you
need a frame-aligned tick with an accurate timestamp instead of
`setInterval(cb, 16)`.

```typescript,no-test
import { onFrame, cancelFrame } from "perry/ui";

function loop(timestampMs: number, deltaMs: number) {
  // advance simulation, redraw...
  onFrame(loop); // schedule the next frame
}

const id = onFrame(loop);
// later, to stop:
cancelFrame(id);
```

## Semantics

- **One-shot.** The callback fires *once*. To keep a loop running, call
  `onFrame` again from inside the callback (this mirrors the web's
  idiomatic `requestAnimationFrame` shape and avoids the "how do I stop a
  recurring callback" footgun).
- **`timestampMs`** is monotonic time since app start, in milliseconds,
  double precision.
- **`deltaMs`** is the time since the previous fire of *this* callback (0
  on the first call). Tracking is keyed off the callback identity so the
  idiomatic `onFrame(loop)` pattern gets accurate deltas without the app
  bookkeeping anything.
- **Order.** Subscribers fire in registration order each frame.
- **Pause when invisible.** The web backend uses `requestAnimationFrame`,
  which is paused automatically when the tab is hidden. The native
  backends drive frames from their main-loop pump; treat that as a soft
  guarantee for now and a real per-platform display-link driver is a
  follow-up.

## Platform mapping

| Platform | Driver |
|---|---|
| Web (WASM) | `requestAnimationFrame` |
| macOS | Main-thread pump (CADisplayLink wiring TBD) |
| iOS / tvOS / visionOS | Main-thread pump (CADisplayLink wiring TBD) |
| Android | Main-thread pump (Choreographer wiring TBD) |
| GTK4 (Linux) | Main-loop pump (`gtk_widget_add_tick_callback` TBD) |
| Windows | WM_TIMER pump (DwmFlush vsync wiring TBD) |


---

<!-- source: docs/src/ui/multi-window.md -->

# Multi-Window & Window Management

Perry supports creating multiple native windows and controlling their
appearance and behavior. Every snippet below is excerpted from
[`docs/examples/ui/multi_window/snippets.ts`](../../examples/ui/multi_window/snippets.ts) —
CI compiles and runs it on every PR.

## Creating Windows

`Window(title, width, height)` returns a window handle. Call `.setBody()` to
set its content and `.show()` to display it:

```typescript
const settings = Window("Settings", 500, 400)
settings.setBody(VStack(16, [
    Text("Settings panel"),
]))
settings.show()
```

## Window Instance Methods

```typescript
const win = Window("My Window", 600, 400)

win.setBody(Text("Hello"))   // Set the root widget
win.show()                    // Show the window
win.hide()                    // Hide without destroying
win.setSize(800, 600)         // Resize dynamically
win.onFocusLost(() => {       // Callback when the window loses focus
    win.hide()
})
win.close()                   // Close and destroy
```

| Method | Description |
|--------|-------------|
| `setBody(widget)` | Set the root widget of the window |
| `show()` | Show the window |
| `hide()` | Hide without destroying — call `show()` again to reveal |
| `setSize(w, h)` | Resize dynamically |
| `onFocusLost(cb)` | Register a callback that fires when focus leaves the window |
| `close()` | Close and destroy |

## App Window Properties

The main `App({})` config object accepts the same window properties for
building launcher-style, overlay, or utility apps:

```typescript
App({
    title: "QuickLaunch",
    width: 600,
    height: 80,
    frameless: true,             // borderless window, movable by background
    level: "floating",           // stays above normal windows
    transparent: true,           // desktop shows through non-opaque regions
    vibrancy: "sidebar",         // native translucent background material
    activationPolicy: "accessory", // no dock icon — launcher-style app
    body: VStack(8, [
        Text("Search..."),
        Button("Open Settings", () => settings.show()),
    ]),
})
```

`App` additionally accepts the optional fields `frameless`, `level`,
`transparent`, `vibrancy`, `activationPolicy`, and `icon`. Each present
field is applied to the window right after creation — before the body
widget is attached, so vibrancy and frameless reconfigure the window ahead
of layout. (`activationPolicy` is also settable at runtime via the
standalone `appSetActivationPolicy(policy)` function.) They map to the
following native primitives:

### `frameless: true`

Removes the window title bar and frame, creating a borderless window.

| Platform | Implementation |
|----------|---------------|
| macOS | `NSWindowStyleMask::Borderless` + movable by background |
| Windows | `WS_POPUP` window style |
| Linux | `set_decorated(false)` |

### `level: "floating" | "statusBar" | "modal" | "normal"`

Controls the window's z-order level relative to other windows.

| Level | Description |
|-------|-------------|
| `"normal"` | Default window level |
| `"floating"` | Stays above normal windows |
| `"statusBar"` | Stays above floating windows |
| `"modal"` | Modal panel level |

| Platform | Implementation |
|----------|---------------|
| macOS | `NSWindow.level` (NSFloatingWindowLevel, etc.) |
| Windows | `SetWindowPos` with `HWND_TOPMOST` |
| Linux | `set_modal(true)` (best-effort) |

### `transparent: true`

Makes the window background transparent, allowing the desktop to show through
non-opaque regions of your UI.

| Platform | Implementation |
|----------|---------------|
| macOS | `isOpaque = false`, `backgroundColor = .clear` |
| Windows | `WS_EX_LAYERED` with `SetLayeredWindowAttributes` |
| Linux | CSS `background-color: transparent` |

### `vibrancy: string`

Applies a native translucent material to the window background. On macOS this
uses the system vibrancy effect; on Windows it uses Mica/Acrylic.

**macOS materials:** `"sidebar"`, `"titlebar"`, `"selection"`, `"menu"`,
`"popover"`, `"headerView"`, `"sheet"`, `"windowBackground"`, `"hudWindow"`,
`"fullScreenUI"`, `"tooltip"`, `"contentBackground"`, `"underWindowBackground"`,
`"underPageBackground"`

| Platform | Implementation |
|----------|---------------|
| macOS | `NSVisualEffectView` with the specified material |
| Windows | `DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)` — Mica, Acrylic, or Mica Alt depending on material (Windows 11 22H2+) |
| Linux | CSS `alpha(@window_bg_color, 0.85)` (best-effort) |

### `activationPolicy: "regular" | "accessory" | "background"`

Controls whether the app appears in the dock/taskbar.

| Policy | Description |
|--------|-------------|
| `"regular"` | Normal app with dock icon and menu bar (default) |
| `"accessory"` | No dock icon, no menu bar activation — ideal for launchers and utilities |
| `"background"` | Fully hidden from dock and app switcher |

| Platform | Implementation |
|----------|---------------|
| macOS | `NSApp.setActivationPolicy()` |
| Windows | `WS_EX_TOOLWINDOW` (removes from taskbar) |
| Linux | `set_deletable(false)` (best-effort) |

## Platform Notes

| Platform | Implementation |
|----------|---------------|
| macOS | NSWindow |
| Windows | CreateWindowEx (HWND) |
| Linux | GtkWindow |
| Web | Floating `<div>` |
| iOS/Android | Modal view controller / Dialog |

On mobile platforms, "windows" are presented as modal views or dialogs since
mobile apps typically use a single-window model.

## Next Steps

- [Events](https://docs.perryts.com/ui/events.html) — Keyboard shortcuts
- [Dialogs](https://docs.perryts.com/ui/dialogs.html) — Modal dialogs and sheets
- [Menus](https://docs.perryts.com/ui/menus.html) — Menu bar and toolbar
- [UI Overview](https://docs.perryts.com/ui/overview.html) — Full UI system overview


---

<!-- source: docs/src/ui/camera.md -->

# Camera

The `perry/ui` module provides a live camera preview widget with color
sampling capabilities.

```ts
import {
    CameraView,
    cameraStart, cameraStop,
    cameraFreeze, cameraUnfreeze,
    cameraSampleColor, cameraSetOnTap,
} from "perry/ui"
```

> **Platform support:** real capture is implemented on **iOS**
> (AVCaptureSession) and **Android** (Camera2). On **macOS**, **Linux**
> (GTK4), **Windows**, and the **Web** target the runtime exports no-op
> stubs so cross-platform code compiles and links cleanly — `CameraView()`
> returns handle 0 and `cameraSampleColor` returns `-1`. Wiring real
> capture on those platforms (AVFoundation on macOS, GStreamer/V4L2 on
> Linux, Media Foundation on Windows, `getUserMedia` on Web) is tracked as
> a follow-up.

## Quick Example

```ts
const colorHex = State("#000000")

const cam = CameraView()
cameraStart(cam)

cameraSetOnTap(cam, (x: number, y: number) => {
    const rgb = cameraSampleColor(x, y)
    if (rgb >= 0) {
        const r = Math.floor(rgb / 65536)
        const g = Math.floor((rgb % 65536) / 256)
        const b = Math.floor(rgb % 256)
        colorHex.set(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`)
    }
})

App({
    title: "Color Picker",
    width: 400,
    height: 600,
    body: VStack(16, [
        cam,
        Text(`Color: ${colorHex.value}`),
    ]),
})
```

## API Reference

### `CameraView()`

Create a live camera preview widget.

```ts
const preview = CameraView()
```

Returns a widget handle. The camera does not start automatically — call `cameraStart()` to begin capture.

### `cameraStart(handle)`

Start the live camera feed.

```ts
cameraStart(preview)
```

On iOS, the camera permission dialog is shown automatically on first use.

### `cameraStop(handle)`

Stop the camera feed and release the capture session.

```ts
cameraStop(preview)
```

### `cameraFreeze(handle)`

Pause the live preview (freeze the current frame).

```ts
cameraFreeze(preview)
```

The camera session remains active but the preview stops updating. Useful for "capture" moments where you want to inspect the frozen frame.

### `cameraUnfreeze(handle)`

Resume the live preview after a freeze.

```ts
cameraUnfreeze(preview)
```

### `cameraSampleColor(x, y)`

Sample the pixel color at normalized coordinates.

```ts
const rgb = cameraSampleColor(0.5, 0.5) // center of frame
```

- `x`, `y` are normalized coordinates (0.0–1.0)
- Returns packed RGB as a number: `r * 65536 + g * 256 + b`
- Returns `-1` if no frame is available

To extract individual channels:

```ts
const r = Math.floor(rgb / 65536)
const g = Math.floor((rgb % 65536) / 256)
const b = Math.floor(rgb % 256)
```

The color is averaged over a 5x5 pixel region around the sample point for noise reduction.

### `cameraSetOnTap(handle, callback)`

Register a tap handler on the camera view.

```ts
cameraSetOnTap(preview, (tx: number, ty: number) => {
    // tx, ty are normalized coordinates (0.0-1.0)
    const tappedRgb = cameraSampleColor(tx, ty)
    console.log(`tapped color: ${tappedRgb}`)
})
```

The callback receives normalized coordinates of the tap location, which can be passed directly to `cameraSampleColor()`.

## Implementation

On iOS, the camera uses AVCaptureSession with AVCaptureVideoPreviewLayer for GPU-accelerated live preview, and AVCaptureVideoDataOutput for frame capture. Color sampling reads pixel data from CVPixelBuffer.

On Android, the camera uses Camera2 with a TextureView preview surface. Color sampling reads from the most recent ImageReader frame.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Audio Capture](https://docs.perryts.com/system/audio.html) — Microphone input and sound metering


---

<!-- source: docs/src/ui/webview.md -->

# WebView

`WebView` embeds a real browser engine inside the native widget tree —
`WKWebView` on Apple platforms, `WebView2` on Windows, `WebKitGTK 6.0`
on Linux, `android.webkit.WebView` on Android, and a sandboxed
`<iframe>` on the web target. Use it for OAuth / payment flows, embedded
admin pages, help / docs viewers, or any "show this URL as part of my
app" surface. The cross-platform implementation shipped under closed issue
#658.

```ts
import {
    WebView,
    webviewLoadUrl,
    webviewReload,
    webviewGoBack,
    webviewGoForward,
    webviewCanGoBack,
    webviewEvaluateJs,
    webviewClearCookies,
} from "perry/ui"
```

> **Scope.** This is a "browser tab embedded in your native widget tree"
> primitive — explicit non-goals: a Tauri / Electron-style native↔JS RPC
> bridge, custom protocol / scheme handlers, DevTools, file downloads,
> WebGL / camera / mic / clipboard permission negotiation, service
> workers, WebRTC. If you need any of those, reach for Tauri or
> Electron; the rest of `perry/ui` still applies.

## Basic Usage

```ts
const wv = WebView({
    url: "https://example.com",
    width: 800,
    height: 600,
})

App({
    title: "WebView Demo",
    width: 820,
    height: 640,
    body: wv,
})
```

`WebView({...})` returns a `Widget` you can drop into any layout
container. The widget tree's layout engine controls final size — `width`
and `height` are hints for the initial bounds.

## OAuth / Callback Interception

The load-bearing use case. `onShouldNavigate` is a **synchronous**
intercept invoked before each navigation; return `false` to cancel the
load. Every backend's should-load hook is itself sync on the main
thread (`decidePolicyForNavigationAction`, `NavigationStarting`,
`shouldOverrideUrlLoading`, `decide-policy`), so the contract is the
same everywhere.

```ts
const authCode = State("")

const auth = WebView({
    url: "https://accounts.google.com/o/oauth2/auth?client_id=...&redirect_uri=https://myapp.com/oauth/callback&response_type=code&scope=email",
    // Hard host-level allowlist — blocked at the native delegate
    // without round-tripping into TS. Exact match or subdomain match
    // (so "google.com" allows "accounts.google.com").
    allowedDomains: ["accounts.google.com", "google.com", "myapp.com"],
    onShouldNavigate: (url) => {
        if (url.startsWith("https://myapp.com/oauth/callback?")) {
            const code = new URL(url).searchParams.get("code") ?? ""
            authCode.set(code)
            return false  // cancel — we already have what we need
        }
        return true
    },
    onLoaded: (url) => {
        // Fires after every successful page load.
    },
    onError: (code, message) => {
        // DNS / TLS / HTTP / cancellation all flow here.
    },
})
```

The `allowedDomains` allowlist is enforced at the **native delegate
layer** — disallowed hosts never reach your `onShouldNavigate`. Treat it
as defense-in-depth against a hijacked OAuth page redirecting the
embedded session somewhere unexpected.

## Imperative Navigation

Drive the WebView from outside (toolbar buttons, deep links, app-state
changes):

```ts
// Navigate the WebView from outside (e.g. from a toolbar button).
webviewLoadUrl(wv, "https://perryts.com")
webviewReload(wv)
webviewGoBack(wv)
webviewGoForward(wv)
const hasHistory = webviewCanGoBack(wv)  // 1 or 0
```

## Reading Page State

`webviewEvaluateJs(handle, js, callback)` runs a one-shot JS expression
in the WebView's content process and delivers the stringified result.
Use this for "after the redirect lands, read `document.cookie` /
`localStorage.getItem(...)`" — not as a general native↔JS RPC channel.

```ts
// Read state out of the loaded page after `onLoaded` fires. The
// callback gets the stringified return value (empty string on null /
// undefined / error). Plain string returns are JSON-unwrapped for
// ergonomic `document.cookie` reads.
const reader = WebView({
    url: "https://example.com/auth/callback",
    onLoaded: (_url) => {
        webviewEvaluateJs(reader, "document.cookie", (cookies) => {
            // parseCookies(cookies)
        })
    },
})
```

The callback receives an empty string on `null` / `undefined` / error.
Plain string returns are JSON-unwrapped (so `document.cookie` reads
clean, without surrounding quotes).

## Cookie Isolation

`ephemeral: true` is the **default** — auth flows that silently reuse
a user's logged-in browser session are usually a footgun. Each backend
maps this to its native equivalent at construction time:

| Platform | Ephemeral | Persistent |
|----------|-----------|------------|
| **macOS / iOS / visionOS** | `WKWebsiteDataStore.nonPersistent()` | `WKWebsiteDataStore.defaultDataStore()` |
| **Windows** | per-handle temp `userDataFolder` under `%TEMP%\PerryWebView\<pid>-<tag>` | `%LOCALAPPDATA%\PerryWebView\persistent` |
| **Linux / GTK4** | `WebKitNetworkSession::new_ephemeral()` | `~/.local/share/perry-webview` + `~/.cache/perry-webview` (XDG-aware) |
| **Android** | best-effort `CookieManager.removeAllCookies(null)` + `WebStorage.deleteAllData()` at create | shared process-wide storage |
| **Web** | iframe shares parent storage (no true isolation) | same |

To opt out:

```ts
// Opt out of ephemeral cookies so the user's session survives app
// restarts (like a regular browser profile).
const browser = WebView({
    url: "https://news.ycombinator.com",
    ephemeral: false,
    userAgent: "MyApp/1.0",
})
```

`webviewClearCookies(handle)` wipes the data store on demand — useful
at logout, or between accounts:

```ts
// Wipe the WebView's cookies / localStorage / IndexedDB. Useful at
// logout, or between user accounts in a multi-tenant flow. No-op when
// `ephemeral: true` (the default), since there's nothing persisted to
// clear.
webviewClearCookies(wv)
```

## API

| Function | Description |
|----------|-------------|
| `WebView({ url, allowedDomains?, userAgent?, ephemeral?, onShouldNavigate?, onLoaded?, onError?, width?, height? })` | Construct the widget. Returns a `Widget` handle. |
| `webviewLoadUrl(handle, url)` | Replace the current URL and re-paint. |
| `webviewReload(handle)` | Reload the current page. |
| `webviewGoBack(handle)` | Navigate back through session history. |
| `webviewGoForward(handle)` | Navigate forward through session history. |
| `webviewCanGoBack(handle)` | Returns `1` if there's back history, `0` otherwise. |
| `webviewEvaluateJs(handle, js, callback)` | Run JS in the content process; callback receives the stringified result. |
| `webviewClearCookies(handle)` | Wipe cookies / localStorage / IndexedDB for this WebView's data store. |

### Options

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `url` | `string` | — | Initial URL. Required. |
| `allowedDomains` | `string[]` | `[]` | Hard host allowlist (exact OR subdomain). Empty / omitted = no host restriction. |
| `userAgent` | `string` | platform WebKit UA | Custom UA header. |
| `ephemeral` | `boolean` | `true` | Cookie / storage isolation. See the table above. |
| `onShouldNavigate` | `(url) => boolean \| void` | — | **Sync** intercept. Return `false` to cancel. |
| `onLoaded` | `(url) => void` | — | Fires when a page finishes loading. |
| `onError` | `(code, message) => void` | — | DNS / TLS / HTTP / cancellation. |
| `width`, `height` | `number` | layout-engine controlled | Initial pixel bounds; layout engine still has final say. |

## Platform Notes

| Platform | Backend | Notes |
|----------|---------|-------|
| **macOS** | `WKWebView` (AppKit) | Full callback parity. PerryWebViewDelegate (NSObject conforming to `WKNavigationDelegate`) carries the user closures + allowed-domains list. |
| **iOS / visionOS** | `WKWebView` (UIKit) | Same delegate pattern as macOS. |
| **Windows** | `WebView2` via `webview2-com` (pinned to `windows = "0.58"`) | A STATIC host HWND becomes the widget handle; `ICoreWebView2Controller` binds to it. WebView2's two-stage async init is wrapped synchronously by pumping the message queue with a 10s timeout — `WebView({...})` blocks until the widget is live, so the first navigation isn't racing init. `WM_SIZE` is subclassed on the host HWND and forwards bounds to `SetBounds` so the surface tracks layout-engine resizes. Requires the WebView2 runtime, which ships preinstalled on Windows 10+ and Windows Server 2019+. |
| **Linux / GTK4** | `WebKitGTK 6.0` via `webkit6 = "=0.4"` | Real implementation. `decide-policy::navigation-action` is the sync intercept. Build dep: `libwebkitgtk-6.0-dev` (Ubuntu 22.10+ / Debian 12+). |
| **Android** | `android.webkit.WebView` via JNI | `PerryWebViewClient.kt` (deployed alongside the runtime APK) bridges `shouldOverrideUrlLoading` / `onPageFinished` / `onReceivedError` back to native Rust. Full callback parity with the Apple / Windows / GTK4 backends. Ephemeral isolation is best-effort — Android WebView shares storage process-wide; `CookieManager.removeAllCookies(null)` + `WebStorage.deleteAllData()` runs at create when requested. |
| **Web** | sandboxed `<iframe>` | `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`. `onShouldNavigate` is best-effort (cross-origin URLs the iframe navigates to are unreachable from JS for security reasons); `onLoaded` fires from the iframe's `load` event; `onError` from `error` (same-origin only). `webviewEvaluateJs` only works on same-origin frames. UA is browser-controlled. See "Cross-origin messaging" below. |
| **tvOS / watchOS** | stub | All 14 FFIs link as no-ops returning `0`. The widget is invisible; cross-platform code compiles unchanged. |

## Cross-Origin Messaging (Web Target)

On the web target, the embedded iframe can `window.parent.postMessage`
out, and the host can `window.addEventListener("message", ...)` to
receive. This is a **browser-only** pattern — native targets don't
expose `postMessage` (that's the Tauri / Electron path Perry's WebView
deliberately avoids).

The portable contract that works on every target:

- Push state **in** with `webviewEvaluateJs(wv, "window.someHook(...)")`.
- Pull state **out** by intercepting a known callback URL in
  `onShouldNavigate`.

## Common Pitfalls

- **Don't reuse one `WebView` for unrelated sessions.** Cookie isolation
  is per-WebView, not per-call. If you need to log a different user in,
  call `webviewClearCookies(handle)` first or destroy and recreate the
  widget.
- **`onShouldNavigate` runs on the main thread.** Keep it cheap — it
  blocks the navigation until you return. Heavy work belongs in
  `onLoaded` or off-thread via `spawn`.
- **WebView2 runtime requirement on older Windows.** WebView2 is
  preinstalled on Windows 10 1803+ and Windows Server 2019+. On older
  builds the runtime needs to be installed separately (Microsoft ships
  an evergreen bootstrapper).
- **No bidirectional RPC.** If you find yourself round-tripping
  structured data through `webviewEvaluateJs` callbacks, you're past
  the design scope — pick Tauri / Electron instead, or move the logic
  out of the embedded page.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [State Management](https://docs.perryts.com/ui/state.html) — React to `onLoaded` / `onError` from the rest of the UI
- [Multi-Window](https://docs.perryts.com/ui/multi-window.html) — Pop a fresh window with a WebView for isolated sessions
