<!-- Perry docs bundle: container-core.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/container/overview.md -->

# Containers — Overview

Perry ships a first-class container subsystem that lets a TypeScript program
manage OCI containers and multi-container stacks directly, without shelling
out to `docker compose` or hand-rolling subprocess wrappers. The user-facing
API is split across two TypeScript modules:

| Module | Use case |
|---|---|
| [`perry/container`](https://docs.perryts.com/container/containers.html) | Single-container lifecycle: `run`, `create`, `start`, `stop`, `remove`, `inspect`, `logs`, `exec`, plus image management. |
| [`perry/compose`](https://docs.perryts.com/container/compose.html) | Multi-service orchestration: `up`, `down`, `ps`, `logs`, `exec`, `start`, `stop`, `restart`, `config` — driven by a TS object literal that mirrors the Compose spec. |

Both modules compile to **direct calls into a Rust backend** that talks to
whatever OCI-compatible runtime is on the host. There is no JavaScript
runtime in the loop, no YAML file emitter, no `docker-compose` shell-out:
the spec is a TS object, the engine is in-process, and orchestration logic
(dependency ordering, rollback, healthcheck waits) runs natively.

## Backend auto-detection

You do **not** configure a runtime up-front. On first use, Perry probes a
platform-specific priority list of OCI runtimes (with a 2-second timeout
per candidate) and caches the first one that responds:

| Platform | Probe order |
|---|---|
| **macOS / iOS** | `apple/container` → `orbstack` → `colima` → `rancher-desktop` → `lima` → `podman` → `nerdctl` → `docker` |
| **Linux** | `podman` → `nerdctl` → `docker` |
| **Windows** | `podman` → `nerdctl` → `docker` |

The choices reflect three priorities: platform-native runtimes win
(`apple/container` on macOS, the others on Linux), daemonless / rootless
runtimes (`podman`, `nerdctl`) beat daemon-based ones, and `docker` is
always the last fallback.

The same `ComposeSpec` produces deterministic behavior across every
backend in this list — same project-namespaced names, same DNS
aliases, same `ContainerInfo` shape from `inspect`, with explicit
warnings (or hard failures, opt-in) when a feature like
`privileged: true` can't be honored on the chosen runtime. See
[Cross-Backend Determinism](https://docs.perryts.com/container/determinism.html) for the architecture.

```typescript
import { getBackend, detectBackend } from "perry/container";

async function pickBackend(): Promise<void> {
    // Synchronous: returns the canonical name of the active backend
    // (`"docker"`, `"podman"`, `"apple/container"`, `"orbstack"`,
    // `"colima"`, `"lima"`, `"nerdctl"`, …). When called before any
    // async FFI has triggered detection, getBackend() performs a
    // synchronous in-place probe with the same 2 s timeout per
    // candidate that detectBackend() uses, so the result is live.
    console.log(`backend: ${getBackend()}`);

    // Async + verbose: returns a JSON array of every probed backend
    // with availability + version + reason for unavailable ones. Use
    // this when you want to surface a "diagnostics" panel to the user.
    const probed = await detectBackend();
    console.log(probed);
}
```

### Picking a specific backend explicitly

Auto-detect is the default, but Perry exposes **four mechanisms** for
overriding it. Each has its own use case — the four compose cleanly,
so a single program can use multiple.

| # | Mechanism | When | API |
|---|---|---|---|
| 1 | Auto-detect | "just work" | (default — none) |
| 2 | Env var | process-level pin (CI matrix, dev override) | `PERRY_CONTAINER_BACKEND=docker ./app` |
| 3 | Programmatic pin | TS-runtime pin before first op | `await setBackend('podman')` |
| 4 | Capability-aware | pick the best backend **for the spec** | `JSON.parse(selectBackendFor(JSON.stringify(spec)))` |

```typescript,no-test
import {
  setBackend, setBackends, getBackend, getBackendPriority,
  getAvailableBackends, selectBackendFor, up,
} from 'perry/container';

// (3a) Pin a specific backend for everything in this process.
await setBackend('docker');

// (3b) Or — try a list in user-defined priority order (first
//      available wins). Useful for "prefer rootless, fall back to
//      docker" patterns and CI matrix lanes.
await setBackends(['podman', 'docker']);

// (4) Or — let Perry pick the best backend FOR THIS SPEC.
//     Spec uses privileged: true → returns "docker" / "podman" (not apple).
//     Trivial spec on macOS → returns "apple/container".
const best = JSON.parse(selectBackendFor(JSON.stringify(spec))) as string;
await setBackend(best);
await up(spec);

// Diagnostics — which backends does Perry know about, and which are
// actually installed on this host?
console.log(getBackend());                                          // "docker" (active)
console.log(JSON.parse(getBackendPriority()));                      // ["apple/container", ...]
console.log(JSON.parse(await getAvailableBackends()));              // BackendInfo[] — full probe
```

`setBackend()` rejects after the first container op fires — the global
backend `OnceLock` can't be reset. Set it before any other
`perry/container` or `perry/compose` call. See [Cross-Backend
Determinism](https://docs.perryts.com/container/determinism.html) for the full architecture and the
capability-aware `selectBackendFor()` semantics.

### Environment variables

| Variable | Effect |
|---|---|
| `PERRY_CONTAINER_BACKEND=<name>` | Process-level backend pin (skips auto-detection). Same effect as calling `setBackend(name)` from TS, but works before the first op fires. Errors with `NoBackendFound` if the named backend isn't probeable. |
| `PERRY_NO_INSTALL_PROMPT=1` | Disable the interactive installer when no backend is found. Defaults to allowed when `stderr` is a TTY. |
| `PERRY_CONTAINER_VERIFY_IMAGES=1` | Run `cosign verify` against every pulled image before use. See [Security](https://docs.perryts.com/container/security.html#image-verification). |
| `PERRY_ALLOW_UNTRUSTED_SHARED_KERNEL=1` | Opt out of the workload-graph requirement that `policy.tier = "untrusted"` runs in a microVM. **Not recommended for actual untrusted code.** |
| `PERRY_NO_DEFAULT_SIGINT_CLEANUP=1` | Skip the default SIGINT/SIGTERM handler that drains `COMPOSE_HANDLES`. Tests + tools that own their own teardown set this. |

## Module layout

```text
TypeScript code
    ↓  import { run } from 'perry/container'
    ↓  import { up }  from 'perry/compose'
HIR (perry-hir)        — recognises the import paths as native modules
codegen (perry-codegen)— emits direct calls to FFI symbols (NativeModSig dispatch table)
FFI bridge (perry-stdlib::container)
    ↓
ComposeEngine (perry-container-compose)
    ↓
ContainerBackend trait → CliBackend<P: CliProtocol>  (DockerProtocol / AppleContainerProtocol / LimaProtocol)
    ↓
docker / podman / apple/container / colima / orbstack / lima / nerdctl
```

The split exists so the compiler can stay agnostic about which runtime
will actually execute the spec: HIR + codegen reference symbol *strings*
only, and the runtime backend is swappable without recompilation of user
code.

## Canonical lifecycle

The pattern most production deployments follow is the same as
`docker compose up -d` / `down`:

1. **`up()`** — bring the stack up, return an opaque integer handle, and
   exit when every service is started (`up()` does not block on
   healthchecks; for that, see [Healthchecks &
   readiness](https://docs.perryts.com/container/compose.html#waiting-for-readiness)).
2. **Run a separate readiness probe** (or rely on the in-spec
   `healthcheck` block) to verify the stack is actually serving.
3. **Exit 0**: the containers keep running thanks to docker's daemon
   (`restart: unless-stopped` survives host reboots).
4. **`down(handle)`** later (typically from a separate invocation) to
   tear the stack down. Volumes are preserved by default; pass
   `{ volumes: true }` to also drop them.

Perry's runtime currently does not deliver `process.on('SIGINT', ...)`
handlers to your TS code, so a `Ctrl-C`-tears-down pattern can't be
written today. The example deployments under
[`example-code/forgejo-deployment`](https://github.com/PerryTS/perry/tree/main/example-code/forgejo-deployment)
use the two-invocation pattern (`./forgejo_app` and
`./forgejo_app --down`) instead.

## When to use which module

Reach for **`perry/container`** when:

- You need to run a single utility container (CI helper, build tool,
  database migration runner, capability sandbox) and clean up after it.
- You're building a higher-level abstraction on top of OCI primitives.
- You need fine-grained per-container security knobs (`cap_add`,
  `seccomp`, `read_only`, `user`).

Reach for **`perry/compose`** when:

- You're deploying a multi-service application (web + db, app + cache +
  worker, etc.).
- You need dependency-ordered startup with healthcheck conditions.
- You want named volumes, custom networks, and rollback-on-failure
  semantics.
- You'd otherwise reach for a `docker-compose.yaml` file.

The two modules share a runtime; you can mix them in the same program if
you e.g. use `perry/compose` for the long-running stack and `perry/
container` for one-off tasks against the same containers.

## Where to read next

- [Single-container lifecycle](https://docs.perryts.com/container/containers.html) — every `perry/container`
  call documented with examples.
- [Compose orchestration](https://docs.perryts.com/container/compose.html) — `perry/compose` and the
  `ComposeSpec` shape, including the canonical TS-object pattern.
- [Networking](https://docs.perryts.com/container/networking.html) — networks, the `internal` flag, and
  the cross-service-DNS gotcha (and how to work around it today).
- [Volumes](https://docs.perryts.com/container/volumes.html) — named-vs-bind, preservation across `down()`,
  and the `forgejo-pgdata`-style stable-name pattern.
- [Security](https://docs.perryts.com/container/security.html) — capabilities, image verification with
  cosign, and the workload-graph policy tiers.
- [Production patterns](https://docs.perryts.com/container/production-patterns.html) — case study using
  the [`example-code/forgejo-deployment`](https://github.com/PerryTS/perry/tree/main/example-code/forgejo-deployment)
  example and the gotchas it surfaced.


---

<!-- source: docs/src/container/containers.md -->

# Single-Container Lifecycle (`perry/container`)

`perry/container` exposes the OCI primitives that operate on **one
container at a time**: create, start, run, stop, remove, exec, logs,
inspect, plus image management. For multi-service stacks, see
[`perry/compose`](https://docs.perryts.com/container/compose.html) — but you can mix the two modules in the
same program (a long-running compose stack plus one-off `run()` helpers
against it is a normal pattern).

Every async function returns a `Promise`. The runtime backend (docker,
podman, apple/container, …) is auto-detected on first use; see
[Overview](https://docs.perryts.com/container/overview.html#backend-auto-detection) for the probe order
and override knobs.

## Running a container

`run()` creates and starts a container in one shot, returning a handle:

```typescript
import { run, remove } from "perry/container";

async function runAlpine(): Promise<void> {
    const handle = await run({
        image: "alpine:3.19",
        cmd: ["echo", "hello from perry"],
        rm: false,
        // Production-friendly defaults: drop every Linux capability and
        // run as a non-root user. Add `cap_add` only for the specific
        // capabilities a workload actually needs.
        user: "nobody",
        cap_drop: ["ALL"],
    });
    console.log(`container handle: ${String(handle)}`);

    // `force: true` removes the container even if still running (the
    // FFI calls `docker rm -f` / `podman rm -f`).
    await remove(handle as unknown as string, true);
}
```

The full `ContainerSpec` accepts:

| Field | Type | Effect |
|---|---|---|
| `image` | `string` | (required) Image reference, e.g. `"alpine:3.19"`. |
| `name` | `string` | Explicit container name. Defaults to `{md5(image)[0..8]}-{random_hex8}` when unset. |
| `cmd` | `string[]` | Command-line override (overrides the image's CMD). |
| `entrypoint` | `string[]` | Entrypoint override. |
| `env` | `Record<string, string>` | Environment variables. |
| `ports` | `string[]` | Port maps in `"host:container"` form, e.g. `["8080:80"]`. |
| `volumes` | `string[]` | Volume mounts in `"host:container[:ro]"` form, e.g. `["./data:/data:ro"]`. |
| `network` | `string` | Network name to attach to. |
| `rm` | `boolean` | Auto-remove on exit (`docker run --rm`). |
| `labels` | `Record<string, string>` | Container labels. |
| `read_only` | `boolean` | Mount the root filesystem read-only. |
| `privileged` | `boolean` | Run privileged. **Use sparingly.** |
| `user` | `string` | UID, username, or `"UID:GID"`. |
| `workdir` | `string` | Working directory inside the container. |
| `cap_add` | `string[]` | Linux capabilities to add (e.g. `["NET_BIND_SERVICE"]`). |
| `cap_drop` | `string[]` | Linux capabilities to drop (e.g. `["ALL"]`). |
| `seccomp` | `string` | Seccomp profile path or `"default"` (the runtime's default profile). |
| `no_new_privileges` | `boolean` | Sets `--security-opt no-new-privileges` — SUID/SGID binaries inside the container can't gain privileges via execve. |

When `seccomp` or `no_new_privileges` is set, `run()`/`create()`
automatically route through the engine's security-aware launch path
(the same one `perry/compose` uses), which also normalizes the spec
against the detected backend's capabilities — on apple/container the
two flags have no equivalent and are dropped with a warning instead of
crashing the CLI. See [Security](https://docs.perryts.com/container/security.html) for the security knobs
in depth.

### Hardened single-container run

For an untrusted workload (e.g. running user-supplied code, executing a
build script from an untrusted source) the recommended starting point
is "drop everything, add back what you need":

```typescript
import { run as runSecure } from "perry/container";

// Maximum-isolation single-container run for an untrusted workload:
//   - read-only root filesystem
//   - no Linux capabilities at all
//   - non-root user
//   - working directory pinned
//   - default seccomp profile
async function runUntrustedWorkload(): Promise<void> {
    await runSecure({
        image: "alpine:3.19",
        cmd: ["sh", "-c", "echo isolated && exit 0"],
        read_only: true,
        cap_drop: ["ALL"],
        user: "nobody",
        workdir: "/tmp",
        seccomp: "default",
    });
}
```

## Inspect, list, logs, exec

```typescript
import {
    list,
    inspect,
    logs,
    exec,
} from "perry/container";

async function inspectAll(): Promise<void> {
    const containers = await list(true); // all=true → include stopped
    console.log(containers);

    const id = "my-container-id";
    const info = await inspect(id);
    console.log(info.status); // "running" | "exited" | …

    // Tail the last 50 stdout/stderr lines.
    const tailed = await logs(id, { tail: 50 });
    console.log(tailed.stdout);

    // Run a command inside the container; returns a ContainerLogs
    // handle whose stdout/stderr you can read.
    const r = await exec(id, ["ls", "-la"]);
    console.log(r.stdout);
}
```

| Function | Signature | Notes |
|---|---|---|
| `list(all?)` | `(all: boolean) → Promise<ContainerInfo[]>` | `all=true` includes stopped containers. |
| `inspect(id)` | `(id: string) → Promise<ContainerInfo>` | Throws if the container doesn't exist. |
| `logs(id, opts?)` | `(id, { tail?: number }) → Promise<ContainerLogs>` | Returns a registry handle to a `{ stdout, stderr }` pair. |
| `exec(id, cmd, opts?)` | `(id, cmd[], { env?, workdir? })` | Runs a command in the container. Returns a `ContainerLogs` handle. |
| `stop(id, timeout?)` | `(id, seconds: number)` | Sends SIGTERM, then SIGKILL after `timeout` seconds. |
| `start(id)` | `(id)` | Re-starts a stopped container. |
| `remove(id, force?)` | `(id, force: boolean)` | `force=true` is `docker rm -f`. |

> **Note on the `logs` and `exec` return shape:** today the FFI returns
> a registry-id handle into a `Vec<ContainerLogs>` rather than a JS
> object. Treat the returned value as opaque — a future ergonomics task
> will expose `.stdout` / `.stderr` directly on the JS side. The
> `ContainerLogs` shape over the wire is `{ stdout: string, stderr:
> string }`.

## Image management

```typescript
import { pullImage, listImages, removeImage } from "perry/container";

async function manageImages(): Promise<void> {
    await pullImage("postgres:16-alpine");
    const images = await listImages();
    console.log(`${images.length} images`);
    await removeImage("postgres:16-alpine", false);
}
```

| Function | Signature |
|---|---|
| `pullImage(reference)` | `(reference: string) → Promise<void>` |
| `listImages()` | `() → Promise<ImageInfo[]>` |
| `removeImage(reference, force?)` | `(reference: string, force: boolean) → Promise<void>` |

When `PERRY_CONTAINER_VERIFY_IMAGES=1` is set, every `run()`,
`create()`, and `pullImage()` call routes through cosign keyless
verification against the Chainguard identity. See
[Security → Image verification](https://docs.perryts.com/container/security.html#image-verification).

## Container naming

The default name is `{md5(image)[0..8]}-{random_hex8}` — a stable
8-character hash of the image plus a per-call random suffix. This is
fine for one-off `run()` calls but makes containers hard to find later
unless you set `name:` explicitly. **For anything you'll re-target
later (with `inspect`, `logs`, `exec`, etc.), set `name:` upfront.**

```typescript,no-test
const handle = await run({
  image: "alpine:3.19",
  name: "build-helper",   // ← stable handle
  cmd: ["sh", "-c", "echo 'hi from build-helper'"],
  rm: true,
});
```

## Backend introspection

```typescript
import { getBackend, detectBackend } from "perry/container";

async function pickBackend(): Promise<void> {
    // Synchronous: returns the canonical name of the active backend
    // (`"docker"`, `"podman"`, `"apple/container"`, `"orbstack"`,
    // `"colima"`, `"lima"`, `"nerdctl"`, …). When called before any
    // async FFI has triggered detection, getBackend() performs a
    // synchronous in-place probe with the same 2 s timeout per
    // candidate that detectBackend() uses, so the result is live.
    console.log(`backend: ${getBackend()}`);

    // Async + verbose: returns a JSON array of every probed backend
    // with availability + version + reason for unavailable ones. Use
    // this when you want to surface a "diagnostics" panel to the user.
    const probed = await detectBackend();
    console.log(probed);
}
```

`getBackend()` is synchronous and returns the canonical backend name
(`"docker"`, `"podman"`, `"apple/container"`, etc.). It will perform a
synchronous in-place probe on first call so the result is always the
live name; calls after the first hit a cached `OnceLock` and return
instantly.

`detectBackend()` is async and returns a JSON array of *every* probed
candidate with `{ name, available, reason, version, mode,
isolationLevel }` per entry. Use it to surface a "diagnostics" view in
your CLI / dashboard.

## See also

- [Compose orchestration](https://docs.perryts.com/container/compose.html) — multi-service stacks.
- [Networking](https://docs.perryts.com/container/networking.html) — port maps, networks, the
  cross-service DNS gotcha.
- [Security](https://docs.perryts.com/container/security.html) — capability isolation patterns.


---

<!-- source: docs/src/container/compose.md -->

# Compose Orchestration (`perry/compose`)

`perry/compose` brings the `docker compose up / down / ps / exec / logs`
workflow into TypeScript. The spec is a TS object literal that mirrors
the [Compose Specification](https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json),
the engine is in-process Rust (no shell-out to a `docker-compose`
binary), and dependency ordering / rollback / interpolation all run
natively.

## Bringing up a single-service stack

```typescript
import { up } from "perry/compose";

async function bringUpSimpleStack(): Promise<void> {
    const stack = await up({
        version: "3.8",
        services: {
            cache: {
                image: "redis:7-alpine",
                ports: ["6379:6379"],
                networks: ["app-net"],
                healthcheck: {
                    test: ["CMD", "redis-cli", "PING"],
                    interval: "5s",
                    timeout: "3s",
                    retries: 6,
                },
            },
        },
        networks: {
            "app-net": { driver: "bridge" },
        },
    });
    // `stack` is an opaque handle (NaN-boxed integer) — pass it as
    // the first arg to `down` / `ps` / `logs` / `exec`.
    console.log(`stack handle: ${String(stack)}`);
}
```

The handle returned from `up()` is an opaque integer (NaN-boxed with
`POINTER_TAG`); pass it as the first argument to
[`down`](#tearing-down) / [`ps`](#status--logs--exec) /
[`logs`](#status--logs--exec) / [`exec`](#status--logs--exec). The
template-string interpolation `${stack}` renders as `[object Object]`
because of the NaN-boxing tag; coerce explicitly with `String(stack)` if
you need to log it.

## Multi-service stack with healthcheck-gated startup

```typescript
import { up as upMulti } from "perry/compose";

async function bringUpMultiServiceStack(): Promise<void> {
    // depends_on with `condition: 'service_healthy'` blocks the
    // dependent service until the dependency's healthcheck reports
    // healthy. Use the map form (not the bare-array form) to pass
    // the condition.
    await upMulti({
        version: "3.8",
        services: {
            db: {
                image: "postgres:16-alpine",
                container_name: "app-db", // stable DNS target for siblings
                environment: {
                    POSTGRES_USER:     "app",
                    POSTGRES_PASSWORD: "${APP_DB_PASSWORD:-changeme}",
                    POSTGRES_DB:       "app",
                },
                volumes: ["app-pgdata:/var/lib/postgresql/data"],
                networks: ["app-db-net"],
                healthcheck: {
                    test: ["CMD-SHELL", "pg_isready -U app -d app"],
                    interval: "5s",
                    timeout: "3s",
                    retries: 10,
                    start_period: "30s",
                },
            },
            api: {
                image: "myorg/api:1.0",
                depends_on: { db: { condition: "service_healthy" } },
                environment: {
                    DATABASE_URL: "postgres://app:changeme@app-db:5432/app",
                },
                ports: ["8080:8080"],
                networks: ["app-db-net", "app-web-net"],
                restart: "unless-stopped",
            },
        },
        networks: {
            "app-db-net":  { driver: "bridge", internal: true }, // db unreachable from host
            "app-web-net": { driver: "bridge" },
        },
        volumes: {
            "app-pgdata": { driver: "local" },
        },
    });
}
```

This pattern combines several production-grade primitives:

| Primitive | What it does |
|---|---|
| `container_name: 'app-db'` | Forces a stable container name so docker's embedded DNS resolves `app-db` to the postgres container's IP. **See the [DNS gotcha below](#cross-service-dns).** |
| `healthcheck: { test: [...], interval, retries, start_period }` | Per-service liveness probe. Compose-spec § service.healthcheck shape — Perry's engine honors it for `depends_on` gating. |
| `depends_on: { db: { condition: 'service_healthy' } }` | Holds the dependent service back until the dependency reports healthy. Three valid conditions: `service_started`, `service_healthy`, `service_completed_successfully`. |
| `networks: { ..., internal: true }` | Marks the network as internal-only — postgres is unreachable from the host or from sibling stacks. See [Networking](https://docs.perryts.com/container/networking.html). |
| `restart: 'unless-stopped'` | The runtime restarts the container after a crash, but not after an explicit `docker stop`. |

The full `ComposeSpec` shape is exported from `perry/compose` as
`ComposeSpec`, with sub-types `Service`, `ComposeNetwork`,
`ComposeVolume`, `Build`, and `Healthcheck`.

The root-level `name:` field sets the **compose project name** — it
labels every container (`perry.compose.project=<name>`) and namespaces
non-external volumes and networks as `<name>_<declared-name>`, exactly
like docker-compose's project prefix. It defaults to `"perry-stack"`
when omitted, so set it whenever more than one stack can run on the
same host (see [Volumes → Volume naming and
ownership](https://docs.perryts.com/container/volumes.html#volume-naming-and-ownership)).

### Recognised Service fields

The full set Perry's engine understands (matches compose-spec § services):

```typescript,no-test
interface Service {
  image?: string;
  container_name?: string;
  ports?: string[];                                              // "host:container[:proto]"
  environment?: Record<string, string> | string[];               // map or KEY=VALUE list
  labels?: Record<string, string>;
  volumes?: string[];                                            // "host:container[:ro]" or "named:container"
  build?: Build;                                                 // { context, dockerfile, args, … }
  depends_on?: string[] | Record<string, { condition?: string }>;
  restart?: "no" | "always" | "on-failure" | "unless-stopped";
  entrypoint?: string | string[];
  command?: string | string[];
  networks?: string[];
  healthcheck?: Healthcheck;
  user?: string;
  working_dir?: string;
  read_only?: boolean;
  privileged?: boolean;
  cap_add?: string[];
  cap_drop?: string[];
}
```

### `Healthcheck` shape

```typescript,no-test
interface Healthcheck {
  test?: string[];           // ["CMD", "<cmd>", ...] | ["CMD-SHELL", "<line>"] | ["NONE"]
  interval?: string;         // Go duration: "5s", "2m", "1h30m"
  timeout?: string;
  retries?: number;
  start_period?: string;     // grace period before retries count
  disable?: boolean;
}
```

## Environment variable interpolation

Compose's `${VAR}` and `${VAR:-default}` placeholders work in TS-side
specs too — Perry expands them against `process.env` at the FFI
boundary, **before** the JSON gets parsed:

```typescript
import { up as upEnv } from "perry/compose";

// Compose YAML interpolation (`${VAR}` / `${VAR:-default}`) is applied
// to TS-side specs at the FFI boundary too — set `process.env` keys
// before calling up() and they'll resolve in the spec values.
async function envInterpolatedStack(): Promise<void> {
    await upEnv({
        version: "3.8",
        services: {
            web: {
                image: "nginx:${NGINX_VERSION:-alpine}",
                ports: ["${WEB_PORT:-8080}:80"],
                environment: {
                    SERVER_NAME: "${WEB_DOMAIN:-localhost}",
                },
            },
        },
    });
}
```

Set the env vars before invoking your binary:

```bash
NGINX_VERSION=1.27 WEB_PORT=9000 ./my-stack
```

Without this, the literal string `"${NGINX_VERSION:-alpine}"` would
flow through to docker as the image tag and the pull would fail.

## Cross-service DNS

Each service registers its **service key** (`db`, `api`, …) as a
network alias automatically — Perry's engine emits
`--network-alias <key>` per service per network on every `run`. So this
just works:

```typescript,no-test
api: {
  image: "myapp/api",
  environment: {
    // ✅ "db" resolves in DNS via the auto-registered service-key alias
    DATABASE_URL: "postgres://user:pw@db:5432/app",
  },
}
```

`container_name` is no longer required for cross-service DNS. You can
still set one if you want a stable name visible to `docker ps`, but the
service key alone is enough for in-network resolution. Pre-v0.5.372 docs
described a workaround using `container_name` pinning — that pattern
still works but is now optional.

## Tearing down

```typescript
import { down } from "perry/compose";

async function tearDown(stack: number): Promise<void> {
    // Default: containers + networks removed; named volumes preserved
    // so a subsequent `up()` against the same spec resumes from
    // committed state.
    await down(stack);

    // Pass `volumes: true` to also drop named volumes — DESTROYS DATA.
    // Useful for test teardown or for a "rip and replace" redeploy.
    await down(stack, { volumes: true });
}
```

`down(handle)` removes containers and networks, and **preserves named
volumes by default**. Pass `{ volumes: true }` to also drop the volumes
(destroys committed data — use only for "rip and replace" redeploy or
test cleanup). Pass `{ removeOrphans: true }` to also sweep out
containers left behind by earlier deploys of the same project whose
service key no longer exists in the spec.

| `down` option | Type | Default | Effect |
|---|---|---|---|
| `volumes` | `boolean` | `false` | Also remove named volumes after containers + networks. |
| `removeOrphans` | `boolean` | `false` | Remove **orphaned containers**: ones still carrying this stack's `perry.compose.project` label whose `perry.compose.service` key is no longer in the spec (service renamed/deleted between deploys). Strictly label-scoped — other projects' containers and anything not created by Perry are never touched. |

## Status / logs / exec

```typescript
import {
    ps,
    logs as composeLogs,
    exec as composeExec,
    config,
    start,
    stop,
    restart,
} from "perry/compose";

async function manageStack(stack: number): Promise<void> {
    // Status of every service in the stack (returns a registry
    // handle to a ContainerInfo[]; user-side array materialisation
    // is a follow-up ergonomics task).
    const statusHandle = await ps(stack);
    console.log(statusHandle);

    // Aggregated logs from one or all services.
    await composeLogs(stack, { service: "db", tail: 200 });

    // Exec a command inside a service's container by service KEY
    // (not container name) — the engine resolves the service to its
    // running container internally.
    await composeExec(stack, "db", ["pg_isready"]);

    // Resolved YAML the engine actually used (post-interpolation).
    const yaml = await config(stack);
    console.log(yaml);

    // Stop / start / restart by service key. `services: []` (or
    // omitted) targets every service in the stack.
    await stop(stack, ["api"]);
    await start(stack, ["api"]);
    await restart(stack, []);
}
```

Like `perry/container.{logs, exec}`, the compose `logs` and `exec`
return registry-id handles for the `ContainerLogs` array. Treat them as
opaque for now; user-side materialisation is a planned ergonomics
task.

| Function | Signature |
|---|---|
| `ps(handle)` | `(handle) → Promise<ContainerInfo[]>` |
| `logs(handle, opts?)` | `(handle, { service?, tail? }) → Promise<ContainerLogs>` |
| `exec(handle, service, cmd[])` | `(handle, service, cmd[]) → Promise<ContainerLogs>` |
| `config(handle)` | `(handle) → Promise<string>` (resolved YAML) |
| `start(handle, services?)` | `(handle, services?: string[]) → Promise<void>` |
| `stop(handle, services?)` | `(handle, services?: string[]) → Promise<void>` |
| `restart(handle, services?)` | `(handle, services?: string[]) → Promise<void>` |
| `down(handle, opts?)` | `(handle, { volumes?, removeOrphans? }) → Promise<void>` |

`exec` targets a service by its **service key** (e.g. `'db'`, not the
container name) — the engine resolves the key to its tracked container
name internally.

## Idempotency

`up()` is idempotent: if a service is already running with a matching
configuration, it's left alone; if it exists but is stopped, it's
`start`ed; only when it doesn't exist at all is it created from
scratch. This makes "redeploy" a no-op-or-restart operation rather
than a tear-down-and-recreate.

> ⚠️ Idempotency works at the **service** granularity, not field-level.
> If you change the spec (e.g. update an image tag), you'll want
> `down(handle, { volumes: false })` followed by `up(newSpec)` so the
> old containers are replaced with the new image.

## Waiting for readiness

`up()` returns as soon as the engine has *started* every service —
not when each service is *ready*. To block until the stack is serving:

1. **Use the `healthcheck` block on the service** (built-in, runtime
   handles it). Combined with `depends_on: { svc: { condition:
   'service_healthy' } }`, dependent services wait for the dependency
   to report healthy.
2. **Run an explicit probe loop in your code.** The
   [Forgejo example](https://docs.perryts.com/container/production-patterns.html) does this for both
   postgres (`pg_isready`) and Forgejo (`/api/healthz` over HTTP), each
   with its own timeout budget.

## Errors and rollback

If any service fails to start, the engine rolls back the entire stack:
every container created during this `up()` call is stopped + removed,
every network created is removed, and (subject to the standard
`session_volumes` semantics) created volumes are removed too. The
returned `Promise` rejects with a `ServiceStartupFailed` containing the
failing service name and the underlying backend error.

```typescript,no-test
try {
  const stack = await up({ /* … */ });
} catch (err: any) {
  // err.message is "Service '<name>' failed to start: <reason>"
  console.error(err);
  process.exit(1);
}
```

## See also

- [Networking](https://docs.perryts.com/container/networking.html) — networks, ports, and the DNS gotcha.
- [Volumes](https://docs.perryts.com/container/volumes.html) — preserving data across `down()`.
- [Production patterns](https://docs.perryts.com/container/production-patterns.html) — case study with
  the Forgejo example.
- [Security](https://docs.perryts.com/container/security.html) — image verification and capability
  isolation.


---

<!-- source: docs/src/container/networking.md -->

# Networking

Compose stacks join one or more user-defined networks. Each container
spec lists the networks it joins; the engine creates the networks (if
they don't already exist) before starting any service. This page
covers the day-to-day networking patterns Perry users hit.

## Defining networks

```typescript,no-test
const stack = await up({
  version: "3.8",
  services: {
    api: { image: "myapp/api", networks: ["app-net"] },
    db:  { image: "postgres:16-alpine", networks: ["app-net"] },
  },
  networks: {
    "app-net": { driver: "bridge" },
  },
});
```

Recognised `ComposeNetwork` fields:

| Field | Type | Effect |
|---|---|---|
| `driver` | `string` | Network driver (`"bridge"` is the default; `"overlay"` for swarm). |
| `external` | `boolean` | Don't create — assume the network already exists. |
| `name` | `string` | Override the network's runtime name. |
| `internal` | `boolean` | **Internal-only**: containers attached have no external bridge or routing. See below. |
| `driver_opts` | `Record<string, string>` | Driver-specific options. |
| `labels` | `Record<string, string>` | Network labels. |

## Internal-only networks (`internal: true`)

A network with `internal: true` blocks egress to anything outside the
network. Containers on it can talk to each other, but **cannot reach the
host or the public internet**, and the host cannot reach them via
published ports. This is the canonical "private database side-channel"
pattern:

```typescript,no-test
networks: {
  "app-db-net":  { driver: "bridge", internal: true },  // db <-> api only
  "app-web-net": { driver: "bridge" },                  // api <-> host
},
services: {
  db: {
    image: "postgres:16-alpine",
    networks: ["app-db-net"],   // db is reachable ONLY from app-db-net
    // no `ports:` — postgres is unpublished
  },
  api: {
    image: "myapp/api",
    networks: ["app-db-net", "app-web-net"],
    ports: ["8080:8080"],       // api published on the host
  },
},
```

The api container straddles both networks: it can reach `db` over
`app-db-net` and accept inbound HTTP from the host on `app-web-net`.
postgres is invisible to anything not on `app-db-net`.

## Cross-service DNS

Within a user-defined bridge network, the backend's embedded DNS resolves
container names and registered aliases to IP addresses. Perry registers each
compose service key (`db`, `api`, …) as a network alias on Docker, Podman, and
Lima, so sibling services can use ordinary compose-style hostnames:
>
> ```typescript,no-test
> api: {
>   image: "myapp/api",
>   environment: {
>     DATABASE_URL: "postgres://user:pw@db:5432/app",
>   },
> }
> ```

`apple/container` does not expose network aliases. Perry therefore drops this
capability with an explicit warning (or rejects the compose plan in strict
enforcement mode). For portable service discovery that must also work with the
Apple backend, set `container_name` explicitly and use that name in sibling
URLs:

```typescript
// IMPORTANT: Perry's compose engine creates each container with a
// `{md5}-{random_hex}` derived name and DOES NOT (yet) register the
// service KEY (`db`, `api`, …) as a network alias. So
// `DATABASE_URL: 'postgres://user:pw@db:5432/app'` would fail name
// resolution at runtime. Two ways to make sibling-DNS work:
//
//   (a) Set `container_name` explicitly on each service so the
//       chosen name is what Docker's embedded DNS resolves. This is
//       the simplest pattern and is what the Forgejo example uses.
//
//   (b) Wait for service-key network-alias support (planned).
//
// Until (b) lands, prefer (a):
import { up as upDns } from "perry/compose";

async function dnsAwareStack(): Promise<void> {
    await upDns({
        version: "3.8",
        services: {
            db: {
                image: "postgres:16-alpine",
                container_name: "myapp-db", // ← stable DNS target
                networks: ["myapp-net"],
                environment: { POSTGRES_PASSWORD: "x" },
            },
            api: {
                image: "myapp/api",
                container_name: "myapp-api",
                networks: ["myapp-net"],
                environment: {
                    // Use the container_name as the hostname:
                    DATABASE_URL: "postgres://postgres:x@myapp-db:5432/postgres",
                },
            },
        },
        networks: { "myapp-net": { driver: "bridge" } },
    });
}
```

The Forgejo example uses this portable pattern (`container_name:
'forgejo-db'` + `FORGEJO__database__HOST: 'forgejo-db:5432'`).

## Port mapping

Inside a service spec, `ports: ["host:container[:proto]"]` publishes
ports to the host. Examples:

| Spec | Behavior |
|---|---|
| `"8080:80"` | Host port 8080 → container port 80 (TCP). |
| `"8080:80/udp"` | Host port 8080 → container port 80 (UDP). |
| `"127.0.0.1:8080:80"` | Bind only to loopback on the host (don't expose to other LAN hosts). |
| `"3000-3010:3000-3010"` | Range mapping (UDP/TCP, host:container both inclusive). |

For services that should never be host-published (private databases,
internal-only side-cars), simply **don't list any ports**. Combined
with `internal: true` on the network, those services are unreachable
from the host even if a port slipped into the spec by mistake.

## Single-network shorthand

When every service joins the same network, you can put `networks:
['<name>']` on each service and `networks: { <name>: {...} }` once at
the root. The engine deduplicates network creation across services.

## Networks created in this session vs. external

Perry tracks **session networks** (created during this `up()` call) and
distinguishes them from `external: true` networks (assumed pre-existing
and shared across stacks). On `down()`, only session networks are
torn down — external networks are left alone, matching docker-compose
semantics.

```typescript,no-test
networks: {
  // Session: created if missing; removed on down()
  "app-net": { driver: "bridge" },

  // External: must already exist; never touched on down()
  "shared-public-net": { external: true, name: "external_pub_v1" },
},
```

## Network options for production

Common per-network knobs you'll want for production:

| Pattern | Spec |
|---|---|
| **Disable masquerade / NAT** (host-side) | `driver_opts: { "com.docker.network.bridge.enable_ip_masquerade": "false" }` |
| **Custom MTU** (matches host network) | `driver_opts: { "com.docker.network.driver.mtu": "1450" }` |
| **Stable bridge name** (for iptables rules) | `driver_opts: { "com.docker.network.bridge.name": "br-myapp" }` |
| **Tag for monitoring** | `labels: { team: "platform", environment: "prod" }` |

## See also

- [Compose orchestration](https://docs.perryts.com/container/compose.html) — full `up()` / `down()`
  reference.
- [Production patterns](https://docs.perryts.com/container/production-patterns.html) — Forgejo example
  uses the internal-db-net + public-web-net split.
- [Volumes](https://docs.perryts.com/container/volumes.html) — companion concept: networks without
  volumes is rare in production stacks.


---

<!-- source: docs/src/container/volumes.md -->

# Volumes

Container filesystems are ephemeral by default — once a container is
removed, anything written to its layers is gone. Production deployments
need volumes for the data that should survive container restarts +
upgrades: database storage, uploaded files, generated config, etc.

Perry supports the three Compose-spec volume modes:

| Mode | Spec example | Use case |
|---|---|---|
| **Named volume** | `["app-pgdata:/var/lib/postgresql/data"]` | Database state, durable per-app data. |
| **Bind mount** | `["./config:/app/config:ro"]` | Host-supplied config or secrets. |
| **System pass-through** | `["/etc/timezone:/etc/timezone:ro"]` | Read-only access to host system files. |

## Declaring named volumes

Named volumes must be declared at the spec root and referenced by name
in each service's `volumes` array:

```typescript,no-test
const stack = await up({
  services: {
    db: {
      image: "postgres:16-alpine",
      volumes: ["app-pgdata:/var/lib/postgresql/data"],
    },
  },
  volumes: {
    "app-pgdata": { driver: "local" },
  },
});
```

Recognised `ComposeVolume` fields:

| Field | Type | Effect |
|---|---|---|
| `driver` | `string` | Volume driver (`"local"` is the default). |
| `external` | `boolean` | Don't create — assume the volume already exists. |
| `name` | `string` | Override the volume's runtime name. |

## Bind mounts

For host-supplied data, use the `host:container[:options]` form:

```typescript,no-test
volumes: [
  "./config:/app/config:ro",     // read-only config dir from host
  "/var/log/myapp:/app/logs",    // bidirectional logs
],
```

Permissions are governed by the host filesystem and the container's
running UID. If the container runs as a non-root user (as it should —
see [Security](https://docs.perryts.com/container/security.html)), make sure the host directory is owned
by a matching UID, **or** explicitly set the container UID via
`USER_UID` / `USER_GID` env vars in the image (the Forgejo image does
this).

## System pass-throughs

Read-only mounts of host system files are common for time / DNS /
locale alignment:

```typescript,no-test
volumes: [
  "/etc/timezone:/etc/timezone:ro",
  "/etc/localtime:/etc/localtime:ro",
],
```

Best-effort: hosts where the source path doesn't exist (e.g. some
minimal Alpine VMs) just see a missing mount source — docker tolerates
it; the container falls back to UTC / system defaults.

## Preservation on `down()`

By default, **`down(handle)` preserves named volumes**:

```typescript,no-test
await down(stack);                       // containers + networks gone, volumes survive
await down(stack, { volumes: false });   // same — explicit preserve
await down(stack, { volumes: true });    // ⚠ volumes ALSO removed (DESTROYS DATA)
```

This matches `docker compose down` semantics:

| Command | Containers | Networks | Volumes |
|---|---|---|---|
| `down(handle)` | removed | removed | **kept** |
| `down(handle, { volumes: true })` | removed | removed | **removed** |

After a `down(handle)`, you can `up(spec)` again with the same volume
declarations and the database / file state from before is still there.
That's how the [Forgejo example](https://docs.perryts.com/container/production-patterns.html) supports
"deploy → tear-down → redeploy" cycles without data loss.

> ⚠️ **Forgejo / Postgres redeploy gotcha:** if you used randomly
> generated passwords or secret keys on the first deploy, **the next
> redeploy with new random secrets will fail** because postgres
> authenticates against the old password and Forgejo can't decrypt
> the existing config dir with a different SECRET_KEY. For
> redeploys against the same volumes, set
> `FORGEJO_DB_PASSWORD` / `FORGEJO_SECRET_KEY` /
> `FORGEJO_INTERNAL_TOKEN` to **stable** values (e.g. via an `.env`
> file). The Forgejo example's doc-comment has the canonical pattern.

## External volumes

Mark a volume `external: true` to share it across stacks or to use a
volume created by a different process (e.g. `docker volume create
team-shared-cache` ahead of time):

```typescript,no-test
volumes: {
  "shared-cache": { external: true, name: "team-shared-cache" },
},
```

External volumes are **never removed** by `down(handle, { volumes: true
})` — that flag only drops volumes the engine itself created. This
matches docker-compose semantics; if you want the external volume gone,
remove it explicitly with `docker volume rm team-shared-cache`.

## Volume naming and ownership

Perry project-scopes volume (and network) names as `<project>_<name>`
unless the volume is `external: true` or carries an explicit `name:`
override — so `forgejo-pgdata` under project `forgejo` becomes the
docker volume `forgejo_forgejo-pgdata`. The project identifier comes
from `ComposeSpec.name` and defaults to `"perry-stack"` when omitted —
so two stacks that *both* leave `name` unset and declare the same
volume key still collide. Give each stack a distinct project name for
multi-stack isolation:

```typescript,no-test
await up({
  name: "myapp-staging",              // → volume myapp-staging_pgdata
  services: { /* … */ },
  volumes: {
    pgdata: { driver: "local" },
  },
});
```

## Inspecting volume state

The `perry/container` and `perry/compose` modules don't expose a JS
`inspectVolume()` helper today — for now, inspect with the underlying
runtime CLI:

```bash
docker volume ls --filter name=app-       # list app-prefixed volumes
docker volume inspect app-pgdata          # mountpoint, driver, labels
docker run --rm -v app-pgdata:/data \      # mount + inspect contents
  alpine ls -la /data
```

## Backup patterns

The standard "tar the volume into the host" backup recipe:

```bash
docker run --rm -v app-pgdata:/data:ro -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-$(date +%F).tar.gz -C /data .
```

For a pure-Perry approach, drive that with `perry/container.run()`:

```typescript,no-test
await run({
  image: "alpine:3.19",
  cmd: ["sh", "-c",
    "tar czf /backup/pgdata-$(date +%F).tar.gz -C /data ."],
  volumes: [
    "app-pgdata:/data:ro",
    "./backups:/backup",
  ],
  rm: true,
});
```

## See also

- [Compose orchestration](https://docs.perryts.com/container/compose.html) — `down(handle, opts)` reference.
- [Production patterns](https://docs.perryts.com/container/production-patterns.html) — Forgejo example
  uses three named volumes (pgdata, data, config).
- [Security](https://docs.perryts.com/container/security.html) — read-only mounts and ownership patterns.
