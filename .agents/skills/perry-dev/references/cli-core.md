<!-- Perry docs bundle: cli-core.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/cli/commands.md -->

# CLI Commands

The default Perry build provides 22 top-level commands for compiling, checking,
running, publishing, security, package management, and project tooling.

## Command index

| Command | Purpose |
|---|---|
| `compile` (`build`) | Compile TypeScript to a native target. |
| `check` | Check Perry compatibility without producing a binary. |
| `init` | Initialize a Perry project. |
| `install` | Install npm dependencies behind Perry's malware-scan gate. |
| `doctor` | Diagnose the host toolchain and configuration. |
| `explain` | Explain a Perry diagnostic code. |
| `publish` | Build, sign, package, and publish an app. |
| `setup` | Configure platform credentials and SDK support. |
| `update` | Check for and install Perry updates. |
| `audit` | Scan source and emit security/SBOM information. |
| `verify` | Verify a binary or attestation. |
| `run` | Compile and run in one step. |
| `dev` | Watch, rebuild, and relaunch on changes. |
| `i18n` | Extract and manage application locales. |
| `login` | Authenticate a Perry account through GitHub OAuth. |
| `appstore` | Manage App Store release notes and metadata. |
| `types` | Generate TypeScript declarations for Perry built-ins. |
| `cache` | Inspect or clear Perry's on-disk cache. |
| `updater` | Generate keys and sign or verify updater payloads. |
| `native` | Scaffold, validate, and list native bindings. |
| `widget` | Scaffold and integrate home-screen widget targets. |
| `lock` | Create or verify the native-library supply-chain lockfile. |

The sections below cover the most common workflows. For every option and
feature-gated subcommand in the installed binary, use `perry <command> --help`.

See also: [perry.toml Reference](https://docs.perryts.com/cli/perry-toml.html) for project configuration.

## compile

Compile TypeScript to a native executable.

```bash
perry compile main.ts -o app
# Or shorthand (auto-detects compile):
perry main.ts -o app
```

| Flag | Description |
|------|-------------|
| `-o, --output <PATH>` | Output file path |
| `--target <TARGET>` | Platform target (see [Compiler Flags](https://docs.perryts.com/cli/flags.html)) |
| `--output-type <TYPE>` | `executable` (default) or `dylib` (plugin) |
| `--print-hir` | Print HIR intermediate representation |
| `--no-link` | Produce object file(s) only, skip linking; written to `-o` (see [Compiler Flags](https://docs.perryts.com/cli/flags.html)) |
| `--keep-intermediates` | Keep `.o` and `.asm` files |
| `--enable-js-runtime` | Enable V8 JavaScript runtime fallback |
| `--enable-wasm-runtime` | Force-link the wasmi WebAssembly host runtime (auto-detected on `WebAssembly.*` use) |
| `--type-check` | Enable type checking via tsgo |
| `--minify` | Minify and obfuscate output (auto-enabled for `--target web`) |
| `--app-bundle-id <ID>` | Bundle ID (required for widget targets) |
| `--bundle-extensions <DIR>` | Bundle TypeScript extensions from directory |

```bash
# Basic compilation
perry compile app.ts -o app

# Cross-compile for iOS Simulator
perry compile app.ts -o app --target ios-simulator

# Build a plugin
perry compile plugin.ts --output-type dylib -o plugin.dylib

# Debug: view intermediate representation
perry compile app.ts --print-hir

# Build an iOS widget
perry compile widget.ts --target ios-widget --app-bundle-id com.myapp.widget
```

## run

Compile and launch your app in one step.

```bash
perry run                          # Auto-detect entry file
perry run ios                      # Run on iOS device/simulator
perry run visionos                 # Run on Apple Vision Pro simulator/device
perry run android                  # Run on Android device
perry run -- --port 3000           # Forward args to your program
```

| Argument / Flag | Description |
|------|-------------|
| `ios` | Target iOS (device or simulator) |
| `visionos` | Target visionOS (device or simulator) |
| `macos` | Target macOS (default on macOS host) |
| `web` | Target web (opens in browser) |
| `android` | Target Android device |
| `--simulator <UDID>` | Specify iOS simulator by UDID |
| `--device <UDID>` | Specify iOS physical device by UDID |
| `--local` | Force local compilation (no remote fallback) |
| `--remote` | Force remote build via Perry Hub |
| `--enable-js-runtime` | Enable V8 JavaScript runtime |
| `--enable-wasm-runtime` | Force-link the wasmi WebAssembly host runtime |
| `--type-check` | Enable type checking via tsgo |
| `--` | Separator for program arguments |

**Entry file detection** (checked in order):
1. `perry.toml` → `[project] entry` field
2. `src/main.ts`
3. `main.ts`

**Device detection**: When targeting iOS, Perry auto-discovers available simulators (via `simctl`) and physical devices (via `devicectl`). For Android, it uses `adb`. When multiple targets are found, an interactive prompt lets you choose.

**Remote build fallback**: If cross-compilation toolchains aren't installed locally (e.g., Apple mobile targets on a machine without Xcode), `perry run ios` and `perry run visionos` can fall back to Perry Hub's build server when the backend supports the target. Use `--local` or `--remote` to force either path.

```bash
# Run a CLI program
perry run

# Run on a specific simulator
perry run ios --simulator 12345-ABCDE

# Force remote build
perry run ios --remote

# Run web target
perry run web
```

## dev

Watch your TypeScript source tree and auto-recompile + relaunch on every save.

```bash
perry dev src/main.ts                        # watch + rebuild + relaunch on save
perry dev src/server.ts -- --port 3000       # forward args to the child
perry dev src/app.ts --watch shared/         # watch an extra directory
perry dev src/app.ts -o build/dev-app        # override output path
```

| Flag | Description |
|------|-------------|
| `-o, --output <PATH>` | Output binary path (default: `.perry-dev/<entry-stem>`) |
| `--watch <DIR>` | Extra directories to watch (comma-separated or repeated) |
| `--` | Separator — everything after is forwarded to the compiled binary |

**How it works:**

1. Resolves the entry, computes the **project root** (walks up until it finds a `package.json` or `perry.toml`; falls back to the entry's parent directory).
2. Does an initial `perry compile`, then spawns the resulting binary with stdio inherited.
3. Watches the project root (plus any `--watch` dirs) recursively using the `notify` crate. A 300 ms **debounce** window collapses editor "save storms" into one rebuild.
4. On each relevant change: kill the running child, recompile, relaunch. A failed build leaves the old child dead and waits for the next change; no crash loop.

**What counts as a "relevant" change:**
- **Trigger extensions:** `.ts`, `.tsx`, `.mts`, `.cts`, `.json`, `.toml`
- **Ignored directories (not watched, never retrigger):** `node_modules`, `target`, `.git`, `dist`, `build`, `.perry-dev`, `.perry-cache`

**Benchmarks** (trivial single-file program, macOS):

| Phase | Time |
|---|---|
| Initial build (cold — runtime + stdlib rebuilt by auto-optimize) | ~15 s |
| Post-edit rebuild (hot libs cached on disk) | **~330 ms** |

The speedup on hot rebuilds comes from Perry's auto-optimize library cache and
the per-module object cache. In a multi-module project, unchanged modules reuse
cached object bytes while changed modules are parsed and compiled again. See
[Cache Directory](https://docs.perryts.com/cli/cache-dir.html) for placement, invalidation, and CI guidance.

**Not yet in scope (V2+):**
- In-memory AST cache (reuse SWC parses across rebuilds).
- State preservation across rebuilds / HMR — "fast restart" is the honest target.

## check

Validate TypeScript for Perry compatibility without compiling.

```bash
perry check src/
```

| Flag | Description |
|------|-------------|
| `--check-deps` | Check `node_modules` for compatibility |
| `--deep-deps` | Scan all transitive dependencies |
| `--all` | Show all issues including hints |
| `--strict` | Treat warnings as errors |
| `--fix` | Automatically apply fixes |
| `--fix-dry-run` | Preview fixes without modifying files |
| `--fix-unsafe` | Include medium-confidence fixes |

```bash
# Check a single file
perry check src/index.ts

# Check with dependency analysis
perry check . --check-deps

# Auto-fix issues
perry check . --fix

# Preview fixes without applying
perry check . --fix-dry-run
```

## init

Create a new Perry project.

```bash
perry init my-project
cd my-project
```

| Flag | Description |
|------|-------------|
| `--name <NAME>` | Project name (defaults to directory name) |

Creates `perry.toml`, `package.json`, `src/main.ts`, `.gitignore`, and `tsconfig.json` (plus Perry type stubs under `.perry/types/`). The generated `package.json` carries the npm-interop layer, including an empty `perry.compilePackages` array — the sole config home for [compiling npm packages natively](https://docs.perryts.com/packages/porting.html).

## doctor

Check your Perry installation and environment.

```bash
perry doctor
```

| Flag | Description |
|------|-------------|
| `--quiet` | Only report failures |

Checks:
- Perry version
- System linker availability (cc/MSVC)
- Runtime library
- Project configuration
- Available updates

## explain

Get detailed explanations for error codes.

```bash
perry explain U001
```

Error code families:
- **P** — Parse errors
- **T** — Type errors
- **U** — Unsupported features
- **D** — Dependency issues

Each explanation includes the error description, example code, and suggested fix.

## publish

Build, sign, and distribute your app.

```bash
perry publish macos
perry publish ios
perry publish visionos
perry publish android
```

| Argument / Flag | Description |
|------|-------------|
| `macos` | Build for macOS (App Store/notarization) |
| `ios` | Build for iOS (App Store/TestFlight) |
| `visionos` | Build for visionOS |
| `android` | Build for Android (Google Play) |
| `linux` | Build for Linux (AppImage/deb/rpm) |
| `--server <URL>` | Build server (default: `https://hub.perryts.com`) |
| `--license-key <KEY>` | Perry Hub license key |
| `--project <PATH>` | Project directory |
| `-o, --output <PATH>` | Artifact output directory (default: `dist`) |
| `--no-download` | Skip artifact download |

Apple-specific flags:

| Flag | Description |
|------|-------------|
| `--apple-team-id <ID>` | Developer Team ID |
| `--apple-identity <NAME>` | Signing identity |
| `--apple-p8-key <PATH>` | App Store Connect .p8 key |
| `--apple-key-id <ID>` | App Store Connect API Key ID |
| `--apple-issuer-id <ID>` | App Store Connect Issuer ID |
| `--certificate <PATH>` | .p12 certificate bundle |
| `--provisioning-profile <PATH>` | .mobileprovision file (iOS) |

Android-specific flags:

| Flag | Description |
|------|-------------|
| `--android-keystore <PATH>` | .jks/.keystore file |
| `--android-keystore-password <PASS>` | Keystore password |
| `--android-key-alias <ALIAS>` | Key alias |
| `--android-key-password <PASS>` | Key password |
| `--google-play-key <PATH>` | Google Play service account JSON |

On first use, `publish` auto-registers a free license key.

## setup

Interactive credential wizard for app distribution, plus toolchain setup for Windows.

```bash
perry setup          # Show platform menu
perry setup macos    # macOS setup (signing credentials)
perry setup ios      # iOS setup (signing credentials)
perry setup visionos # visionOS setup (signing credentials)
perry setup android  # Android setup (signing credentials)
perry setup windows  # Windows toolchain (downloads MS CRT + Windows SDK via xwin)
```

`perry setup windows` downloads the Microsoft CRT + Windows SDK libraries (~1.5 GB) so Perry can link without Visual Studio Build Tools. Requires LLVM (`winget install LLVM.LLVM`) and prompts to accept the Microsoft redistributable license — pass `--accept-license` to skip the prompt for CI. Output lands at `%LOCALAPPDATA%\perry\windows-sdk`. See the [Windows platform guide](https://docs.perryts.com/platforms/windows.html) for the full toolchain comparison.

Credential wizards store their output in `~/.perry/config.toml`.

## update

Check for and install Perry updates.

```bash
perry update                # Update to latest
perry update --check-only   # Check without installing
perry update --force        # Ignore the cached answer
perry update --mode auto    # Save how updates should behave, then exit
```

`perry update` installs whatever the release infrastructure offers, whichever
source the background check uses, and verifies its signature before replacing
anything.

`--mode` writes `[update] mode` to `~/.perry/config.toml`:

| mode | behaviour |
|---|---|
| `off` | Never check, never say anything. |
| `notify` | Mention a newer version at the end of a run. The default. |
| `prompt` | Mention it, then ask. |
| `auto` | Install at the end of a successful run. |

`perry update` itself ignores the mode — asking for it explicitly is the point.
`prompt` and `auto` refuse to install when the command failed, when a package
manager owns this Perry, or when the install directory is not writable, and say
which.

Full reference, including where the check asks and the release cooldown:
[Updates](https://docs.perryts.com/cli/updates.html).

## i18n

Internationalization tools for managing locale files and extracting localizable strings.

### `perry i18n extract`

Scan source files and generate/update locale JSON scaffolds:

```bash
perry i18n extract src/main.ts
```

Detects string literals in UI component calls (`Button`, `Text`, `Label`, etc.) and `t()` calls. Creates `locales/*.json` files based on the `[i18n]` config in `perry.toml`.

See the [i18n documentation](https://docs.perryts.com/i18n/overview.html) for full details.

## native

Tooling for native-bindings packages — Rust crates exporting `extern "C"` symbols that Perry's compiler links into your TypeScript program. See [Native Bindings — Overview](https://docs.perryts.com/native-libraries/overview.html) for the architecture this fits into.

### `perry native init <name>`

Scaffold a new native-bindings package:

```bash
perry native init my-bindings \
  --description "Native bindings for libfoo" \
  --upstream-dep 'libfoo = "1.0"' \
  --github-owner my-handle
```

Creates a directory with:

- `package.json` (`perry.nativeLibrary` block: `abiVersion` + `functions[]` + per-target build config)
- `Cargo.toml` (depends on `perry-ffi` through the Perry repository because the
  crate is not currently available from crates.io; pin a tested tag or commit
  before releasing your wrapper)
- `src/lib.rs` (one example `#[no_mangle] pub extern "C" fn js_<name>_hello`)
- `src/index.ts` (TypeScript surface user code imports)
- `README.md`, `LICENSE`, `.gitignore`
- `.github/workflows/release.yml` — multi-target prebuild matrix (x86_64 + aarch64 macOS / Linux + Windows) on tag, attaches staticlibs to the GitHub release

Pass `--force` to overwrite an existing directory.

See the [Authoring Guide](https://docs.perryts.com/native-libraries/authoring-guide.html) for the full walkthrough.

### `perry native validate`

Run from a wrapper's root:

```bash
cd my-bindings
perry native validate
```

Parses `package.json`, runs `cargo build --release`, locates the resulting `.a` / `.lib` / `.dylib`, walks `nm -gP` over its symbols, and diffs against the manifest's `functions[].name` array. Reports:

- ❌ **declared functions with no matching symbol** — broken bindings (typo in `name` field, missing `#[no_mangle]`, etc.); exits 1.
- ⚠ **`js_*` symbols not in the manifest** — unreachable from user code (forgot to declare them, or named something internal `js_*` accidentally).

Pass `--no-build` to skip the `cargo build` step when you're iterating on the manifest only.

### `perry native list`

Enumerates the well-known bindings shipped with this Perry build:

```bash
perry native list
```

Output:

```text
30 bindings ship with this Perry build:

  argon2                        → perry-ext-argon2                  (#466)
  axios                         → perry-ext-axios                   (#466)
  bcrypt                        → perry-ext-bcrypt                  (#466)
  better-sqlite3                → perry-ext-better-sqlite3          (#466)
  …
```

Pass `--format json` for machine-readable output. Resolution order printed at the bottom — bindings discovered via `node_modules/<pkg>/package.json` `perry.nativeLibrary` always win over the well-known set.

## Next Steps

- [Compiler Flags](https://docs.perryts.com/cli/flags.html) — Complete flag reference
- [Getting Started](https://docs.perryts.com/getting-started/installation.html) — Installation


---

<!-- source: docs/src/cli/cache-dir.md -->

# Cache directory

Where Perry writes its on-disk caches for a project. Defaults to
`<project-root>/node_modules/.cache/perry`, the find-cache-dir convention
used by babel-loader, eslint, and most of the JS toolchain.

Everything Perry caches lands directly under this directory: per-module
object files (`objects/<target>/`), the build-cache manifest (`build/`),
the link-cache manifest (`link/`), the behavioral SBOM (`audit.json`),
sandbox-exec profiles (`buildrs-<pkg>.sandbox`), and HIR miss dumps
(`debug/`) when `PERRY_CACHE_DEBUG_HIR=1`.

## Four ways to set it

Precedence, highest to lowest: CLI flag, then `PERRY_CACHE_DIR`, then
`perry.toml`, then `package.json`. So `perry.toml` overrides `package.json`,
and the env var and CLI flag override `perry.toml`:

```
# 1. Per-build CLI flag (wins over everything)
perry compile --cache-dir /var/cache/perry myapp.ts

# 2. Per-shell environment
PERRY_CACHE_DIR=/var/cache/perry perry compile myapp.ts

# 3. Per-project perry.toml, alongside the other [perry] settings
[perry]
cacheDir = "/var/cache/perry"

# 4. Per-project package.json (most common)
{
  "perry": {
    "cacheDir": ".perry-cache"
  }
}
```

A relative path resolves against the project root, so two projects that
both set `cacheDir = ".cache"` keep separate caches. An absolute path is
used as-is.

## Notes

- The directory is created automatically on the first build. If it can't
  be created (read-only root, permission error), Perry silently degrades
  to a no-op cache for that run rather than failing the build.
- The cache directory must be writable for caching to take effect.
- The default `node_modules/.cache/perry` rides along with the
  already-ignored `node_modules/`, so nothing new lands in `git status`.
- Older Perry versions wrote to `<project-root>/.perry-cache/`. That
  directory is now stale and can be deleted; Perry no longer reads or
  writes it. Run `perry cache clean` to wipe the current cache.
- An explicit `--cache-dir` is useful for CI caches (point it at a path
  your CI restores between runs), shared build farms (a fast local SSD
  instead of an NFS-mounted project root), and read-only project roots
  (relocate the cache to a writable scratch dir).

The object cache is machine-local — it bakes in `-mcpu=native` codegen —
so sharing a cache directory across machines with different CPUs (rsync,
NFS, a Docker bind-mount) can produce `SIGILL` at runtime. Scope a shared
`--cache-dir` to a single CPU family.


---

<!-- source: docs/src/cli/updates.md -->

# Updates

Perry checks whether a newer version exists, in the background, and mentions it
on stderr at the end of a run. That is all it does by default. Everything below
is optional.

## Doing nothing

The default is to check at most once a day and print one line when there is
something newer. Perry never installs anything unless you ask it to.

Checks are skipped entirely when any of these is true:

- `PERRY_NO_UPDATE_CHECK` is set to `1` or `true`
- `NO_UPDATE_NOTIFIER` is set — the same variable npm's `update-notifier`
  reads, so setting it once covers every tool that honours it
- `CI` is set to anything other than an empty or explicitly-false value
- stderr is not a terminal, so nobody would see the notice
- `--format` asks for machine-readable output, where a notice would land in the
  middle of what you are parsing

## Configuring it

Everything lives in an `[update]` section of `~/.perry/config.toml`.

```toml
[update]
mode = "notify"
check_interval_hours = 24
notify_interval_hours = 0
```

| key | default | what it does |
|---|---|---|
| `mode` | `notify` | How much Perry does. See below. |
| `check_interval_hours` | `24` | How often to ask what the latest version is. |
| `notify_interval_hours` | `0` | Minimum gap between two notices about the same version. `0` means every run. |
| `prompt_default` | `false` | Which answer Enter picks in `prompt` mode. |
| `min_age_hours` | `24` for `auto`, `0` otherwise | How long a release must have existed before `auto` installs it. |
| `skip_version` | unset | A version to stay quiet about. Usually written by answering the prompt. |
| `source` | unset | Where to ask. See [Choosing a source](#choosing-a-source). |
| `package`, `registry` | Perry's own | For the npm-shaped sources. |
| `server` | unset | A mirror to prefer, and the URL for `source = "custom"`. |

### The four modes

| mode | behaviour |
|---|---|
| `off` | Never check, never say anything. |
| `notify` | Check in the background, print one line when something is newer. **The default.** |
| `prompt` | Notify, then ask whether to install. |
| `auto` | Install at the end of a successful run, without asking. |

`perry update --mode auto` writes the setting for you.

`prompt` and `auto` both refuse in three situations, and say why:

- **The command you ran failed.** You are reading an error; a question about
  upgrading is noise, and an unattended install would bury it. Perry falls back
  to a plain notice.
- **A package manager owns this Perry.** Homebrew, npm, apt and winget each
  track what they installed. Overwriting the binary underneath leaves that
  record wrong, so Perry names that manager's own command instead.
- **The install directory is not writable.** Checked before anything is
  downloaded, so you get one sentence naming `sudo perry update` rather than a
  download that dies at the last step. Perry never escalates on its own.

`auto` additionally waits out `min_age_hours` — see [The cooldown](#the-cooldown).

## Choosing a source

By default Perry asks its release infrastructure. If you installed through npm,
it asks npm instead, because that is the version your package manager can
actually install.

| `source` | what it reads |
|---|---|
| `gh-releases` | The GitHub releases API. |
| `npm` | An npm registry's `latest` dist-tag. Public registry unless `registry` says otherwise. |
| `gh-registry` | GitHub Packages. Needs `GH_TOKEN` or `GITHUB_TOKEN`. |
| `custom` | Any HTTPS URL in `server` returning `{"version": "..."}`. |

```toml
[update]
source = "npm"
package = "@perryts/perry"
```

A source that fails is reported rather than quietly retried somewhere else. If
you said "ask npm", a failure means npm did not answer — not that Perry should
go and ask GitHub.

### One thing a source can never do

A source answers *what is the latest version*. It never decides where a binary
comes from. Downloads and their signature always come from the release
infrastructure.

That is deliberate. The signature is what makes a self-update safe to run, and
`source` is a URL you can point anywhere — so if it could redirect the
download, this setting would be a way to install arbitrary code.

## The cooldown

`auto` will not install a release that is younger than `min_age_hours`, which
defaults to a day.

A release that was published by mistake, or pulled shortly after, or published
by someone who should not have been able to, is most dangerous in its first
hours. Waiting a day costs nothing and means your machine is not the one that
finds out. `notify` and `prompt` are unaffected — they tell a human, who can
decide.

If a source does not report a publish date, the release counts as **too fresh**
rather than old enough. The abbreviated npm document has no dates, so treating
unknown as "old enough" would switch the cooldown off for exactly the people
using the cheapest source. Set `min_age_hours = 0` to turn it off deliberately.

## Skipping one version

In `prompt` mode the third answer is "skip this version and stop asking about
it". That is not the same as turning notices off: the skipped version goes
quiet, and the next release is mentioned normally — so the release that fixes
whatever made you skip does not stay hidden too.

## What a check sends

The request itself, and nothing else: a user agent naming Perry's version, and
the platform's artifact name when asking the release infrastructure. No
identifiers, and no relationship to telemetry — `PERRY_NO_TELEMETRY` does not
affect update checks, and these settings do not affect telemetry.

## Where things are kept

| path | what |
|---|---|
| `~/.perry/config.toml` | The `[update]` section. |
| `~/.perry/update-check.json` | The last check's answer, and when you were last told. |

Both are safe to delete; Perry rebuilds them.

## Environment variables

| variable | effect |
|---|---|
| `PERRY_NO_UPDATE_CHECK=1` | Switch the whole surface off. Beats every config setting. |
| `NO_UPDATE_NOTIFIER` | The same, using the ecosystem-wide spelling. |
| `PERRY_UPDATE_MODE` | `off`/`notify`/`prompt`/`auto` for one run. Beats the config file, loses to the two above. |
| `PERRY_UPDATE_SERVER` | Prefer this release URL. Highest priority for downloads. |
| `GH_TOKEN`, `GITHUB_TOKEN` | Used only by `source = "gh-registry"`. |


---

<!-- source: docs/src/cli/app-updates.md -->

# Update checks in apps you build

An app Perry compiles can tell its own users when a newer version exists. You
configure it once and Perry bakes the settings into the executable.

Two halves, and it is worth knowing which is which:

- **Perry does the noticing.** At startup your app reads its own state file and
  prints a notice if the last lookup found something newer. You write no code
  for this.
- **Your app does the asking.** The version lookup uses your app's own
  `fetch()`, from a few lines you add — see
  [Performing the check yourself](#performing-the-check-yourself). Until you add
  them, nothing is ever recorded and the notice never appears.

This is off unless you ask for it. A project with no `perry.update` block
produces a binary identical to one built before this feature existed.

## The smallest useful configuration

```json
{
  "name": "myapp",
  "version": "1.2.3",
  "perry": {
    "update": {
      "source": "npm",
      "package": "myapp",
      "command": "self-update"
    }
  }
}
```

That is enough for the configuration side. Once you add the lookup call, a run
that finds a newer `myapp` records it, and the next run prints two lines to
stderr:

```
Update available: myapp 1.2.3 → 1.4.0
  Run `myapp self-update` to update
```

If you have not implemented a `self-update` command, leave `command` out and the
second line points at the release page instead. Perry will not tell your users
to run something that does not exist.

## Every setting

`perry.update` in package.json, or an `[update]` table in perry.toml using
`snake_case` names. perry.toml wins key by key, so a project can keep defaults
in package.json and override them per build.

| package.json | perry.toml | default | what it does |
|---|---|---|---|
| `source` | `source` | — | Required. `gh-releases`, `npm`, `gh-registry` or `custom`. |
| `url` | `url` | — | Required for `gh-releases` and `custom`. |
| `package` | `package` | — | Required for `npm` and `gh-registry`. |
| `registry` | `registry` | public npm | Registry base URL for the npm-shaped sources. |
| `tag` | `tag` | — | Release-tag pattern for `gh-releases`. |
| `command` | `command` | none | The command your notice suggests. Omit if you have none. |
| `checkInterval` | `check_interval_hours` | `24` | Hours between lookups. |
| `notifyInterval` | `notify_interval_hours` | `24` | Minimum hours between two notices about the same version. |
| `binName` | `bin_name` | output name | What to call the app in its own notice. |
| `appId` | `app_id` | `binName` | Names the state directory. |
| `skipEnv` | `skip_env` | none | An environment variable that switches the check off. |
| `enabled` | `enabled` | `true` | `false` keeps the settings and emits nothing. |

The version comes from `[project] version` in perry.toml when you have one, and
from package.json's `version` otherwise — the same value the rest of your binary
reports, so the notice cannot compare against a number your app never claims.

### Choosing a source

| `source` | reads | needs |
|---|---|---|
| `gh-releases` | The GitHub releases API | `url`, optionally `tag` |
| `npm` | A registry's `latest` dist-tag | `package` |
| `gh-registry` | GitHub Packages | `package`; pass a token to `embeddedCheckUrl` |
| `custom` | Any HTTPS URL returning `{"version": "..."}` | `url` |

## Mistakes are caught at build time

These fail the build rather than warning. A warning scrolls past in build
output; the consequence lands on your users, who get no notices and no error —
the feature simply does nothing and nobody can tell why:

- **A URL must be `https://`.** Plain HTTP is refused. An attacker on the
  network can answer "you are current" and suppress an update, and a warning in
  build output is not where that gets noticed. `http://localhost` and the
  loopback addresses are allowed so you can test against a local server.
- **A source must have the keys it reads** — `url` for `gh-releases` and
  `custom`, `package` for the npm-shaped ones.
- **`checkInterval` cannot be 0.** That would ask on every run. To disable
  checks, remove the block or set `enabled: false`.
- **Your app needs a version.** Set `version` in package.json, or
  `currentVersion` in the block.

## When your app will not check

Your users get a check only when all of these hold. None of it is configurable
by you, because each one is a case where a notice does harm:

- their stderr is a terminal — otherwise the notice lands in whatever is reading
  your app's output;
- `CI` and `CONTINUOUS_INTEGRATION` are unset;
- `PERRY_NO_UPDATE_CHECK` and `NO_UPDATE_NOTIFIER` are unset, or set to `0`,
  `false`, `off`, `no` or the empty string. Any other value disables the check,
  including one this list does not name — somebody who wrote `=please` is asking
  not to be checked. `NO_UPDATE_NOTIFIER` is the variable npm's
  `update-notifier` reads, so a user who set it once has already told every tool
  on their machine;
- your own `skipEnv` variable, if you named one, is unset;
- the command being run is not your `command`. An `app self-update` invocation
  does not check on its way to updating.

Your app's **stdout is never touched**. The notice is stderr only.

## Where the state lives

One file per app, in the platform's cache directory:

| platform | path |
|---|---|
| macOS | `~/Library/Caches/<appId>/update-check.json` |
| Linux | `$XDG_CACHE_HOME/<appId>/update-check.json`, or `~/.cache/<appId>/update-check.json` |
| Windows | `%LOCALAPPDATA%\<appId>\update-check.json` |

It records when the last check happened, what it found, and when the user was
last told. Deleting it is safe. Two apps never share one, so your app's notice
cannot silence another's.

The `notifyInterval` throttle is keyed to the *version*, not just the clock. If
you set a week to stop nagging about `1.4.0`, and `1.4.1` ships the next day
fixing something, your users still hear about it.

## Turning it off for a build

```json
{ "perry": { "update": { "enabled": false, "source": "npm", "package": "myapp" } } }
```

Nothing is embedded — not a disabled block. The settings stay in the file for
when you want them back.

## Giving your users an off switch

Name one and Perry honours it:

```json
{ "perry": { "update": { "source": "npm", "package": "myapp",
                          "skipEnv": "MYAPP_NO_UPDATE_CHECK" } } }
```

Document it in your own README. The global variables above work regardless.

## Performing the check yourself

The startup notice reports what a *previous* run recorded. To make a run actually
ask, call the check from your own code — Perry gives you everything except the
request itself, which uses your app's own `fetch()`:

```typescript,no-test
import {
  embeddedCheckHeaders,
  embeddedCheckUrl,
  embeddedRefreshDue,
  recordEmbeddedResponse,
} from "perry/updater";

async function checkForUpdates(): Promise<void> {
  if (!embeddedRefreshDue()) return;

  const url = embeddedCheckUrl(process.env.GH_TOKEN);
  if (!url) return; // nothing should be requested — see below

  const headers: Record<string, string> = {};
  for (const line of embeddedCheckHeaders().split("\n").filter(Boolean)) {
    const at = line.indexOf(": ");
    headers[line.slice(0, at)] = line.slice(at + 2);
  }

  const response = await fetch(url, { headers });
  if (response.ok) recordEmbeddedResponse(await response.text());
}
```

Call it wherever a slow operation is already acceptable — after your work, not
before it. The next run prints the notice.

### Why the request is yours

Perry keeps the parts that must agree with the settings it compiled — which URL,
which headers, and how to read each of the four source shapes — and leaves the
network call to you. An HTTP stack added to the runtime for this would be paid
for by every program that never checks for an update.

It also means the check obeys your app's own proxy configuration, timeouts and
error handling, rather than a second set hidden inside the runtime.

### An empty URL is an answer

`embeddedCheckUrl()` returns `""` when no request should be made. Respect it.

The case that matters is `gh-registry` with no token available: that request
would 404, and a 404 reads as "no newer version", so your app would report itself
up to date forever. Perry declines to give you a URL rather than let that happen.

### Recording is validated

`recordEmbeddedResponse` reads the body according to your configured `source`, so
a registry answering a `gh-releases` request is rejected rather than read as
version `""`. A version that does not parse is also rejected — one malformed
answer would otherwise become a permanent "update available" your users cannot
dismiss.

It returns 1 when something was recorded, 0 otherwise. There is no need to act on
that; the next startup either has something to say or does not.


---

<!-- source: docs/src/cli/telemetry.md -->

# Privacy & Telemetry

Perry sends no telemetry unless you accept the first-run prompt (or explicitly
set `telemetry.enabled = true` in `~/.perry/config.toml`). This setting is the
master consent gate for every telemetry channel. If it is false or missing,
nothing is sent, even when `compatibility_reports = "on"`. The environment
overrides `PERRY_NO_TELEMETRY=1` and `CI=true` always win as well.

## 1. Master consent and generic usage analytics — `telemetry.enabled`

Counts `perry compile`, `perry init`, `perry publish` invocations on a
background HTTP POST. Sends: command name, platform (`darwin`/`linux`/...),
Perry version, success/error status, and an anonymous client UUID.

## 2. Compatibility reports — `telemetry.compatibility_reports` (#849)

Additional opt-in for "I hit an unsupported TS/Node feature and bailed."
This channel is available only while the master `enabled` consent is true.
It sends a structured report when the compiler emits one of these diagnostic codes:
`UnsupportedBinaryOp`, `UnsupportedExpression`, `UnsupportedStatement`,
`DynamicPropertyAccess`, `ImplicitCoercion`, `UnresolvedImport`, `NoOpStub`.

Three modes:

- `off` — never send. Sink isn't even installed; zero overhead.
- `ask` (default) — when a qualifying diagnostic fires, prompt once per
  session: `[y] just this once / [a] always / [n] not this time / [N] never`.
- `on` — always send (after dedup + redaction). No prompt.

**What's sent (the entire payload schema):**

```json
{
  "perry_version": "0.5.x",
  "client_id": "uuid",
  "code": "UnsupportedExpression",
  "category": "gap-categorical",
  "stage": "hir-lower",
  "snippet_hash": "sha256:...",
  "snippet_redacted": "let <id1> = await <id2>();",
  "ts_feature": "decorator",
  "node_api": "node:async_hooks.createHook",
  "os": "darwin-arm64",
  "node_target": "20"
}
```

**What's NEVER sent:** raw source, file paths, project names, env vars, your
program's stdout/stderr, dependency tree, or anything tied to identity
beyond the existing anonymous `client_id`. Snippets are redacted before
hashing — string literals → `"<str>"`, numbers → `<num>`, identifiers
(except built-ins like `console`, `Math`, `Promise`) → `<id1>`, `<id2>`,
capped at 200 chars, with a hard reject if any invariant fails.

A local 30-day dedup cache at `~/.perry/.report-cache` prevents resending
the same `snippet_hash` on every reload.

## Inspecting & managing

```bash
perry doctor                          # shows current mode, sent/queued counts
perry doctor --show-pending-reports   # print redacted payloads queued this run
perry doctor --clear-report-cache     # wipe the 30-day dedup cache
```

To opt out at the file level, edit `~/.perry/config.toml`:

```toml
[telemetry]
enabled = false                  # all telemetry off
compatibility_reports = "off"    # optional; master opt-out already wins
```

See also the [`PERRY_NO_TELEMETRY` row in the perry.toml reference](https://docs.perryts.com/cli/perry-toml.html).
