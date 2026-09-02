<!-- Perry docs bundle: platforms-mobile.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/platforms/android.md -->

# Android

Perry compiles TypeScript apps for Android using JNI (Java Native Interface).

## Requirements

- Android NDK
- Android SDK
- Rust Android targets:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi
  ```

## Building

```bash
perry app.ts -o app --target android
```

## UI Toolkit

Perry maps UI widgets to Android views via JNI:

| Perry Widget | Android Class |
|-------------|--------------|
| Text | TextView |
| Button | Button |
| TextField | EditText |
| SecureField | EditText (ES_PASSWORD) |
| Toggle | Switch |
| Slider | SeekBar |
| Picker | Spinner + ArrayAdapter |
| Image | ImageView |
| VStack | LinearLayout (vertical) |
| HStack | LinearLayout (horizontal) |
| ZStack | FrameLayout |
| ScrollView | ScrollView |
| Canvas | Canvas + Bitmap |
| NavigationStack | FrameLayout |

## Android-Specific APIs

- **Dark mode**: `Configuration.uiMode` detection
- **Preferences**: SharedPreferences
- **Keychain**: Android Keystore
- **Notifications**: NotificationManager
- **Open URL**: `Intent.ACTION_VIEW`
- **Alerts**: `PerryBridge.showAlert`
- **Sheets**: Dialog (modal)

## Splash Screen

Perry's Android template includes a splash theme (`Theme.Perry.Splash`) that displays a `windowBackground` drawable during cold start. Configure it via `perry.splash` in `package.json`:

```json
{
  "perry": {
    "splash": {
      "image": "logo/icon-256.png",
      "background": "#FFF5EE"
    }
  }
}
```

The image is centered via a `layer-list` drawable with a solid background color. The activity switches to the normal theme in `onCreate` before inflating the layout, so the splash disappears as soon as the app is ready.

For full control, provide custom drawable and theme XML files:

```json
{
  "perry": {
    "splash": {
      "android": {
        "layout": "splash/splash_background.xml",
        "theme": "splash/themes.xml"
      }
    }
  }
}
```

See [Project Configuration](https://docs.perryts.com/getting-started/project-config.html#splash) for the full config reference.

## Differences from Desktop

- **Touch-only**: No hover events, no right-click context menus
- **Single window**: Multi-window maps to Dialog views
- **Toolbar**: Horizontal LinearLayout
- **Font**: Typeface-based font family support

## Next Steps

- [Wear OS](https://docs.perryts.com/platforms/wearos.html) — full watch apps on the same Android backend
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system


---

<!-- source: docs/src/platforms/wearos.md -->

# Wear OS

Perry can compile TypeScript apps for Wear OS watches and the Wear OS emulator.

Wear OS **is Android on a watch**, so Perry reuses the exact same backend as the
[Android](https://docs.perryts.com/platforms/android.html) target: your `perry/ui` tree lowers through `perry-ui-android`
(JNI → `TextView` / `LinearLayout` / `Button` / …), and the compiled
`aarch64-linux-android` `.so` is identical to a phone build. `perry run wearos`
then packages it with a **watch form-factor overlay** — the
`android.hardware.type.watch` feature, the standalone meta-data, and the
`androidx.wear` support library — and installs it over `adb` like any other APK.

> This page is about **full Wear OS apps**. For glanceable Wear OS **Tiles**
> (the swipe-left surfaces, built from `Widget({...})` declarations), see
> [Wear OS Tiles](https://docs.perryts.com/widgets/wearos.html).

## Requirements

Wear OS uses the same toolchain as the [Android](https://docs.perryts.com/platforms/android.html) target (the
`.so` is cross-compiled and the APK is built with Gradle), plus a Wear OS system
image. You need all of:

| Tool | Why | Notes |
|---|---|---|
| **JDK 17** | Runs Gradle / the Android Gradle Plugin | The template uses **AGP 8.8.2**, which targets **JDK 17**. Newer JDKs (21/26) can fail the Gradle build — point `JAVA_HOME` at a 17 if your default is newer. |
| **Gradle 8.x** | `perry run wearos` bootstraps a Gradle wrapper from the system `gradle` | AGP 8.8.2 requires **Gradle 8.10.2+** and is **not** compatible with Gradle 9.x. |
| **Android SDK** | `adb`, `aapt`, signing, the `android-35` platform | `platform-tools`, `build-tools;35.0.0`, `platforms;android-35`. Set `ANDROID_HOME`. |
| **Android NDK (r27+)** | Cross-compiles the runtime/`.so` for `aarch64-linux-android` | Set `ANDROID_NDK_HOME`. r27+ is fine — Perry points `cc-rs` at the NDK `llvm-ar`. |
| **Rust Android target** | The `.so` is `aarch64-linux-android` | `rustup target add aarch64-linux-android`. Wear is **arm64-only** — NaN-boxing needs 64-bit pointers. |
| **Wear OS system image + emulator** | A watch to install onto | Use an **`arm64-v8a`** image (Perry packages an `arm64-v8a` `libperry_app.so`). |

### One-time setup (macOS example)

```bash
# 1. JDK 17 + Gradle 8.x (Homebrew's `gradle` may be 9.x — pin 8.x if so)
brew install --cask temurin@17
brew install gradle@8        # or any Gradle 8.10.2+

# 2. Point the env at the SDK / NDK / JDK 17 (add to your shell profile)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/<installed-version>"   # e.g. 28.2.13676358
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# 3. SDK packages + a Wear OS arm64 image
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" \
           "platforms;android-35" "build-tools;35.0.0" \
           "ndk;28.2.13676358" \
           "system-images;android-34;android-wear;arm64-v8a"

# 4. The Rust cross target
rustup target add aarch64-linux-android

# 5. Create + boot a Wear OS emulator (round watch)
avdmanager create avd -n perry_wear \
  -k "system-images;android-34;android-wear;arm64-v8a" -d wearos_large_round
emulator -avd perry_wear
```

On Apple-silicon Macs the `arm64-v8a` image runs natively; on Intel hosts it runs
under the emulator's arm translation. The first `perry run wearos` build also
downloads the AGP and `androidx.wear` dependencies from Google's Maven repo, so
the initial build needs network access.

## Building

```bash
perry compile app.ts -o app --target wearos
```

This cross-compiles to `aarch64-linux-android` and emits `libperry_app.so` — the
same artifact as `--target android`. Packaging into a watch APK happens at run
time (below).

## Running with `perry run`

```bash
perry run wearos          # Auto-detect a connected watch / booted Wear emulator
```

`perry run wearos`:

1. Cross-compiles the `.so` (identical to the Android path).
2. Copies the Android Gradle template and applies the Wear overlay:
   - adds `<uses-feature android:name="android.hardware.type.watch" android:required="true" />`
   - adds `<meta-data android:name="com.google.android.wearable.standalone" android:value="true" />`
   - adds `implementation("androidx.wear:wear:1.3.0")`
   - raises `minSdk` to 30 (Wear OS 3, the Google Play floor for watch APKs)
3. Runs `./gradlew assembleDebug`, debug-signs, then `adb install` + launches and
   streams `logcat`.

`wear` and `wear-os` are accepted as aliases for `wearos`.

## UI Toolkit

Identical to [Android](https://docs.perryts.com/platforms/android.html) — the same `perry/ui` widgets map to the same
Android `View` classes (`Text` → `TextView`, `VStack` → vertical `LinearLayout`,
`Button` → `Button`, `ScrollView` → `ScrollView`, and so on). No Wear-specific
widget API is required: an Android UI tree renders directly on a watch.

The `androidx.wear` dependency in the overlay brings in `BoxInsetLayout` and
swipe-to-dismiss so round screens and the back gesture behave like a native Wear
app.

## App Lifecycle

A Wear OS app uses the same `App({...})` entry point as every other Perry UI
target:

```typescript
import { App, Text, VStack, Button, State } from "perry/ui"

const count = State(0)

App({
    title: "My Watch App",
    width: 200,
    height: 200,
    body: VStack(8, [
        Text("Hello, Wear OS!"),
        Text(`Taps: ${count.value}`),
        Button("Tap me", () => count.set(count.value + 1)),
    ]),
})
```

Under the hood this is the Android lifecycle: `PerryActivity` loads
`libperry_app.so`, calls into your compiled `main()` over JNI, and the
`perry/ui` tree is realized as Android `View`s on the watch.

## State Management

Reactive state works exactly as on Android and the other platforms:

```typescript
import { App, Text, VStack, Button, State } from "perry/ui"

const count = State(0)

App({
    title: "Counter",
    width: 400,
    height: 300,
    body: VStack(16, [
        Text(`Count: ${count.value}`),
        Button("Increment", () => count.set(count.value + 1)),
    ]),
})
```

## Platform Detection

Because the runtime target triple is `aarch64-linux-android`, a Wear OS app
reports the **Android** platform number — `__platform__ === 2`:

```typescript
declare const __platform__: number

// Platform constants:
// 0 = macOS
// 1 = iOS
// 2 = Android
// 3 = Windows
// 4 = Linux
// 5 = Web (browser, --target web / --target wasm)
// 6 = tvOS
// 7 = watchOS
// 8 = visionOS

if (__platform__ === 0) {
    console.log("Running on macOS")
} else if (__platform__ === 1) {
    console.log("Running on iOS")
} else if (__platform__ === 3) {
    console.log("Running on Windows")
}
```

There is intentionally no separate Wear OS platform constant: at runtime a Wear
app *is* an Android app. Branch on screen size at runtime if you need
watch-specific layout.

## Configuration

Wear OS reuses the `[android]` section of `perry.toml` (bundle id, etc.):

```toml
[android]
bundle_id = "com.example.mywatch"
```

## Limitations

Wear OS inherits Android's widget set but the watch form factor imposes the usual
constraints:

- **Small round screens** — design for ~1.2–1.4" displays; prefer `ScrollView`
  and short labels. Use the `androidx.wear` `BoxInsetLayout` insets for round
  bezels.
- **Touch-only** — no hover or right-click.
- **Single window** — modal flows map to `Dialog` views, same as Android.
- **Battery / memory** — keep apps lightweight; Wear devices have far less RAM
  than phones.
- **Publishing** — Wear apps ship through Google Play as Android APK/AABs (the
  `perry publish` flow treats Wear like Android).

## Next Steps

- [Android](https://docs.perryts.com/platforms/android.html) — the shared backend, UI mapping, and APK details
- [Wear OS Tiles](https://docs.perryts.com/widgets/wearos.html) — glanceable Tile surfaces
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — all platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — the `perry/ui` system


---

<!-- source: docs/src/platforms/harmonyos.md -->

# HarmonyOS NEXT

Perry compiles TypeScript apps for HarmonyOS NEXT (Huawei's mobile OS) by emitting **declarative ArkUI** alongside a logic-only `.so` library. The same TypeScript source that targets macOS, iOS, Android, Linux, and Windows also runs natively on HarmonyOS — no platform-specific adapters needed in user code.

## Architecture

HarmonyOS NEXT runs apps via the ArkTS runtime, which owns the UI tree. Perry can't lower `perry/ui` calls to the imperative AppKit/UIKit/etc shape used on every other platform — it has to play by ArkTS's declarative rules. So the harmonyos target is structured differently:

```
TypeScript (.ts)
   ↓
HIR (perry-hir)
   ↓
perry-codegen-arkts (harvest pass)
   ├── walks App({body: ...}) call
   ├── extracts widget tree → emits pages/Index.ets (real ArkUI source)
   ├── captures closure args → registers slot ids
   ├── strips the App call from the HIR
   └── injects perry_arkts_register_callback() per closure
   ↓
perry-codegen (LLVM)
   ↓
libentry.so (no UI calls — just logic + NAPI bridge)
```

The user splices three artifacts into a DevEco Studio project — `libentry.so`, `pages/Index.ets`, `cpp/types/libentry/Index.d.ts` — and DevEco signs + runs as usual. Tap interactions, text input, etc. fire NAPI calls into the `.so`, which dispatch the registered Perry closure bodies.

## What's supported

**Widgets** (introduced in v0.5.401, expanded in v0.5.418, v0.5.429):

| Widget | ArkUI emission |
|---|---|
| `Text(content)` / `Text(content, "id")` | `Text(...).fontSize(20)` (reactive when id is given) |
| `VStack(children)` / `VStack(spacing, children)` | `Column({ space })` |
| `HStack(children)` / `HStack(spacing, children)` | `Row({ space })` |
| `Button(label, onPress)` | `Button(...).onClick(...)` |
| `TextField(placeholder, onChange)` | `TextInput(...).onChange(...)` |
| `Toggle(label, onChange)` | `Toggle({type: ToggleType.Switch}).onChange(...)` |
| `Slider(min, max, onChange)` | `Slider({...}).onChange(...)` |
| `Spacer()` | `Blank()` |
| `Divider()` | `Divider()` |
| `Image(src)` / `ImageFile(path)` | `Image(...)` |
| `ScrollView(children)` | `Scroll() { Column() { ... } }` |
| `LazyVStack(children)` | `Column({...})` (eager — see v10 follow-up) |
| `Picker(options, onChange)` | `TextPicker({...}).onChange(...)` |
| `ProgressView(value, total)` | `Progress({type: ProgressType.Linear})` |
| `Section(title, children)` | `Column({ space: 4 }) { Text(title) ... }` |

**Event handling** (v0.5.417 + v0.5.421):
- `Button.onPress` → `invokeCallback(idx)` via NAPI
- `Toggle.onChange((isOn: boolean) => ...)` → `invokeCallback1(idx, isOn)`
- `TextField.onChange((value: string) => ...)` → `invokeCallback1(idx, value)`
- `Slider.onChange((value: number) => ...)` → `invokeCallback1(idx, value)`
- `Picker.onChange((idx: number) => ...)` → `invokeCallback1(idx, index)`

**Reactivity** (v0.5.419 + v0.5.421):
- `Text("0", "counter")` registers a reactive slot bound to a generated `@State text_counter: string` field.
- `setText("counter", "5")` from inside any closure updates the Text on-screen.

**Toast banners** (v0.5.419):
- `showToast("Saved!")` from inside any closure shows an ArkUI `promptAction.showToast({ message })` banner.

**Inline styling** (v0.5.429):
- `Text("hi", { fontSize: 16, color: "red" })` maps to `.fontSize(16).fontColor('red')`.
- Supported props: `backgroundColor`, `color`, `fontSize`, `fontWeight`, `fontFamily`, `borderRadius`, `padding` (number or per-side object), `opacity`, `hidden`, `borderColor` + `borderWidth` (combined as `.border({...})`).
- PerryColor objects (`{r,g,b,a}`) auto-convert to `rgba(...)` strings.

**Dynamic lists** (v0.5.429):
- `VStack(items.map(item => Text(item)))` lowers to ArkUI `ForEach(items, (__item) => { Text(__item) }, (__item) => __item)`.
- Single-arg map closures only; complex array sources require Phase 2 v6 state binding.

## Setup

1. **Install DevEco Studio** + the OpenHarmony SDK from Huawei. Verified working with DevEco Studio 6.0.2 + OpenHarmony 5.0+.

2. **Run the setup wizard once** (introduced in v0.5.380):

   ```bash
   perry setup harmonyos
   ```

   The wizard auto-discovers your DevEco-generated debug certificates from `~/.ohos/config/`, prompts for the keystore password, and persists the configuration to `~/.perry/config.toml`. Subsequent `perry compile --target harmonyos` invocations sign HAPs automatically.

3. **Optional**: install `hdc` (HarmonyOS Device Connector) for emulator interaction. It ships inside DevEco at `Contents/sdk/default/openharmony/toolchains/hdc`.

## Compile + run workflow

Write a TypeScript program with `App({body: ...})`:

```typescript,no-test
// hi.ts
import { App, VStack, Text, Button, showToast } from "perry/ui";

let count = 0;

App({
  title: "Perry on HarmonyOS",
  body: VStack([
    Text("Count: 0", "counter"),
    Button("+", () => {
      count++;
      setText("counter", `Count: ${count}`);
    }),
    Button("Notify", () => {
      showToast(`Counter is ${count}`);
    }),
  ]),
});
```

Compile for HarmonyOS:

```bash
perry compile hi.ts --target harmonyos -o /tmp/libentry.so
```

This produces three artifacts in `/tmp/`:

- `libentry.so` — the compiled `.so` (8-9 MB typically)
- `ets/pages/Index.ets` — the auto-emitted ArkUI page
- `cpp/types/libentry/Index.d.ts` — the NAPI declaration file

**Splice** into a DevEco Studio project:

```bash
cp /tmp/libentry.so       ~/DevEcoStudioProjects/MyApp/entry/libs/arm64-v8a/libentry.so
cp /tmp/ets/pages/Index.ets   ~/DevEcoStudioProjects/MyApp/entry/src/main/ets/pages/Index.ets
cp /tmp/cpp/types/libentry/Index.d.ts   ~/DevEcoStudioProjects/MyApp/entry/src/main/cpp/types/libentry/Index.d.ts
```

Click ▶ Run in DevEco — DevEco's hvigor signs + bundles the HAP and installs onto the emulator (or attached device). The app launches, taps fire your TS closures, and the screen updates reactively.

## Architecture deep dive

### The harvest model

`perry-codegen-arkts::emit_index_ets` walks `module.init` looking for the first `App({body: <expr>})` call from `perry/ui`. It extracts the `body` field, recursively emits ArkUI source for each widget in the tree, and **destructively replaces the App call with `Stmt::Expr(Expr::Number(0.0))`** so the LLVM backend never sees `perry_ui_*` FFI calls (which would be unresolved on the OHOS target — there's no `perry-ui-harmonyos` crate by design).

The emitted Index.ets is a real ArkUI `@Entry @Component struct Index { build() { ... } }` page with `@State` declarations for any reactive Text widgets, `import promptAction from '@ohos.promptAction'` for toast routing, and per-Button onClick handlers that invoke NAPI callbacks then drain queued toasts and text updates.

### Closures across the NAPI boundary

Each Button/Toggle/etc onClick closure registers via `perry_arkts_register_callback(idx, closure_handle)` during `main()` startup. The `closure_handle` is a NaN-boxed pointer to a real Perry `*ClosureHeader`. A GC root scanner registered in `gc_init` keeps registered closures alive across collections.

When ArkUI fires an onClick, the auto-emitted `.onClick(() => perryEntry.invokeCallback(0))` calls back into the `.so` via NAPI. The `invoke_callback` NAPI handler in `crates/perry-runtime/src/ohos_napi.rs` reads the int32 idx, looks up the slot, and dispatches via `js_closure_call0`. Multi-arg variants (Toggle/TextField/Slider) use `invokeCallback1(idx, value)` with `napi_typeof` dispatch to NaN-box the value (boolean / string / number) before calling `js_closure_call1`.

### The drain queue pattern

`showToast` and `setText` calls inside a closure body push entries onto thread-local queues:
- `PENDING_TOASTS: Mutex<VecDeque<String>>`
- `PENDING_TEXT_UPDATES: Mutex<VecDeque<(String, String)>>`

After every onClick/onChange invocation, the auto-emitted handler in Index.ets drains both queues:

```ets
.onClick(() => {
    perryEntry.invokeCallback(0);
    let __t = perryEntry.drainToast();
    while (__t !== undefined) {
        promptAction.showToast({ message: __t });
        __t = perryEntry.drainToast();
    }
    let __u = perryEntry.drainTextUpdate();
    while (__u !== undefined) {
        this.applyTextUpdate(__u.id, __u.value);
        __u = perryEntry.drainTextUpdate();
    }
})
```

`applyTextUpdate(id, value)` is a switch over registered Text ids that assigns to the matching `@State text_<id>: string` field — ArkUI's reactivity then rerenders the Text widget.

### Why NAPI?

HarmonyOS NEXT uses the OpenHarmony NAPI binding (modeled on Node's NAPI) to load native `.so` libraries from ArkTS. Perry's `crates/perry-runtime/src/ohos_napi.rs` registers a module via `napi_module_register` in an `.init_array` constructor (Rust's equivalent of `__attribute__((constructor))`), with the modname auto-derived from the `.so` filename via `dladdr`. The exported NAPI surface is just `run` / `invokeCallback` / `invokeCallback1` / `drainToast` / `drainTextUpdate` — every other Perry runtime call happens within the `.so` itself.

## Known limitations

- **LazyVStack is currently rendered eagerly** as a plain `Column`. Real lazy rendering for big lists needs ArkUI's `LazyForEach` + a custom `IDataSource` impl — tracked as Phase 2 v10.
- **State binding is one-way** — `setText("id", value)` from a closure updates the Text on-screen, but a generic `state<T>` reactive container (`const count = state(0); count.set(...)`) is Phase 2 v6 follow-up work.
- **Multi-page navigation** (NavStack / Router across multiple `.ets` files) is Phase 2 v11.
- **AppGallery production signing** uses a different cert chain than DevEco's debug certs and isn't yet plumbed into `perry compile`. The current splice workflow handles debug-emulator deploy.
- **Real device validation** is pending — every milestone has been verified on the Pura 90 Pro Max emulator. AppGallery upload + real-hardware install will follow.

## Validated on emulator

End-to-end on Pura 90 Pro Max with a 5-widget interactive page (counter + reset, TextField echoing input live as `You typed: <text>`, Toggle flipping `Notifications: on/off` with toast feedback, Slider tracking `Volume: N` continuously, reactive Texts everywhere). Each interaction routes:

```
ArkUI event → invokeCallback{,1} → typeof-dispatch in NAPI → NaN-box marshal
            → js_closure_call{0,1} → user TS body runs with the typed arg
            → closure calls setText / showToast → drain queues → ArkUI rerenders
```

This is the first time Perry-compiled TypeScript state mutation has reactively driven a HarmonyOS NEXT screen.

## Version history

- **v0.5.401** — Phase 2 v1.5: full widget set rendering (Text/VStack/HStack/Button/TextField/Toggle/Slider/Spacer/Divider).
- **v0.5.417** — Phase 2 v2 + v3 + v2.5: Button onClick callback bridge, showToast, reactive Text via setText, multi-arg Toggle/TextField/Slider value forwarding.
- **v0.5.418** — Phase 2 v4: Image / ScrollView / LazyVStack / Picker / ProgressView / Section.
- **v0.5.420 / .421** — Cross-platform showToast + setText on iOS / tvOS / visionOS / Android.
- **v0.5.422 / .423** — Cross-platform showToast + setText on Windows / GTK4.
- **v0.5.429** — Phase 2 v5: inline `style: { ... }` + ForEach via array.map.

For the full per-version detail see [CHANGELOG.md](https://github.com/PerryTS/perry/blob/main/CHANGELOG.md).
