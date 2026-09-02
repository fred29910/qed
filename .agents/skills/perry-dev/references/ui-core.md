<!-- Perry docs bundle: ui-core.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/ui/overview.md -->

# UI Overview

Perry's `perry/ui` module lets you build native desktop and mobile apps with declarative TypeScript. Your UI code compiles directly to platform-native widgets — AppKit on macOS, UIKit on iOS, GTK4 on Linux, Win32 on Windows, and DOM elements on the web.

## Quick Start

```typescript
// demonstrates: the smallest complete Perry UI app
// docs: docs/src/ui/overview.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, Text, VStack } from "perry/ui"

App({
    title: "My App",
    width: 400,
    height: 300,
    body: VStack(16, [
        Text("Hello from Perry!"),
    ]),
})
```

```bash
perry app.ts -o app && ./app
```

## Mental Model

Perry's UI follows the same model as SwiftUI and Flutter: you compose native widgets using stack-based layout containers (`VStack`, `HStack`, `ZStack`), control alignment and distribution, and style widgets via free functions that take the widget handle as their first argument (`textSetColor(label, r, g, b, a)`, `widgetSetEdgeInsets(stack, ...)`, etc.). If you're coming from web development, the key shift is:

- **Layout** is controlled by stack alignment, distribution, and spacers — not CSS properties. See [Layout](https://docs.perryts.com/ui/layout.html).
- **Styling** is applied directly to widgets — not through stylesheets. See [Styling](https://docs.perryts.com/ui/styling.html).
- **Absolute positioning** uses overlays (`widgetAddOverlay` + `widgetSetOverlayFrame`) — not `position: absolute/relative`.
- **Design tokens** come from the `perry-styling` package. See [Theming](https://docs.perryts.com/ui/theming.html).

## App Lifecycle

Every Perry UI app starts with `App()`:

```typescript
function runAppShell(): void {
    App({
        title: "Window Title",
        width: 800,
        height: 600,
        body: VStack(16, [
            Text("Content here"),
        ]),
    })
}
```

`App({})` accepts a config object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Window title |
| `width` | number | Initial window width |
| `height` | number | Initial window height |
| `body` | widget | Root widget |
| `icon` | string | App icon file path (optional) |
| `windowState` | string | Initial state: `"normal"`, `"maximized"`, `"fullscreen"` (optional) |
| `frameless` | boolean | Remove title bar (optional) |
| `level` | string | Window z-order: `"floating"`, `"statusBar"`, `"modal"` (optional) |
| `transparent` | boolean | Transparent background (optional) |
| `vibrancy` | string | Native blur material, e.g. `"sidebar"` (optional) |
| `activationPolicy` | string | `"regular"`, `"accessory"` (no dock icon), `"background"` (optional) |

See [Multi-Window](https://docs.perryts.com/ui/multi-window.html#app-window-properties) for full
documentation on window properties, including the native primitive each
field maps to per platform.

### Lifecycle Hooks

```typescript
onActivate(() => {
    console.log("App became active")
})

onTerminate(() => {
    console.log("App is closing")
})
```

## Widget Tree

Perry UIs are built as a tree of widgets:

```typescript
function runWidgetTree(): void {
    App({
        title: "Layout Demo",
        width: 400,
        height: 300,
        body: VStack(16, [
            Text("Header"),
            HStack(8, [
                Button("Left", () => console.log("left")),
                Button("Right", () => console.log("right")),
            ]),
            Text("Footer"),
        ]),
    })
}
```

Widgets are created by calling their constructor functions. Layout containers (`VStack`, `HStack`, `ZStack`) accept a spacing value (in points) followed by an array of child widgets.

## Handle-Based Architecture

Under the hood, each widget is a handle — a small integer that references a native platform object. When you call `Text("hello")`, Perry creates a native `NSTextField` (macOS), `UILabel` (iOS), `GtkLabel` (Linux), or `<span>` (web) and returns a handle you can use to modify it.

```typescript
const label = Text("Hello")
textSetFontSize(label, 18)              // Modifies the native widget
textSetColor(label, 1.0, 0.0, 0.0, 1.0) // RGBA floats in [0,1]
```

## Imports

All UI functions are imported from `perry/ui`:

```typescript
import {
    // App lifecycle
    App, onActivate, onTerminate,

    // Widgets
    Text, Button, TextField, SecureField, TextArea,
    Toggle, Slider, ProgressView, Picker, ImageFile, ImageSymbol,

    // Layout
    VStack, HStack, ZStack, ScrollView, Spacer, Divider,
    NavStack, TabBar, LazyVStack, Section,
    VStackWithInsets, HStackWithInsets, SplitView, splitViewAddChild,

    // Layout control
    stackSetAlignment, stackSetDistribution, stackSetDetachesHidden,
    widgetMatchParentWidth, widgetMatchParentHeight, widgetSetHugging,
    widgetAddOverlay, widgetSetOverlayFrame,

    // State
    State, ForEach,

    // Dialogs
    openFileDialog, openFolderDialog, saveFileDialog,
    alert, alertWithButtons,
    sheetCreate, sheetPresent, sheetDismiss,

    // Menus
    menuCreate, menuAddItem, menuAddSeparator, menuAddSubmenu,
    menuBarCreate, menuBarAddMenu, menuBarAttach,
    widgetSetContextMenu,

    // Window
    Window,
} from "perry/ui"
```

> [`Canvas`](https://docs.perryts.com/ui/canvas.html), [`CameraView`](https://docs.perryts.com/ui/camera.html), and the virtualized
> [`Table`](https://docs.perryts.com/ui/table.html) widget are wired through the LLVM codegen (closed via
> [#190](https://github.com/PerryTS/perry/issues/190),
> [#191](https://github.com/PerryTS/perry/issues/191), and
> [#192](https://github.com/PerryTS/perry/issues/192)). See each widget's page
> for the platform-support matrix.

## Platform Differences

The same code runs on all platforms, but the look and feel matches each platform's native style:

| Feature | macOS | iOS | Linux | Windows | Web |
|---------|-------|-----|-------|---------|-----|
| Buttons | NSButton | UIButton | GtkButton | HWND Button | `<button>` |
| Text | NSTextField | UILabel | GtkLabel | Static HWND | `<span>` |
| Layout | NSStackView | UIStackView | GtkBox | Manual layout | Flexbox |
| Menus | NSMenu | — | GMenu | HMENU | DOM |

Platform-specific behavior is noted on each widget's documentation page.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Layout](https://docs.perryts.com/ui/layout.html) — Arranging widgets
- [State Management](https://docs.perryts.com/ui/state.html) — Reactive state and bindings
- [Styling](https://docs.perryts.com/ui/styling.html) — Colors, fonts, sizing
- [Events](https://docs.perryts.com/ui/events.html) — Click, hover, keyboard


---

<!-- source: docs/src/ui/widgets.md -->

# Widgets

Perry provides native widgets that map to each platform's native controls.
Every example on this page is a real runnable program verified by CI
(`scripts/run_doc_tests.sh`) — the snippet you read is the same source that's
compiled and launched.

Most widget operations use **free functions**. A widget is a 64-bit opaque
handle; pass it into helpers like `textSetFontSize(widget, 18)` rather than
calling `widget.setFontSize(18)`. The small method surface declared by
`WidgetMethods` is cross-backend too: it includes animations plus
`parent.addChild(child)` and `parent.removeAllChildren()` compatibility aliases
for `widgetAddChild` and `widgetClearChildren`.

## Text

Displays read-only text.

```typescript,no-test
// demonstrates: Text widget styling with the real free-function API
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, textSetFontSize, textSetFontWeight, textSetColor, textSetFontFamily } from "perry/ui"

const label = Text("Hello, World!")
textSetFontSize(label, 18)
textSetColor(label, 0.2, 0.2, 0.2, 1.0) // RGBA in [0, 1]
textSetFontFamily(label, "Menlo")

const bold = Text("Bold")
textSetFontWeight(bold, 20, 1.0)

App({
    title: "Text",
    width: 400,
    height: 200,
    body: VStack(8, [label, bold]),
})
```

Color is RGBA with each channel in `[0.0, 1.0]` — divide a hex byte by 255
(`0x33 / 255 ≈ 0.2`).

**Helpers:** `textSetString`, `textSetFontSize`, `textSetFontWeight`,
`textSetFontFamily`, `textSetColor`, `textSetWraps`, `textSetSelectable`.

Text widgets inside template literals with `state.value` update automatically
— perry detects the state read and rewires the widget to re-render on change.
See [State Management](https://docs.perryts.com/ui/state.html).

## Button

A clickable button.

```typescript,no-test
// demonstrates: Button styling with buttonSet*/widgetSet* helpers
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import {
    App,
    VStack,
    Button,
    buttonSetBordered,
    widgetSetEnabled,
    setCornerRadius,
} from "perry/ui"

// Note: buttonSetContentTintColor is macOS/iOS-only (maps to NSButton /
// UIButton tint). GTK4/Win32 don't have an equivalent — set
// widgetSetBackgroundColor(btn, r, g, b, a) there instead.
const primary = Button("Click Me", () => console.log("Clicked!"))
buttonSetBordered(primary, 1)
setCornerRadius(primary, 8)

const disabled = Button("Can't click me", () => {})
widgetSetEnabled(disabled, 0)

App({
    title: "Button",
    width: 400,
    height: 200,
    body: VStack(12, [primary, disabled]),
})
```

**Helpers:** `buttonSetTitle`, `buttonSetBordered`, `buttonSetImage`
(SF Symbol name on macOS/iOS), `buttonSetImagePosition`,
`buttonSetContentTintColor`, `buttonSetTextColor`, `widgetSetEnabled`.

## TextField

An editable single-line text input.

```typescript,no-test
// demonstrates: TextField + two-way binding via stateBindTextfield
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, TextField, State, stateBindTextfield } from "perry/ui"

const text = State("")
const field = TextField("Placeholder...", (value: string) => text.set(value))
stateBindTextfield(text, field) // programmatic text.set() also updates the field

App({
    title: "TextField",
    width: 400,
    height: 200,
    body: VStack(12, [
        field,
        Text(`You typed: ${text.value}`),
    ]),
})
```

`TextField(placeholder, onChange)` fires `onChange` as the user types. Pair
with `stateBindTextfield(state, field)` for two-way binding so programmatic
`state.set(…)` also updates the visible text.

**Helpers:** `textfieldSetString`, `textfieldSetFontSize`,
`textfieldSetTextColor`, `textfieldSetBackgroundColor`,
`textfieldSetBorderless`, `textfieldSetOnSubmit`, `textfieldSetOnFocus`,
`textfieldSetNextKeyView`.

## SecureField

A password input — identical signature to `TextField`, but text is masked.

```typescript,no-test
// demonstrates: SecureField for password input
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, SecureField, State } from "perry/ui"

const password = State("")

App({
    title: "SecureField",
    width: 400,
    height: 200,
    body: VStack(12, [
        SecureField("Enter password...", (value: string) => password.set(value)),
    ]),
})
```

## Toggle

A boolean on/off switch.

```typescript,no-test
// demonstrates: Toggle widget bound to State
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, Toggle, State } from "perry/ui"

const enabled = State(false)

App({
    title: "Toggle",
    width: 400,
    height: 200,
    body: VStack(12, [
        Toggle("Enable notifications", (on: boolean) => enabled.set(on)),
        Text(`Enabled: ${enabled.value}`),
    ]),
})
```

## Slider

A numeric slider.

```typescript,no-test
// demonstrates: Slider with a numeric range
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, Slider, State } from "perry/ui"

const value = State(50)

App({
    title: "Slider",
    width: 400,
    height: 200,
    body: VStack(12, [
        Slider(0, 100, (v: number) => value.set(v)),
        Text(`Value: ${value.value}`),
    ]),
})
```

`Slider(min, max, onChange)` — `onChange` fires on every drag. Use
`stateBindSlider(state, slider)` for two-way binding.

## Picker

A dropdown selection control. Items are added with `pickerAddItem`.

## WheelPicker

A wheel-style selector for long sequential lists such as hours, minutes, or
quantities. It uses `UIPickerView` on iOS/visionOS, `NumberPicker` on Android,
and the platform's scroll-capable selection control on desktop and web.

```typescript,no-test
import { WheelPicker, wheelPickerAddItem } from "perry/ui";

const hours = WheelPicker((index) => console.log("hour:", index));
for (let hour = 0; hour < 24; hour++) {
  wheelPickerAddItem(hours, hour.toString().padStart(2, "0"));
}
```

```typescript,no-test
// demonstrates: Picker with items added via pickerAddItem
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, Picker, State, pickerAddItem } from "perry/ui"

const selected = State(0)
const picker = Picker((index: number) => selected.set(index))
pickerAddItem(picker, "Option A")
pickerAddItem(picker, "Option B")
pickerAddItem(picker, "Option C")

App({
    title: "Picker",
    width: 400,
    height: 200,
    body: VStack(12, [
        picker,
        Text(`Selected index: ${selected.value}`),
    ]),
})
```

## ImageFile / ImageSymbol

Two distinct constructors:

- `ImageFile(path)` — image from a file path
- `ImageSymbol(name)` — SF Symbol glyph name (macOS/iOS only)

```typescript,no-test
// demonstrates: ImageSymbol for SF Symbol glyphs (macOS/iOS)
// docs: docs/src/ui/widgets.md
// platforms: macos
// targets: ios-simulator, visionos-simulator, tvos-simulator

import { App, HStack, ImageSymbol, widgetSetWidth, widgetSetHeight } from "perry/ui"

const star = ImageSymbol("star.fill")
widgetSetWidth(star, 32)
widgetSetHeight(star, 32)

const heart = ImageSymbol("heart.fill")
const bell = ImageSymbol("bell.fill")

App({
    title: "ImageSymbol",
    width: 400,
    height: 200,
    body: HStack(12, [star, heart, bell]),
})
```

Use `widgetSetWidth(img, N)` / `widgetSetHeight(img, N)` to size the image.

## ProgressView

An indeterminate or determinate progress indicator.

```typescript,no-test
// demonstrates: ProgressView as an indeterminate spinner
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, ProgressView } from "perry/ui"

App({
    title: "ProgressView",
    width: 400,
    height: 200,
    body: VStack(12, [
        Text("Loading..."),
        ProgressView(),
    ]),
})
```

## TextArea

A multi-line text input. Same `(placeholder, onChange)` signature as
`TextField` but renders as a multi-line box.

```typescript,no-test
// demonstrates: TextArea for multi-line input
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, Text, TextArea, State } from "perry/ui"

const content = State("")

App({
    title: "TextArea",
    width: 500,
    height: 400,
    body: VStack(12, [
        TextArea("Enter multi-line text...", (value: string) => content.set(value)),
        Text(`Length: ${content.value.length}`),
    ]),
})
```

**Helpers:** `textareaSetString`.

## Sections

Group controls into labelled sections. Perry has no `Form()` widget — use a
`VStack` of `Section(title)`s and attach children via `widgetAddChild`.

```typescript,no-test
// demonstrates: Section grouping with widgetAddChild (no Form widget in Perry)
// docs: docs/src/ui/widgets.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import {
    App,
    VStack,
    Section,
    TextField,
    Toggle,
    State,
    widgetAddChild,
} from "perry/ui"

const name = State("")
const notifications = State(true)

const personal = Section("Personal Info")
widgetAddChild(personal, TextField("Name", (value: string) => name.set(value)))

const settings = Section("Settings")
widgetAddChild(
    settings,
    Toggle("Notifications", (on: boolean) => notifications.set(on)),
)

App({
    title: "Sections",
    width: 500,
    height: 400,
    body: VStack(16, [personal, settings]),
})
```

## Mobile widgets (issue #553)

### BottomNavigation

5-tab bottom bar with icon + label + badge per tab. `onSelect(index)`
fires when the user taps; `bottomNavSetSelected` is the programmatic
counterpart and does NOT fire `onSelect`.

```typescript,no-test
import {
  BottomNavigation,
  bottomNavAddItem,
  bottomNavSetBadge,
} from "perry/ui";

const bar = BottomNavigation((index) => {
  console.log("tab:", index);
});
bottomNavAddItem(bar, "house", "Home");
bottomNavAddItem(bar, "magnifyingglass", "Search");
bottomNavAddItem(bar, "bell", "Activity");
bottomNavSetBadge(bar, 2, "5");
```

Real on macOS (`NSStackView` + `NSButton` strip with SF Symbol icons),
iOS (`UITabBar`), Android (custom `LinearLayout` strip with badge
overlay), and GTK4 (`GtkBox` + Adwaita CSS). Stub on Windows, tvOS,
visionOS, watchOS.

### ImageGallery

Swipeable, paging carousel of images. Local file paths load
synchronously; HTTP/HTTPS URLs are fetched on a background queue and
applied on the main thread.

```typescript,no-test
import { ImageGallery, imageGalleryAddImage } from "perry/ui";

const gallery = ImageGallery((idx) => console.log("page:", idx));
imageGalleryAddImage(gallery, "/photos/01.jpg", "Hero shot");
imageGalleryAddImage(gallery, "https://cdn.example/photo2.jpg", "Wide angle");
```

Real on macOS (`NSScrollView` paging), iOS (`UIScrollView` with
`scrollViewDidEndDecelerating`), Android (`HorizontalScrollView`), GTK4
(`GtkScrolledWindow` + `GtkPicture`). Stub on Windows, tvOS, visionOS,
watchOS.

### Pull-to-refresh

Available on `ScrollView` and `LazyVStack`. The `onPull` callback fires
once when the user pulls past the threshold; call
`scrollviewEndRefreshing` (or `lazyvstackEndRefreshing`) when your async
fetch settles to dismiss the spinner.

```typescript,no-test
import {
  ScrollView,
  scrollviewSetRefreshControl,
  scrollviewEndRefreshing,
} from "perry/ui";

const scroll = ScrollView();
scrollviewSetRefreshControl(scroll, async () => {
  await refreshFeed();
  scrollviewEndRefreshing(scroll);
});
```

Real on iOS (`UIRefreshControl`). The macOS / Android / GTK4 / Windows
desktops have no native pull-to-refresh idiom — they're documented
no-ops.

### Infinite scroll (`onScrollEnd`)

Fires once when the user scrolls past `thresholdPx` (or `thresholdItems`
for `LazyVStack`) from the bottom; re-arms after the user scrolls back
up past the threshold so a single fetch is queued at a time.

```typescript,no-test
import { ScrollView, scrollviewSetScrollEndCallback } from "perry/ui";

const scroll = ScrollView();
scrollviewSetScrollEndCallback(
  scroll,
  () => loadMore(),
  200, // threshold in pixels from the bottom
);
```

Real on every platform that has a scroll view: macOS
(`NSViewBoundsDidChangeNotification`), iOS
(`UIScrollViewDelegate.scrollViewDidScroll`), Android
(`View.OnScrollChangeListener`), GTK4 (`GtkAdjustment::value-changed`),
Windows (`WM_VSCROLL` / `WM_MOUSEWHEEL`).

## Platform-specific widgets

These exist only on specific platforms and aren't verified by the
cross-platform doc-tests:

- **`Table(rows, cols, renderer)`** — macOS only. Now supports
  `tableSetSortColumn`, `tableSetFilterText`, and multi-select since
  v0.5.636 (#473).
- **`QRCode(data, size)`** — macOS only. Renders a QR code.
- **`Canvas(width, height, draw)`** — all desktop platforms. A drawing
  surface; see [Canvas](https://docs.perryts.com/ui/canvas.html).
- **`CameraView()`** — iOS only (other platforms planned). See
  [Camera](https://docs.perryts.com/ui/camera.html).

### Combobox (issue #475)

Editable text field with a filterable dropdown of suggestions. macOS
uses `NSComboBox` with as-you-type completion; other platforms stub the
FFI today (the field falls back to a plain editable field).

```typescript,no-test
import { Combobox, comboboxAddItem, comboboxGetValue } from "perry/ui";

const combo = Combobox("", (v) => console.log("picked:", v));
comboboxAddItem(combo, "apple");
comboboxAddItem(combo, "apricot");
comboboxAddItem(combo, "avocado");
```

### TreeView / Outline (issue #480)

Hierarchical disclosure list. Build the topology bottom-up via `TreeNode`
+ `treeNodeAddChild`, then mount it via `TreeView`. macOS uses
`NSOutlineView`; other platforms stub.

```typescript,no-test
import { TreeNode, treeNodeAddChild, TreeView } from "perry/ui";

const dox = TreeNode("docs", "Documents");
treeNodeAddChild(dox, TreeNode("doc-1", "Resume.pdf"));
treeNodeAddChild(dox, TreeNode("doc-2", "Cover Letter.pdf"));
const root = TreeNode("root", "Files");
treeNodeAddChild(root, dox);
const tree = TreeView(root, (id) => console.log("selected:", id));
```

### Calendar (issue #481)

Month-grid date picker. macOS uses `NSDatePicker` in graphical style;
other platforms stub. `onChange` receives the selected date as an ISO
`yyyy-MM-dd` string.

```typescript,no-test
import { Calendar, calendarGetSelectedDate } from "perry/ui";

const cal = Calendar(2026, 5, (iso) => console.log("date:", iso));
```

### DatePicker (issue #4772)

Compact field-style date picker — the space-saving complement to the
month-grid `Calendar`. Each platform uses its native compact date control:
macOS `NSDatePicker` (text-field-and-stepper), iOS / visionOS
`UIDatePicker` (`.compact`), Windows `SysDateTimePick32`, Android
`android.widget.DatePicker`. GTK4 has no native compact date field, so it
reuses `GtkCalendar`; tvOS / watchOS stub. `onChange` receives the selected
date as an ISO `yyyy-MM-dd` string.

```typescript,no-test
import { DatePicker, datePickerGetSelectedDate } from "perry/ui";

const picker = DatePicker(2026, 5, (iso) => console.log("date:", iso));
```

### Chart (issue #474)

Line / bar / pie via CoreGraphics on macOS. `kind` is `0=line`, `1=bar`,
`2=pie`. Apple Charts framework / SwiftUI Charts integration on iOS 16+
is a follow-up.

```typescript,no-test
import { Chart, chartAddDataPoint, chartSetTitle } from "perry/ui";

const chart = Chart(0, 600, 400);
chartSetTitle(chart, "Visits");
chartAddDataPoint(chart, "Mon", 12);
chartAddDataPoint(chart, "Tue", 18);
chartAddDataPoint(chart, "Wed", 9);
```

### Command palette (issue #477)

⌘K-style fuzzy command launcher. macOS shows a floating `NSPanel`; other
platforms stub. Bind `commandPaletteShow()` to ⌘K via
`addKeyboardShortcut` to wire the default hotkey.

```typescript,no-test
import {
  commandPaletteRegister,
  commandPaletteShow,
} from "perry/ui";

commandPaletteRegister("save", "Save", "⌘S", () => save());
commandPaletteRegister("export", "Export PDF", "", () => exportPdf());
// then:
commandPaletteShow();
```

### MapView (issue #517)

Wraps `MKMapView` on macOS / iOS / visionOS / tvOS, `libshumate` on GTK4,
Google Maps SDK on Android (requires API key in `AndroidManifest.xml`), the
SwiftUI `Map` view on watchOS, and the native Windows `MapControl` in a XAML
Island. On Windows, obtain a Bing Maps key as described in Microsoft's
[maps authentication guide](https://learn.microsoft.com/windows/uwp/maps-and-location/authentication-key),
then set `PERRY_MAP_SERVICE_TOKEN` (or the legacy `PERRY_BING_MAPS_KEY` alias)
before launching the app. The token is read when each MapView is created and
assigned to `MapControl.MapServiceToken`.

```typescript,no-test
import {
  MapView,
  mapViewSetRegion,
  mapViewAddPin,
  mapViewSetMapType,
} from "perry/ui";

const map = MapView(800, 600);
mapViewSetRegion(map, 37.7749, -122.4194, 0.05, 0.05);
mapViewAddPin(map, 37.7749, -122.4194, "San Francisco");
mapViewSetMapType(map, 1); // 0=standard, 1=satellite, 2=hybrid
```

### PdfView (issue #516)

Native PDF rendering uses PDFKit on macOS / iOS / visionOS and
`Windows.Data.Pdf` with a GDI+ page surface on Windows. `pdfViewLoadFile`
returns 1 on success, 0 on failure. Page navigation and zoom redraw real
document pixels on both backends.

```typescript,no-test
import {
  PdfView,
  pdfViewLoadFile,
  pdfViewGetPageCount,
} from "perry/ui";

const pdf = PdfView(800, 600);
if (pdfViewLoadFile(pdf, "/tmp/report.pdf")) {
  console.log("pages:", pdfViewGetPageCount(pdf));
}
```

### RichTextEditor (issue #478)

`NSTextView` with `NSAttributedString` storage on macOS. Plain-text and
HTML round-trip cover persistence; `richTextToggleBold` /
`ToggleItalic` / `ToggleUnderline` cover inline formatting via
`NSResponder` actions.

```typescript,no-test
import {
  RichTextEditor,
  richTextSetHtml,
  richTextGetHtml,
  richTextToggleBold,
} from "perry/ui";

const editor = RichTextEditor(600, 400, (text) => console.log(text));
richTextSetHtml(editor, "<p>Hello <b>world</b></p>");
richTextToggleBold(editor);
```

### Rich tooltip (issue #479)

`widgetSetRichTooltip(widget, content, hoverDelayMs)` — like
`widgetSetTooltip` but the tooltip content is itself a Perry widget.
macOS uses `NSPanel` + `NSTrackingArea`; other platforms stub. For
plain-text tooltips with VoiceOver / a11y support, prefer the simpler
`widgetSetTooltip`.

### WebView (issue #658)

`WebView({ url, allowedDomains?, onShouldNavigate?, ... })` embeds a
real browser engine — `WKWebView` on Apple, `WebView2` on Windows,
`WebKitGTK 6.0` on Linux, `android.webkit.WebView` on Android,
sandboxed `<iframe>` on web. See [WebView](https://docs.perryts.com/ui/webview.html) for the full
OAuth / callback-interception pattern and the per-platform notes.

These are linked from their own pages where richer examples exist.

## Common widget helpers

Every widget handle accepts these:

| Helper | Description |
|---|---|
| `widgetSetWidth(w, n)` / `widgetSetHeight(w, n)` | Explicit size in points |
| `widgetSetBackgroundColor(w, r, g, b, a)` | RGBA in [0, 1] |
| `setCornerRadius(w, r)` | Rounded corners in points |
| `widgetSetOpacity(w, alpha)` | Opacity in [0, 1] |
| `widgetSetEnabled(w, flag)` | `0` disables, `1` enables |
| `widgetSetHidden(w, flag)` | `0` visible, `1` hidden |
| `widgetSetTooltip(w, text)` | Tooltip on hover (desktop only) |
| `widgetSetOnClick(w, cb)` | Click handler |
| `widgetSetOnHover(w, cb)` | Hover enter/leave (desktop only) |
| `widgetSetOnDoubleClick(w, cb)` | Double-click handler |
| `widgetSetEdgeInsets(w, top, left, bottom, right)` | Padding around contents |
| `widgetSetBorderColor(w, r, g, b, a)` / `widgetSetBorderWidth(w, n)` | Border |
| `widgetAddChild(parent, child)` | Attach a child to a container |
| `widgetSetContextMenu(w, menu)` | Right-click menu |

See [Styling](https://docs.perryts.com/ui/styling.html) and [Events](https://docs.perryts.com/ui/events.html) for deeper coverage.

## Next Steps

- [Layout](https://docs.perryts.com/ui/layout.html) — Arranging widgets with stacks and containers
- [Styling](https://docs.perryts.com/ui/styling.html) — Colors, fonts, borders
- [State Management](https://docs.perryts.com/ui/state.html) — Reactive bindings


---

<!-- source: docs/src/ui/layout.md -->

# Layout

Perry provides layout containers that arrange child widgets using the
platform's native layout system. Every snippet below is excerpted from
[`docs/examples/ui/layout/snippets.ts`](../../examples/ui/layout/snippets.ts) —
CI compiles and runs it on every PR.

Layout helpers are free functions: `widgetAddChild(parent, child)`,
`stackSetAlignment(stack, value)`, `widgetSetEdgeInsets(w, top, left, bottom,
right)`, etc. Stack constructors take a numeric spacing followed by a child
array; everything else (alignment, distribution, padding, sizing) is applied
post-construction via the free functions on the widget handle.

## VStack

Arranges children vertically (top to bottom).

```typescript
const stack = VStack(16, [
    Text("First"),
    Text("Second"),
    Text("Third"),
])
```

`VStack(spacing, children)` — the first argument is the gap in points between
children.

## HStack

Arranges children horizontally (left to right).

```typescript
const row = HStack(8, [
    Button("Cancel", noop),
    Spacer(),
    Button("OK", noop),
])
```

## ZStack

Layers children on top of each other (back to front). `ZStack()` takes no
constructor children — populate it with `widgetAddChild`:

```typescript
const layered = ZStack()
widgetAddChild(layered, ImageFile("background.png"))
widgetAddChild(layered, Text("Overlay text"))
```

## ScrollView

A scrollable container. Built empty, then filled via `scrollviewSetChild`:

```typescript
// ScrollView() takes no args; populate it with `scrollviewSetChild`.
const sv = ScrollView()
const inner = VStack(8, [Text("a"), Text("b"), Text("c")])
scrollviewSetChild(sv, inner)
```

## LazyVStack

A vertically scrolling list that lazily renders items. More efficient than
`ScrollView` + `VStack` for thousands of rows — on macOS this is backed by
`NSTableView` so only rows in the visible rect are realized.

```typescript
// `render(index)` is invoked lazily — only rows in the visible rect are realized.
const lazy = LazyVStack(1000, (index: number) => Text(`Row ${index}`))
```

When the underlying data changes, call `lazyvstackUpdate(handle, newCount)` to
refresh. Override the default 44pt row height with `lazyvstackSetRowHeight`.

## NavStack

A navigation container that supports push/pop navigation. Push a new view
with `navstackPush(stack, view, title)`; pop with `navstackPop(stack)`:

```typescript
const home = VStack(16, [
    Text("Home Screen"),
    Button("Go to Details", () => {
        navstackPush(nav, Text("Details!"), "Details")
    }),
])
const nav = NavStack()
widgetAddChild(nav, home)
```

## Spacer

A flexible space that expands to fill available room.

```typescript
const toolbar = HStack(8, [
    Text("Left"),
    Spacer(),
    Text("Right"),
])
```

Use `Spacer()` inside `HStack` or `VStack` to push widgets apart.

## Divider

A visual separator line.

```typescript
const sections = VStack(12, [
    Text("Section 1"),
    Divider(),
    Text("Section 2"),
])
```

## Nesting Layouts

Layouts can be nested freely. This complete example is verified by CI:

```typescript
// demonstrates: nested VStack/HStack + Spacer + Divider
// docs: docs/src/ui/layout.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import { App, VStack, HStack, Text, Button, Spacer, Divider } from "perry/ui"

App({
    title: "Layout Example",
    width: 800,
    height: 600,
    body: VStack(16, [
        // Header
        HStack(8, [
            Text("My App"),
            Spacer(),
            Button("Settings", () => {}),
        ]),
        Divider(),
        // Content
        VStack(12, [
            Text("Welcome!"),
            HStack(8, [
                Button("Action 1", () => {}),
                Button("Action 2", () => {}),
            ]),
        ]),
        Spacer(),
        // Footer
        Text("v1.0.0"),
    ]),
})
```

## Child Management

Containers support dynamic child management via free functions:

```typescript
const list = VStack(16, [])
widgetAddChild(list, Text("appended"))            // append
widgetAddChildAt(list, Text("prepended"), 0)      // insert at index
widgetReorderChild(list, 1, 0)                    // move from→to
const removeMe = Text("temporary")
widgetAddChild(list, removeMe)
widgetRemoveChild(list, removeMe)                 // remove
widgetClearChildren(list)                         // remove all
```

| Function | Description |
|----------|-------------|
| `widgetAddChild(parent, child)` | Append a child widget |
| `widgetAddChildAt(parent, child, index)` | Insert a child at a specific position |
| `widgetRemoveChild(parent, child)` | Remove a specific child |
| `widgetReorderChild(widget, fromIndex, toIndex)` | Move a child to a new position |
| `widgetClearChildren(widget)` | Remove all children |

## Stack Alignment

Control how children are aligned within a stack using `stackSetAlignment`:

```typescript
const centered = VStack(16, [
    Text("Centered"),
    Text("Content"),
])
stackSetAlignment(centered, 9) // CenterX
```

**VStack alignment** (cross-axis = horizontal):

| Value | Name | Effect |
|-------|------|--------|
| 5 | Leading | Children align to the leading (left) edge |
| 9 | CenterX | Children centered horizontally |
| 7 | Width | Children stretch to fill the stack's width |

**HStack alignment** (cross-axis = vertical):

| Value | Name | Effect |
|-------|------|--------|
| 3 | Top | Children align to the top |
| 12 | CenterY | Children centered vertically |
| 4 | Bottom | Children align to the bottom |

## Stack Distribution

Control how children share space within a stack using `stackSetDistribution`:

```typescript
const buttons = HStack(8, [
    Button("Cancel", noop),
    Button("OK", noop),
])
stackSetDistribution(buttons, 1) // FillEqually — both buttons get equal width
```

| Value | Name | Behavior |
|-------|------|----------|
| 0 | Fill | Default. First resizable child fills remaining space |
| 1 | FillEqually | All children get equal size |
| 2 | FillProportionally | Children sized proportionally to their intrinsic content |
| 3 | EqualSpacing | Equal gaps between children |
| 4 | EqualCentering | Equal distance between child centers |

## Fill Parent

Pin a child's edges to its parent container:

```typescript
const banner = Text("Full width banner")
widgetMatchParentWidth(banner)
const banneredPage = VStack(16, [banner, Text("Normal width")])
```

- `widgetMatchParentWidth(widget)` — stretch to fill parent's width
- `widgetMatchParentHeight(widget)` — stretch to fill parent's height

## Content Hugging

Control whether a widget resists being stretched beyond its intrinsic size:

```typescript
const tight = Text("I stay small")
widgetSetHugging(tight, 750) // High priority — resist stretching

const stretchy = Text("I stretch")
widgetSetHugging(stretchy, 1) // Low priority — stretch to fill
```

- **High priority** (250–750+): widget resists stretching, stays at its natural size
- **Low priority** (1–249): widget stretches to fill available space

## Overlay Positioning

For absolute positioning, add overlay children to any container:

```typescript
// Overlay parent must be a ZStack — macOS NSView allows `addSubview` on
// any view, but GTK4 can only float children above siblings inside
// `gtk::Overlay` (which is what ZStack is backed by).
const container = ZStack()
widgetAddChild(container, VStack(16, [Text("Main content")])) // main child

const badge = Text("3")
setCornerRadius(badge, 10)
widgetSetBackgroundColor(badge, 1.0, 0.231, 0.188, 1.0) // RGBA red

widgetAddOverlay(container, badge)
widgetSetOverlayFrame(badge, 280, 10, 20, 20) // x, y, width, height
```

Overlay children are positioned absolutely relative to their parent — similar
to CSS `position: absolute`.

## Split Views

Create resizable split panes for sidebar layouts:

```typescript
const split = SplitView()

const sidebar = VStack(8, [Text("Navigation"), Text("Item 1"), Text("Item 2")])
const content = VStack(16, [Text("Main Content")])

splitViewAddChild(split, sidebar)
splitViewAddChild(split, content)
```

The user can drag the divider to resize panes. On macOS this maps to
`NSSplitView`.

## Stacks with Built-in Padding

Create a stack with padding in a single call. The order is **top, left,
bottom, right** (CSS-shorthand-style), not top/right/bottom/left:

```typescript
// VStackWithInsets(spacing, top, left, bottom, right) — note: order is
// top/left/bottom/right (CSS-style), not top/right/bottom/left.
const card = VStackWithInsets(12, 16, 16, 16, 16)
widgetAddChild(card, Text("Padded content"))
widgetAddChild(card, Text("More content"))
```

`HStackWithInsets(spacing, top, left, bottom, right)` is the horizontal
counterpart. Equivalent to creating a stack and then calling
`widgetSetEdgeInsets`, but more concise. Children are added via
`widgetAddChild` rather than the constructor array.

## Detaching Hidden Views

By default, hidden children still occupy space in a stack. To collapse them:

```typescript
const collapsible = VStack(8, [Text("Always visible"), Text("Sometimes hidden")])
stackSetDetachesHidden(collapsible, 1) // Hidden children leave no gap
// You can then toggle a child:
const sometimesHidden = Text("toggle me")
widgetSetHidden(sometimesHidden, 1) // 1 = hidden, 0 = visible
```

## Common Layout Patterns

### Centered content

```typescript
const page = VStack(16, [Text("Title"), Text("Subtitle")])
stackSetAlignment(page, 9) // CenterX
```

### Search row that fills the width

```typescript
const searchInput = TextField("Search...", (v: string) => search.set(v))
widgetMatchParentWidth(searchInput)
const results = VStack(8, [])
const searchPage = VStack(12, [searchInput, results])
```

### Floating badge / overlay

```typescript
// Wrap the icon in a ZStack so the badge can float above it on every
// platform (see `// ANCHOR: overlay` for the GTK4 vs macOS rationale).
const icon = ZStack()
widgetAddChild(icon, ImageSymbol("bell"))
const dotBadge = Text("3")
widgetAddOverlay(icon, dotBadge)
widgetSetOverlayFrame(dotBadge, 20, -5, 16, 16)
```

### Toolbar with spacers

```typescript
const titleBar = HStack(8, [
    Button("Back", noop),
    Spacer(),
    Text("Page Title"),
    Spacer(),
    Button("Settings", noop),
])
```

## Next Steps

- [Styling](https://docs.perryts.com/ui/styling.html) — Colors, padding, sizing
- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [State Management](https://docs.perryts.com/ui/state.html) — Dynamic UI with state


---

<!-- source: docs/src/ui/state.md -->

# State Management

Perry uses reactive state to automatically update the UI when data changes.
Every snippet below is excerpted from
[`docs/examples/ui/state/snippets.ts`](../../examples/ui/state/snippets.ts) —
CI compiles and runs it on every PR.

## Creating State

```typescript
const counter = State(0)               // number state
const username = State("Perry")        // string state
const items = State<string[]>([])      // array state
```

`State(initialValue)` creates a reactive state container.

## Reading and Writing

```typescript
const value = counter.value     // Read current value
counter.set(42)                  // Set new value → triggers UI update
```

Every `.set()` call re-renders the widget tree with the new value.

## Reactive Text

Template literals with `state.value` update automatically:

```typescript
const showCount = State(0)
const countLabel = Text(`Count: ${showCount.value}`)
// The text updates whenever showCount changes.
```

This works because Perry detects `state.value` reads inside template literals
and creates reactive bindings.

## Binding Inputs to State

Input widgets expose an `onChange` callback. Forward that into a state's
`.set(...)` to keep the state in sync as the user types/toggles/drags:

```typescript
const input = State("")
const field = TextField("Type here...", (v: string) => input.set(v))

// Optional: also let input.set("hello") update the field on screen.
stateBindTextfield(input, field)
```

Input control signatures:
- `TextField(placeholder, onChange)` — text input, `onChange: (value: string) => void`
- `SecureField(placeholder, onChange)` — password input, `onChange: (value: string) => void`
- `Toggle(label, onChange)` — boolean toggle, `onChange: (value: boolean) => void`
- `Slider(min, max, onChange)` — numeric slider, `onChange: (value: number) => void`
- `Picker(onChange)` — dropdown, `onChange: (index: number) => void`; items via `pickerAddItem`
- `WheelPicker(onChange)` — spinning selector on touch platforms and a scrollable selector elsewhere; items via `wheelPickerAddItem`

For programmatic-to-UI sync (state-drives-widget) use the dedicated binders:
`stateBindTextfield`, `stateBindSlider`, `stateBindToggle`, `stateBindTextNumeric`,
`stateBindVisibility`.

## onChange Callbacks

Listen for state changes with the free-function `stateOnChange`:

```typescript
const watched = State(0)
stateOnChange(watched, (newValue: number) => {
    console.log(`Count changed to ${newValue}`)
})
```

## ForEach

Render a list from numeric state (the index count):

```typescript
const fruits = State(["Apple", "Banana", "Cherry"])
const fruitCount = State(3)

const fruitList = VStack(16, [
    ForEach(fruitCount, (i: number) =>
        Text(`${i + 1}. ${fruits.value[i]}`),
    ),
])
```

> **Note:** `ForEach` iterates by index over a numeric state. Keep a count
> state in sync with your array, then read the items via `array.value[i]`
> inside the closure.

`ForEach` re-renders the list when the count state changes:

```typescript
// Add an item:
fruits.set([...fruits.value, "Date"])
fruitCount.set(fruitCount.value + 1)

// Remove an item:
fruits.set(fruits.value.filter((_, i) => i !== 1))
fruitCount.set(fruitCount.value - 1)
```

## Conditional Rendering

Use state to conditionally show widgets:

```typescript
const showDetails = State(false)
const detailsLabel: number = showDetails.value
    ? Text("Details are visible!")
    : Spacer()
const detailsPanel = VStack(16, [
    Button("Toggle", () => showDetails.set(!showDetails.value)),
    detailsLabel,
])
```

## Multi-State Text

Text can depend on multiple state values:

```typescript
const firstName = State("John")
const lastName = State("Doe")

const greeting = Text(`Hello, ${firstName.value} ${lastName.value}!`)
// Updates when either firstName or lastName changes.
```

## State with Objects and Arrays

```typescript
const user = State({ name: "Perry", age: 0 })

// Update by replacing the whole object:
user.set({ ...user.value, age: 1 })

const todos = State<{ text: string; done: boolean }[]>([])

// Add a todo:
todos.set([...todos.value, { text: "New task", done: false }])

// Toggle a todo (must produce a new array reference):
const next = todos.value.slice()
if (next.length > 0) {
    next[0] = { ...next[0], done: !next[0].done }
    todos.set(next)
}
```

> **Note**: State uses identity comparison. You must create a new array/object
> reference for changes to be detected. Mutating in-place without calling
> `.set()` with a new reference won't trigger updates.

## Complete Example

```typescript
// demonstrates: complete reactive todo app combining State, ForEach, and widget tree mutation
// docs: docs/src/ui/state.md
// platforms: macos, linux, windows, windows-winui
// targets: ios-simulator, tvos-simulator, watchos-simulator, web, wasm

import {
    App,
    Text,
    Button,
    TextField,
    VStack,
    HStack,
    State,
    ForEach,
    Spacer,
    Divider,
} from "perry/ui"

const todos = State<string[]>([])
const count = State(0)
const input = State("")

App({
    title: "Todo App",
    width: 480,
    height: 600,
    body: VStack(16, [
        Text("My Todos"),

        HStack(8, [
            TextField("What needs to be done?", (value: string) => input.set(value)),
            Button("Add", () => {
                const text = input.value
                if (text.length > 0) {
                    todos.set([...todos.value, text])
                    count.set(count.value + 1)
                    input.set("")
                }
            }),
        ]),

        Divider(),

        ForEach(count, (i: number) =>
            HStack(8, [
                Text(todos.value[i]),
                Spacer(),
                Button("Delete", () => {
                    todos.set(todos.value.filter((_, idx) => idx !== i))
                    count.set(count.value - 1)
                }),
            ]),
        ),

        Spacer(),
        Text(`${count.value} items`),
    ]),
})
```

This program is built and run by CI (`scripts/run_doc_tests.sh`), so the
snippet above always matches the compiled artifact under
[`docs/examples/ui/state/todo_app.ts`](../../examples/ui/state/todo_app.ts).

## Next Steps

- [Events](https://docs.perryts.com/ui/events.html) — Click, hover, keyboard events
- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Layout](https://docs.perryts.com/ui/layout.html) — Layout containers


---

<!-- source: docs/src/ui/events.md -->

# Events

Perry widgets support native event handlers for user interaction. Every snippet
below is excerpted from
[`docs/examples/ui/events/snippets.ts`](../../examples/ui/events/snippets.ts) —
CI compiles and runs it on every PR, so the API drawn here is the API the
runtime exposes.

Event handlers are registered as **free functions** that take the widget handle
as the first argument. The widget handle itself is opaque (`number` at the
type level); perry's API is function-first throughout.

## onClick

```typescript
const greet = Button("Click me", () => {
    log.set("Button clicked")
})

// Or attach a click handler to a non-button widget after creation:
const label = Text("Clickable text")
widgetSetOnClick(label, () => {
    log.set("Text clicked")
})
```

## onHover

Triggered when the cursor enters the widget.

```typescript
const hoverBtn = Button("Hover me", () => {})
widgetSetOnHover(hoverBtn, () => {
    log.set("hovered")
})
```

> **Note**: Hover events are available on macOS, Windows, Linux, and Web. iOS
> and Android use touch interactions instead. The callback fires once on enter;
> if you need a "left" event you'll have to track it yourself.

## onDoubleClick

```typescript
const dbl = Text("Double-click me")
widgetSetOnDoubleClick(dbl, () => {
    log.set("double-clicked!")
})
```

## Keyboard Shortcuts

Register in-app keyboard shortcuts (active when the app is focused):

```typescript
// Cmd+N on macOS, Ctrl+N on other platforms (modifier 1 = Cmd/Ctrl).
addKeyboardShortcut("n", 1, () => {
    log.set("New document")
})

// Cmd+Shift+S — modifiers add: 1 (Cmd/Ctrl) + 2 (Shift) = 3.
addKeyboardShortcut("s", 3, () => {
    log.set("Save as...")
})
```

**Modifier bits:** `1` = Cmd (macOS) / Ctrl (Windows/Linux), `2` = Shift, `4` =
Option (macOS) / Alt (others), `8` = Control (macOS only). Combine by adding
— `3` = Cmd+Shift, `5` = Cmd+Option, etc.

Keyboard shortcuts are also available on [menu items](https://docs.perryts.com/ui/menus.html):

```typescript
const fileMenu = menuCreate()
menuAddItem(fileMenu, "New", () => log.set("file/new"))
menuAddItem(fileMenu, "Save As", () => log.set("file/saveAs"))
```

### Global Hotkeys

Register a hotkey that fires system-wide, even when the app is in the
background:

```typescript
// System-wide: fires even when the app is in the background.
// macOS: real Carbon RegisterEventHotKey. Other platforms: no-op.
registerGlobalHotkey("F5", 0, () => {
    log.set("Global F5 hotkey fired")
})

// Cmd+Shift+G (modifiers: 1=Cmd + 2=Shift = 3)
registerGlobalHotkey("g", 3, () => {
    log.set("Global Cmd+Shift+G fired")
})
```

**Platform support:** macOS uses Carbon `RegisterEventHotKey` (real
implementation). Linux, Windows, iOS, tvOS, visionOS, watchOS, and Android
log the registration and no-op — global hotkeys on those platforms require
OS-level portal / hook APIs that vary per OS.

## Clipboard

```typescript
// Copy to clipboard
clipboardWrite("Hello, clipboard!")

// Read from clipboard
const text = clipboardRead()
log.set(`clipboard length: ${text.length}`)
```

## Complete Example

```typescript
// demonstrates: click + hover + double-click + keyboard shortcut all wired to
// a single State-backed status label
// docs: docs/src/ui/events.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import {
    App,
    Text,
    Button,
    VStack,
    State,
    Spacer,
    addKeyboardShortcut,
    widgetSetOnHover,
    widgetSetOnDoubleClick,
} from "perry/ui"

const lastEvent = State("No events yet")

// Cmd+R (modifiers: 1 = Cmd/Ctrl).
addKeyboardShortcut("r", 1, () => {
    lastEvent.set("Keyboard: Cmd+R")
})

const hoverBtn = Button("Hover me", () => {})
widgetSetOnHover(hoverBtn, () => {
    lastEvent.set("Hover fired")
})

const dblLabel = Text("Double-click me")
widgetSetOnDoubleClick(dblLabel, () => {
    lastEvent.set("Double-clicked!")
})

App({
    title: "Events Demo",
    width: 400,
    height: 300,
    body: VStack(16, [
        Text(`Last event: ${lastEvent.value}`),
        Spacer(),
        Button("Click me", () => {
            lastEvent.set("Button clicked")
        }),
        hoverBtn,
        dblLabel,
    ]),
})
```

## Next Steps

- [Menus](https://docs.perryts.com/ui/menus.html) — Menu bar and context menus with keyboard shortcuts
- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [State Management](https://docs.perryts.com/ui/state.html) — Reactive state


---

<!-- source: docs/src/ui/styling.md -->

# Styling

Perry widgets accept an inline `style: { ... }` object that maps to each
platform's native styling APIs. The same shape works on every Widget
constructor — `Button`, `Text`, `Toggle`, `Slider`, `VStack`/`HStack`,
and friends — so cross-platform styling code stays the same regardless
of target.

## Inline style — recommended

Pass a `StyleProps` object as the trailing argument to any widget
constructor. Codegen destructures the literal at HIR time into a
sequence of native setter calls, so the runtime shape is the same as
hand-writing the imperative pattern below — but the source is much
shorter:

```typescript
const card = Button("Save", () => {
    console.log("saved")
}, {
    backgroundColor: { r: 0.231, g: 0.510, b: 0.965, a: 1.0 },
    borderColor: { r: 0.0, g: 0.0, b: 0.0, a: 0.1 },
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    opacity: 0.95,
    shadow: {
        color: { r: 0.0, g: 0.0, b: 0.0, a: 0.25 },
        blur: 12,
        offsetX: 0,
        offsetY: 4,
    },
    tooltip: "Save the current document",
    enabled: true,
})
```

The `style` arg is optional; widgets without it look identical to
calls before this API existed. See
[`docs/examples/ui/styling/button_inline_style.ts`](../../examples/ui/styling/button_inline_style.ts)
for the full file.

### What `style` accepts

| Prop | Type | Maps to |
|---|---|---|
| `backgroundColor` | string \| PerryColor | `widgetSetBackgroundColor` |
| `color` | string \| PerryColor | `textSetColor` / `buttonSetTextColor` |
| `borderColor` | string \| PerryColor | `widgetSetBorderColor` |
| `borderWidth` | number | `widgetSetBorderWidth` |
| `borderRadius` | number | `setCornerRadius` |
| `padding` | number \| `{ top, right, bottom, left }` | `widgetSetEdgeInsets` |
| `opacity` | number (0..=1) | `widgetSetOpacity` |
| `shadow` | `{ color, blur, offsetX, offsetY }` | `widgetSetShadow` |
| `textDecoration` | `"none" \| "underline" \| "strikethrough"` | `textSetDecoration` |
| `gradient` | `{ angle, stops: [c1, c2] }` | `widgetSetBackgroundGradient` |
| `fontSize`, `fontWeight`, `fontFamily` | number / string | `textSetFont*` |
| `tooltip` | string | `widgetSetTooltip` |
| `hidden` | boolean | `widgetSetHidden` |
| `enabled` | boolean | `widgetSetEnabled` |

### Color values

Color props accept four interchangeable shapes:

```typescript,no-test
backgroundColor: "#3B82F6"                                   // hex 6/8
backgroundColor: "#3B82F6FF"                                 // hex with alpha
backgroundColor: "blue"                                      // named color
backgroundColor: { r: 0.231, g: 0.510, b: 0.965, a: 1.0 }   // PerryColor object
backgroundColor: themeColor                                  // runtime variable
```

Named colors: `white`, `black`, `red`, `green`, `blue`, `yellow`,
`cyan`, `magenta`, `gray` / `grey`, `transparent`. Hex forms supported:
`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`.

Literals (the first four forms) compile-time-fold into 4 baked-in float
arguments — zero runtime cost. Runtime variables resolve through
`js_color_parse_channel` (a small CSS color parser in `perry-runtime`)
so `backgroundColor: someStringVar` works the same as the literal form.

### Padding shapes

A single number applies to all four sides; an object picks per-side:

```typescript,no-test
padding: 12                                       // all four sides 12
padding: { top: 8, right: 16, bottom: 8, left: 16 }  // per-side
```

Missing sides default to 0.

### Container styling

`VStack` and `HStack` accept `style` after the children array:

```typescript
// VStack with explicit spacing AND inline style — children + style.
const card = VStack(8, [
    Text("Heading"),
    Text("Subtitle"),
    Button("Action", () => { console.log("clicked") }),
], {
    backgroundColor: { r: 0.96, g: 0.97, b: 0.99, a: 1.0 },
    borderRadius: 12,
    padding: 16,
    shadow: {
        color: { r: 0.0, g: 0.0, b: 0.0, a: 0.1 },
        blur: 8,
        offsetY: 2,
    },
})

// HStack with no explicit spacing (children-array first form) + style.
const toolbar = HStack([
    Text("Left"),
    Text("Right"),
], {
    backgroundColor: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
    padding: { top: 8, right: 16, bottom: 8, left: 16 },
    borderRadius: 6,
})
```

Both shapes work — `VStack(children, style?)` and `VStack(spacing, children, style?)`.

## Coming from CSS

If you're coming from web, the conceptual mapping is:

| CSS | Perry inline style |
|-----|-------|
| `display: flex; flex-direction: column` | `VStack(spacing, [...])` |
| `display: flex; flex-direction: row` | `HStack(spacing, [...])` |
| `width: 100%` | `widgetMatchParentWidth(widget)` |
| `padding: 10px 20px` | `padding: { top: 10, right: 20, bottom: 10, left: 20 }` |
| `gap: 16px` | `VStack(16, [...])` — first argument is the gap |
| CSS variables / design tokens | [`perry-styling`](https://docs.perryts.com/ui/theming.html) package |
| `opacity: 0.5` | `opacity: 0.5` |
| `border-radius: 8px` | `borderRadius: 8` |
| `background: #3B82F6` | `backgroundColor: "#3B82F6"` |
| `box-shadow: 0 4px 12px rgba(0,0,0,0.25)` | `shadow: { color: "#0004", blur: 12, offsetY: 4 }` |
| `text-decoration: underline` | `textDecoration: "underline"` |

See [Layout](https://docs.perryts.com/ui/layout.html) for full details on alignment, distribution, overlays, and split views.

## Imperative API (underlying)

The inline `style` object lowers to the same FFI calls as Perry's
imperative free-function setters: `widgetSet*`, `textSet*`,
`buttonSet*`. They take the widget handle as the first argument and
remain available for cases where you want fine-grained control or
need to mutate styles after creation. Colors here are RGBA floats in
`[0.0, 1.0]` (divide each hex byte by 255 — `0xFF3B30` →
`(1.0, 0.231, 0.188, 1.0)`).

Every snippet below is excerpted from
[`docs/examples/ui/styling/snippets.ts`](../../examples/ui/styling/snippets.ts),
which CI compiles and runs on every PR — so the API drawn here is always the
API the compiler accepts.

```typescript
import {
    App,
    VStack, VStackWithInsets, HStack, Spacer,
    Text, Button,
    textSetColor, textSetFontSize, textSetFontFamily, textSetFontWeight,
    setCornerRadius, setPadding,
    widgetAddChild,
    widgetSetBackgroundColor, widgetSetBackgroundGradient,
    widgetSetBorderColor, widgetSetBorderWidth,
    widgetSetEdgeInsets,
    widgetSetWidth, widgetSetHeight, widgetMatchParentWidth,
    widgetSetOpacity,
    widgetSetControlSize,
    widgetSetTooltip,
    widgetSetEnabled,
} from "perry/ui"
```

### Colors

```typescript
const colored = Text("Colored text")
textSetColor(colored, 1.0, 0.0, 0.0, 1.0)              // r, g, b, a in [0,1]
widgetSetBackgroundColor(colored, 0.94, 0.94, 0.94, 1.0)
```

### Fonts

```typescript
const font = Text("Styled text")
textSetFontSize(font, 24)                  // Font size in points
textSetFontFamily(font, "Menlo")           // Font family name
textSetFontWeight(font, 24, 700)           // Re-set size + weight together
```

Use `"monospaced"` for the system monospaced font.

### Corner Radius

```typescript
const rounded = Button("Rounded", () => {})
setCornerRadius(rounded, 12)
```

### Borders

```typescript
const bordered = VStack(0, [])
widgetSetBorderColor(bordered, 0.8, 0.8, 0.8, 1.0)
widgetSetBorderWidth(bordered, 1)
```

### Padding and Insets

```typescript
const padded = VStack(8, [Text("Padded content")])
// Both names accept (widget, top, left, bottom, right):
setPadding(padded, 16, 16, 16, 16)
widgetSetEdgeInsets(padded, 10, 20, 10, 20)
```

### Sizing

```typescript
const sized = VStack(0, [])
widgetSetWidth(sized, 300)
widgetSetHeight(sized, 200)
widgetMatchParentWidth(sized) // expand to fill parent's width
```

### Opacity

```typescript
const dim = Text("Semi-transparent")
widgetSetOpacity(dim, 0.5) // 0.0 to 1.0
```

### Background Gradient

```typescript
const grad = VStack(0, [])
// Two RGBA stops + angle (degrees, 0 = top-to-bottom).
widgetSetBackgroundGradient(grad,
    1.0, 0.0, 0.0, 1.0,   // start (red)
    0.0, 0.0, 1.0, 1.0,   // end   (blue)
    0,                    // angle
)
```

### Control Size

```typescript
const small = Button("Small", () => {})
widgetSetControlSize(small, 0) // 0=mini, 1=small, 2=regular, 3=large
```

> **macOS**: Maps to `NSControl.ControlSize`. Other platforms may interpret differently.

### Tooltips

```typescript
const tip = Button("Hover me", () => {})
widgetSetTooltip(tip, "Click to perform action")
```

> **macOS/Windows/Linux**: Native tooltips. **iOS/Android**: No tooltip support. **Web**: HTML `title` attribute.

### Enabled/Disabled

```typescript
const submit = Button("Submit", () => {})
widgetSetEnabled(submit, 0)  // 0 = disabled, 1 = enabled
```

### Complete Imperative Example

```typescript
// demonstrates: a styled counter card using the real free-function API
// docs: docs/src/ui/styling.md
// platforms: macos, linux, windows
// targets: ios-simulator, web, wasm

import {
    App,
    Text,
    Button,
    VStack,
    HStack,
    State,
    Spacer,
    textSetFontSize,
    textSetFontFamily,
    textSetColor,
    widgetSetBackgroundColor,
    widgetSetEdgeInsets,
    setCornerRadius,
} from "perry/ui"

// Note: widgetSetBorderColor / widgetSetBorderWidth are macOS/iOS/Windows
// only — perry-ui-gtk4 doesn't export them (GTK4 borders are CSS-driven).
// Omitted from this demo so it compiles everywhere.

const count = State(0)

const title = Text("Counter")
textSetFontSize(title, 28)
textSetColor(title, 0.1, 0.1, 0.1, 1.0)

const display = Text(`${count.value}`)
textSetFontSize(display, 48)
textSetFontFamily(display, "monospaced")
textSetColor(display, 0.0, 0.478, 1.0, 1.0)

const decBtn = Button("-", () => count.set(count.value - 1))
setCornerRadius(decBtn, 20)
widgetSetBackgroundColor(decBtn, 1.0, 0.231, 0.188, 1.0)

const incBtn = Button("+", () => count.set(count.value + 1))
setCornerRadius(incBtn, 20)
widgetSetBackgroundColor(incBtn, 0.204, 0.78, 0.349, 1.0)

const controls = HStack(8, [decBtn, Spacer(), incBtn])
widgetSetEdgeInsets(controls, 20, 20, 20, 20)

const container = VStack(16, [title, display, controls])
widgetSetEdgeInsets(container, 40, 40, 40, 40)
setCornerRadius(container, 16)
widgetSetBackgroundColor(container, 1.0, 1.0, 1.0, 1.0)

App({
    title: "Styled App",
    width: 400,
    height: 300,
    body: container,
})
```

### Composing Styles (imperative helper functions)

Reduce repetition by creating helper functions:

```typescript
function card(children: number[]): number {
  const c = VStackWithInsets(12, 16, 16, 16, 16)
  setCornerRadius(c, 12)
  widgetSetBackgroundColor(c, 1.0, 1.0, 1.0, 1.0)
  widgetSetBorderColor(c, 0.9, 0.9, 0.9, 1.0)
  widgetSetBorderWidth(c, 1)
  for (const child of children) widgetAddChild(c, child)
  return c
}
```

For larger apps, use the `perry-styling` package to define design tokens in JSON and generate a typed theme file. See [Theming](https://docs.perryts.com/ui/theming.html) for the full workflow.

## Platform support

Per-prop, per-platform support is tracked in the
[styling matrix](https://docs.perryts.com/ui/styling-matrix.html) — auto-generated from
`crates/perry-ui/src/styling_matrix.rs` and CI-checked against each
backend's `lib.rs` exports on every PR.

The generated summary is the source of truth. It currently reports all 47
tracked properties wired, with zero stubs or missing exports, on macOS, iOS,
tvOS, visionOS, watchOS, Android, GTK4, Windows, and Web. The GTK4 and Windows
closure work is recorded in closed issues
[#202](https://github.com/PerryTS/perry/issues/202) and
[#210](https://github.com/PerryTS/perry/issues/210). Do not copy the counts
into another hand-maintained table; consult the matrix so the documentation
cannot drift from the backend inventory.

## Next Steps

- [Widgets](https://docs.perryts.com/ui/widgets.html) — All available widgets
- [Layout](https://docs.perryts.com/ui/layout.html) — Layout containers
- [Animation](https://docs.perryts.com/ui/animation.html) — Animate style changes
- [Theming](https://docs.perryts.com/ui/theming.html) — Design tokens via the `perry-styling` package


---

<!-- source: docs/src/ui/styling-matrix.md -->

# perry/ui styling matrix

Auto-generated from `crates/perry-ui/src/styling_matrix.rs` by `scripts/run_ui_styling_matrix.sh`. Do not edit by hand — CI fails if this file drifts from the source-of-truth.

Legend: `✓` Wired (real native impl), `~` Stub (symbol exists, no-op), `✗` Missing (FFI symbol not exported), `—` Not applicable to this platform.

## Generic widget setters (apply to any widget)

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `background_color` | `perry_ui_widget_set_background_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `background_gradient` | `perry_ui_widget_set_background_gradient` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `border_color` | `perry_ui_widget_set_border_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `border_width` | `perry_ui_widget_set_border_width` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `corner_radius` | `perry_ui_widget_set_corner_radius` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `edge_insets` | `perry_ui_widget_set_edge_insets` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `opacity` | `perry_ui_widget_set_opacity` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tooltip` | `perry_ui_widget_set_tooltip` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hidden` | `perry_ui_set_widget_hidden` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `enabled` | `perry_ui_widget_set_enabled` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `control_size` | `perry_ui_widget_set_control_size` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hugging` | `perry_ui_widget_set_hugging` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `width` | `perry_ui_widget_set_width` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `height` | `perry_ui_widget_set_height` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `match_parent_width` | `perry_ui_widget_match_parent_width` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `match_parent_height` | `perry_ui_widget_match_parent_height` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_click` | `perry_ui_widget_set_on_click` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_double_click` | `perry_ui_widget_set_on_double_click` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_hover` | `perry_ui_widget_set_on_hover` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_mouse_down` | `perry_ui_widget_set_on_mouse_down` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_mouse_up` | `perry_ui_widget_set_on_mouse_up` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on_mouse_move` | `perry_ui_widget_set_on_mouse_move` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `animate_opacity` | `perry_ui_widget_animate_opacity` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `animate_position` | `perry_ui_widget_animate_position` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `context_menu` | `perry_ui_widget_set_context_menu` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `shadow` | `perry_ui_widget_set_shadow` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## `button` widget

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `text_color` | `perry_ui_button_set_text_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `content_tint_color` | `perry_ui_button_set_content_tint_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `bordered` | `perry_ui_button_set_bordered` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `image_position` | `perry_ui_button_set_image_position` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## `image` widget

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `tint` | `perry_ui_image_set_tint` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `size` | `perry_ui_image_set_size` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## `stack` widget

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `alignment` | `perry_ui_stack_set_alignment` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `distribution` | `perry_ui_stack_set_distribution` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `detaches_hidden` | `perry_ui_stack_set_detaches_hidden` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## `text` widget

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `color` | `perry_ui_text_set_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `font_size` | `perry_ui_text_set_font_size` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `font_weight` | `perry_ui_text_set_font_weight` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `font_family` | `perry_ui_text_set_font_family` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `selectable` | `perry_ui_text_set_selectable` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `wraps` | `perry_ui_text_set_wraps` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `text_alignment` | `perry_ui_text_set_text_alignment` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `decoration` | `perry_ui_text_set_decoration` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## `textfield` widget

| Prop | FFI symbol | macOS | iOS | tvOS | visionOS | watchOS | Android | GTK4 | Windows | Web |
|---|---|---|---|---|---|---|---|---|---|---|
| `background_color` | `perry_ui_textfield_set_background_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `text_color` | `perry_ui_textfield_set_text_color` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `font_size` | `perry_ui_textfield_set_font_size` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `borderless` | `perry_ui_textfield_set_borderless` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Summary

| Platform | Wired | Stub | Missing | Not applicable |
|---|---|---|---|---|
| macOS | 47 | 0 | 0 | 0 |
| iOS | 47 | 0 | 0 | 0 |
| tvOS | 47 | 0 | 0 | 0 |
| visionOS | 47 | 0 | 0 | 0 |
| watchOS | 47 | 0 | 0 | 0 |
| Android | 47 | 0 | 0 | 0 |
| GTK4 | 47 | 0 | 0 | 0 |
| Windows | 47 | 0 | 0 | 0 |
| Web | 47 | 0 | 0 | 0 |


---

<!-- source: docs/src/ui/theming.md -->

# Theming

The `perry-styling` package provides a design system bridge for Perry UI — design token codegen and ergonomic styling helpers with compile-time platform detection.

## Installation

```bash
npm install perry-styling
```

## Design Token Codegen

Generate typed theme files from a JSON token definition:

```bash
perry-styling generate --tokens tokens.json --out src/theme.ts
```

### Token Format

```json
{
  "colors": {
    "primary": "#007AFF",
    "primary-dark": "#0A84FF",
    "background": "#FFFFFF",
    "background-dark": "#1C1C1E",
    "text": "#000000",
    "text-dark": "#FFFFFF"
  },
  "spacing": {
    "sm": 4,
    "md": 8,
    "lg": 16,
    "xl": 24
  },
  "radius": {
    "sm": 4,
    "md": 8,
    "lg": 16
  },
  "fontSize": {
    "body": 14,
    "heading": 20,
    "caption": 12
  },
  "borderWidth": {
    "thin": 1,
    "medium": 2
  }
}
```

Colors with a `-dark` suffix are used as the dark mode variant. If no dark variant is provided, the light value is used for both modes. Supported color formats: hex (`#RGB`, `#RRGGBB`, `#RRGGBBAA`), `rgb()`/`rgba()`, `hsl()`/`hsla()`, and CSS named colors.

## Generated Types

The codegen produces typed interfaces:

```text
interface PerryColor {
  r: number; g: number; b: number; a: number; // floats in [0, 1]
}

interface PerryTheme {
  light: { [key: string]: PerryColor };
  dark: { [key: string]: PerryColor };
  spacing: { [key: string]: number };
  radius: { [key: string]: number };
  fontSize: { [key: string]: number };
  borderWidth: { [key: string]: number };
}

interface ResolvedTheme {
  colors: { [key: string]: PerryColor };
  spacing: { [key: string]: number };
  radius: { [key: string]: number };
  fontSize: { [key: string]: number };
  borderWidth: { [key: string]: number };
}
```

## Theme Resolution

Resolve a theme at runtime based on the system's dark mode setting:

```text
import { getTheme } from "perry-styling";
import { theme } from "./theme"; // generated file

const resolved = getTheme(theme);
// resolved.colors.primary → the correct light/dark variant
```

`getTheme()` calls `isDarkMode()` from `perry/system` and returns the appropriate palette.

## Styling Helpers

Ergonomic functions for applying styles to widget handles. Perry's compiler
doesn't yet support passing `PerryColor` objects as parameters into user
functions, so the helpers take **flat primitives**: extract the channels at
the call site:

```text
import {
  applyBg, applyRadius, applyTextColor, applyFontSize, applyGradient,
} from "perry-styling";

const t = resolved;                    // your ResolvedTheme
const c = t.colors.text;               // a PerryColor
const bg = t.colors.background;
const start = t.colors.primary;
const end = t.colors["primary-dark"];

const label = Text("Hello");
applyTextColor(label, c.r, c.g, c.b, c.a);
applyFontSize(label, t.fontSize.heading);

const card = VStack(16, []);
applyBg(card, bg.r, bg.g, bg.b, bg.a);
applyRadius(card, t.radius.md);
applyGradient(card,
  start.r, start.g, start.b, start.a,
  end.r,   end.g,   end.b,   end.a,
  0,                                   // 0 = vertical, 1 = horizontal
);
```

### Available Helpers

| Function | Signature |
|----------|-----------|
| `applyBg(handle, r, g, b, a)` | Background color |
| `applyRadius(handle, radius)` | Corner radius |
| `applyTextColor(handle, r, g, b, a)` | Text color |
| `applyFontSize(handle, size)` | Font size (regular weight) |
| `applyFontBold(handle, size)` | Font size with bold weight |
| `applyFontFamily(handle, family)` | Font family |
| `applyWidth(handle, width)` | Fixed width |
| `applyTooltip(handle, text)` | Tooltip (no-op on iOS/Android) |
| `applyBorderColor(handle, r, g, b, a)` | Border color |
| `applyBorderWidth(handle, width)` | Border width |
| `applyEdgeInsets(handle, top, left, bottom, right)` | Edge insets (padding) |
| `applyOpacity(handle, alpha)` | Opacity |
| `applyGradient(handle, r1, g1, b1, a1, r2, g2, b2, a2, direction)` | Background gradient |
| `applyButtonBg(btn, r, g, b, a)` | Button background |
| `applyButtonTextColor(btn, r, g, b, a)` | Button text color |
| `applyButtonBordered(btn, bordered)` | Bordered button style (`true`/`false`) |

## Platform Constants

`perry-styling` exports compile-time platform constants based on the `__platform__` built-in:

```text
import { isMac, isIOS, isAndroid, isWindows, isLinux, isDesktop, isMobile } from "perry-styling";

if (isMobile) {
  applyFontSize(label, 16);
} else {
  applyFontSize(label, 14);
}
```

These are constant-folded by LLVM at compile time — dead branches are eliminated with zero runtime cost.

## Next Steps

- [Styling](https://docs.perryts.com/ui/styling.html) — Widget styling basics
- [State Management](https://docs.perryts.com/ui/state.html) — Reactive bindings
