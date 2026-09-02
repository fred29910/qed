<!-- Perry docs bundle: container-advanced.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/container/security.md -->

# Security

Containers don't isolate themselves; you isolate them. Perry exposes the
standard OCI security knobs on both `ContainerSpec` (single-container)
and `ComposeService` (orchestrated stacks), plus first-party support
for Sigstore / cosign image verification and a workload-graph policy
tier API for declarative isolation levels.

## Per-container security knobs

The same set of fields work on `run()`, `create()`, and any service in a
compose `up()`:

| Field | Type | Effect | Cross-backend |
|---|---|---|---|
| `read_only` | `boolean` | Mount the root filesystem as read-only. Forces all writable state to be in declared volumes. | All backends |
| `privileged` | `boolean` | Run privileged: grants ALL Linux capabilities + access to host devices. **Avoid unless absolutely necessary.** | Docker / Podman / Lima only — apple/container has no concept and **drops the field** with a warning |
| `user` | `string` | UID, username, or `"UID:GID"` — runs the container's processes as that identity. The image's CMD ignores this if it does its own user-switching, but most properly-built images respect it. | All backends |
| `workdir` | `string` | Working directory inside the container. | All backends |
| `cap_add` | `string[]` | Linux capabilities to add. Specific (e.g. `["NET_BIND_SERVICE"]`), not blanket. | All backends |
| `cap_drop` | `string[]` | Capabilities to drop. `["ALL"]` is the canonical "drop everything" starting point. | All backends |
| `seccomp` | `string` | Seccomp profile path or `"default"` (uses the runtime's default profile). | Docker / Podman / Lima only — apple/container has no equivalent and **drops the field** with a warning |
| `no_new_privileges` | `boolean` | Sets `--security-opt no-new-privileges` — SUID/SGID binaries inside the container can't gain privileges via execve. | Docker / Podman / Lima only — dropped on apple/container |

On a compose service the last two are spelled in compose-spec form
instead: `security_opt: ["seccomp=<path-or-default>",
"no-new-privileges"]`. The engine parses those entries into the same
internal `SecurityProfile` that `run()`/`create()` build from the
spec-level fields, so both APIs hand the backend identical flags.

> ⚠️ **Cross-backend security caveat.** `privileged`, `seccomp`,
> `--security-opt no-new-privileges`, IPC/PID namespace sharing, and
> SELinux mount labels are **not honored on apple/container** — its
> Apple-VM model means those concepts don't translate. Perry's
> normalization pass drops the fields and emits a `tracing::warn!`
> rather than silently downgrading the security policy. For production
> deployments that demand cross-backend parity, set
> `EnforcementMode::Strict` on the engine — any unsupported security
> field becomes a hard `up()` failure rather than a silent drop. Full
> matrix at [Cross-Backend Determinism](https://docs.perryts.com/container/determinism.html).

## Recommended baseline

Start with maximum isolation and add back only what the workload needs:

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

Field-by-field rationale:

- `read_only: true` — even an exploit that lands code execution can't
  persist to the image's filesystem. Anything mutable goes into a
  declared volume.
- `cap_drop: ["ALL"]` — removes Linux capabilities the workload didn't
  explicitly ask for. Most apps need none.
- `user: "nobody"` — non-root inside the container. If the image
  doesn't have a `nobody` user, replace with `"65534:65534"` (the
  numeric UID/GID of `nobody` on most distros).
- `workdir: "/tmp"` — the only writable location under
  `read_only: true` is `/tmp` (which is `tmpfs`-backed by default).
- `seccomp: "default"` — uses docker's default seccomp profile (~50
  syscalls blocked).

## Capability addition patterns

`cap_drop: ["ALL"]` plus targeted `cap_add`:

| Workload | Capabilities |
|---|---|
| **Web server binding to port 80/443** | `cap_add: ["NET_BIND_SERVICE"]` |
| **Network namespace manipulation** | `cap_add: ["NET_ADMIN"]` |
| **Kernel time setting** | `cap_add: ["SYS_TIME"]` |
| **chown** to other users (rare) | `cap_add: ["CHOWN"]` |
| **Bind-mount filesystems inside** | `cap_add: ["SYS_ADMIN"]` (still avoid if possible) |

The full capability list is in `man capabilities(7)`. Always start with
`cap_drop: ["ALL"]` and add only what fails when removed — most
applications need zero capabilities.

## Image verification

Set `PERRY_CONTAINER_VERIFY_IMAGES=1` to enable cosign keyless
verification on every `run()`, `create()`, and `pullImage()` call:

```bash
export PERRY_CONTAINER_VERIFY_IMAGES=1
./my-app
```

Perry's verifier:

1. Resolves the image tag to its digest via `inspect_image`.
2. Looks up the digest in an in-memory `VERIFICATION_CACHE` —
   subsequent runs against the same digest are free.
3. Runs `cosign verify --certificate-identity ${CHAINGUARD_IDENTITY}
   --certificate-oidc-issuer ${CHAINGUARD_ISSUER} <ref>@<digest>` and
   caches pass/fail.
4. On fail, the FFI rejects with a `verification failed` error
   (the container is never created).

Default identity / issuer point at Chainguard's keyless signing flow:

| Const | Value |
|---|---|
| `CHAINGUARD_IDENTITY` | `https://github.com/chainguard-images/images/.github/workflows/sign.yaml@refs/heads/main` |
| `CHAINGUARD_ISSUER` | `https://token.actions.githubusercontent.com` |

For your own org's images, override these via the (planned) per-call
verification options. For now, using Chainguard-signed base images is
the path of least resistance — `cgr.dev/chainguard/<tool>` is signed.

> **Cosign required.** Set `PERRY_CONTAINER_VERIFY_IMAGES=1` only when
> `cosign` is installed and on `PATH`. The verification is OFF by
> default so the bare-metal `./my-app` execution doesn't depend on a
> separate cosign install.

## Capability sandbox helper

For one-off command execution against an untrusted image (CI helper,
build tool, code-evaluation sandbox), use the
[`run_capability` pattern](https://docs.perryts.com/container/containers.html#hardened-single-container-run)
which wraps `run()` with the maximum-isolation defaults:

- `read_only: true`
- `cap_drop: ["ALL"]`
- No network attached
- `user: "nobody"`
- Image verified via cosign before pull

This is the same path the internal `perry-stdlib::container::capability`
module uses for shell-command sandboxing in plugin systems.

## Workload-graph policy tiers (`perry/workloads`)

For multi-node deployments where different workloads have different
trust levels, the workload-graph engine accepts a per-node `policy`:

```typescript,no-test
import { graph, runGraph, runtime, policy } from "perry/workloads";

const g = graph("my-app", {
  trusted_db:    { image: "postgres:16-alpine",
                   runtime: runtime.oci(),
                   policy:  policy.default() },        // no extra hardening

  isolated_api:  { image: "myapp/api",
                   runtime: runtime.oci(),
                   policy:  policy.isolated() },       // no_network=true

  hardened_proxy: { image: "myapp/proxy",
                    runtime: runtime.oci(),
                    policy:  policy.hardened() },      // read_only_root + seccomp

  untrusted_eval: { image: "myapp/sandbox",
                    runtime: runtime.microvm(),         // ← required by tier
                    policy:  policy.untrusted() },     // microVM-only, all hardening on
});

await runGraph(g);
```

The four `PolicyTier` levels and what they enforce:

| Tier | `no_network` | `read_only_root` | `seccomp` | `microvm` |
|---|---|---|---|---|
| `default()` | — | — | — | — |
| `isolated()` | ✅ | — | — | — |
| `hardened()` | — | ✅ | ✅ | — |
| `untrusted()` | ✅ | ✅ | ✅ | **required** |

`untrusted` requires kernel-level isolation (i.e. a microVM, not a
shared-kernel container). When the active backend doesn't expose a
microVM runtime (`apple/container`'s VM mode, Lima, Firecracker), the
engine returns `BackendNotAvailable` rather than silently dropping the
isolation guarantee. Use `PERRY_ALLOW_UNTRUSTED_SHARED_KERNEL=1` to opt
out — **not recommended for actually-untrusted code.**

User-explicit per-flag overrides on top of a tier are honored: setting
`policy.tier = "default"` and `no_network: true` produces an
isolated-network default-tier node.

## Defense in depth

Stacking patterns for production:

1. **Verify images** (`PERRY_CONTAINER_VERIFY_IMAGES=1`).
2. **Run as non-root** (`user: "nobody"` or numeric UID).
3. **Drop all capabilities, add specific ones back** (`cap_drop:
   ["ALL"]` + minimal `cap_add`).
4. **Read-only root filesystem** (`read_only: true`).
5. **Internal networks for the database side** (`internal: true` on the
   db's network — see [Networking](https://docs.perryts.com/container/networking.html#internal-only-networks-internal-true)).
6. **No published ports for private services** (omit `ports:` on
   internal-only services).
7. **Resource limits** (planned: `mem_limit`, `cpu_limit` on Service).

## See also

- [Compose orchestration](https://docs.perryts.com/container/compose.html) — applying these knobs in a
  stack spec.
- [Production patterns](https://docs.perryts.com/container/production-patterns.html) — Forgejo example
  uses several of these (internal-only db net, published web port,
  USER_UID/GID).
- [Networking](https://docs.perryts.com/container/networking.html) — internal-only networks for
  database isolation.


---

<!-- source: docs/src/container/production-patterns.md -->

# Production Patterns

This page is a guided tour of [`example-code/forgejo-deployment`](https://github.com/PerryTS/perry/tree/main/example-code/forgejo-deployment),
a working production-quality deployment of [Forgejo](https://forgejo.org/)
(self-hosted Git) using the real Forgejo image from the official
`data.forgejo.org` registry. The example was driven end-to-end against
live Docker; the patterns here are what survived.

The full source is at [`example-code/forgejo-deployment/main.ts`](https://github.com/PerryTS/perry/blob/main/example-code/forgejo-deployment/main.ts).
This page documents the *patterns*, not every line.

## Lifecycle: `up + verify + exit 0` then a separate `--down`

Perry's runtime currently does not deliver `process.on('SIGINT', ...)`
to your TS code. So the canonical "Ctrl-C tears down the stack" pattern
isn't writable today. Instead, follow the `docker compose up -d` /
`docker compose down` model: deploy + verify + exit 0, with teardown
behind a separate `--down` invocation:

```typescript,no-test
async function main() {
  const args = process.argv.slice(2);
  const config = buildConfig();
  if (args.includes("--down")) {
    await cmdDown(config);
  } else {
    await cmdUp(config);
  }
}
```

The example's `cmdUp`:

1. Pre-flight backend probe + port-conflict guard.
2. Call `up()` with the canonical spec.
3. Poll readiness probes (postgres `pg_isready`, then forgejo
   `/api/healthz`).
4. Print an operator-facing banner with URLs + "how to tear down".
5. Exit 0. Containers keep running thanks to `restart:
   unless-stopped`.

The example's `cmdDown`:

1. Re-call `up()` with the same spec — idempotent: services already
   running are detected and skipped, returning the same handle the
   original deploy got.
2. Call `down(handle, { volumes: destroy })`. `destroy` is set from
   `FORGEJO_DESTROY_ON_EXIT=1`.

## Two-network split: internal db + public web

The Forgejo example puts postgres on an internal-only network and
forgejo on both that network and a public bridge:

```typescript,no-test
networks: {
  "forgejo-db-net":  { driver: "bridge", internal: true }, // postgres unreachable from host
  "forgejo-web-net": { driver: "bridge" },                 // forgejo's web + SSH ports
},
services: {
  db: {
    networks: ["forgejo-db-net"],
    // no `ports:` — postgres is invisible to the host
  },
  forgejo: {
    networks: ["forgejo-db-net", "forgejo-web-net"],
    ports: ["3000:3000", "2222:22"],  // public web + SSH
  },
},
```

Why: postgres should never be reachable from the host (or from sibling
stacks), but forgejo needs both inbound HTTP from the host AND outbound
DB queries to postgres. Two networks is the cleanest expression of
that split.

## Stable container names for cross-service DNS

Perry's Docker, Podman, and Lima backends register each compose service key
(`db`, `forgejo`) as a network alias. Apple's `container` CLI does not expose
that capability, so `FORGEJO__database__HOST: 'db:5432'` is not portable to
that backend. The Forgejo example pins explicit `container_name` values so the
same spec works everywhere:

```typescript,no-test
const dbHostname      = "forgejo-db";
const forgejoHostname = "forgejo-app";

services: {
  db: {
    image: `postgres:${pgVersion}`,
    container_name: dbHostname,                  // ← stable target
    // …
  },
  forgejo: {
    image: `data.forgejo.org/forgejo/forgejo:${version}`,
    container_name: forgejoHostname,
    environment: {
      FORGEJO__database__HOST: `${dbHostname}:5432`,  // ← refers to it
      // …
    },
  },
},
```

See [Networking → Cross-service DNS](https://docs.perryts.com/container/networking.html#cross-service-dns) for the
backend-specific behavior and strict-mode handling.

## OpenSSH on :22 + `START_SSH_SERVER=false`

Forgejo's official image runs `/usr/sbin/sshd` on container port 22 in
its entrypoint script, then runs the forgejo binary. If you also set
`FORGEJO__server__START_SSH_SERVER=true`, forgejo's Go-based built-in
SSH server tries to bind :22 too — and the container exit-0's with
"bind: address already in use".

The standard Forgejo deployment pattern is to **let OpenSSH handle SSH
on :22 and tell forgejo not to start its own**:

```typescript,no-test
environment: {
  FORGEJO__server__START_SSH_SERVER: "false",   // ← critical
  FORGEJO__server__SSH_PORT:         "2222",    // public host port
  FORGEJO__server__SSH_LISTEN_PORT:  "22",      // container-internal port
  // …
},
```

Forgejo writes git users' authorized_keys to `/data/git/.ssh/`, which
the in-container OpenSSH consumes. Git operations route through sshd on
:22, then forgejo's `gitea-shell` script.

## Healthcheck-gated dependency startup

postgres takes ~5–10 seconds to initialise on first run (initdb +
listener bind). Without gating, forgejo starts immediately, can't
connect, and burns retry budget. The fix is a per-service
`healthcheck` plus `depends_on: { svc: { condition: 'service_healthy'
} }`:

```typescript,no-test
db: {
  image: "postgres:16-alpine",
  // …
  healthcheck: {
    test: ["CMD-SHELL", "pg_isready -U forgejo -d forgejo"],
    interval: "5s",
    timeout: "3s",
    retries: 10,
    start_period: "30s",
  },
},
forgejo: {
  // …
  depends_on: { db: { condition: "service_healthy" } },
},
```

Even with that, the example *also* runs an explicit readiness loop
post-`up()` for the full HTTP `/api/healthz` path — the healthcheck
gates **container startup** but the operator banner shouldn't print
until the API is *serving*:

```typescript,no-test
async function waitForForgejo(stack: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Probe from INSIDE the forgejo container so the docker-proxy
      // bind-up window doesn't trip the host-side curl.
      await exec(stack, "forgejo", [
        "wget", "-q", "-O", "/dev/null",
        "--timeout=2", "--tries=1",
        "http://127.0.0.1:3000/api/healthz",
      ]);
      return true;
    } catch (_e) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}
```

`/api/healthz` is Forgejo's no-auth liveness endpoint that returns 200
once the web server is up AND the database / cache subsystems pinged
successfully. Don't use `/api/v1/version` — when
`REQUIRE_SIGNIN_VIEW=true` (a production-hardening default) it returns
401, and `wget` exits non-zero on HTTP error responses.

## Stable secrets for redeploy

The Forgejo example's `buildConfig()` uses **truthy-fallback** semantics
for env vars (`process.env[name] || fallback`) because Perry's
`process.env[NONEXISTENT]` returns an empty-ish value where strict
equality to `undefined` / `''` doesn't hold:

```typescript,no-test
function envOr(name: string, fallback: string): string {
  return (process.env[name] as string | undefined) || fallback;
}
```

The defaults for the three secret-bearing fields are random hex:

```typescript,no-test
dbPassword:      envOr('FORGEJO_DB_PASSWORD', randomHex(32)),
secretKey:       envOr('FORGEJO_SECRET_KEY',     randomHex(32)),
internalT:       envOr('FORGEJO_INTERNAL_TOKEN', randomHex(52)),
```

This is fine for **first-run** / dev / smoke-test, but **breaks any
subsequent run against the same volumes** because:

- Postgres rows were authored under the prior password — new password
  rejects the connection.
- Forgejo's `/data/gitea/conf/app.ini` is encrypted with the prior
  `SECRET_KEY` — Forgejo can't decrypt it on startup.

For production, **set them to stable values** via an `.env` file or a
secrets manager:

```bash
# .env
FORGEJO_DB_PASSWORD=$(openssl rand -hex 32)
FORGEJO_SECRET_KEY=$(openssl rand -hex 32)
FORGEJO_INTERNAL_TOKEN=$(openssl rand -hex 52)

# deploy.sh
source .env
./forgejo_app
```

Generate once, store in a secrets manager, redeploy as many times as
needed against the same volumes.

## First-run admin user

Forgejo's installer is locked (`INSTALL_LOCK=true`) so the GUI
installer doesn't run on first request. To create the initial admin
user, exec the `forgejo admin user create` CLI inside the container:

```bash
docker exec forgejo-app forgejo admin user create \
  --admin --username root --email root@example.com \
  --random-password
```

The `--random-password` flag prints the generated password to stdout
once — capture it from the docker logs and store it somewhere safe.

## Idempotent redeploy

Running `./forgejo_app` a second time on a healthy stack is a no-op:
`up()` calls `inspect` on each service, sees `running`, and skips. The
operator banner prints immediately and the readiness loops exit fast
because the services are already serving. This is by design — it's
the same property `docker compose up -d` has.

For a "rip and replace" upgrade (new image tag, new env values that
require recreate), do an explicit `--down` first:

```bash
./forgejo_app --down                        # preserve volumes
FORGEJO_VERSION=12 ./forgejo_app            # redeploy with new version
```

The volumes carry forward automatically; `up()` detects the existing
`forgejo-data` and `forgejo-pgdata` volumes via `inspect_volume` and
attaches them to the new containers without re-creating.

## Running it

```bash
# Build perry once
cargo build --release -p perry-runtime -p perry-stdlib -p perry

# Build the example
cd example-code/forgejo-deployment
../../target/release/perry compile main.ts -o forgejo_app

# Deploy
./forgejo_app
# 🔧 Backend: docker
# 🚀 Deploying Forgejo 11 (data.forgejo.org/forgejo/forgejo:11)
# …
# 🎉  Forgejo 11 is up and ready.

# Visit http://localhost:3000/ in a browser.

# Tear down (preserves volumes for redeploy):
./forgejo_app --down

# Tear down + drop volumes (DESTROYS DATA):
FORGEJO_DESTROY_ON_EXIT=1 ./forgejo_app --down
```

## See also

- [Compose orchestration](https://docs.perryts.com/container/compose.html) — `up()` / `down()` reference.
- [Networking](https://docs.perryts.com/container/networking.html) — the internal-net + public-net split.
- [Volumes](https://docs.perryts.com/container/volumes.html) — preservation across `down()`.
- [Security](https://docs.perryts.com/container/security.html) — capability hardening + image
  verification.


---

<!-- source: docs/src/container/determinism.md -->

# Cross-Backend Determinism

Perry can pick from four container runtimes at startup — Docker, Podman,
apple/container, Lima/nerdctl — and the same `ComposeSpec` should
produce **the same outcome** on each of them. This page describes how
Perry guarantees that across CLIs that diverge sharply in flag shape
and feature support.

> **TL;DR**: Each backend declares its real capabilities in a typed
> table. Specs run through a normalization pass that drops fields the
> backend can't honor (with explicit warnings) before the CLI sees
> them. A conformance test suite makes "do all backends behave the
> same?" a CI-blocking check, not a runtime surprise.

## The problem

A `ComposeSpec` written for Docker that sets `privileged: true` and
`seccomp: "/etc/seccomp.json"` is meaningless on apple/container — the
runtime has no concept of privileged mode and no syscall-filter
profiles. Pre-v0.5.374 Perry handled this in two failure modes:

- **Silent rejection** — the CLI errored with an opaque
  `unknown flag --privileged` and the user spent half an hour
  hunting through Perry's source.
- **Silent downgrade** — Perry's apple protocol simply didn't emit
  the flag, and the user got a *less secure* container than they
  asked for, with no signal that the policy wasn't honored.

Both are unacceptable for production.

## The architecture

**Four orthogonal layers**, each with a single responsibility:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Conformance test suite                            │
│  "do all backends behave the same?"  → CI-blocking          │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Spec normalization + EnforcementMode              │
│  "drop / translate / hard-reject features the backend       │
│   can't honor before they reach the CLI"                    │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: BackendCapabilities (declared support, 20 axes)   │
│  Native / Emulated / Partial(reason) / Unsupported          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Backend selection (FOUR mechanisms)               │
│  1. Auto-detect via platform priority [default]             │
│  2. PERRY_CONTAINER_BACKEND env var [process]               │
│  3. setBackend(name) [TS-runtime]                           │
│  4. selectBackendFor(spec) [capability-match]               │
└─────────────────────────────────────────────────────────────┘
```

### 0. Backend selection — four mechanisms, caller chooses

| # | Mechanism | When | API |
|---|---|---|---|
| 1 | Auto-detect | "just work" | walks platform priority list on first use |
| 2 | Env var | process-level pin | `PERRY_CONTAINER_BACKEND=docker ./app` |
| 3 | Programmatic pin | TS-runtime override before first op | `await setBackend('podman')` |
| 4 | Capability-aware | pick the best backend **for the spec** | `JSON.parse(selectBackendFor(JSON.stringify(spec)))` |

The four mechanisms compose. The most common production pattern combines (4) and (3):

```typescript,no-test
import { selectBackendFor, setBackend, up } from 'perry/container';

const best = JSON.parse(selectBackendFor(JSON.stringify(spec))) as string;
// privileged: true rules out apple/container → returns "docker"
// trivial spec on macOS → returns "apple/container"

await setBackend(best);
await up(spec);
```

**`selectBackendFor` is pure** — no probes, no daemon checks, no
filesystem access. Same `(spec, mode)` always returns the same name.
Three strictness modes:

| Mode | What counts as "supported" |
|---|---|
| `"strict-native"` | Only `Native` |
| `"accept-emulated"` (default) | `Native` + `Emulated` |
| `"accept-partial"` | `Native` + `Emulated` + `Partial(reason)` |

`StrictNative` is for production parity. `AcceptEmulated` is the
sensible default. `AcceptPartial` is for dev / "just make it run."

**Companion APIs:**

```typescript,no-test
// "What backend is currently active?"
console.log(getBackend());                                // "docker"

// "What's the platform's auto-detect probe order?" (compile-time, no probes)
console.log(JSON.parse(getBackendPriority()));            // ["apple/container", ...]

// "Which backends are installed and reachable?" (probes ALL candidates)
const all = JSON.parse(await getAvailableBackends()) as BackendInfo[];
//   length === getBackendPriority().length
//   ordered by priority
//   `available: true` on the ones that probe cleanly, `available: false`
//   + `reason` on the rest
const ready = all.filter(b => b.available);

// "Try them in order — first available wins." (mutates singleton)
await setBackends(ready.map(b => b.name));

// "What does detect_backend() return?" (asymmetric — short-circuits on
// first success and returns just the winner, or full failure list on
// no-match). Keep `getAvailableBackends()` for diagnostics; use
// `detectBackend()` when you only care about the active backend.
console.log(JSON.parse(await detectBackend()));           // BackendInfo[]
```

### 1. `BackendCapabilities` — declared support, not assumed parity

Each protocol publishes a `BackendCapabilities` constant naming its
real support per axis. Field names are stable across backends — values
diverge.

```rust
pub struct BackendCapabilities {
    pub backend: &'static str,
    pub privileged: FeatureSupport,
    pub seccomp_profile: FeatureSupport,
    pub no_new_privileges: FeatureSupport,
    pub linux_capabilities: FeatureSupport,
    pub read_only_rootfs: FeatureSupport,
    pub run_as_user: FeatureSupport,
    pub network_alias: FeatureSupport,
    pub user_defined_bridge: FeatureSupport,
    pub internal_network: FeatureSupport,
    pub ipc_namespace_share: FeatureSupport,
    pub pid_namespace_share: FeatureSupport,
    pub restart_policy: FeatureSupport,
    pub healthcheck_native: FeatureSupport,
    pub rm_on_exit: FeatureSupport,
    pub named_volumes: FeatureSupport,
    pub bind_mounts: FeatureSupport,
    pub selinux_mount_labels: FeatureSupport,
    pub tmpfs_mounts: FeatureSupport,
    pub image_signature_verify: FeatureSupport,
    pub multi_arch_pull: FeatureSupport,
}

pub enum FeatureSupport {
    Native,                    // tested + emitted as-is
    Emulated,                  // engine emulates host-side
    Unsupported,               // dropped + warning
    Partial(&'static str),     // limited subset; reason documented
}
```

The actual support matrix at v0.5.374:

| Feature | Docker | Podman | apple/container | Lima |
|---|---|---|---|---|
| `privileged` | Native | Native | **Unsupported** | Native |
| `seccomp_profile` | Native | Native | **Unsupported** | Native |
| `no_new_privileges` | Native | Native | **Unsupported** | Native |
| `linux_capabilities` | Native | Native | Native | Native |
| `read_only_rootfs` | Native | Native | Native | Native |
| `run_as_user` | Native | Native | Native | Native |
| `network_alias` | Native | Native | **Unsupported** | Native |
| `user_defined_bridge` | Native | Native | Partial *(needs `container system start`)* | Native |
| `internal_network` | Native | Native | **Unsupported** | Native |
| `ipc_namespace_share` | Native | Native | **Unsupported** | Native |
| `pid_namespace_share` | Native | Native | **Unsupported** | Native |
| `restart_policy` | Native | Native | **Emulated** | Partial *(only `always` / `on-failure`)* |
| `healthcheck_native` | Native | Native | **Emulated** | Native |
| `rm_on_exit` | Native | Native | Native | Native |
| `named_volumes` | Native | Native | Native | Native |
| `bind_mounts` | Native | Native | Native | Native |
| `selinux_mount_labels` | Native | Native | **Unsupported** | Native |
| `tmpfs_mounts` | Native | Native | Native | Native |
| `image_signature_verify` | Native | Native | **Emulated** | Native |
| `multi_arch_pull` | Native | Native | Native | Partial *(nerdctl <1.7 limited)* |

Each protocol returns its constant from a `capabilities()` method:

```rust
impl CliProtocol for AppleContainerProtocol {
    fn capabilities(&self) -> &'static BackendCapabilities {
        &BackendCapabilities::APPLE
    }
    // ... arg builders
}
```

### 2. Spec normalization — drop unsupported fields before emit

[`CliBackend::run_with_security`](https://github.com/PerryTS/perry/blob/main/crates/perry-container-compose/src/backend.rs)
runs the normaliser **before** the protocol's `run_args()`:

```rust
let caps = self.protocol.capabilities();
let mut normalised = spec.clone();
let warnings = normalise_spec_for(caps, name, &mut normalised);
for w in &warnings {
    tracing::warn!(
        target: "perry::container::normalise",
        backend = w.backend, service = %w.service,
        field = w.field, reason = %w.reason,
        "spec field dropped/translated for backend"
    );
}
let args = self.protocol.run_args(&normalised); // <-- clean spec
```

The normaliser is **idempotent** — calling it twice on the same spec
yields the same result. It produces a `Vec<NormalizationWarning>`:

```rust
pub struct NormalizationWarning {
    pub backend: &'static str,
    pub service: String,
    pub field: &'static str,
    pub action: NormalizationAction,
    pub reason: String,
}

pub enum NormalizationAction {
    Dropped,                                       // field removed
    Translated { from: String, to: String },       // mapped to equivalent
    EmulatedHost,                                  // engine emulates instead
}
```

### 3. Enforcement mode — pick how warnings are surfaced

```rust
pub enum EnforcementMode {
    Lenient,    // default — silent tracing::warn!
    WarnUser,   // surface to TS console.warn
    Strict,     // unsupported field → hard up() failure
}
```

Production deploys that demand cross-backend parity set `Strict`.
The user opt-in says "fail if my deploy can't be reproduced exactly
across backends." Default is `Lenient` for ergonomics.

## The conformance test suite

[`tests/conformance.rs`](https://github.com/PerryTS/perry/blob/main/crates/perry-container-compose/tests/conformance.rs)
runs the **same questions against all four protocols** (19 tests).
Three categories:

### Universals — every backend MUST emit these

```rust
#[test]
fn universal_run_emits_image() {
    for (name, proto) in all_protocols() {
        let spec = baseline_spec();
        let args = proto.run_args(&spec);
        assert!(args.iter().any(|a| a == &spec.image),
                "{name}: run_args must include image; got {:?}", args);
    }
}
```

Same shape for `name`, `ports`, `volumes`, `env`, `labels`, `network-alias`,
`remove --force`, `logs --tail N`, `inspect <id>`, `pull <ref>`. A
protocol that drops one of these is fundamentally broken.

### Capability-gated — declared support is enforced

```rust
#[test]
fn capability_apple_drops_privileged_via_normalization() {
    let mut spec = ContainerSpec {
        image: "alpine".into(),
        privileged: Some(true),
        ..Default::default()
    };
    let warnings =
        normalise_spec_for(&BackendCapabilities::APPLE, "svc", &mut spec);
    assert_eq!(spec.privileged, None);
    assert_eq!(warnings.len(), 1);
}
```

### Output normalization — same shape regardless of backend

```rust
#[test]
fn parse_list_output_returns_unified_container_info_shape() {
    // Docker shape (NDJSON line)
    let docker = DockerProtocol.parse_list_output(/* docker JSON */).unwrap();
    // Apple shape (JSON array of `configuration`-wrapped objects)
    let apple = AppleContainerProtocol.parse_list_output(/* apple JSON */).unwrap();
    // Both produce ContainerInfo with the same field semantics:
    assert_eq!(docker[0].id, apple[0].id);
    assert_eq!(docker[0].image, apple[0].image);
}
```

User code reading `info.status` sees `"running"` from any backend — not
`"Up 5 seconds"` from docker vs `"running"` from apple.

## What this guarantees

Given the same `ComposeSpec`:

- **Same names** — project-namespaced container/volume/network names are
  computed at the engine layer above protocols, so they're invariant.
- **Same DNS on capable backends** — service-key cross-container resolution
  via `--network-alias` works identically on Docker, Podman, and Lima.
  `apple/container` does not expose network aliases, so Perry warns and drops
  them (or rejects the plan in strict mode); use an explicit `container_name`
  when the same compose file must also run there.
- **Same labels** — `perry.compose.project` + `perry.compose.spec_hash`
  on every container, so cleanup-by-project + spec-drift detection
  work uniformly.
- **Same `ContainerInfo` shape** from `inspect` / `list` — code that
  reads `info.status` or `info.image` works regardless of which backend
  emitted the JSON.
- **Best-effort security flag parity** — features that land natively
  are emitted; features the backend can't honor are either translated,
  dropped with explicit warning, or hard-failed (under
  `EnforcementMode::Strict`).

## What it does NOT solve

| Out of scope | Why | Where it's handled |
|---|---|---|
| Daemon running, plugin loaded | Operational state, not feature state | `check_available()` at probe time |
| Startup latency, I/O speed | Performance differs across runtimes | User chooses backend per workload |
| Image registry auth | Each runtime owns its own credential helper | Runtime-local; Perry doesn't bridge |

## Adding a new backend

The architecture turns "add backend X" into a contained checklist:

1. Add a new `pub struct XProtocol;` to `backend.rs`.
2. Implement `CliProtocol` for it — `run_args`, `parse_list_output`, etc.
3. Add a `BackendCapabilities::X` constant in `capabilities.rs`,
   honestly declaring which features X supports.
4. Override `capabilities()` on the protocol to return that constant.
5. Register the backend in `platform_candidates()` and `probe_candidate()`.
6. Add the protocol to `tests/conformance.rs::all_protocols()`.

The conformance suite immediately catches "I forgot to emit `--name`"
or "my `inspect_args` doesn't end with the id" — surfacing protocol
gaps as test failures rather than runtime surprises in user code.

## Further reading

- [Container overview](https://docs.perryts.com/container/overview.html) — public API and backend selection.
- [`crates/perry-container-compose/src/capabilities.rs`](https://github.com/PerryTS/perry/blob/main/crates/perry-container-compose/src/capabilities.rs) —
  full source.
- [`crates/perry-container-compose/tests/conformance.rs`](https://github.com/PerryTS/perry/blob/main/crates/perry-container-compose/tests/conformance.rs) —
  the 19-test suite.
