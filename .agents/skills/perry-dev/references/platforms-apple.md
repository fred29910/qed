<!-- Perry docs bundle: platforms-apple.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/platforms/overview.md -->

# Platform Overview

Perry compiles TypeScript to native executables for 10 platform families from the same source code.

## Supported Platforms

| Platform | Target Flag | UI Toolkit | Status |
|----------|-------------|------------|--------|
| macOS | *(default)* | AppKit | Full support (127/127 FFI functions) |
| iOS | `--target ios` / `--target ios-simulator` | UIKit | Full support (127/127) |
| visionOS | `--target visionos` / `--target visionos-simulator` | UIKit (2D windows) | Core support (2D only) |
| tvOS | `--target tvos` / `--target tvos-simulator` | UIKit | Full support (focus engine + game controllers) |
| watchOS | `--target watchos` / `--target watchos-simulator` | SwiftUI (data-driven) | Core support (15 widgets) |
| Android | `--target android` | JNI/Android SDK | Full support (112/112) |
| Wear OS | `--target wearos` | JNI/Android SDK (shared) | Android backend on a watch |
| Windows | `--target windows` | Win32 | Full support (112/112) |
| Linux | `--target linux` | GTK4 | Full support (112/112) |
| Web / WebAssembly | `--target web` *(alias `--target wasm`)* | DOM/CSS via WASM bridge | Full support (168 widgets) |

## Cross-Compilation

```bash
# Default: compile for current platform
perry app.ts -o app

# Compile for a specific target
perry app.ts -o app --target ios-simulator
perry app.ts -o app --target visionos-simulator
perry app.ts -o app --target tvos-simulator
perry app.ts -o app --target watchos-simulator
perry app.ts -o app --target web   # alias: --target wasm
perry app.ts -o app --target windows
perry app.ts -o app --target linux
perry app.ts -o app --target android
perry app.ts -o app --target wearos   # Wear OS — Android on a watch
```

## Platform Detection

Use the `__platform__` compile-time constant to branch by platform:

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

`__platform__` is resolved at compile time. The compiler constant-folds comparisons and eliminates dead branches, so platform-specific code has zero runtime cost.

## Platform Feature Matrix

| Feature | macOS | iOS | visionOS | tvOS | watchOS | Android | Windows | Linux | Web (WASM) |
|---------|-------|-----|----------|------|---------|---------|---------|-------|------------|
| CLI programs | Yes | — | — | — | — | — | Yes | Yes | — |
| Native UI (DOM on web) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Game engines | Yes | Yes | — | Yes | — | Yes | Yes | Yes | Via FFI |
| File system | Yes | Sandboxed | Sandboxed | Sandboxed | — | Sandboxed | Yes | Yes | File System Access API |
| Networking | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | `fetch` / `WebSocket` |
| System APIs | Yes | Partial | Partial | Partial | Minimal | Partial | Yes | Yes | Partial |
| Widgets (WidgetKit) | — | Yes | — | — | Yes | — | — | — | — |
| Threading | Native | Native | Native | Native | Native | Native | Native | Native | Web Workers |

## Next Steps

- [macOS](https://docs.perryts.com/platforms/macos.html)
- [iOS](https://docs.perryts.com/platforms/ios.html)
- [visionOS](https://docs.perryts.com/platforms/visionos.html)
- [tvOS](https://docs.perryts.com/platforms/tvos.html)
- [watchOS](https://docs.perryts.com/platforms/watchos.html)
- [Android](https://docs.perryts.com/platforms/android.html)
- [Wear OS](https://docs.perryts.com/platforms/wearos.html)
- [Windows](https://docs.perryts.com/platforms/windows.html)
- [Linux (GTK4)](https://docs.perryts.com/platforms/linux.html)
- [Web](https://docs.perryts.com/platforms/web.html)
- [WebAssembly](https://docs.perryts.com/platforms/wasm.html)


---

<!-- source: docs/src/platforms/macos.md -->

# macOS

macOS is Perry's primary development platform. It uses AppKit for native UI.

## Requirements

- macOS 13+ (Ventura or later)
- Xcode Command Line Tools: `xcode-select --install`

## Building

```bash
# macOS is the default target
perry app.ts -o app
./app
```

No additional flags needed — macOS is the default compilation target.

## UI Toolkit

Perry maps UI widgets to AppKit controls:

| Perry Widget | AppKit Class |
|-------------|-------------|
| Text | NSTextField (label mode) |
| Button | NSButton |
| TextField | NSTextField |
| SecureField | NSSecureTextField |
| Toggle | NSSwitch |
| Slider | NSSlider |
| Picker | NSPopUpButton |
| Image | NSImageView |
| VStack/HStack | NSStackView |
| ScrollView | NSScrollView |
| Table | NSTableView |
| Canvas | NSView + Core Graphics |

## Code Signing

For distribution, apps need to be signed. Perry supports automatic signing:

```bash
perry publish
```

This auto-detects your signing identity from the macOS Keychain, exports it to a temporary `.p12` file, and signs the binary.

For manual signing:

```bash
codesign --sign "Developer ID Application: Your Name" ./app
```

## App Store Distribution

```bash
perry app.ts -o MyApp
# Sign with App Store certificate
codesign --sign "3rd Party Mac Developer Application: Your Name" MyApp
# Package
productbuild --sign "3rd Party Mac Developer Installer: Your Name" --component MyApp /Applications MyApp.pkg
```

## macOS-Specific Features

- **Menu bar**: Full NSMenu support with keyboard shortcuts
- **Toolbar**: NSToolbar integration
- **Dock icon**: Automatic for GUI apps
- **Dark mode**: `isDarkMode()` detects system appearance
- **Keychain**: Secure storage via Security.framework
- **Notifications**: Local notifications via UNUserNotificationCenter
- **File dialogs**: NSOpenPanel/NSSavePanel

## System APIs

```typescript
import { openURL, isDarkMode, preferencesSet, preferencesGet } from "perry/system"

openURL("https://example.com")          // Opens in default browser
const dark = isDarkMode()               // Check appearance
preferencesSet("key", "value")          // NSUserDefaults
const val = preferencesGet("key")       // NSUserDefaults
```

## Next Steps

- [iOS](https://docs.perryts.com/platforms/ios.html) — Cross-compile for iPhone/iPad
- [UI Overview](https://docs.perryts.com/ui/overview.html) — Full UI documentation
- [System APIs](https://docs.perryts.com/system/overview.html) — System integration


---

<!-- source: docs/src/platforms/ios.md -->

# iOS

Perry can cross-compile TypeScript apps for iOS devices and the iOS Simulator.

## Requirements

- macOS host (cross-compilation from Linux/Windows is not supported)
- Xcode (full install, not just Command Line Tools) for iOS SDK and Simulator
- Rust iOS targets:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim
  ```

## Building for Simulator

```bash
perry app.ts -o app --target ios-simulator
```

This uses LLVM cross-compilation with the iOS Simulator SDK. The binary can be run in the Xcode Simulator.

## Building for Device

```bash
perry app.ts -o app --target ios
```

This produces an ARM64 binary for physical iOS devices. You'll need to code sign and package it in an `.app` bundle for deployment.

## Running with `perry run`

The easiest way to build and run on iOS is `perry run`:

```bash
perry run ios              # Auto-detect device/simulator
perry run ios --console    # Stream live stdout/stderr
perry run ios --remote     # Use Perry Hub build server
```

Perry auto-discovers available simulators (via `simctl`) and physical devices (via `devicectl`). When multiple targets are found, an interactive prompt lets you choose.

For physical devices, Perry handles code signing automatically — it reads your signing identity and team ID from `~/.perry/config.toml` (set up via `perry setup ios`), embeds the provisioning profile, and signs the `.app` before installing.

If you don't have the iOS cross-compilation toolchain installed locally, `perry run ios` automatically falls back to Perry Hub's remote build server.

## UI Toolkit

Perry maps UI widgets to UIKit controls:

| Perry Widget | UIKit Class |
|-------------|------------|
| Text | UILabel |
| Button | UIButton (TouchUpInside) |
| TextField | UITextField |
| SecureField | UITextField (secureTextEntry) |
| Toggle | UISwitch |
| Slider | UISlider (Float32, cast at boundary) |
| Picker | UIPickerView |
| Image | UIImageView |
| VStack/HStack | UIStackView |
| ScrollView | UIScrollView |

## App Lifecycle

iOS apps use `UIApplicationMain` with a deferred creation pattern:

```typescript
import { App, Text, VStack } from "perry/ui"

App({
    title: "My iOS App",
    width: 400,
    height: 800,
    body: VStack(16, [
        Text("Hello, iPhone!"),
    ]),
})
```

The `App()` call triggers `UIApplicationMain`, and your render function is called via `PerryAppDelegate` once the app is ready. Perry-generated apps use `UIWindowScene`, `PerrySceneDelegate`, and an `UIApplicationSceneManifest`, which also satisfies the scene-based lifecycle required for apps built with the iOS 27 SDK.

## Adaptive layouts

Use `perry/ios` to inspect the active scene rather than branching on a device model or physical screen size:

```typescript,no-test
import {
  getLayoutEnvironment,
  onLayoutChange,
  offLayoutChange,
} from "perry/ios";

const initial = getLayoutEnvironment();
console.log(initial.width, initial.horizontalSizeClass, initial.windowMode);

const subscription = onLayoutChange((layout) => {
  if (layout.horizontalSizeClass === "compact") {
    // Present a compact navigation treatment.
  }
  if (layout.isFourByThree || layout.windowMode === "sideBySide") {
    // Reflow content for 4:3 or iPad side-by-side multitasking.
  }

  // These insets describe display cutouts, rounded corners, and any future
  // interrupted-display geometry exposed to the scene by UIKit.
  console.log(layout.safeAreaTop, layout.safeAreaRight);
});

// When the observer is no longer needed:
offLayoutChange(subscription);
```

Snapshots contain the window dimensions and aspect ratio, display scale, horizontal and vertical size classes, orientation, window mode, multitasking and 4:3 flags, and all four safe-area insets. On iOS 27 they also contain the effective scene's system-space frame, interactive-resize state, and orientation-lock state. The callback fires once when a scene is available and then after meaningful bounds, trait, safe-area, or effective-geometry changes.

UIKit does not expose a separate public hardware-model or hinge-state property. Safe areas, effective scene geometry, and trait collections are the supported adaptive signals, and they continue to work when one device moves among full-screen, side-by-side, and freeform window modes. Perry's `SplitView` and `FrameSplit` also cap their preferred sidebar at 45% of the current scene width so the detail pane remains usable in narrow layouts.

## Foundation Models

The simple, unstructured Foundation Models flow is available through `perry/ios`:

```typescript,no-test
import {
  foundationModelAvailability,
  createLanguageModelSession,
  respond,
  destroyLanguageModelSession,
} from "perry/ios";

if (foundationModelAvailability() === "available") {
  const session = createLanguageModelSession(
    "Answer in one short, factual sentence.",
  );
  try {
    const answer = await respond(session, "Why is the sky blue?");
    console.log(answer);
  } finally {
    destroyLanguageModelSession(session);
  }
}
```

The bridge uses Apple's default `LanguageModelSession`, preserves conversational context while a session handle is reused, and rejects the returned promise when generation fails. Check availability first: unsupported OS versions and unavailable Apple Intelligence configurations are reported without loading the framework. This surface intentionally returns plain strings; structured `@Generable` responses are outside the current API.

Building a source file that imports `perry/ios` requires an Xcode SDK containing `FoundationModels.framework` (Xcode 26 or later). The framework is weak-linked, so the normal iOS 17 deployment target remains valid.

## Now Playing on iOS 27

`perry/media.setNowPlaying(...)` is the public Perry API for Lock Screen, Control Center, Dynamic Island, CarPlay, artwork, playback progress, and play/pause/stop/seek commands. When an Xcode 27 SDK containing `NowPlaying.framework` is installed, Perry automatically compiles an observable `MediaSession` bridge and publishes each player through the new framework. Builds made with older SDKs, and devices before iOS 27, retain the existing `MPNowPlayingInfoCenter` / `MPRemoteCommandCenter` compatibility path. Perry never activates both paths for one local session.

The iOS 27 SDK is beta software until Apple's GM release. This support does not change Perry's SDK build markers or version; distribution metadata should only be updated once the GM toolchain can submit to App Store Connect.

## iOS Widgets (WidgetKit)

Perry can compile TypeScript widget declarations to native SwiftUI WidgetKit extensions:

```bash
perry widget.ts --target ios-widget
```

See [Widgets (WidgetKit)](https://docs.perryts.com/widgets/overview.html) for details.

## Splash Screen

Perry auto-generates a native `LaunchScreen.storyboard` from the `perry.splash` config in `package.json`. The splash screen appears instantly during cold start.

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

The image is centered at 128x128pt with `scaleAspectFit`. You can provide a custom storyboard for full control:

```json
{
  "perry": {
    "splash": {
      "ios": { "storyboard": "splash/LaunchScreen.storyboard" }
    }
  }
}
```

See [Project Configuration](https://docs.perryts.com/getting-started/project-config.html#splash) for the full config reference.

## Resource Bundling

Perry automatically bundles `logo/` and `assets/` directories from your project root into the `.app` bundle. These resources are available at runtime via standard file APIs relative to the app bundle path.

## Keyboard Avoidance

Perry apps automatically handle keyboard avoidance on iOS. When the keyboard appears, the root view adjusts its bottom constraint with an animated layout transition, and focused TextFields are auto-scrolled into view above the keyboard.

## Differences from macOS

- **No menu bar**: iOS doesn't support menu bars. Use toolbar or navigation patterns.
- **Touch events**: `onHover` is not available. Use `onClick` (mapped to touch).
- **Slider precision**: iOS UISlider uses Float32 internally (automatically converted).
- **File dialogs**: Limited to UIDocumentPicker.
- **Keyboard shortcuts**: Not applicable on iOS.

## Next Steps

- [Widgets (WidgetKit)](https://docs.perryts.com/widgets/overview.html) — iOS home screen widgets
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system


---

<!-- source: docs/src/platforms/visionos.md -->

# visionOS

Perry can compile TypeScript apps for Apple Vision Pro devices and the visionOS Simulator.

This first pass targets **2D windowed apps only**. Perry uses the same UIKit-style `perry/ui` model as iOS, packaged for visionOS app bundles and scene lifecycle.

## Prerequisites

- macOS with Xcode installed
- Rust visionOS targets:

```bash
rustup target add aarch64-apple-visionos aarch64-apple-visionos-sim
```

## Compile

```bash
perry compile app.ts -o app --target visionos-simulator
perry compile app.ts -o app --target visionos
```

This produces a `.app` bundle with visionOS-specific `Info.plist` metadata and a `UIWindowScene` configuration.

## Run

```bash
perry run visionos
perry run visionos --simulator <UDID>
perry run visionos --device <UDID>
```

Perry auto-detects booted Apple Vision Pro simulators via `simctl`. Physical device installs use `devicectl`, like other modern Apple platforms.

## Configuration

Configure visionOS-specific settings in `perry.toml`:

```toml
[visionos]
bundle_id = "com.example.myvisionapp"
deployment_target = "1.0"
entry = "src/main_visionos.ts"
encryption_exempt = true
```

Custom `Info.plist` keys can be merged through `[visionos.info_plist]`.

## Platform Detection

Use `__platform__ === 8` to detect visionOS at compile time:

```typescript
function reportVisionos(): void {
    if (__platform__ === 8) {
        console.log("Running on visionOS")
    }
}
```

## Current Scope

- Supported: 2D windowed apps, simulator/device app bundles, `perry run`, `perry setup`, `perry publish`
- Not supported yet: immersive spaces, volumes, RealityKit scene generation, Geisterhand

## Related

- [iOS](https://docs.perryts.com/platforms/ios.html) — shared UIKit foundation
- [Platform Overview](https://docs.perryts.com/platforms/overview.html)


---

<!-- source: docs/src/platforms/tvos.md -->

# tvOS

Perry can compile TypeScript apps for Apple TV devices and the tvOS Simulator.

tvOS uses UIKit (the same framework as iOS), so Perry's tvOS support shares the same UIKit-based widget system. The primary difference is input: Apple TV apps are controlled via the Siri Remote and game controllers rather than touch, and all apps run full-screen.

## Requirements

- macOS host (cross-compilation from Linux/Windows is not supported)
- Xcode (full install) for tvOS SDK and Simulator
- Rust tvOS targets:
  ```bash
  rustup target add aarch64-apple-tvos aarch64-apple-tvos-sim
  ```

## Building for Simulator

```bash
perry compile app.ts -o app --target tvos-simulator
```

This produces an ARM64 binary linked with `clang` against the tvOS Simulator SDK, wrapped in a `.app` bundle.

## Building for Device

```bash
perry compile app.ts -o app --target tvos
```

This produces an ARM64 binary for physical Apple TV hardware.

## Running with `perry run`

```bash
perry run tvos                        # Auto-detect booted Apple TV simulator
perry run tvos --simulator <UDID>     # Target a specific simulator
```

Perry auto-discovers booted Apple TV simulators. To install and launch manually:

```bash
xcrun simctl install booted app.app
xcrun simctl launch booted com.perry.app
```

## UI Toolkit

Perry maps UI widgets to UIKit controls on tvOS, identical to iOS:

| Perry Widget | UIKit Class | Notes |
|-------------|------------|-------|
| Text | UILabel | |
| Button | UIButton | Focus-based navigation |
| TextField | UITextField | On-screen keyboard via Siri Remote |
| Toggle | UISwitch | |
| Slider | UISlider | |
| Picker | UIPickerView | |
| Image | UIImageView | |
| VStack/HStack | UIStackView | |
| ScrollView | UIScrollView | Focus-based scrolling |

### Focus Engine

tvOS uses a **focus-based navigation model** instead of direct touch. The Siri Remote's touchpad and directional buttons move focus between focusable views. Perry widgets that support interaction (buttons, text fields, toggles, etc.) are automatically focusable.

## Game Engine Support

tvOS is particularly well-suited for game engines. When using a native library like [Bloom](https://bloomengine.dev), the game engine handles its own windowing, rendering, and input.

> **Status:** illustrative only — Bloom is an external native library (see [bloomengine.dev](https://bloomengine.dev)). The snippet below is left as `,no-test` because it depends on Bloom's `.a`/`.so` being available at link time; the doc-tests harness compiles every other snippet on this page.

```text
import { initWindow, windowShouldClose, beginDrawing, endDrawing,
         clearBackground, isGamepadButtonDown, Colors } from "bloom";

initWindow(1920, 1080, "My Apple TV Game");

while (!windowShouldClose()) {
  beginDrawing();
  clearBackground(Colors.BLACK);

  if (isGamepadButtonDown(0)) {
    // A button (Siri Remote select) pressed
  }

  endDrawing();
}
```

### Input on tvOS

The Siri Remote acts as a game controller:

| Input | Mapping |
|-------|---------|
| Touchpad swipe | Gamepad axes 0/1 (left stick) |
| Touchpad click (Select) | Gamepad button 0 (A) + mouse button 0 |
| Menu button | Gamepad button 1 (B) |
| Play/Pause button | Gamepad button 9 (Start) |
| Arrow presses (up/down/left/right) | Gamepad D-pad buttons (12-15) |

Extended game controllers (MFi, PlayStation, Xbox) are fully supported with all axes, buttons, triggers, and D-pad mapped through the standard gamepad API.

## App Lifecycle

tvOS apps use `UIApplicationMain` with the same lifecycle as iOS. When using `perry/ui`:

```typescript
import { App, Text, VStack } from "perry/ui"

App({
    title: "My TV App",
    width: 1920,
    height: 1080,
    body: VStack(16, [
        Text("Hello, Apple TV!"),
    ]),
})
```

When using a game engine with `--features ios-game-loop`, the runtime starts `UIApplicationMain` on the main thread and runs your game code on a dedicated game thread.

## Configuration

Configure tvOS settings in `perry.toml`:

```toml
[tvos]
bundle_id = "com.example.mytvapp"
deployment_target = "17.0"
```

## Platform Detection

Use `__platform__ === 6` to detect tvOS at compile time:

```typescript
function reportTvos(): void {
    if (__platform__ === 6) {
        console.log("Running on tvOS")
    }
}
```

## App Bundle

Perry generates a `.app` bundle with an `Info.plist` containing:

| Key | Value | Notes |
|-----|-------|-------|
| `UIDeviceFamily` | `[3]` | Apple TV |
| `MinimumOSVersion` | `17.0` | tvOS 17+ |
| `UIRequiresFullScreen` | `true` | All tvOS apps are full-screen |
| `UILaunchStoryboardName` | `LaunchScreen` | Required by tvOS |

## Limitations

tvOS has inherent platform constraints compared to other Perry targets:

- **No camera**: Apple TV has no camera hardware
- **No clipboard**: UIPasteboard is not available on tvOS
- **No file dialogs**: No document picker
- **No QR code**: No camera for scanning
- **No multi-window**: Single full-screen window only
- **No direct touch**: Input is via Siri Remote focus engine and game controllers
- **Resolution**: Design for 1920x1080 (1080p) or 3840x2160 (4K) displays

## Differences from iOS

| Aspect | tvOS | iOS |
|--------|------|-----|
| **Input** | Siri Remote + game controllers (focus engine) | Direct touch |
| **Display** | Full-screen only (1080p/4K) | Variable screen sizes |
| **Device family** | `[3]` (Apple TV) | `[1, 2]` (iPhone/iPad) |
| **Camera** | Not available | Available |
| **Clipboard** | Not available | Available |
| **Deployment target** | 17.0 | 17.0 |
| **UI framework** | UIKit (same as iOS) | UIKit |

## Next Steps

- [iOS](https://docs.perryts.com/platforms/ios.html) — iOS platform reference (shared UIKit base)
- [watchOS](https://docs.perryts.com/platforms/watchos.html) — watchOS platform reference
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms


---

<!-- source: docs/src/platforms/watchos.md -->

# watchOS

Perry can compile TypeScript apps for Apple Watch devices and the watchOS Simulator.

Since watchOS does not support UIKit views, Perry uses a **data-driven SwiftUI renderer**: your TypeScript code builds a UI tree via the standard `perry/ui` API, and a fixed SwiftUI runtime (shipped with Perry) queries the tree and renders it reactively. No code generation or transpilation is involved — the binary is fully native.

## Requirements

- macOS host (cross-compilation from Linux/Windows is not supported)
- Xcode (full install) for watchOS SDK and Simulator
- Rust watchOS targets. The simulator target is tier 2 and can be added with
  `rustup`; the **device** targets are tier 3 and ship no prebuilt `std`, so
  their runtime libraries must be built from source with a nightly toolchain
  and `-Z build-std` (see [Building for Device](#building-for-device)):
  ```bash
  rustup target add aarch64-apple-watchos-sim       # simulator (tier 2)
  rustup component add rust-src --toolchain nightly  # for device build-std
  ```

## Watch architectures

watchOS spans two CPU architectures, and which one you target decides which
watches your app runs on:

| Architecture | Watches | watchOS | Perry target |
|---|---|---|---|
| **arm64** (64-bit) | Series 9/10/11, Ultra 2/3, SE 3 (S9 chip+) | 26+ | `--target watchos` (default) |
| **arm64_32** (ILP32, 32-bit pointers) | Series 4–8, SE 1/2 | 9–11 | `--target watchos` + `PERRY_WATCHOS_ARM64_32=1` |
| **arm64** (simulator) | — | — | `--target watchos-simulator` |

Apple moved S9-and-later watches to full arm64 in watchOS 26. Older watches stay
arm64_32 forever. Perry's NaN-boxed value representation is sound on both — a
32-bit pointer fits in the 48-bit NaN payload and clean tagged values round-trip
— but **heap-struct layouts are pointer-width-dependent**: any code that bakes in
a 64-bit field offset (the closure `type_tag`, the `ObjectHeader` field-region
base, …) reads the wrong bytes and segfaults on arm64_32 unless it derives the
offset from the target pointer width. See
`perry_runtime::closure::CLOSURE_TYPE_TAG_OFFSET` and `perry_codegen::target_layout`.
The simulator is always arm64 (Apple Silicon
host) and **cannot run an arm64_32 binary** — device-arch builds can only be
tested on real hardware (or shipped via TestFlight).

## Building for Simulator

```bash
perry compile app.ts -o app --target watchos-simulator
```

This produces an arm64 binary linked with `swiftc` against the watchOS Simulator
SDK, wrapped in a `.app` bundle.

## Building for Device

Device runtime libraries are tier-3 Rust targets with no prebuilt `std`, so build
`perry-runtime` (and `perry-ui-watchos`, if you use the SwiftUI tree renderer)
from source once, then point `PERRY_RUNTIME_DIR` at them:

```bash
# arm64 (Series 9+ / watchOS 26+) — the default device target
cargo +nightly build -Z build-std=std,panic_abort --release \
  -p perry-runtime -p perry-ui-watchos --target aarch64-apple-watchos

PERRY_RUNTIME_DIR=target/aarch64-apple-watchos/release \
  perry compile app.ts -o app --target watchos
```

```bash
# arm64_32 (Series 4-8 / SE) — opt in with PERRY_WATCHOS_ARM64_32
cargo +nightly build -Z build-std=std,panic_abort --release \
  -p perry-runtime -p perry-ui-watchos --target arm64_32-apple-watchos

PERRY_WATCHOS_ARM64_32=1 \
PERRY_RUNTIME_DIR=target/arm64_32-apple-watchos/release \
  perry compile app.ts -o app --target watchos
```

To support every watch from a single App Store upload, build **both** and `lipo`
them into a fat binary — see [Publishing to the App Store](https://docs.perryts.com/platforms/watchos-app-store.html).

### Build environment variables

| Variable | Effect |
|---|---|
| `PERRY_WATCHOS_ARM64_32=1` | Switch the `watchos` device target from arm64 to arm64_32 (codegen object arch, runtime/native-lib/Swift/link triples, and the bundle's `MinimumOSVersion` floor all follow). |
| `PERRY_WATCHOS_MIN` | Override `MinimumOSVersion` for arm64_32 device builds (default `11.0`). The engine/SwiftUI you link may impose its own floor — e.g. `onChange(of:initial:)` needs watchOS 10. |
| `PERRY_ENTRY_SYMBOL` | Name the C entry symbol emitted by codegen instead of renaming `_main` afterwards. Needed on arm64_32 because `rust-objcopy --redefine-sym` segfaults on arm64_32 Mach-O (`MachOWriter::writeSections`); see below. |

> **arm64_32 entry symbol.** With `--features watchos-swift-app`/`watchos-game-loop`,
> Perry normally emits `_main` and renames it to `__perry_user_main` with
> `rust-objcopy`. That tool crashes on arm64_32 objects, so for arm64_32 set
> `PERRY_ENTRY_SYMBOL=_perry_user_main` — codegen then emits the final symbol
> directly (the leading underscore yields Mach-O `__perry_user_main`, which the
> Swift `@main` shell references via `@_silgen_name`) and Perry skips the objcopy
> pass. A fat `lipo` build needs the same symbol in both slices.

> **Note for runtime contributors.** arm64_32 has 32-bit `usize`. Pointer-range
> guards and size caps in `perry-runtime` must compare in `u64` (e.g.
> `(addr as u64) < 0x8000_0000_0000`) rather than writing bare `usize` literals
> ≥ 2³² — those are a hard "literal out of range" error on arm64_32 (and wasm32).
> Use `usize::try_from(...).unwrap_or(usize::MAX)` to saturate length caps like
> `1usize << 53`.
>
> **Hardcoded struct-field offsets are the other arm64_32 trap.** A heap header
> whose layout includes a pointer shifts on arm64_32 — e.g. `ClosureHeader`'s
> `type_tag` sits at +12 after an 8-byte `func_ptr` on 64-bit but at +8 after a
> 4-byte one on ILP32, while `ObjectHeader`'s field region starts at +16 on
> both layouts (#8047 removes the derived `keys_array` word and ILP32 retains
> explicit alignment padding). Those numbers were +32/+24 before #8113 and
> +24/+16 before #8047; that is exactly why they must be
> derived, not written down. NEVER hardcode
> such an offset: in `perry-runtime` use `std::mem::offset_of!` / `size_of`
> (these track the target); in `perry-codegen` (which runs on the host but emits
> for the target) derive it from the target triple via `crate::target_layout`.
> Hardcoded `12` (closure magic) and a hardcoded `ObjectHeader` size were the original
> arm64_32 startup-crash root causes — a real getter failed its `CLOSURE_MAGIC`
> probe, was judged non-callable, and the resulting `TypeError` value-coercion
> dereferenced the closure as an object.

## Running with `perry run`

```bash
perry run watchos                # Auto-detect booted watch simulator
perry run watchos --simulator <UDID>  # Target a specific simulator
```

Perry auto-discovers booted Apple Watch simulators. To install and launch manually:

```bash
xcrun simctl install booted app_watchos/app.app
xcrun simctl launch booted com.perry.app
```

## UI Toolkit

Perry maps UI widgets to SwiftUI views via a data-driven bridge:

| Perry Widget | SwiftUI View | Notes |
|-------------|-------------|-------|
| Text | Text | Font size, weight, color, wrapping |
| Button | Button | Tap action via native closure callback |
| VStack | VStack | With spacing |
| HStack | HStack | With spacing |
| ZStack | ZStack | Layered views |
| Spacer | Spacer | |
| Divider | Divider | |
| Toggle | Toggle | Two-way state binding |
| Slider | Slider | Min/max/value, state binding |
| Image | Image(systemName:) | SF Symbols |
| ScrollView | ScrollView | |
| ProgressView | ProgressView | Linear |
| Picker | Picker | Selection list |
| Form | List | Maps to List on watchOS |
| NavigationStack | NavigationStack | Push navigation |

### Modifiers

All widgets support these styling modifiers:

- `foregroundColor` / `backgroundColor`
- `font` (size, weight, family)
- `frame` (width, height)
- `padding` (uniform or per-edge)
- `cornerRadius`
- `opacity`
- `hidden` / `disabled`

## App Lifecycle

watchOS apps use SwiftUI's `@main App` pattern. Perry's PerryWatchApp.swift runtime handles the app lifecycle automatically:

```typescript
import { App, Text, VStack, Button } from "perry/ui"

App({
    title: "My Watch App",
    width: 200,
    height: 200,
    body: VStack(8, [
        Text("Hello, Apple Watch!"),
        Button("Tap me", () => {
            console.log("Button tapped!")
        }),
    ]),
})
```

Under the hood:
1. `perry_main_init()` runs your compiled TypeScript, which builds the UI tree in memory
2. The SwiftUI `@main` struct observes the tree version and renders it
3. User interactions (button taps, toggle changes) call back into native closures

## State Management

Reactive state works the same as other platforms:

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

When `state.set()` is called, the tree version increments and SwiftUI re-renders the affected views automatically.

## How It Works

Unlike iOS (UIKit) and macOS (AppKit), where Perry calls native view APIs directly via FFI, watchOS uses a **data-driven architecture**:

```
TypeScript code
  |
  v
perry_ui_*() FFI calls  →  Node tree stored in memory (Rust)
                                      |
                                      v
                        PerryWatchApp.swift queries tree via FFI
                                      |
                                      v
                        SwiftUI renders views reactively
                                      |
                                      v
                        User interaction → FFI callback → native closure
```

The `PerryWatchApp.swift` file is a fixed runtime (~280 lines) that ships with Perry. It never changes per-app — it's the watchOS equivalent of `libperry_ui_ios.a`.

## App rendering modes

The data-driven SwiftUI renderer above is the default. Two feature flags switch
to app shells that own their own entry point — used by games and apps that draw
their own frames instead of building a `perry/ui` tree:

| Feature | Shell | Use case |
|---|---|---|
| *(default)* | Perry's `PerryWatchApp.swift` observes the UI tree | Standard `perry/ui` apps |
| `--features watchos-swift-app` | A native library ships its own `@main struct App: App` | Games / engines with a custom SwiftUI `Canvas` (e.g. Bloom Engine) |
| `--features watchos-game-loop` | `perry-runtime` provides C `main()` + `WKApplicationMain` | Metal/wgpu game loops |

In both non-default modes the TypeScript entry runs on a background thread the
shell spawns, and the shell references it as `__perry_user_main` (see
`PERRY_ENTRY_SYMBOL` above).

## Configuration

Configure watchOS settings in `perry.toml`:

```toml
[watchos]
bundle_id = "com.example.mywatch"
deployment_target = "10.0"

[watchos.info_plist]
NSLocationWhenInUseUsageDescription = "Used for location features"
```

Set up signing credentials with:

```bash
perry setup watchos
```

This shares App Store Connect credentials with iOS/macOS (same team, API key, issuer).

## Platform Detection

Use `__platform__ === 7` to detect watchOS at compile time:

```typescript
function reportWatchos(): void {
    if (__platform__ === 7) {
        console.log("Running on watchOS")
    }
}
```

## watchOS Widgets (WidgetKit)

Perry also supports watchOS WidgetKit complications (separate from full apps):

```bash
perry compile widget.ts --target watchos-widget --app-bundle-id com.example.app
```

See [watchOS Complications](https://docs.perryts.com/widgets/watchos.html) for widget-specific documentation.

## Limitations

watchOS apps have inherent platform constraints compared to other Perry targets:

- **No Canvas**: CoreGraphics drawing is not available
- **No Camera**: watchOS does not support camera APIs
- **No TextField**: Text input is extremely limited on Apple Watch
- **No File Dialogs**: No document picker
- **No Menu Bar / Toolbar**: Not applicable on watch
- **No Multi-Window**: Single window only
- **No QR Code**: Screen too small for practical QR display
- **Memory**: watchOS devices have ~50-75MB available RAM — keep apps lightweight
- **Screen size**: Design for 40-49mm watch faces

## Differences from iOS

- **SwiftUI vs UIKit**: watchOS uses SwiftUI rendering; iOS uses UIKit directly
- **No splash screen**: watchOS apps don't use launch storyboards
- **Standalone**: watchOS apps are standalone (no iPhone companion required, `WKWatchOnly = true`)
- **Device family**: `UIDeviceFamily = [4]` (watch) vs `[1, 2]` (iPhone/iPad)

## Next Steps

- [Publishing watchOS apps to the App Store](https://docs.perryts.com/platforms/watchos-app-store.html) — fat binaries, the iOS-stub wrapper, and signing for a watch-only app
- [watchOS Complications](https://docs.perryts.com/widgets/watchos.html) — WidgetKit complications
- [iOS](https://docs.perryts.com/platforms/ios.html) — iOS platform reference
- [Platform Overview](https://docs.perryts.com/platforms/overview.html) — All platforms
- [UI Overview](https://docs.perryts.com/ui/overview.html) — UI system


---

<!-- source: docs/src/platforms/watchos-app-store.md -->

# Publishing watchOS Apps to the App Store

Shipping a **watch-only** app (no iPhone app) through App Store Connect has two
non-obvious requirements that aren't enforced until you upload. This page covers
both, plus the architecture/deployment-target rules that decide which watches
your build reaches.

## Architecture rules

App Store validation enforces two rules for the watch app binary:

- **arm64 is required for every watchOS app**, always.
- **arm64_32 is *additionally* required when `MinimumOSVersion < 27.0`.**

So there are exactly two valid shapes:

| Build | `MinimumOSVersion` | Reaches |
|---|---|---|
| **Fat: arm64 + arm64_32** | < 27 (e.g. 10.0) | Every watch from Series 4 to the latest |
| arm64-only | ≥ 27.0 | Series 9+ only (watchOS 27+) |

An arm64_32-only upload is **rejected** ("missing arm64 architecture"). For the
widest reach, ship the fat binary with a low deployment target.

> **arm64-only builds can stall in processing.** A build whose
> `MinimumOSVersion` is a watchOS version that is not yet generally available
> (e.g. 27.0 during its beta period) may sit in "Processing" indefinitely —
> Apple's pipeline appears unable to finish it until that OS ships. A fat build
> targeting a shipped watchOS (e.g. 10.0) processes normally in minutes. Prefer
> the fat/low-minOS shape unless you specifically need arm64-only.

## Building the fat binary

Build each slice (see [Building for Device](https://docs.perryts.com/platforms/watchos.html#building-for-device)),
re-stamp the arm64 slice's load command down to the shared deployment target
(it only ever runs on watchOS 26+ hardware, so the stamp is cosmetic), then
`lipo` them together:

```bash
# 1. arm64_32 slice at the shared deployment target (e.g. 10.0)
PERRY_WATCHOS_ARM64_32=1 PERRY_WATCHOS_MIN=10.0 \
PERRY_ENTRY_SYMBOL=_perry_user_main \
PERRY_RUNTIME_DIR=.../arm64_32-apple-watchos/release \
  perry compile app.ts -o AppA32 --target watchos --features watchos-swift-app

# 2. arm64 slice (default device target)
PERRY_RUNTIME_DIR=.../aarch64-apple-watchos/release \
  perry compile app.ts -o AppA64 --target watchos --features watchos-swift-app

# 3. align minos + fuse
xcrun vtool -set-build-version watchos 10.0 26.5 -replace \
  -output AppA64.min10 AppA64.app/AppA64
lipo -create -output App.fat AppA32.app/AppA32 AppA64.min10
lipo -info App.fat   # => arm64_32 arm64
```

Place `App.fat` as the watch app's executable and set the bundle's
`MinimumOSVersion` to the same value (10.0 here).

## The iOS stub wrapper

App Store Connect has no standalone "watchOS" platform — watch software ships
**inside an iOS app record**. Uploading a bare watch `.app` fails in Transporter
with `Unknown platform alias: watchOS`. The watch app must be nested in a minimal
iOS "stub" container:

```
Payload/
  <Container>.app/              # iOS stub (com.example.app)
    <stub binary>               # trivial UIKit app, never launched
    Info.plist
    Watch/
      <WatchApp>.app/           # the real watch app (com.example.app.watchkitapp)
        <fat binary>
        Info.plist
        embedded.mobileprovision
      embedded.mobileprovision
```

Xcode generates this stub automatically for "Watch-Only App" projects; with
Perry you assemble it by hand. The stub is a do-nothing Swift `UIApplicationDelegate`
compiled for `arm64-apple-ios`.

### Required Info.plist keys

**Watch app** (`Watch/<WatchApp>.app/Info.plist`):

| Key | Value |
|---|---|
| `WKApplication` | `true` |
| `WKWatchOnly` | `true` |
| `CFBundleIdentifier` | `com.example.app.watchkitapp` |
| `MinimumOSVersion` | matches the fat binary (e.g. `10.0`) |
| `UIDeviceFamily` | `[4]` |

Do **not** set `WKCompanionAppBundleIdentifier` when `WKWatchOnly` is true.

**Stub container** (`<Container>.app/Info.plist`):

| Key | Value |
|---|---|
| `ITSWatchOnlyContainer` | `true` |
| `LSApplicationLaunchProhibited` | `true` |
| `CFBundleIdentifier` | `com.example.app` |
| `UISupportedInterfaceOrientations` | all four orientations (iPad multitasking rule with `UIDeviceFamily [1,2]`) |

## Signing

The watch app and the stub each need their own distribution provisioning
profile and matching bundle ID, both signed with an **Apple Distribution**
identity. `WKWatchOnly` is rejected on an app record that already distributes an
iOS build, so a watch-only app needs its **own new app record** in App Store
Connect.

```bash
codesign --force --sign "Apple Distribution: <Team>" \
  --entitlements watch.entitlements "Container.app/Watch/WatchApp.app"
codesign --force --sign "Apple Distribution: <Team>" \
  --entitlements stub.entitlements  "Container.app"
codesign --verify --deep --strict "Container.app"
```

## Uploading

`altool` cannot upload watch apps ("cannot determine platform"). Use Transporter:

```bash
mkdir Payload && cp -R "Container.app" Payload/ && zip -qr App.ipa Payload
iTMSTransporter -m upload -assetFile App.ipa \
  -apiKey <KEY_ID> -apiIssuer <ISSUER_ID>
```

Transporter runs the architecture/plist validation above before accepting the
upload, so its errors are the fastest way to confirm the bundle is well-formed.

## Development install (no App Store)

To run a device build on a watch you own without TestFlight, sign it with a
**development** profile that lists the watch's UDID and `get-task-allow=true`,
then install via `devicectl`:

```bash
xcrun devicectl device install app --device <watch-udid> WatchApp.app
```

This requires **Developer Mode** enabled on the watch *and* its developer disk
image mounted — open **Xcode → Window → Devices and Simulators** and select the
watch once to mount it (`devicectl` reports `ddiServicesAvailable: false` until
then). Note this needs a watch matching your build's architecture: an arm64_32
build for a pre-S9 watch, an arm64 build for S9+.
