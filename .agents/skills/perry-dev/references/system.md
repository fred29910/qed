<!-- Perry docs bundle: system.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/system/overview.md -->

# System APIs Overview

The `perry/system` module provides access to platform-native system features:
preferences, secure storage, notifications, dark-mode detection, audio
capture, and app introspection. Every snippet below is excerpted from
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) — CI
links the file on every PR.

```typescript
// import {
//     openURL, isDarkMode,
//     preferencesGet, preferencesSet,
//     keychainSave, keychainGet, keychainDelete,
//     notificationSend,
//     audioStart, audioStop, audioGetLevel, audioGetPeak, audioGetWaveform,
// } from "perry/system"
```

## Available APIs

| Function | Description | Platforms |
|----------|------------|-----------|
| `openURL(url)` | Open URL in default browser/app | All |
| `isDarkMode()` | Check system dark mode | All |
| `getDeviceIdiom()` | `"phone"`, `"pad"`, `"mac"`, `"tv"`, `"watch"`, `"vision"`, `"desktop"` | All |
| `getDeviceModel()` | Device model identifier (e.g. `"iPhone13,4"`) | All |
| `preferencesSet(key, value)` | Store a preference (string or number) | All |
| `preferencesGet(key)` | Read a preference (returns `string | number | undefined`) | All |
| `keychainSave(key, value)` | Secure storage write | All |
| `keychainGet(key)` | Secure storage read | All |
| `keychainDelete(key)` | Secure storage remove | All |
| `notificationSend(title, body)` | Local notification | All |
| `notificationCancel(id)` | Cancel a scheduled notification | Apple, Android |
| `notificationOnTap(cb)` | Handle banner taps | Apple, Android |
| `notificationRegisterRemote(cb)` / `notificationOnReceive(cb)` | Push (APNs / FCM) | iOS, macOS; Android needs app-side Firebase setup — see [Notifications](https://docs.perryts.com/system/notifications.html) |
| `audioStart()` / `audioStop()` | Microphone capture | All |
| `audioGetLevel()` / `audioGetPeak()` | RMS / peak amplitude (`0..1`) | All |
| `audioGetWaveform(n)` | Recent waveform samples for visualization | All |
| `audioSetOutputFilename(p)` / `audioStartRecording()` / `audioStopRecording()` | Capture mic to a WAV file | All native |
| `geolocationGetCurrent(ok, err)` | One-shot device position | iOS, Android, macOS |
| `geolocationWatch(cb)` / `geolocationStopWatch(id)` | Subscribe to position updates | iOS, Android, macOS |
| `geolocationRequestPermission(cb)` | Request location permission | iOS, Android, macOS |
| `imagePickerPick(max, multi, cb)` | Native photo-library picker | iOS, Android, macOS |
| `registerTask(id, fn)` / `schedule(id, …)` / `cancel(id)` | Deferred / periodic background work — see [`perry/background`](https://docs.perryts.com/system/background.html) | iOS, Android, tvOS, visionOS, watchOS, macOS |

> **Clipboard** lives in `perry/ui` (not `perry/system`): import `clipboardRead`
> and `clipboardWrite` from there.

## Quick Example

```typescript
if (isDarkMode()) {
    console.log("Dark mode is active")
}
```

```typescript
// Strings and numbers round-trip natively — no manual stringification needed.
preferencesSet("theme", "dark")
preferencesSet("font-size", 14)

const theme = preferencesGet("theme")        // string | number | undefined
const fontSize = preferencesGet("font-size") // → 14 (number)

if (typeof theme === "string") {
    console.log(`saved theme: ${theme}`)
}
if (typeof fontSize === "number") {
    console.log(`saved font-size: ${fontSize}`)
}
```

```typescript
openURL("https://example.com")
```

## Next Steps

- [Preferences](https://docs.perryts.com/system/preferences.html)
- [Keychain](https://docs.perryts.com/system/keychain.html)
- [Notifications](https://docs.perryts.com/system/notifications.html)
- [Audio Capture](https://docs.perryts.com/system/audio.html)
- [Geolocation & Image Picker](https://docs.perryts.com/system/geolocation.html)
- [Background Tasks](https://docs.perryts.com/system/background.html)
- [Other](https://docs.perryts.com/system/other.html)


---

<!-- source: docs/src/system/preferences.md -->

# Preferences

Store and retrieve user preferences using the platform's native storage.
Every snippet below is excerpted from
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) — CI
links it on every PR.

## Usage

`preferencesSet(key, value)` accepts strings **or** numbers and round-trips
them natively (NSUserDefaults / GSettings / Registry preserve the original
type). `preferencesGet(key)` returns `string | number | undefined`:

```typescript
// Strings and numbers round-trip natively — no manual stringification needed.
preferencesSet("theme", "dark")
preferencesSet("font-size", 14)

const theme = preferencesGet("theme")        // string | number | undefined
const fontSize = preferencesGet("font-size") // → 14 (number)

if (typeof theme === "string") {
    console.log(`saved theme: ${theme}`)
}
if (typeof fontSize === "number") {
    console.log(`saved font-size: ${fontSize}`)
}
```

## Platform Storage

| Platform | Backend |
|----------|---------|
| macOS | NSUserDefaults |
| iOS | NSUserDefaults |
| Android | SharedPreferences |
| Windows | Windows Registry |
| Linux | GSettings / file-based |
| Web | localStorage |

Preferences persist across app launches. They are not encrypted — use
[Keychain](https://docs.perryts.com/system/keychain.html) for sensitive data.

## Next Steps

- [Keychain](https://docs.perryts.com/system/keychain.html) — Secure storage
- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs


---

<!-- source: docs/src/system/keychain.md -->

# Keychain

Securely store sensitive data like tokens, passwords, and API keys using the
platform's secure storage. Every snippet below is excerpted from
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) — CI
links it on every PR.

## Usage

```typescript
keychainSave("api_token", "sk-...")
const token = keychainGet("api_token")
keychainDelete("api_token")
console.log(`token length: ${token.length}`)
```

The free-function API is `keychainSave(key, value)`, `keychainGet(key)` (returns
the stored string, or an empty string if the key isn't present), and
`keychainDelete(key)`.

## Platform Storage

| Platform | Backend |
|----------|---------|
| macOS | Security.framework (Keychain) |
| iOS | Security.framework (Keychain) |
| Android | Android Keystore |
| Windows | Windows Credential Manager (CredWrite/CredRead/CredDelete) |
| Linux | libsecret |
| Web | localStorage (not truly secure) |

> **Web**: The web platform uses `localStorage`, which is not encrypted. For
> web apps handling sensitive data, consider server-side storage instead.

## Next Steps

- [Preferences](https://docs.perryts.com/system/preferences.html) — Non-sensitive preferences
- [Notifications](https://docs.perryts.com/system/notifications.html) — Local notifications
- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs


---

<!-- source: docs/src/system/notifications.md -->

# Notifications

Send local notifications using the platform's notification system. Every
snippet below is excerpted from
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) — CI
links it on every PR.

## Sending a notification

```typescript
notificationSend("Build complete", "All targets compiled in 4.2s.")
```

## Reacting to a tap

```typescript
notificationOnTap((id: string, action?: string) => {
    console.log(`tapped notification ${id}; action=${action ?? "(default)"}`)
})
```

`action` is the action-button identifier when the user picks a button, or
`undefined` for the default banner tap.

## Cancelling a scheduled notification

```typescript
notificationCancel("daily-reminder")
```

`notificationCancel(id)` is a no-op if no scheduled notification with that id
exists.

## Push notifications (APNs / Firebase)

```typescript
notificationRegisterRemote((token: string) => {
    console.log(`APNs device token: ${token}`)
})

notificationOnReceive((payload: object) => {
    console.log(`got remote payload: ${JSON.stringify(payload)}`)
})
```

`notificationRegisterRemote(cb)` fires once when the OS returns a device token
— on Apple platforms the token is the canonical uppercase hex string APNs
expects. `notificationOnReceive(cb)` runs whenever a remote payload arrives
while the app is foregrounded; the payload is the APNs `aps` userInfo
dictionary (or equivalent platform shape) converted to a plain object.

Requires the relevant platform capability. On iOS/macOS that's the APNs
entitlement (below). On Android the scaffolded app ships **without**
Firebase — there is no `google-services.json` — so
`notificationRegisterRemote` logs a warning describing the setup it needs
and returns without doing anything. To enable it, add Firebase Messaging to
the generated Android project (the `com.google.gms.google-services` Gradle
plugin, the `com.google.firebase:firebase-messaging` dependency, and your
`google-services.json`), then forward your `FirebaseMessagingService`'s
`onNewToken` / `onMessageReceived` to `PerryBridge.nativeNotificationToken`
/ `nativeNotificationReceive` (and/or
`nativeNotificationBackgroundReceive`) — the native side of those callbacks
is already wired ([#95](https://github.com/PerryTS/perry/issues/95),
[#98](https://github.com/PerryTS/perry/issues/98)).
No-op on platforms without a push pipeline (tvOS, visionOS, watchOS, GTK4,
Windows, Web).

### Enabling APNs on iOS

`registerForRemoteNotifications` only succeeds when the signed `.app` carries
the `aps-environment` entitlement. Opt in from `perry.toml`
([#5074](https://github.com/PerryTS/perry/issues/5074)):

```toml
[ios]
push_notifications = true          # emit the aps-environment entitlement
# push_environment = "production"  # default "development"; set for distribution
```

With this set, `perry compile --target ios` writes `aps-environment` into the
bundle's `app.entitlements` (defaulting to `development`, which matches
dev-signed builds), and `perry setup ios` / `perry run --target ios` enable the
Push Notifications capability on the App ID when minting the development
provisioning profile. For App Store / Ad Hoc distribution set
`push_environment = "production"`.

## Local notifications on Android

Local and scheduled notifications work out of the box on a freshly
scaffolded Android app:

- `notificationSend(title, body)` posts immediately to the `perry_default`
  notification channel (created on demand, API 26+). Like the Apple
  implementations it uses the fixed id `"perry_notification"`, so
  `notificationCancel("perry_notification")` removes it.
- `notificationSchedule(...)` interval/calendar triggers arm an
  `AlarmManager` alarm that fires a broadcast receiver, so the banner is
  delivered even if the process has since exited. Timing is *inexact*
  (exact alarms need the `SCHEDULE_EXACT_ALARM` special permission on
  Android 12+), and repeating intervals under 60 seconds are clamped to 60
  seconds by the OS. Android location triggers are not wired; closed
  [#96](https://github.com/PerryTS/perry/issues/96) implemented interval and
  calendar scheduling and explicitly left Android geofencing out of scope.
- `notificationCancel(id)` cancels the pending alarm *and* removes an
  already-delivered banner with that id from the shade.
- `notificationOnTap(cb)` fires while the app process is alive (the tap
  intent routes through `PerryActivity`). A tap that cold-starts the
  process is logged and skipped — no JS callback can be registered before
  the app has run.
- **Permission**: Android 13+ requires the `POST_NOTIFICATIONS` runtime
  grant. The template declares it and `PerryActivity` requests it (with the
  other dangerous permissions) at first launch; if the user denies it,
  notification calls log a warning to logcat and drop the banner instead of
  crashing.

## Platform Implementation

| Platform | Backend |
|----------|---------|
| macOS | UNUserNotificationCenter |
| iOS | UNUserNotificationCenter |
| Android | NotificationManager + AlarmManager (local/scheduled); FCM push requires app-side Firebase setup |
| Windows | Toast notifications |
| Linux | GNotification |
| Web | Web Notification API |

> **Permissions**: On macOS, iOS, Android 13+, and Web, the user may need to
> grant notification permissions. On first use (app launch on Android), the
> system will prompt automatically.

## Next Steps

- [Keychain](https://docs.perryts.com/system/keychain.html) — Secure storage
- [Other](https://docs.perryts.com/system/other.html) — Additional system APIs
- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs


---

<!-- source: docs/src/system/audio.md -->

# Audio Capture

The `perry/system` module provides real-time audio capture from the device
microphone, with A-weighted dB(A) level metering and waveform sampling —
everything needed to build a sound meter, audio visualizer, or voice-level
indicator. Every snippet below is excerpted from
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) — CI
links it on every PR.

```typescript,no-test
const ok = audioStart() // 1 on success, 0 on failure
if (ok === 1) {
    const level = audioGetLevel()           // 0..1
    const peak = audioGetPeak()             // 0..1
    const waveform = audioGetWaveform(64)   // sample-count
    console.log(`level=${level} peak=${peak} waveform=${waveform}`)
    audioStop()
}
```

## API Reference

### `audioStart()`

Start capturing audio from the device microphone. Returns `1` on success, `0`
on failure (permission denied, no microphone, etc.).

On platforms that require permission (iOS, Android, Web), the system
permission dialog is shown automatically.

### `audioStop()`

Stop audio capture and release the microphone.

### `audioGetLevel()`

Get the current A-weighted sound level (a smoothed value with a 125 ms time
constant). Typical ranges:

- ~30 dB — quiet room
- ~50 dB — normal conversation
- ~70 dB — busy street
- ~90 dB — loud music
- ~110+ dB — dangerously loud

### `audioGetPeak()`

Get the current peak sample amplitude (`0.0`–`1.0`). Useful for simple level
indicators without dB conversion.

### `audioGetWaveform(sampleCount)`

Get recent waveform samples for visualization. Pass the number of samples you
want; the runtime returns the most recent N readings from its internal ring
buffer. Useful for drawing waveform displays or level history charts.

### `audioSetOutputFilename(filename)`

Set the destination path for the next call to `audioStartRecording`. Pass an
absolute path or a path relative to the app's working directory. Must be
called **before** `audioStartRecording`.

### `audioStartRecording()`

Begin writing captured microphone audio to the file set by
`audioSetOutputFilename`. The output is a WAV file (16-bit PCM, mono,
48 kHz on every platform). Calling without a destination set is a no-op.

### `audioStopRecording()`

Finalize the in-progress recording — flushes pending samples, writes the
RIFF/WAVE header sizes, and closes the file. Safe to call when no
recording is in flight.

```typescript,no-test
import {
  audioStart,
  audioStop,
  audioSetOutputFilename,
  audioStartRecording,
  audioStopRecording,
} from "perry/system";

audioStart();
audioSetOutputFilename("/tmp/captured.wav");
audioStartRecording();
// … capture for some duration …
audioStopRecording();
audioStop();
```

`audioStartRecording` does not imply `audioStart` — start the input first,
then start the file writer.

## Platform Implementations

| Platform | Audio Backend | Permissions |
|----------|--------------|-------------|
| macOS | AVAudioEngine | Microphone permission dialog |
| iOS | AVAudioSession + AVAudioEngine | System permission dialog |
| Android | AudioRecord (JNI) | RECORD_AUDIO permission |
| Linux | PulseAudio (libpulse-simple) | None (system-level) |
| Windows | WASAPI (shared mode) | None |
| Web | getUserMedia + AnalyserNode | Browser permission dialog |

All platforms capture at 48 kHz mono and apply the same A-weighting filter
(IEC 61672 standard, 3 cascaded biquad sections).

## Next Steps

- [Camera](https://docs.perryts.com/ui/camera.html) — Live camera preview (iOS)
- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs


---

<!-- source: docs/src/system/audio_module.md -->

# Audio (perry/audio)

The `perry/audio` module is Perry's **low-latency, game-engine-style audio
mixer**. Three concepts:

- **`Sound`** — a loaded asset. `loadSound("click.wav")` returns one
  handle; the PCM data lives in memory until you `unload()`.
- **`PlaybackId`** — one *live voice*. `play(sound)` returns a new
  PlaybackId every time it's called, so the same sound can overlap with
  itself (think: multiple gunshots, multiple footsteps).
- **`Bus`** — a mixer group. Sounds route through a Bus, Buses route
  through their parent (default: master). One `setVolume(musicBus,
  0.3)` scales every voice on it.

Use `perry/audio` for SFX, music loops, voice prompts, and any UI
feedback where you want overlap or sub-20ms latency. For long-form
streaming with a seek bar, lock-screen controls, and Now Playing
metadata, use [`perry/media`](https://docs.perryts.com/system/media.html) instead.

## Quick start

```typescript,no-test
import {
  loadSound, play, stop, setVolume,
  createBus, setMasterVolume,
} from "perry/audio";

// Optional: organise sounds into buses
const sfx   = createBus("sfx");
const music = createBus("music");

// Load assets — decode happens in the background. The handle is
// returned immediately; play() before decode finishes just queues
// the playback.
const click = loadSound("assets/click.wav", sfx);
const bgm   = loadSound("assets/bgm.mp3",   music, /* stream */ true);

// Fire-and-forget — overlap is automatic, each play() returns a new
// PlaybackId you can stop / fade / tune independently.
const a = play(click);
const b = play(click, 0.7, false, 0.95);  // slightly lower pitch
const bgmId = play(bgm, 1.0, true);        // looping

// Mix
setVolume(music, 0.3);
setMasterVolume(0.8);

// Stop
stop(a);          // one voice
stop(click);      // every live voice of this sound
```

## Game-engine patterns

### Pitch variation on repeated SFX

The single biggest "doesn't feel robotic" trick: randomise the rate
(±5%) on every play of high-frequency SFX (footsteps, gunshots, hits).

```typescript,no-test
const rate = 0.95 + Math.random() * 0.1;  // 0.95 – 1.05
play(footstep, 1.0, false, rate);
```

### Crossfade music tracks

```typescript,no-test
const calmId = play(calm, 0.0, true);   // start silent
crossfade(intenseId, calmId, 2000);     // 2s linear crossfade
```

### Pause when backgrounded

```typescript,no-test
// from your app lifecycle hook (perry/system / onAppDidEnterBackground)
suspend();                              // silences everything
// onAppDidBecomeActive:
resumeAll();
```

### Three-bus mix template

```typescript,no-test
const sfx   = createBus("sfx");
const music = createBus("music");
const voice = createBus("voice");

// User-facing sliders bind to these:
setVolume(sfx,   userPreferences.sfxVolume);
setVolume(music, userPreferences.musicVolume);
setVolume(voice, userPreferences.voiceVolume);
```

## Format compatibility

WAV (PCM) and MP3 are **portable across every platform**. The rest depend
on the platform decoder:

| Format     | macOS / iOS / tvOS / visionOS | Linux / Windows / Android | Web |
|------------|:--:|:--:|:--:|
| WAV        | ✓ | ✓ | ✓ |
| MP3        | ✓ | ✓ | ✓ |
| AAC / M4A  | ✓ | ✗ | ✓ |
| OGG Vorbis | ✗ | ✓ | ✓ (most browsers) |
| FLAC       | ✓ (10.13+) | ✓ | partial (no Safari) |
| Opus       | ✓ (iOS 11+) | ✓ | ✓ |

When in doubt, ship **WAV for SFX** (small, instant decode) and **MP3
for music** (good compression, universal).

## Performance notes

- **Preload, decode once.** `loadSound` decodes a file to a single shared
  PCM buffer. Every subsequent `play()` of that sound schedules the same
  buffer — no re-decode, no second allocation. 1MB WAV = 1MB in RAM no
  matter how many times you play it.
- **Voice pool.** Voices are preallocated and recycled. The hot path
  through `play()` is one indexed table read plus a `scheduleBuffer`
  call. No malloc, no string lookup.
- **One shared audio graph.** A single `AVAudioEngine` (Apple) /
  `AudioContext` (Web) drives every sound. Bus volume / mute / solo are
  O(1) on a mixer node, not a walk over voices.
- **Streaming for big files only.** Pass `stream: true` to `loadSound`
  for music or files >2MB — Perry reads chunks from disk as the voice
  consumes them, so a 60-minute track doesn't occupy 60MB of RAM.
- **Target latency.** <10ms on Apple, <30ms on Web. On par with Unity /
  Godot.

## Platform implementation

| Platform | Backend |
|---|---|
| macOS / iOS / tvOS / visionOS | `AVAudioEngine` + `AVAudioPlayerNode` + `AVAudioPCMBuffer` + `AVAudioUnitVarispeed` (per-voice rate). |
| watchOS                       | Same `AVAudioEngine` stack as iOS. Background audio requires the host app to declare the audio background mode entitlement; foreground playback works out of the box. |
| Web (WASM)                    | Web Audio API (`AudioContext` + `AudioBufferSourceNode` + `GainNode`) |
| Linux / Windows / Android     | miniaudio v0.11.22 (`perry-audio-miniaudio` crate). PulseAudio / PipeWire / ALSA on Linux, WASAPI / DirectSound / WinMM on Windows, AAudio (API 26+) / OpenSL ES on Android — chosen at runtime. |

## Web autoplay policy

Browsers don't allow audio playback before a user gesture. The
`AudioContext` is lazily created on the first `loadSound()` / `play()`
call; if that call happens **before** any user interaction, the context
starts in a suspended state and your `play()` is queued. Trigger a
user-interaction-bound `resumeAll()` (or just any other `play()`
inside a click handler) to release it.

## API reference

See [the TypeScript declarations](../../../types/perry/audio/index.d.ts)
for full parameter documentation. Summary:

| Function | Purpose |
|---|---|
| `loadSound(path, bus?, stream?) -> Sound` | Decode (or open for streaming) an audio file. |
| `unload(sound)` | Free the PCM buffer / stream decoder. |
| `play(sound, volume?, loop?, rate?, pan?, fadeInMs?) -> PlaybackId` | Start a new voice. |
| `stop(handle, fadeOutMs?)` | Stop one voice or every voice of a sound. |
| `pause(playback)` / `resume(playback)` | Pause/resume a single voice. |
| `setVolume(handle, volume, fadeMs?)` | Sound default / live voice / bus. |
| `setRate(playback, rate)` / `setPan(playback, pan)` | Per-voice pitch and stereo position. |
| `fadeIn(playback, ms, toVol?)` / `fadeOut(playback, ms)` / `crossfade(a, b, ms)` | Linear ramps. |
| `createBus(name, parent?) -> Bus` / `destroyBus(bus)` / `muteBus(bus, muted)` / `soloBus(bus, soloed)` | Mixer tree. |
| `setMasterVolume(volume, fadeMs?)` | Root-bus gain. |
| `suspend()` / `resumeAll()` | Whole-graph pause for foreground/background transitions. |
| `isPlaying(handle)` / `getDuration(sound)` / `getPosition(playback)` | Introspection. |
| `onEnded(playback, cb)` / `onLoaded(sound, cb)` | Lifecycle callbacks. |

Implemented through closed issue
[#1867](https://github.com/PerryTS/perry/issues/1867).


---

<!-- source: docs/src/system/media.md -->

# Media Playback

The `perry/media` module provides streaming media playback — HTTP/HTTPS
audio URLs (Subsonic, Icecast, plain MP3/AAC, HLS m3u8), `file://` paths,
lock-screen / Now Playing metadata, and remote-command (Siri Remote /
Touch Bar / Control Center) integration.

## Quick start

```typescript,no-test
import {
  createPlayer,
  play,
  pause,
  setVolume,
  onStateChange,
  onTimeUpdate,
  setNowPlaying,
} from "perry/media";

const player = createPlayer("https://example.com/track.mp3");
if (player === 0) {
  console.error("createPlayer failed");
} else {
  setVolume(player, 0.8);
  setNowPlaying(player, "Track Title", "Artist", "Album", "");

  onStateChange(player, (state) => console.log("state:", state));
  onTimeUpdate(player, (cur, dur) => console.log(`${cur}/${dur}s`));

  play(player); // begins (or resumes) once buffered
}
```

## API surface

| Function | Returns | Notes |
| --- | --- | --- |
| `createPlayer(url)` | handle (1+) or `0` on failure | HTTP/HTTPS or `file://` |
| `play(handle)` | void | Resumes if paused |
| `pause(handle)` | void | Position preserved |
| `stop(handle)` | void | Resets position to 0 |
| `seek(handle, seconds)` | void | |
| `setVolume(handle, volume)` | void | 0.0–1.0, clamped |
| `setRate(handle, rate)` | void | 1.0 = normal; Apple supports 0.5–2.0 |
| `getCurrentTime(handle)` | seconds | |
| `getDuration(handle)` | seconds | `0` if live / loading |
| `getState(handle)` | `MediaState` | See states below |
| `isPlaying(handle)` | boolean | |
| `onStateChange(h, cb)` | void | Fires on every transition |
| `onTimeUpdate(h, cb)` | void | ~10 Hz while playing |
| `setNowPlaying(h, title, artist, album, artworkUrl)` | void | All strings; pass `""` for unknown |
| `destroy(handle)` | void | Frees resources |

## States

`MediaState` is one of:

- `idle` — never started
- `loading` — buffering / fetching headers
- `ready` — first chunk decoded, ready to `play()`
- `playing` — actively rendering
- `paused` — paused (position preserved)
- `ended` — reached end of stream
- `error` — irrecoverable failure (network, codec, …)

### `ended` reliability

`ended` is fired both from the platform's native end-of-playback signal
**and** from a `currentTime ≈ duration` fallback. Per [issue #351
discussion](https://github.com/PerryTS/perry/issues/351), the native
event has been historically flaky on the web / Chromecast — the same
belt-and-braces is cheap to apply on every backend so a `perry/media`
consumer can rely on `ended` firing once per track.

The fallback engages only after `play()` has been called and `duration`
is known (live streams report `+inf`, which sanitises to `0` and disables
the fallback). Window: 0.25s before duration. The native signal sets the
flag first when it works; the fallback sets the same flag on the polling
tick if the signal hasn't arrived.

## Platform implementations

| Platform | Backend | Status |
| --- | --- | --- |
| macOS | AVPlayer + MPNowPlayingInfoCenter + MPRemoteCommandCenter | **Implemented** + lock-screen |
| iOS | AVPlayer + NowPlaying MediaSession (iOS 27) or MediaPlayer fallback | **Implemented** + lock-screen |
| tvOS | AVPlayer + Siri Remote play/pause/skip | **Implemented** + remote |
| visionOS | AVPlayer + UIImage artwork | **Implemented** + lock-screen |
| Android | `android.media.MediaPlayer` + `MediaSessionCompat` via JNI | **Implemented** + lock-screen |
| GTK4 / Linux | GStreamer `playbin` element + MPRIS D-Bus | **Implemented** + lock-screen |
| Windows | `Windows.Media.Playback.MediaPlayer` (WinRT) + `SystemMediaTransportControls` | **Implemented** + Now Playing |
| watchOS | AVPlayer + AVAudioSession Playback + UIImage artwork | **Implemented** + Now Playing complication |
| HarmonyOS | `@ohos.multimedia.media.AVPlayer` via napi | **Implemented** (lock-screen via `@ohos.multimedia.avsession` is a follow-up) |
| Web | `<audio>` element + Media Session API | **Implemented** (`--target web`; `setNowPlaying` populates `navigator.mediaSession.metadata` + wires play / pause / seekto / seekforward / seekbackward action handlers) |

Stub platforms link cleanly against the same FFI surface — code that
imports `perry/media` compiles on every target. `createPlayer` returns
`0` on a stub backend so `if (player === 0)` is the canonical "feature
not available here" check.

On Linux, `setNowPlaying` exposes the player to the desktop via MPRIS
(`org.mpris.MediaPlayer2.perry-<pid>` on the session bus). GNOME Shell,
KDE Plasma, `playerctl`, and any Bluetooth-headphone media-key bridge
that speaks MPRIS will see the metadata and route Play / Pause /
PlayPause / Stop / Seek / SetPosition back to the player. The MPRIS
server is lazy-bootstrapped on the first `setNowPlaying` call so apps
that don't need lock-screen integration don't pay the zbus startup
cost. `Next` / `Previous` are no-ops (single-track playback model);
playlists are an app-level concern.

### Android — background playback

Perry's Android backend wires `MediaSessionCompat` so the lock-screen
tile, Bluetooth headset, Android Auto, and Wear OS see the metadata
pushed by `setNowPlaying` and route headphone play/pause/stop/seek
events back into the registered `onStateChange` closure. That covers
foreground use. Apps that want playback to survive the activity being
backgrounded (a podcast app, music player, etc.) need a foreground
service of their own — Android will otherwise kill the audio when the
process drops to the cached state. Add the following to your app's
`AndroidManifest.xml` and start the service when playback begins:

```xml
<service
    android:name=".PerryMediaService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
```

The service implementation is app-specific — it should hold a
`MediaSessionCompat.Token` (the same session Perry created), build a
`Notification.MediaStyle` notification from it, and call
`startForeground(...)` on `play` / `stopForeground(false)` on `pause` /
`stopSelf()` on `stop`. We deliberately don't ship a default service
because the notification's branding (small icon, tint, content intent)
depends on the host app.

### Threading notes

The `onStateChange` and `onTimeUpdate` callbacks fire from the platform's
main UI thread on every backend, so they share the same JS heap as the
calling code. Implementation detail varies:

- **macOS / iOS / tvOS / visionOS** — driven by an `NSTimer` scheduled
  on the main run loop at 10 Hz.
- **Android** — driven from `Java_com_perry_app_PerryBridge_nativePumpTick`
  (the existing 125 Hz UI-thread pump), throttled internally to ~10 Hz.
  The `prepare()` call runs on a background worker thread to avoid
  blocking the UI on network buffering.
- **GTK4** — driven by a `glib::timeout_add_local` timer on the GLib
  main loop. EOS / error messages arrive on the GStreamer bus and get
  forwarded to per-player atomic flags via a `bus.add_watch_local`
  closure.
- **Windows** — driven from the `GetMessageW` / `PeekMessageW` message
  loop after each dispatch, throttled to 100 ms by wall-clock comparison.
- **HarmonyOS** — Perry's `.so` cannot reach `@ohos.multimedia.media`
  directly, so `perry/media` calls record intents into Mutex-protected
  drain queues in `perry-runtime::media_playback`. The harvested
  `pages/Index.ets` (emitted by `perry-codegen-arkts` whenever the
  module uses `perry/media`) installs a 100 ms `setInterval` pump in
  `aboutToAppear` that drains the queues, dispatches each op against
  the matching `media.AVPlayer` instance (allocated lazily on the
  first `createPlayer` drain), and pushes state observations back into
  the runtime via the `pushMediaState(handle, state, current,
  duration)` NAPI export. AVPlayer's own `stateChange` / `timeUpdate`
  / `error` / `endOfStream` events feed the same callback path. The
  pump runs on the ArkTS UI thread, so closures fired by
  `media_playback::push_media_state` share the same arena as Perry's
  `main()`. Lock-screen integration (`@ohos.multimedia.avsession`) is
  a follow-up — the runtime queues now-playing metadata via
  `drainNowPlaying` but the ArkTS-side AVSession dispatch is a no-op
  beyond a hilog line for now. Closed issue #369 delivered the HarmonyOS
  AVPlayer bridge; it is not an open tracker for AVSession support.

## Now Playing on Apple platforms

On iOS 27, an app built with an Xcode 27 SDK uses Apple's new NowPlaying
framework. Perry creates an observable `MediaSession` per player, keeps its
metadata, playback snapshot, elapsed time, and duration synchronized, and
routes play, pause, stop, and seek commands to the matching `AVPlayer` handle.
The bridge requests system-primary status so the session appears on the Lock
Screen, in Control Center and Dynamic Island, and on connected surfaces such
as CarPlay.

On devices before iOS 27, builds made without the new framework, and other
Apple platforms, Perry uses `MPNowPlayingInfoCenter` and
`MPRemoteCommandCenter`. `MPNowPlayingInfoCenter` is process-wide, so the most
recent `setNowPlaying` call wins on that compatibility path. The remote command
handlers route events to the first live player handle. Perry selects exactly
one implementation for a local iOS session; Apple warns that mixing the new
NowPlaying and legacy MediaPlayer APIs has undefined behavior.

`artworkUrl` accepts:

- `file://` paths — loaded via the platform image/artwork loader
- `https://` URLs — requested when the system needs artwork. The legacy
  MediaPlayer path fetches once via `NSData(contentsOf:)`; iOS 27's
  NowPlaying `Artwork` provider loads it asynchronously on demand.

### watchOS Info.plist requirements

watchOS keeps the audio engine alive when the watch screen sleeps **only
if** the app's `Info.plist` declares the `audio` background mode under
`WKBackgroundModes` (the WatchKit equivalent of iOS's `UIBackgroundModes`):

```xml
<key>WKBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

Without this entry the OS suspends the watch app a few seconds after the
wrist-down gesture or screen timeout, regardless of whether AVPlayer is
actively rendering. The runtime also auto-activates an `AVAudioSession`
with category `Playback` on the first `createPlayer(...)` call — combined
with the Info.plist entry, this is what tells watchOS the app intends to
keep playing audio in the background.

The Now Playing surface on the watch face is independent from the paired
iPhone's lock screen — they're separate processes with separate
`MPNowPlayingInfoCenter` instances. `setNowPlaying` on watchOS targets
the watch's Now Playing complication / glance screen.

## Subsonic example

```typescript,no-test
import { createPlayer, play, setNowPlaying, onStateChange } from "perry/media";

function streamUrl(serverUrl: string, user: string, pass: string, songId: string): string {
  const params = new URLSearchParams({
    u: user, p: pass, v: "1.16.1", c: "PerryClient", id: songId, format: "mp3",
  });
  return `${serverUrl}/rest/stream?${params.toString()}`;
}

const player = createPlayer(streamUrl("https://music.example.com", "alice", "secret", "12345"));
setNowPlaying(player, "All These Things That I've Done", "The Killers", "Hot Fuss",
              "https://music.example.com/rest/getCoverArt?id=12345&u=alice&p=secret&v=1.16.1&c=PerryClient");
onStateChange(player, (state) => {
  if (state === "ended") {
    // queue.next() ...
  }
});
play(player);
```

## Next steps

- [Audio Capture](https://docs.perryts.com/system/audio.html) — Microphone input + dB metering
- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs


---

<!-- source: docs/src/system/geolocation.md -->

# Geolocation & Image Picker

Two `perry/system` capabilities that wrap the OS's location and
photo-library pickers across iOS, Android, macOS, and stub on every
other platform.

## Geolocation

Callback-based; wrap in `new Promise(r => …)` at the call site if a
Promise-shaped API is preferred.

```typescript,no-test
import {
  geolocationGetCurrent,
  geolocationWatch,
  geolocationStopWatch,
  geolocationRequestPermission,
} from "perry/system";

geolocationGetCurrent(
  (lat, lng, accuracy, timestampMs) => {
    console.log(`at ${lat},${lng} ±${accuracy}m`);
  },
  (errorMessage) => {
    console.error("location failed:", errorMessage);
  },
);
```

### `geolocationGetCurrent(onSuccess, onError)`

Resolve the device's current position. Exactly one of the two callbacks
fires per invocation:

- `onSuccess(lat, lng, accuracy, timestampMs)` — `accuracy` in meters
  (horizontal); `timestampMs` is Unix epoch milliseconds.
- `onError(message)` — fires on permission denial, timeout, or platform
  unavailability. Common messages: `"permission-denied"`,
  `"no-location"`, `"no-provider-available"`,
  `"unsupported-platform"`.

### `geolocationWatch(callback): number`

Subscribe to position updates. Returns a numeric watch id; pass it to
`geolocationStopWatch` to cancel. Updates fire whenever the platform
reports movement greater than the OS's default distance filter.

### `geolocationStopWatch(id)`

Cancel a watch started by `geolocationWatch`. No-op on unknown ids.

### `geolocationRequestPermission(callback)`

Request location permission. Calls `callback(status)` where status is
one of `"granted"`, `"denied"`, `"restricted"`, or
`"unsupported-platform"`. Safe to call repeatedly — already-granted
permissions return immediately.

### Required configuration

| Platform | Configuration |
|---|---|
| **iOS** | `NSLocationWhenInUseUsageDescription` in `Info.plist`. Backed by `CLLocationManager`. |
| **Android** | `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>` (or `ACCESS_COARSE_LOCATION`) in `AndroidManifest.xml`. Backed by `LocationManager`. |
| **macOS** | `NSLocationWhenInUseUsageDescription` in `Info.plist` for sandboxed apps. Backed by `CLLocationManager`. |
| **tvOS / watchOS / visionOS / GTK4 / Windows / Web** | No-op stub — `geolocationGetCurrent` invokes `onError` immediately with `"unsupported-platform"`. |

### Promise wrapper

```typescript,no-test
import { geolocationGetCurrent } from "perry/system";

function getPosition(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}> {
  return new Promise((resolve, reject) => {
    geolocationGetCurrent(
      (lat, lng, accuracy, timestamp) =>
        resolve({ lat, lng, accuracy, timestamp }),
      (msg) => reject(new Error(msg)),
    );
  });
}
```

## Image picker

Present the native photo-library picker. The callback receives an array
of absolute filesystem paths the user selected; read bytes via
`fs.readFileSync(path)` if needed.

```typescript,no-test
import { imagePickerPick } from "perry/system";

imagePickerPick(
  5,        // maxCount
  true,     // allowMultiple
  (paths) => {
    if (paths.length === 0) {
      console.log("user cancelled");
    } else {
      for (const p of paths) {
        console.log("picked:", p);
      }
    }
  },
);
```

### `imagePickerPick(maxCount, allowMultiple, callback)`

- `maxCount: number` — soft cap on selections. iOS Photo Picker enforces
  this when API supports; Android Photo Picker (API 33+) accepts a max
  in `[1, 10]`.
- `allowMultiple: boolean` — if `false`, only one image can be picked
  regardless of `maxCount`.
- `callback(paths: string[])` — fires once when the user dismisses the
  picker. `paths` is empty if the user cancelled.

### Platform implementations

| Platform | Backend | Permissions |
|---|---|---|
| **iOS** | `PHPickerViewController` | None — the system picker doesn't require Photos permission |
| **Android (API 33+)** | `MediaStore.ACTION_PICK_IMAGES` (Photo Picker) | None — privacy-preserving |
| **Android (API < 33)** | `ACTION_GET_CONTENT` fallback | `READ_MEDIA_IMAGES` (used only by the fallback path) |
| **macOS** | `NSOpenPanel` filtered to image UTIs | None |
| **All other targets** | No-op stub — `callback` invoked with `[]` immediately | — |

On Android, picked URIs are copied into the app's cache dir (named
`perry_pick_<ms>_<idx>.<ext>` with the extension inferred from the MIME
type) so the absolute path returned is safe to read with `fs`.

## Image compression

Pair the picker with the `sharp` package (compiled natively via Perry's
well-known bindings) to compress before upload:

```typescript,no-test
import sharp from "sharp";

const buf = await sharp(pickedPath)
  .resize({ width: 1600 })
  .jpeg({ quality: 80 })
  .toBuffer();
```

See [Other Modules](https://docs.perryts.com/stdlib/other.html#sharp-image-processing) for the full `sharp`
surface.


---

<!-- source: docs/src/system/background.md -->

# Background Tasks

The `perry/background` module schedules deferred or periodic work that the
operating system runs even when the app is in the background — refreshing
data, polling for updates, or syncing state without keeping the app in the
foreground.

```typescript,no-test
import { registerTask, schedule, cancel } from "perry/background";

registerTask("com.example.refresh", async () => {
  await syncOrders();
});

schedule(
  "com.example.refresh",
  "appRefresh",
  Date.now() + 60_000,   // earliestStartMs
  true,                  // requiresNetwork
  false,                 // requiresCharging
);
```

## API

### `registerTask(identifier, handler)`

Register a handler for a background-task identifier. The OS calls this
handler when it decides to wake the app for the matching schedule.

- `identifier: string` — free-form, but on iOS / tvOS / visionOS it
  **must also appear in `Info.plist`** under
  `BGTaskSchedulerPermittedIdentifiers`. Apple rejects unregistered
  identifiers at submit time.
- `handler: () => Promise<void> | void` — async or sync. The OS gives a
  fixed budget (~30 s for `appRefresh`, several minutes for `processing`);
  Perry awaits the returned promise before signalling completion.

On iOS / tvOS, `registerTask` **must be called at module-init time**
(before the app loop starts). Perry's app delegate flushes the registry
during `application:didFinishLaunchingWithOptions:`. On Android,
visionOS, watchOS, and macOS the call can happen any time.

### `schedule(identifier, kind, earliestStartMs, requiresNetwork, requiresCharging)`

Submit a wake-up request for a registered identifier.

- `kind: "appRefresh" | "processing"`
  - `"appRefresh"` — short (~30 s) wake to refresh data. iOS:
    `BGAppRefreshTaskRequest`. Android: `OneTimeWorkRequest` with no
    power constraint.
  - `"processing"` — longer-running work that requires the device to
    meet `requiresNetwork` / `requiresCharging`. iOS:
    `BGProcessingTaskRequest`. Android: `OneTimeWorkRequest` with a
    matching `Constraints` builder.
- `earliestStartMs: number` — Unix-epoch milliseconds; pass `0` for "as
  soon as the OS allows".
- `requiresNetwork: boolean` — maps to
  `setRequiresNetworkConnectivity` (iOS/visionOS/tvOS),
  `setRequiredNetworkType(CONNECTED)` (Android), or
  `setRequiresNetworkConnectivity` on the macOS scheduler. Advisory on
  watchOS (the OS decides).
- `requiresCharging: boolean` — maps to `setRequiresExternalPower`
  (iOS/tvOS/visionOS), `setRequiresCharging(true)` (Android). Advisory on
  watchOS / macOS.

Calling `schedule` for an identifier that already has a pending request
**replaces it** — both iOS and Android enforce uniqueness per identifier.

### `cancel(identifier)`

Cancel a previously scheduled task. No-op for unknown ids. On watchOS
there is no native cancel API; `cancel` removes the handler from
Perry's registry so a fired refresh becomes a no-op.

## Platform support

| Platform | Backend | Wake while not running? |
|---|---|---|
| **iOS** | `BGTaskScheduler` | Yes (per Apple's policy) |
| **Android** | `androidx.work` (`OneTimeWorkRequest` + `PerryBackgroundWorker`) | Yes |
| **tvOS** | `BGTaskScheduler` (tvOS 13+) | Only while the box is on (during screensaver / different app) |
| **visionOS** | `BGTaskScheduler` (visionOS 1.0+) | Yes |
| **watchOS** | `WKApplication.scheduleBackgroundRefresh` (watchOS 7+) | Yes; only `appRefresh` kind, no native cancel |
| **macOS** | `NSBackgroundActivityScheduler` | Only while app is running |
| **GTK4 (Linux)** | No equivalent — silent no-op | — |
| **Windows** | No equivalent without admin or MSIX — silent no-op | — |
| **Web** | Silent no-op | — |

For Linux desktop and Win32 Perry apps, deploy-time scheduling
(`systemd --user` timer units, Windows Task Scheduler) is the only path;
the app cannot register them at runtime. For periodic refresh while a
desktop app is running, use `setInterval()` directly.

## iOS Info.plist requirement

iOS / tvOS / visionOS reject any `submitTaskRequest:` whose identifier
isn't whitelisted at compile time. Add the identifiers your app registers
to your `Info.plist`:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.example.refresh</string>
</array>
```

Without this entry the `submit` call fails silently and the OS never
delivers the wake-up.

## Android: Google's WorkManager

The Android implementation requires `androidx.work:work-runtime-ktx` on
the app's classpath. Perry's Android template already pulls it in —
`crates/perry-ui-android/template/app/build.gradle.kts`. If you ship a
custom Gradle setup, add:

```kotlin
implementation("androidx.work:work-runtime-ktx:2.9.0")
```

## Branching by platform

Use `getDeviceIdiom()` from `perry/system` to skip background scheduling
on platforms where it's a no-op:

```typescript,no-test
import { getDeviceIdiom } from "perry/system";
import { registerTask, schedule } from "perry/background";

const idiom = getDeviceIdiom();
if (idiom === "phone" || idiom === "pad" || idiom === "watch") {
  registerTask("refresh", refreshHandler);
  schedule("refresh", "appRefresh", 0, true, false);
} else {
  // Desktop fallback: poll while running
  setInterval(refreshHandler, 5 * 60 * 1000);
}
```

## Notes & limitations

- iOS budget is approximately 30 s for `appRefresh` and a few minutes
  for `processing` — design handlers around that.
- Android `WorkManager` enforces a 15-minute minimum for
  `PeriodicWorkRequest`; Perry's `schedule` always builds a
  `OneTimeWorkRequest` to avoid that constraint, but the OS may still
  delay the run based on doze mode and battery state.
- Promise-based completion is synchronous-best-effort: Perry pumps
  microtasks before and after invoking the handler, so simple `await`
  chains run, but a handler that returns a long-lived `Promise` may
  miss the OS's completion deadline.


---

<!-- source: docs/src/system/other.md -->

# Other System APIs

Additional platform-level APIs. Every snippet below is excerpted from a real
file CI compiles on every PR — see
[`docs/examples/system/snippets.ts`](../../examples/system/snippets.ts) for
the perry/system pieces and
[`docs/examples/ui/events/snippets.ts`](../../examples/ui/events/snippets.ts)
for clipboard.

## Open URL

Open a URL in the default browser or application:

```typescript
openURL("https://example.com")
```

| Platform | Implementation |
|----------|---------------|
| macOS | NSWorkspace.open |
| iOS | UIApplication.open |
| Android | Intent.ACTION_VIEW |
| Windows | ShellExecuteW |
| Linux | xdg-open |
| Web | window.open |

## Dark Mode Detection

```typescript
if (isDarkMode()) {
    console.log("Dark mode is active")
}
```

| Platform | Detection |
|----------|-----------|
| macOS | NSApp.effectiveAppearance |
| iOS | UITraitCollection |
| Android | Configuration.uiMode |
| Windows | Registry (AppsUseLightTheme) |
| Linux | GTK settings |
| Web | prefers-color-scheme media query |

## Clipboard

Clipboard helpers live in `perry/ui` (not `perry/system`):

```typescript
// Copy to clipboard
clipboardWrite("Hello, clipboard!")

// Read from clipboard
const text = clipboardRead()
log.set(`clipboard length: ${text.length}`)
```

## Device Identity

```typescript
console.log(`device idiom: ${getDeviceIdiom()}`)
console.log(`device model: ${getDeviceModel()}`)
```

`getDeviceIdiom()` returns the broad form factor as a string: `"phone"` or
`"pad"` on iOS (and `"phone"` on Android), `"mac"` on macOS, `"tv"` on tvOS,
`"watch"` on watchOS, `"vision"` on visionOS, and `"desktop"` on Windows and
Linux. `getDeviceModel()` returns the platform-specific model identifier
(`"iPhone15,2"`, `"MacBookPro18,3"`, etc. — on macOS this is sysctl
`hw.model`).

## Next Steps

- [Overview](https://docs.perryts.com/system/overview.html) — All system APIs
- [UI Overview](https://docs.perryts.com/ui/overview.html) — Building UIs
