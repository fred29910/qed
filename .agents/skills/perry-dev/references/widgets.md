<!-- Perry docs bundle: widgets.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/widgets/overview.md -->

# Widgets (WidgetKit) Overview

Perry can compile TypeScript widget declarations to native widget extensions across 4 platforms: iOS (WidgetKit), Android (App Widgets), watchOS (Complications), and Wear OS (Tiles).

> **Status:** the `perry/widget` API is wired in the HIR
> (`crates/perry-hir/src/lower.rs:try_lower_widget_decl`) and emits via
> dedicated codegen crates (`perry-codegen-glance`, `perry-codegen-wear-tiles`,
> the WidgetKit emitter). The snippets on the widget docs pages compile-link
> cleanly on the host LLVM target — `Widget({...})` lowers to a no-op there —
> and CI verifies that via [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts).
> The doc-tests harness accepts a `// widget-bundle-id:` banner and passes it
> through as `--app-bundle-id`; that plumbing closed
> [#194](https://github.com/PerryTS/perry/issues/194). The shared snippets on
> these pages currently exercise the host compile/link path, while
> `_smoketest_bundleid.ts` exercises the banner. A target is compiled
> end-to-end only on a CI host where its Xcode or Android SDK is available.
> For a working end-to-end reference see [`examples/widget_demo.ts`](https://github.com/PerryTS/perry/blob/main/examples/widget_demo.ts).

## What Are Widgets?

Home screen widgets display glanceable information outside your app. Perry's `perry/widget` module lets you define widgets in TypeScript that compile to each platform's native widget system.

```typescript
Widget({
    kind: "MyWidget",
    displayName: "My Widget",
    description: "Shows a greeting",
    entryFields: { name: "string" },
    render: (entry) =>
        VStack([
            Text(`Hello, ${entry.name}!`),
        ]),
})
```

## How It Works

```
TypeScript widget declaration
    ↓ Parse & Lower to WidgetDecl HIR
    ↓ Platform-specific codegen
    ↓
iOS/watchOS: SwiftUI WidgetKit extension (Entry, View, TimelineProvider, WidgetBundle, Info.plist)
Android:    AppWidgetProvider + layout XML + AppWidgetProviderInfo
Wear OS:    TileService + layout
```

The compiler generates a complete native widget extension for each platform — no platform-specific language knowledge required.

## Building

```bash
perry widget.ts --target ios-widget              # iOS WidgetKit extension
perry widget.ts --target android-widget           # Android App Widget
perry widget.ts --target watchos-widget            # watchOS Complication
perry widget.ts --target watchos-widget-simulator   # watchOS Simulator
perry widget.ts --target wearos-tile               # Wear OS Tile
```

Each target produces the appropriate native widget extension for that platform.

## Next Steps

- [Creating Widgets](https://docs.perryts.com/widgets/creating-widgets.html) — Widget() API in detail
- [Components & Modifiers](https://docs.perryts.com/widgets/components.html) — Available widget components
- [Configuration](https://docs.perryts.com/widgets/configuration.html) — Widget configuration options
- [Data Fetching](https://docs.perryts.com/widgets/data-fetching.html) — Timeline providers and data loading
- [Cross-Platform Reference](https://docs.perryts.com/widgets/platforms.html) — Platform-specific details
- [watchOS Complications](https://docs.perryts.com/widgets/watchos.html) — watchOS-specific guide
- [Wear OS Tiles](https://docs.perryts.com/widgets/wearos.html) — Wear OS-specific guide


---

<!-- source: docs/src/widgets/creating-widgets.md -->

# Creating Widgets

Define home screen widgets using the `Widget()` function.

> **Status:** the full `Widget({...})` snippets on this page compile-link
> cleanly on the host LLVM target via
> [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts),
> so the API shapes are verified against the codegen. The actual cross-compile
> targets (`--target ios-widget`/`android-widget`/`watchos-widget`/`wearos-tile`)
> can be driven by the doc-tests harness with a `// widget-bundle-id:` banner
> ([#194](https://github.com/PerryTS/perry/issues/194)). These shared snippets
> do not request those targets, so their regular CI coverage remains the host
> compile/link path; SDK-backed target coverage runs only where the required
> Xcode or Android toolchain is installed.
> For the canonical end-to-end shape see
> [`examples/widget_demo.ts`](https://github.com/PerryTS/perry/blob/main/examples/widget_demo.ts).
> Fragments below that show partial syntax (just the `entryFields` object,
> just a `render:` body, etc.) are rendered as plain text — the full
> declarations they appear inside are covered by the verified anchors.

## Widget Declaration

```typescript
Widget({
    kind: "WeatherWidget",
    displayName: "Weather",
    description: "Shows current weather",
    entryFields: {
        temperature: "number",
        condition: "string",
        location: "string",
    },
    render: (entry) =>
        VStack([
            HStack([
                Text(entry.location),
                Spacer(),
                Image("cloud.sun.fill"),
            ]),
            Text(`${entry.temperature}°`),
            Text(entry.condition),
        ]),
})
```

## Widget Options

| Property | Type | Description |
|----------|------|-------------|
| `kind` | `string` | Unique identifier for the widget |
| `displayName` | `string` | Name shown in widget gallery |
| `description` | `string` | Description in widget gallery |
| `entryFields` | `object` | Data fields with types (`"string"`, `"number"`, `"boolean"`, arrays, optionals, objects) |
| `render` | `function` | Render function receiving entry data, returns widget tree. Optional 2nd param for family. |
| `config` | `object` | Configurable parameters the user can edit (see below) |
| `provider` | `function` | Timeline provider function for dynamic data (see below) |
| `appGroup` | `string` | App group identifier for sharing data with the host app |

## Entry Fields

Entry fields define the data your widget displays. Each field has a name and type:

```text
entryFields: {
  title: "string",
  count: "number",
  isActive: "boolean",
}
```

### Array, Optional, and Object Fields

Entry fields support richer types beyond primitives:

```text
entryFields: {
  items: [{ name: "string", value: "number" }],  // Array of objects
  subtitle: "string?",                             // Optional string
  stats: { wins: "number", losses: "number" },     // Nested object
}
```

These compile to a Swift `TimelineEntry` struct:

```swift
struct WeatherEntry: TimelineEntry {
    let date: Date
    let temperature: Double
    let condition: String
    let location: String
}
```

## Conditionals in Render

Use ternary expressions for conditional rendering:

```typescript
Widget({
    kind: "ConditionalWidget",
    displayName: "Conditional",
    description: "Renders based on entry data",
    entryFields: {
        isActive: "boolean",
        count: "number",
    },
    render: (entry) =>
        VStack([
            Text(entry.isActive ? "Active" : "Inactive"),
            entry.count > 0 ? Text(`${entry.count} items`) : Spacer(),
        ]),
})
```

## Template Literals

Template literals in widget text are compiled to Swift string interpolation:

```typescript
Widget({
    kind: "TemplateLiteralWidget",
    displayName: "Template Literal",
    description: "Template literals compile to Swift string interpolation",
    entryFields: {
        name: "string",
        score: "number",
    },
    render: (entry) =>
        // Template literal: `${entry.name}: ${entry.score} points`
        // Compiles to: Text("\(entry.name): \(entry.score) points")
        Text(`${entry.name}: ${entry.score} points`),
})
```

## Configuration Parameters

The `config` field defines user-editable parameters that appear in the widget's edit UI:

```typescript
Widget({
    kind: "CityWeather",
    displayName: "City Weather",
    description: "Weather for a chosen city",
    config: {
        city: { type: "string", displayName: "City", default: "New York" },
        units: {
            type: "enum",
            displayName: "Units",
            values: ["Celsius", "Fahrenheit"],
            default: "Celsius",
        },
    },
    entryFields: { temperature: "number", condition: "string" },
    render: (entry) => Text(`${entry.temperature}° ${entry.condition}`),
})
```

## Provider Function

The `provider` field defines a timeline provider that fetches data for the widget:

```typescript
Widget({
    kind: "StockWidget",
    displayName: "Stock Price",
    description: "Shows current stock price",
    config: {
        symbol: { type: "string", displayName: "Symbol", default: "AAPL" },
    },
    entryFields: { price: "number", change: "string" },
    provider: async (config) => {
        const res = await fetch(`https://api.example.com/stock/${config.symbol}`)
        const data = await res.json()
        return { price: data.price, change: data.change }
    },
    // Inline-options form — the chain form `.font("title")` parses but is
    // dropped at HIR-lowering time (#195).
    render: (entry) =>
        VStack([
            Text(`$${entry.price}`, { font: "title" }),
            Text(entry.change, { color: "green" }),
        ]),
})
```

> Note: chain-style modifiers (`.font("title").color("green")`) are rejected
> with a compile-time diagnostic so styling cannot disappear silently; this
> behavior closed [#195](https://github.com/PerryTS/perry/issues/195). The
> verified extract uses the supported inline-options form
> `Text("...", { font: "title" })`.

### Placeholder Data

When the widget has no data yet (e.g., first load), the provider can return placeholder data by providing a `placeholder` field:

```text
Widget({
  kind: "NewsWidget",
  entryFields: { headline: "string", source: "string" },
  placeholder: { headline: "Loading...", source: "---" },
  // ...
});
```

## Family-Specific Rendering

The render function accepts an optional second parameter for the widget family, allowing different layouts per size:

```text
render: (entry, family) =>
  family === "systemLarge"
    ? VStack([
        Text(entry.title).font("title"),
        ForEach(entry.items, (item) => Text(item.name)),
      ])
    : HStack([
        Image("star.fill"),
        Text(entry.title).font("headline"),
      ]),
```

Supported families: `"systemSmall"`, `"systemMedium"`, `"systemLarge"`, `"accessoryCircular"`, `"accessoryRectangular"`, `"accessoryInline"`.

## App Group

The `appGroup` field specifies a shared container for data exchange between the host app and the widget:

```text
Widget({
  kind: "AppDataWidget",
  appGroup: "group.com.example.myapp",
  // ...
});
```

## Multiple Widgets

Define multiple widgets in a single file. They're bundled into a `WidgetBundle`:

```text
Widget({
  kind: "SmallWidget",
  // ...
});

Widget({
  kind: "LargeWidget",
  // ...
});
```

## Next Steps

- [Components](https://docs.perryts.com/widgets/components.html) — Available widget components and modifiers
- [Overview](https://docs.perryts.com/widgets/overview.html) — Widget system overview


---

<!-- source: docs/src/widgets/components.md -->

# Widget Components & Modifiers

Available components and modifiers for widgets.

> **Status:** this page mixes (a) tiny fragments showing component shape —
> rendered as plain `text` because they're not standalone declarations and
> can't compile — and (b) one full verified Widget at the bottom that
> compile-links via
> [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts).
> The doc-tests harness can pass `--app-bundle-id` from a
> `// widget-bundle-id:` banner ([#194](https://github.com/PerryTS/perry/issues/194));
> end-to-end targets also require their platform SDK. Modifier syntax is
> deliberately limited to **inline option-object arguments** — e.g.
> `Text("hi", { font: "title", color: "red" })` and
> `VStack([...], { padding: 16 })`. Method-style chains such as
> `Text("hi").font("title")` are rejected with an actionable compile-time
> diagnostic instead of being silently ignored; that behavior closed
> [#195](https://github.com/PerryTS/perry/issues/195). The end-to-end reference is
> [`examples/widget_demo.ts`](https://github.com/PerryTS/perry/blob/main/examples/widget_demo.ts).

## Text

```text
Text("Hello, World!")
Text(`${entry.name}: ${entry.value}`)
```

### Text Modifiers

```text
const t = Text("Styled", {
  font: "title",          // title, headline, body, caption, etc.
  color: "blue",          // named color or hex
  fontWeight: "bold",
});
```

## Layout

### VStack

```text
VStack([
  Text("Top"),
  Text("Bottom"),
])
```

### HStack

```text
HStack([
  Text("Left"),
  Spacer(),
  Text("Right"),
])
```

### ZStack

```text
ZStack([
  Image("background"),
  Text("Overlay"),
])
```

## Spacer

Flexible space that expands to fill available room:

```text
HStack([
  Text("Left"),
  Spacer(),
  Text("Right"),
])
```

## Image

Display SF Symbols or asset images:

```text
Image("star.fill")           // SF Symbol
Image("cloud.sun.rain.fill") // SF Symbol
```

## ForEach

Iterate over array entry fields to render a list of components:

```text
ForEach(entry.items, (item) =>
  HStack([
    Text(item.name),
    Spacer(),
    Text(`${item.value}`),
  ])
)
```

## Divider

A visual separator line:

```text
VStack([
  Text("Above"),
  Divider(),
  Text("Below"),
])
```

## Label

A label with text and an SF Symbol icon:

```text
Label("Downloads", "arrow.down.circle")
Label(`${entry.count} items`, "folder.fill")
```

## Gauge

A circular or linear progress indicator:

```text
Gauge(entry.progress, 0, 100)       // value, min, max
Gauge(entry.battery, 0, 1.0)
```

## Modifiers

Widget components use inline option objects. Chained modifier calls are a
compile-time error so styling cannot disappear silently. The examples below
use the form that reaches codegen, as does the
[Complete Example](#complete-example).

### Font

```text
Text("Title", { font: "title" })
Text("Body", { font: "body" })
Text("Caption", { font: "caption" })
```

### Color

```text
Text("Red text", { color: "red" })
Text("Custom", { color: "#FF6600" })
```

### Padding

```text
VStack([...], { padding: 16 })
```

### Frame

```text
Text("Fixed", { frame: { width: 120, height: 40 } })
```

### Max Width

```text
VStack([...], { maxWidth: "infinity" }) // expand to fill available width
```

### Minimum Scale Factor

Allow text to shrink to fit:

```text
Text("Long text", { minimumScaleFactor: 0.5 })
```

### Container Background

Set background color for the widget container:

```text
VStack([...], { containerBackground: "blue" })
```

### Widget URL

Make the widget tappable with a deep link:

```text
VStack([...], { url: "myapp://detail/123" })
```

Edge-specific `paddingEdge(...)` chains are not part of the current widget
modifier surface. Use uniform `padding`, or compose nested stacks and spacers
when individual edges need different spacing.

## Conditionals

Render different components based on entry data:

```text
render: (entry) =>
  VStack([
    entry.isOnline
      ? Text("Online", { color: "green" })
      : Text("Offline", { color: "red" }),
  ]),
```

## Complete Example

The full Widget below is the verified extract — it compile-links on the host
LLVM target and uses the inline-options modifier form that round-trips through
the codegen.

```typescript
Widget({
    kind: "StatsWidget",
    displayName: "Stats",
    description: "Shows daily stats",
    entryFields: {
        steps: "number",
        calories: "number",
        distance: "string",
    },
    // Inline-options modifier form — the `.font("title").bold()` chain form
    // parses but its modifiers don't reach the codegen (#195).
    render: (entry) =>
        VStack([
            HStack([
                Image("figure.walk"),
                Text("Daily Stats", { font: "headline" }),
            ]),
            Spacer(),
            HStack([
                VStack([
                    Text(`${entry.steps}`, { font: "title", fontWeight: "bold" }),
                    Text("steps", { font: "caption", color: "gray" }),
                ]),
                Spacer(),
                VStack([
                    Text(`${entry.calories}`, { font: "title", fontWeight: "bold" }),
                    Text("cal", { font: "caption", color: "gray" }),
                ]),
                Spacer(),
                VStack([
                    Text(entry.distance, { font: "title", fontWeight: "bold" }),
                    Text("km", { font: "caption", color: "gray" }),
                ]),
            ]),
        ], { padding: 16 }),
})
```

## Next Steps

- [Creating Widgets](https://docs.perryts.com/widgets/creating-widgets.html) — Widget() API
- [Overview](https://docs.perryts.com/widgets/overview.html) — Widget system overview


---

<!-- source: docs/src/widgets/configuration.md -->

# Widget Configuration

Perry widgets support user-configurable parameters. On iOS/watchOS, these compile to AppIntent configurations (the "Edit Widget" sheet). On Android/Wear OS, they compile to a Configuration Activity.

> **Status:** the full `TopSitesWidget` declaration below compile-links cleanly
> on the host LLVM target via
> [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts),
> so the `config: { ... }` shape is verified against
> `parse_config_params` in `crates/perry-hir/src/lower.rs`. The shorter
> fragments lower on the page (just a `provider:` body, just a `config:`
> object) are rendered as plain text — they're not standalone declarations.
> The doc-tests harness can pass the required bundle id through its
> `// widget-bundle-id:` banner ([#194](https://github.com/PerryTS/perry/issues/194)).
> This page's shared snippet requests only the host compile/link check; actual
> widget-target runs remain conditional on an available Xcode or Android SDK.

## Defining Config Fields

Add a `config` object to your `Widget()` declaration. Each field specifies a type, allowed values, a default, and a display title.

```typescript
Widget({
    kind: "TopSitesWidget",
    displayName: "Top Sites",
    description: "Your top performing sites",
    supportedFamilies: ["systemSmall", "systemMedium"],
    appGroup: "group.com.example.shared",

    config: {
        sortBy: {
            type: "enum",
            values: ["clicks", "impressions", "ctr", "position"],
            default: "clicks",
            title: "Sort By",
        },
        dateRange: {
            type: "enum",
            values: ["7d", "28d", "90d"],
            default: "7d",
            title: "Date Range",
        },
    },

    entryFields: {
        total: "number",
        label: "string",
    },

    provider: async (config: { sortBy: string; dateRange: string }) => {
        const res = await fetch(
            `https://api.example.com/stats?sort=${config.sortBy}&range=${config.dateRange}`,
        )
        const data = await res.json()
        return {
            entries: [{ total: data.total, label: data.label }],
            reloadPolicy: { after: { minutes: 30 } },
        }
    },

    render: (entry) =>
        VStack([
            Text(`${entry.total}`, { font: "title", fontWeight: "bold" }),
            Text(entry.label, { font: "caption", color: "secondary" }),
        ]),
})
```

## Supported Parameter Types

| Type | TypeScript | Description |
|------|-----------|-------------|
| Enum | `{ type: "enum", values: [...], default: "...", title: "..." }` | Picker with fixed choices |
| Boolean | `{ type: "bool", default: true, title: "..." }` | Toggle switch |
| String | `{ type: "string", default: "...", title: "..." }` | Free-text input |

## Accessing Config in the Provider

The `provider` function receives the current config values as its argument. The config object keys match the field names you defined:

```text
provider: async (config: { sortBy: string; dateRange: string }) => {
  // config.sortBy === "clicks" | "impressions" | "ctr" | "position"
  // config.dateRange === "7d" | "28d" | "90d"
  const url = `https://api.example.com/data?sort=${config.sortBy}`;
  const res = await fetch(url);
  const data = await res.json();
  return { entries: [data] };
},
```

When the user changes a config value, the system calls your provider again with the updated config.

## Boolean Config Example

```text
config: {
  showDetails: {
    type: "bool",
    default: true,
    title: "Show Details",
  },
},
```

## Platform Mapping

### iOS / watchOS (AppIntent)

Perry generates a Swift `WidgetConfigurationIntent` struct with `@Parameter` properties and `AppEnum` types for each enum field. The widget uses `AppIntentConfiguration` instead of `StaticConfiguration`.

Generated output (auto-generated, not hand-written):
- `{Name}Intent.swift` -- contains the AppEnum cases and the intent struct
- The provider conforms to `AppIntentTimelineProvider` instead of `TimelineProvider`
- Config values are serialized to JSON and passed to the native provider function

Users configure the widget by long-pressing and selecting "Edit Widget", which presents the system-generated AppIntent UI.

### Android / Wear OS (Configuration Activity)

Perry generates a `{Name}ConfigActivity.kt` with Spinner controls for enum fields and Switch controls for boolean fields. Values are persisted in SharedPreferences keyed by widget ID.

Generated output:
- `{Name}ConfigActivity.kt` -- Activity with UI controls and a Save button
- `widget_info_{name}.xml` -- includes `android:configure` pointing to the config activity
- AndroidManifest snippet includes an `<activity>` entry with `APPWIDGET_CONFIGURE` intent filter

The config activity launches automatically when the user first adds the widget.

## Build Commands

```bash
# iOS
perry widget.ts --target ios-widget --app-bundle-id com.example.app -o widget_out

# Android
perry widget.ts --target android-widget --app-bundle-id com.example.app -o widget_out
```

## Next Steps

- [Data Fetching](https://docs.perryts.com/widgets/data-fetching.html) -- Provider function and shared storage
- [Components](https://docs.perryts.com/widgets/components.html) -- Available widget components
- [Cross-Platform Reference](https://docs.perryts.com/widgets/platforms.html) -- Feature matrix and build targets


---

<!-- source: docs/src/widgets/data-fetching.md -->

# Provider Function and Data Fetching

The `provider` function is the heart of a dynamic widget. It fetches data, transforms it, and returns timeline entries that the system renders on schedule.

> **Status:** the basic `WeatherWidget` provider below compile-links cleanly on
> the host LLVM target via
> [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts),
> so the `provider`/`reloadPolicy`/`entryFields` shapes are verified against
> the codegen. The shorter fragments lower on the page (a bare
> `reloadPolicy:`, a `provider:` body without surrounding `Widget({...})`,
> etc.) are rendered as plain text. The `sharedStorage()` and
> `preferencesSet()` examples are also rendered as plain text — those symbols
> are provided by the platform-specific glue (`AppGroupBridge.swift`,
> `Bridge.kt`) for `--target ios-widget`/`android-widget`/`watchos-widget`/
> `wearos-tile` and don't link on the host LLVM target. The cross-compile
> targets can be driven by the harness with its `// widget-bundle-id:` banner
> ([#194](https://github.com/PerryTS/perry/issues/194)). This page's shared
> snippet requests only the host compile/link check; target execution remains
> conditional on an available Xcode or Android SDK.

## Provider Lifecycle

1. The system calls your provider when the widget is first added, when a snapshot is needed, and when the reload policy expires.
2. Your provider runs as native LLVM-compiled code linked into the widget extension.
3. The provider returns one or more timeline entries. The system renders each entry at its scheduled time.
4. After the last entry, the reload policy determines when the provider runs again.

## Basic Provider

```typescript
Widget({
    kind: "WeatherProviderWidget",
    displayName: "Weather",
    description: "Current conditions",
    supportedFamilies: ["systemSmall"],

    entryFields: {
        temperature: "number",
        condition: "string",
    },

    provider: async () => {
        const res = await fetch("https://api.weather.example.com/current")
        const data = await res.json()
        return {
            entries: [
                { temperature: data.temp, condition: data.description },
            ],
            reloadPolicy: { after: { minutes: 15 } },
        }
    },

    render: (entry) =>
        VStack([
            Text(`${entry.temperature}°`, { font: "title" }),
            Text(entry.condition, { font: "caption" }),
        ]),
})
```

## Authenticated Requests with Shared Storage

Widgets run in a separate process and cannot access your app's memory. Use `sharedStorage()` to read values that your app has written to a shared container.

### iOS / watchOS: App Groups

On Apple platforms, shared storage maps to `UserDefaults(suiteName:)` backed by an App Group container. Set the `appGroup` field in your widget declaration:

```text
Widget({
  kind: "DashboardWidget",
  displayName: "Dashboard",
  description: "Account summary",
  appGroup: "group.com.example.shared",

  entryFields: {
    revenue: "number",
    users: "number",
  },

  provider: async () => {
    const token = sharedStorage("auth_token");
    const res = await fetch("https://api.example.com/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return {
      entries: [{ revenue: data.revenue, users: data.activeUsers }],
      reloadPolicy: { after: { minutes: 30 } },
    };
  },

  render: (entry) =>
    VStack([
      Text(`$${entry.revenue}`, { font: "title" }),
      Text(`${entry.users} active users`, { font: "caption" }),
    ]),
});
```

Your main app writes the token to the shared container:

```text
import { preferencesSet } from "perry/system";
// In your app's login flow:
preferencesSet("auth_token", token);
```

**Setup requirement (iOS):** Add an App Group capability in Xcode to both the main app target and the widget extension target. The identifier must match the `appGroup` value.

### Android / Wear OS: SharedPreferences

On Android, shared storage maps to `SharedPreferences` with the name `perry_shared`. The generated `Bridge.kt` reads values via `context.getSharedPreferences("perry_shared", MODE_PRIVATE)`.

## Reload Policies

The `reloadPolicy` field controls when the system next calls your provider:

```text
return {
  entries: [{ ... }],
  reloadPolicy: { after: { minutes: 30 } },
};
```

The refresh interval is read **at compile time**: the compiler scans the
provider's `return` statements for a literal
`reloadPolicy: { after: { minutes: N } }` (where `N` is a numeric literal;
fractional values round to the nearest second) and bakes the interval into
the generated platform code. A `reloadPolicy` computed at runtime (a
variable, a function call, …) cannot be read — the compiler warns and the
platform default applies.

| Policy | Behavior |
|--------|----------|
| `{ after: { minutes: N } }` | Re-fetch after N minutes. Compiles to `.after(Date().addingTimeInterval(N*60))` on iOS/watchOS, `android:updatePeriodMillis="N*60000"` on Android, and `setFreshnessIntervalMillis(N*60000)` on Wear OS. |
| *(omitted)* | Platform default: 30 minutes on iOS/watchOS, 30 minutes on Android, 60 minutes on Wear OS. |

**Platform floors:** each platform ignores refresh requests below a minimum
interval, so the compiler clamps and warns:

| Platform | Default | Minimum (clamped) |
|----------|---------|-------------------|
| iOS / watchOS (WidgetKit) | 30 minutes | 15 minutes (refresh budget) |
| Android (Glance, `updatePeriodMillis`) | 30 minutes | 30 minutes (hard framework floor) |
| Wear OS (Tiles freshness) | 60 minutes | 15 minutes |

If different `return` statements carry different literal policies (e.g. a
short error-retry interval and a longer happy-path one), the smallest one
wins — the interval is a single compile-time constant per widget — and the
compiler emits a warning naming the value it chose.

**Budget limits:** iOS restricts widget refreshes. Typical budget is 40--70 refreshes per day. watchOS is stricter (see [watchOS Complications](https://docs.perryts.com/widgets/watchos.html)). Request only what you need.

## JSON Response Handling

The provider function receives the parsed JSON directly. Entry field types must match your `entryFields` declaration:

```text
entryFields: {
  items: { type: "array", items: { type: "object", fields: { name: "string", count: "number" } } },
  total: "number",
},

provider: async () => {
  const res = await fetch("https://api.example.com/items");
  const data = await res.json();
  return {
    entries: [{
      items: data.results.map((r: any) => ({ name: r.name, count: r.count })),
      total: data.total,
    }],
  };
},
```

## Error Handling

If the fetch fails or JSON parsing throws, the widget extension falls back to the placeholder data:

```text
Widget({
  // ...
  placeholder: { temperature: 0, condition: "Loading..." },

  provider: async () => {
    const res = await fetch("https://api.example.com/weather");
    if (!res.ok) {
      // Return stale/fallback data with a short retry interval
      return {
        entries: [{ temperature: 0, condition: "Unavailable" }],
        reloadPolicy: { after: { minutes: 5 } },
      };
    }
    const data = await res.json();
    return {
      entries: [{ temperature: data.temp, condition: data.desc }],
      reloadPolicy: { after: { minutes: 15 } },
    };
  },
});
```

The `placeholder` field provides data shown in the widget gallery and during loading. If the provider throws an unhandled exception, the generated Swift/Kotlin code catches it and renders the placeholder instead.

Note that with two distinct literal policies (5 and 15 minutes above), the
compiled widget uses the smaller one — 5 minutes, which the platform floor
then raises to its minimum (15 minutes on iOS) — and the compiler warns
about the choice. See [Reload Policies](#reload-policies).

## Multiple Timeline Entries

Return multiple entries to schedule future content without re-fetching:

```text
provider: async () => {
  const res = await fetch("https://api.example.com/hourly");
  const hours = await res.json();
  return {
    entries: hours.map((h: any) => ({
      temperature: h.temp,
      condition: h.condition,
    })),
    reloadPolicy: { after: { minutes: 60 } },
  };
},
```

Each entry is rendered at the corresponding date in the timeline. The system transitions between entries automatically.

## Next Steps

- [Configuration](https://docs.perryts.com/widgets/configuration.html) -- User-configurable parameters
- [Cross-Platform Reference](https://docs.perryts.com/widgets/platforms.html) -- Build targets and platform differences


---

<!-- source: docs/src/widgets/platforms.md -->

# Cross-Platform Reference

Perry widgets compile from a single TypeScript source to four platforms. The same `Widget({...})` declaration produces native code for each target.

> **Status:** this page has no TypeScript fences (only target-flag tables and
> shell build commands), so the doc-tests harness has nothing to run here. The
> `--target` flags listed below are wired in the compiler. Example files can
> provide the required bundle id with the harness's `// widget-bundle-id:`
> banner; end-to-end target coverage also requires the matching Xcode or
> Android SDK on the CI host.

## Target Flags

| Platform | Target Flag | Output |
|----------|------------|--------|
| iOS | `--target ios-widget` | SwiftUI `.swift` + Info.plist |
| iOS Simulator | `--target ios-widget-simulator` | Same, simulator SDK |
| Android | `--target android-widget` | Kotlin/Glance `.kt` + widget_info XML |
| watchOS | `--target watchos-widget` | SwiftUI `.swift` (accessory families) |
| watchOS Simulator | `--target watchos-widget-simulator` | Same, simulator SDK |
| Wear OS | `--target wearos-tile` | Kotlin Tiles `.kt` + manifest |

## Feature Matrix

| Feature | iOS | Android | watchOS | Wear OS |
|---------|-----|---------|---------|---------|
| Text | Yes | Yes | Yes | Yes |
| VStack/HStack/ZStack | Yes | Column/Row/Box | Yes | Column/Row/Box |
| Image (SF Symbols) | Yes | R.drawable | Yes | R.drawable |
| Spacer | Yes | Yes | Yes | Yes |
| Divider | Yes | Spacer+bg | Yes | Spacer |
| ForEach | Yes | forEach | Yes | forEach |
| Label | Yes | Row compound | Yes | Text fallback |
| Gauge | N/A | Text fallback | Yes | CircularProgressIndicator |
| Conditional | Yes | if | Yes | if |
| FamilySwitch | Yes | LocalSize | Yes | requestedSize |
| Config (AppIntent) | Yes | Config Activity | Yes (10+) | SharedPrefs |
| Native provider | Yes | JNI | Yes | JNI |
| sharedStorage | UserDefaults | SharedPrefs | UserDefaults | SharedPrefs |
| Deep linking (url) | widgetURL | clickable Intent | widgetURL | N/A |

## Platform-Specific Notes

### iOS
- Minimum deployment: iOS 17.0
- AppIntentConfiguration requires `import AppIntents`
- Widget extension memory limit: ~30MB

### Android
- Requires Glance dependency: `androidx.glance:glance-appwidget:1.1.0`
- Widget sizes mapped from iOS families: systemSmall=2x2, systemMedium=4x2, systemLarge=4x4
- `minimumScaleFactor` not supported in Glance (skipped with warning)

### watchOS
- Minimum deployment: watchOS 9.0
- Accessory families only (circular, rectangular, inline)
- Tighter memory (~15-20MB) and refresh budgets (hourly)
- AppIntent requires watchOS 10+; older versions get StaticConfiguration

### Wear OS
- Same native compilation as Android phone (Wear OS = Android)
- Requires Horologist + Tiles Material 3 dependencies
- Tiles are full-screen cards in the carousel
- `Gauge` maps to `CircularProgressIndicator`

## Build Instructions

### iOS
```bash
perry widget.ts --target ios-widget --app-bundle-id com.example.app -o widget_out
xcrun --sdk iphoneos swiftc -target arm64-apple-ios17.0 \
  widget_out/*.swift -framework WidgetKit -framework SwiftUI \
  -o widget_out/WidgetExtension
```

### Android
```bash
perry widget.ts --target android-widget --app-bundle-id com.example.app -o widget_out
# Copy .kt files to app/src/main/java/com/example/app/
# Copy xml/ to app/src/main/res/xml/
# Merge AndroidManifest_snippet.xml into AndroidManifest.xml
```

### watchOS
```bash
perry widget.ts --target watchos-widget --app-bundle-id com.example.app -o widget_out
xcrun --sdk watchos swiftc -target arm64-apple-watchos9.0 \
  widget_out/*.swift -framework WidgetKit -framework SwiftUI \
  -o widget_out/WidgetExtension
```

### Wear OS
```bash
perry widget.ts --target wearos-tile --app-bundle-id com.example.app -o widget_out
# Copy .kt files to Wear OS module
# Add Horologist + Tiles Material 3 dependencies to build.gradle
# Merge AndroidManifest_snippet.xml
```


---

<!-- source: docs/src/widgets/watchos.md -->

# watchOS Complications

Perry widgets can compile to watchOS WidgetKit complications using `--target watchos-widget`. The same `Widget({...})` source produces both iOS and watchOS widgets — the supported families determine the rendering.

> **Status:** the snippet on this page compile-links cleanly on the host LLVM
> target via [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts), so the
> `Widget({...})` shape is verified against the codegen. The actual
> `--target watchos-widget` / `--target watchos-widget-simulator` cross-compile
> is wired in `crates/perry/src/commands/compile.rs` (emits through the
> WidgetKit Swift emitter). The doc-tests harness now supplies
> `--app-bundle-id` from a `// widget-bundle-id:` banner
> ([#194](https://github.com/PerryTS/perry/issues/194)); an end-to-end watchOS
> build additionally requires the watchOS SDK from Xcode. The shared snippet
> on this page currently requests the host compile/link check only.

## Accessory Families

watchOS complications use accessory families instead of system families:

| Family | Size | Best For |
|--------|------|----------|
| `accessoryCircular` | ~76x76pt | Single icon, number, or Gauge |
| `accessoryRectangular` | ~160x76pt | 2-3 lines of text |
| `accessoryInline` | Single line | Short text only |

## Gauge Component

The `Gauge` component is designed for watchOS circular complications:

```typescript
Widget({
    kind: "QuickStats",
    displayName: "Quick Stats",
    supportedFamilies: ["accessoryCircular", "accessoryRectangular"],

    render(entry: { progress: number; label: string }, family) {
        if (family === "accessoryCircular") {
            return Gauge(entry.progress, 1.0)
        }
        return VStack([
            Text(entry.label),
            Gauge(entry.progress, 1.0),
        ])
    },
})
```

### Gauge Styles

- **`circular`** — Ring gauge, maps to `.gaugeStyle(.accessoryCircularCapacity)` in SwiftUI
- **`linear`** / **`linearCapacity`** — Horizontal bar, maps to `.gaugeStyle(.linearCapacity)`

## Refresh Budgets

watchOS has stricter refresh budgets than iOS:
- Recommended: refresh every 60 minutes (`reloadPolicy: { after: { minutes: 60 } }`); requests below 15 minutes are clamped at compile time
- Maximum: system may throttle more aggressively than iOS
- Background refresh uses `BackgroundTask` framework

## Compilation

```bash
# For Apple Watch device
perry widget.ts --target watchos-widget --app-bundle-id com.example.app -o widget_out

# For Apple Watch Simulator
perry widget.ts --target watchos-widget-simulator --app-bundle-id com.example.app -o widget_out
```

Build:
```bash
xcrun --sdk watchos swiftc -target arm64-apple-watchos9.0 \
  widget_out/*.swift \
  -framework WidgetKit -framework SwiftUI \
  -o widget_out/WidgetExtension
```

## Configuration

- watchOS 10+ supports AppIntent for widget configuration (same as iOS 17+)
- Older watchOS versions automatically get `StaticConfiguration` fallback
- `config` params work identically to iOS

## Memory Considerations

watchOS widget extensions have tighter memory limits (~15-20MB) compared to iOS (~30MB). The provider-only compilation approach is critical — only the data-fetching code runs natively, keeping memory usage minimal.


---

<!-- source: docs/src/widgets/wearos.md -->

# Wear OS Tiles

Perry widgets can compile to Wear OS Tiles using `--target wearos-tile`. Tiles are glanceable surfaces in the Wear OS tile carousel and watch face complications.

For full **Wear OS apps** (not glanceable Tiles), see [Wear OS](https://docs.perryts.com/platforms/wearos.html).

> **Status:** the snippet on this page compile-links cleanly on the host LLVM
> target via [`docs/examples/widgets/snippets.ts`](https://github.com/PerryTS/perry/blob/main/docs/examples/widgets/snippets.ts), so the
> `Widget({...})` shape is verified against the codegen.
> `--target wearos-tile` itself is wired through `crates/perry-codegen-wear-tiles`
> and the doc-tests harness can supply `--app-bundle-id` from its
> `// widget-bundle-id:` banner ([#194](https://github.com/PerryTS/perry/issues/194)).
> An end-to-end target build still needs an Android NDK and the Wear OS Gradle
> dependencies. The shared snippet on this page requests the host
> compile/link check only.

## Concepts

- **Tiles** are full-screen cards users swipe through on their watch
- **Complications** are small data displays on the watch face
- Perry compiles `Widget({...})` to a `SuspendingTileService` with layout builders

## Supported Components

| Widget API | Wear OS Mapping |
|-----------|----------------|
| `Text` | `LayoutElementBuilders.Text` |
| `VStack` | `LayoutElementBuilders.Column` |
| `HStack` | `LayoutElementBuilders.Row` |
| `Spacer` | `LayoutElementBuilders.Spacer` |
| `Divider` | Spacer with 1dp height |
| `Gauge(circular)` | `LayoutElementBuilders.Arc` + `ArcLine` |
| `Gauge(linear)` | Text fallback |
| `Image` | Resource-based (provide drawable) |

## Example

```typescript
Widget({
    kind: "StepsTile",
    displayName: "Steps",
    description: "Daily step count",
    supportedFamilies: ["accessoryCircular"],

    provider: async () => {
        return {
            entries: [{ steps: 7500, goal: 10000 }],
            reloadPolicy: { after: { minutes: 60 } },
        }
    },

    render(entry: { steps: number; goal: number }) {
        return VStack([
            Gauge(entry.steps / entry.goal, 1.0),
            Text(`${entry.steps}`),
        ])
    },
})
```

## Compilation

```bash
perry widget.ts --target wearos-tile --app-bundle-id com.example.app -o tile_out
```

Output:
- `{Name}TileService.kt` — `SuspendingTileService` with tile layout
- `{Name}TileBridge.kt` — JNI bridge for native provider (if provider exists)
- `AndroidManifest_snippet.xml` — Service declaration

## Gradle Integration

Add to your Wear OS module's `build.gradle`:

```groovy
dependencies {
    implementation "com.google.android.horologist:horologist-tiles:0.6.5"
    implementation "androidx.wear.tiles:tiles-material:1.4.0"
    implementation "androidx.wear.tiles:tiles:1.4.0"
}
```

Merge the manifest snippet into your `AndroidManifest.xml`:

```xml
<service
    android:name=".StepsTileService"
    android:exported="true"
    android:permission="com.google.android.wearable.permission.BIND_TILE_PROVIDER">
    <intent-filter>
        <action android:name="androidx.wear.tiles.action.BIND_TILE_PROVIDER" />
    </intent-filter>
</service>
```

## Native Provider

Same as Android phone widgets — Wear OS is Android:
- Target triple: `aarch64-linux-android`
- `libwidget_provider.so` loaded via `System.loadLibrary`
- JNI bridge pattern identical to phone Glance widgets
- `sharedStorage()` uses `SharedPreferences`

## Refresh

Wear Tiles use `freshnessIntervalMillis` on the `Tile` builder. Set via a literal `reloadPolicy: { after: { minutes: N } }` in the provider return value — the interval is read at compile time. Default: 60 minutes. Minimum: 15 minutes (shorter requests are clamped with a compile-time warning). See [Reload Policies](https://docs.perryts.com/widgets/data-fetching.html#reload-policies).
