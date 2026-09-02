<!-- Perry docs bundle: stdlib.md -->
<!-- Canonical online source: https://docs.perryts.com/ -->

<!-- source: docs/src/stdlib/overview.md -->

# Standard Library Overview

Perry compiles supported npm packages and Node.js APIs to native code — no
JavaScript runtime involved. Shared runtime APIs have native implementations;
ordinary JavaScript and TypeScript dependencies should be compiled from their
upstream source.

## How It Works

```typescript
import fastify from "fastify"
import mysql from "mysql2/promise"
```

Perry recognizes these imports at compile time. Today, many route to
standalone `perry-ext-*` Rust compatibility shims backed by the stable
[`perry-ffi` ABI](https://docs.perryts.com/native-libraries/abi.html); a few older Node.js built-ins
still live in `perry-stdlib`. These shims expose documented supported surfaces
and remain available during migration, but most ordinary packages are intended
to move to upstream-source compilation. See the
[binding governance inventory](https://docs.perryts.com/native-libraries/governance.html) for each
crate's disposition and
[zero-config bindings and faithfulness](https://docs.perryts.com/native-libraries/zero-config-and-faithfulness.html)
for compatibility guarantees.

## Supported Packages

### Networking & HTTP
- **node:http** / **node:https** / **node:http2** — Node.js stdlib HTTP server modules + WebSocket upgrade dispatch (issue #577). The full `IncomingMessage` / `ServerResponse` surface plus TLS via rustls and HTTP/2 via ALPN. See [HTTP & Networking](https://docs.perryts.com/stdlib/http.html#nodejs-compatibility--nodehttp--nodehttps--nodehttp2).
- **hono** — runtime-agnostic web framework. `app.fetch` works end-to-end via `compilePackages`, and long-lived native servers can adapt it through `node:http` or `@perryts/hono-server`. See [HTTP & Networking → Hono](https://docs.perryts.com/stdlib/http.html#hono); the old link gap was closed in [#589](https://github.com/PerryTS/perry/issues/589).
- **fastify** — HTTP server framework (native binding, separate from node:http).
- **axios** — HTTP client.
- **node-fetch** / **fetch** — HTTP fetch API.
- **ws** — WebSocket client/server.

### Databases
- **mysql2** — MySQL client
- **pg** — PostgreSQL client
- **bun:sqlite** / **node:sqlite** / **better-sqlite3** — SQLite, backed by Perry's native engine
- **mongodb** — MongoDB client
- **ioredis** / **redis** — Redis client

### Cryptography
- **bcrypt** — Password hashing
- **argon2** — Password hashing (Argon2)
- **jsonwebtoken** — JWT signing/verification
- **crypto** — Node.js crypto module
- **ethers** — Ethereum library

### Utilities
- **lodash** — Utility functions
- **dayjs** / **moment** — Date manipulation
- **uuid** — UUID generation
- **nanoid** — ID generation
- **validator** — String validation

### CLI & Data
- **commander** — CLI argument parsing
- **decimal.js** — Arbitrary precision decimals
- **bignumber.js** — Big number math
- **lru-cache** — LRU caching

### Other
- **sharp** — Image processing
- **cheerio** — HTML parsing
- **nodemailer** — Email sending
- **zlib** — Compression
- **cron** — Job scheduling
- **worker_threads** — Background workers
- **exponential-backoff** — Retry logic
- **async_hooks** — AsyncLocalStorage
- **perry/container** — OCI container management
- **perry/compose** — Multi-container orchestration

### Node.js Built-ins
- **fs** — File system
- **path** — Path manipulation
- **child_process** — Process spawning
- **crypto** — Cryptographic functions

## Binary Size

Perry automatically detects which stdlib features your code uses:

| Usage | Binary Size |
|-------|-------------|
| No stdlib imports | ~300KB |
| fs + path only | ~3MB |
| Full stdlib | ~48MB |

The compiler links only the required runtime components.

### External native bindings

Two packages live in their own GitHub repos with their own semver but
plug into the same well-known registry:

- **`@perryts/tursodb`** — Turso (libSQL fork) database client.
  [PerryTS/tursodb-bindings](https://github.com/PerryTS/tursodb-bindings).
- **`@perryts/iroh`** — Iroh peer-to-peer networking.
  [PerryTS/iroh-bindings](https://github.com/PerryTS/iroh-bindings).

Pure-TypeScript drivers compiled via `compilePackages` (no Rust):

- **`@perryts/postgres`** — pg-compatible wire-protocol driver.
- **`@perryts/mysql`** — mysql2-compatible wire-protocol driver.
- **`@perryts/mongodb`** — mongodb-compatible wire-protocol driver.
- **`@perryts/redis`** — Redis / Valkey RESP2 + RESP3 wire-protocol driver.

Each of these also runs unmodified on Node.js / Bun. See
[Native Bindings — Overview](https://docs.perryts.com/native-libraries/overview.html) for
the contract they follow.

## compilePackages

For npm packages not natively supported, you can compile pure TypeScript/JavaScript packages natively:

```json
{
  "perry": {
    "compilePackages": ["@noble/curves", "@noble/hashes"]
  }
}
```

See [Project Configuration](https://docs.perryts.com/getting-started/project-config.html) for details.

## JavaScript Runtime Fallback

For packages that can't be compiled natively (native addons, dynamic code, etc.), Perry includes a QuickJS-based JavaScript runtime as a fallback. The exact API surface is internal-only today; the import below is illustrative:

```text
import { jsEval } from "perry/jsruntime"; // illustrative — not yet a public export
```

## Next Steps

- [File System](https://docs.perryts.com/stdlib/fs.html)
- [HTTP & Networking](https://docs.perryts.com/stdlib/http.html)
- [Databases](https://docs.perryts.com/stdlib/database.html)
- [Cryptography](https://docs.perryts.com/stdlib/crypto.html)
- [Containers](https://docs.perryts.com/stdlib/container.html)
- [Utilities](https://docs.perryts.com/stdlib/utilities.html)
- [Other Modules](https://docs.perryts.com/stdlib/other.html)


---

<!-- source: docs/src/stdlib/fs.md -->

# File System

Perry implements Node.js file system APIs for reading, writing, and managing files.

## Reading Files

```typescript
const configPath = join(scratch, "config.json")
const content = readFileSync(configPath, "utf-8")
console.log(content)
```

### Binary File Reading

```typescript
const imagePath = join(scratch, "image.png")
const buffer = fs.readFileBuffer(imagePath)
console.log(`Read ${buffer.length} bytes`)
```

`readFileBuffer` reads files as binary data (uses `fs::read()` internally, not `read_to_string()`).

## Writing Files

```typescript
const outputPath = join(scratch, "output.txt")
const dataPath = join(scratch, "data.json")
writeFileSync(outputPath, "Hello, World!")
writeFileSync(dataPath, JSON.stringify({ key: "value" }, null, 2))
```

## File Information

```typescript
if (existsSync(configPath)) {
    const stat = statSync(configPath)
    console.log(`Size: ${stat.size}`)
}
```

## Directory Operations

```typescript
// Create directory
const outDir = join(scratch, "output")
if (!existsSync(outDir)) mkdirSync(outDir)

// Read directory contents
const files = readdirSync(scratch)
for (const file of files) {
    console.log(file)
}

// Remove an empty directory
rmdirSync(outDir)
```

For recursive removal Perry exposes `rmRecursive` (a thin wrapper around
`std::fs::remove_dir_all`). Wired via
[#193](https://github.com/PerryTS/perry/issues/193) through
`js_fs_rm_recursive` in the LLVM backend.

```typescript,no-test
import { rmRecursive } from "fs";
rmRecursive("output"); // Recursive remove; returns 1 on success, 0 on failure.
```

## Path Utilities

```typescript
const dir = dirname(configPath)
const cfgPath = join(dir, "config.json")
const name = basename(cfgPath)        // "config.json"
const abs = resolve("relative/path")  // Absolute path
console.log(`${name} ${abs.length > 0}`)
```

For `import.meta.url` → filesystem path conversion, use `fileURLToPath` from
the `url` module:

```text
import { fileURLToPath } from "url";
import { dirname } from "path";

const dir = dirname(fileURLToPath(import.meta.url));
```

## Threading

`fs` numeric file descriptors and `fs.promises.FileHandle` objects are
thread-affine across `perry/thread`. Passing a numeric fd into `spawn` or
`parallelMap` copies only the number; the receiving thread has its own fd
registry, so operations fail with `EBADF`. Passing a `FileHandle` produces a
detached handle with `fd === -1`.

Pass file paths across thread boundaries and reopen files inside the worker.

## Next Steps

- [HTTP & Networking](https://docs.perryts.com/stdlib/http.html)
- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules


---

<!-- source: docs/src/stdlib/http.md -->

# HTTP & Networking

Perry natively implements HTTP servers, clients, and WebSocket support.

## Node.js compatibility — `node:http` / `node:https` / `node:http2`

Perry exposes a faithful subset of Node.js's stdlib HTTP server modules
on top of hyper + rustls + tokio-tungstenite. The whole shape — handler
signature, IncomingMessage / ServerResponse properties + methods,
TLS opts, ALPN-negotiated HTTP/2, WebSocket upgrade dispatch — works
unmodified, so unmodified Node servers (Express / Koa / Polka / hono via
`@hono/node-server` / etc.) compile and run natively (issue #577).

### `http.createServer(handler)`

```typescript,no-test
// node:http server (issue #577). Drop-in for Node.js's `http.createServer`
// — same handler shape `(req, res) => …` and same property/method
// surface (`req.method`, `req.url`, `req.headers`, `res.statusCode`,
// `res.setHeader`, `res.end`, `res.write`, `res.writeHead`). The
// canonical Express body-collection pattern (`req.on('data', ...)`,
// `req.on('end', ...)`) works against a fully-buffered request body.
import { createServer } from "node:http"

const httpServer = createServer((req: any, res: any) => {
    if (req.method === "POST" && req.url === "/echo") {
        let chunks: string[] = []
        req.on("data", (chunk: string) => chunks.push(chunk))
        req.on("end", () => {
            const body = chunks.join("")
            res.statusCode = 200
            res.setHeader("Content-Type", "text/plain")
            res.end("got:" + body)
        })
        return
    }
    res.statusCode = 200
    res.setHeader("Content-Type", "application/json")
    res.end(`{"path":"${req.url}"}`)
})

httpServer.listen(3000, () => {
    console.log("[node:http] listening on http://0.0.0.0:3000")
})
```

Supported on `IncomingMessage`: `.method`, `.url`, `.headers`,
`.rawHeaders`, `.httpVersion`, `.complete`, `.aborted`, `.destroyed`,
`.socket.remoteAddress`, `.socket.remotePort`, `.on('data'|'end'|'close'|
'error', cb)`, `.read()`, `.pause()`, `.resume()`, `.destroy()`.

Supported on `ServerResponse`: `.statusCode` (get/set),
`.statusMessage` (set), `.setHeader/.getHeader/.removeHeader/.hasHeader/
.getHeaders/.getHeaderNames`, `.headersSent`, `.writableEnded`,
`.writableFinished`, `.writeHead(status, msg?, headers?)`,
`.write(chunk)`, `.end(chunk?)`, `.flushHeaders()`,
`.on('finish'|'close', cb)`. Auto Content-Length on `.end()` when no
`Transfer-Encoding` was set.

### `https.createServer({ key, cert }, handler)`

```typescript,no-test
// node:https server (issue #577 Phase 2). Same handler surface as
// `node:http`, plus a `{ key, cert }` opts arg with PEM-encoded TLS
// material. rustls 0.23 underneath; the CryptoProvider is installed
// lazily on first `https.createServer` call. ALPN defaults to
// `http/1.1`; opt into HTTP/2 by passing
// `alpnProtocols: ["h2", "http/1.1"]` (or use `node:http2` directly).
import { createServer as createTlsServer } from "node:https"
import { readFileSync } from "node:fs"

const tlsServer = createTlsServer(
    {
        key: readFileSync("/tmp/perry-https-cert/key.pem", "utf8"),
        cert: readFileSync("/tmp/perry-https-cert/cert.pem", "utf8"),
    },
    (req: any, res: any) => {
        res.statusCode = 200
        res.setHeader("Content-Type", "application/json")
        res.end(`{"tls":"ok","path":"${req.url}"}`)
    }
)

tlsServer.listen(443)
```

Both `key` and `cert` are PEM strings (PKCS#8 / RSA / EC keys + multi-cert
chains all parse). ALPN defaults to `http/1.1` only — programs that want
HTTP/2 should reach for `node:http2`'s `createSecureServer` (which always
advertises `[h2, http/1.1]`).

### `http2.createSecureServer({ key, cert }, handler)`

```typescript,no-test
// node:http2 server (issue #577 Phase 3). `createSecureServer({ key, cert })`
// drives a hyper-util auto::Builder so HTTP/2 and HTTP/1.1 share a
// single port via ALPN auto-negotiation. The handler signature is
// the same as Phase 1 / Phase 2 — IncomingMessage / ServerResponse
// are reused as Http2ServerRequest / Http2ServerResponse since each
// `:path` request becomes a single buffered IncomingMessage.
import { createSecureServer } from "node:http2"

const h2Server = createSecureServer(
    {
        key: readFileSync("/tmp/perry-https-cert/key.pem", "utf8"),
        cert: readFileSync("/tmp/perry-https-cert/cert.pem", "utf8"),
    },
    (req: any, res: any) => {
        res.statusCode = 200
        res.setHeader("Content-Type", "application/json")
        res.end(`{"h2":"ok","path":"${req.url}","httpVersion":"${req.httpVersion}"}`)
    }
)

h2Server.listen(8443)
```

Driven through `hyper-util`'s `auto::Builder`, so an HTTP/1.1 client
(curl without `--http2`) and an HTTP/2 client (curl with `--http2`)
hit the same handler over the same port.

### WebSocket upgrade — `Server.on('upgrade', (req, wsId, head) => …)`

```typescript,no-test
// node:http + WebSocket upgrade (issue #577 Phase 4). The `'upgrade'`
// event fires once per WebSocket client; the `wsId` argument is
// already a fully-handshaked, perry-ext-ws-registered connection,
// so the usual `wsId.on('message', ...)` / `wsId.send(...)` /
// `wsId.close()` surface works without further plumbing. The
// IncomingMessage `req` carries the original upgrade request
// (URL, headers — useful for routing or auth).
const wsHttpServer = createServer((req: any, res: any) => {
    res.statusCode = 200
    res.end("perry node:http server with ws upgrade")
})

wsHttpServer.on("upgrade", (req: any, wsId: any, _head: any) => {
    wsId.on("message", (msg: string) => {
        wsId.send("echo:" + msg)
    })
    wsId.send("perry-hello")
})

wsHttpServer.listen(3001)
```

The HTTP/1.1 server detects `Upgrade: websocket` in the request,
performs the handshake server-side (Sec-WebSocket-Accept derived via
tungstenite's `derive_accept_key`), then registers the upgraded stream
in perry-ext-ws's connection map. The TS-side `wsId` argument is
already a fully-connected client — drive it via the standard
`wsId.on('message', cb)` / `wsId.send(msg)` / `wsId.close()` surface
that standalone `WebSocketServer({ port })` clients use.

## Hono

[Hono](https://hono.dev/) is a runtime-agnostic web framework whose only
required interface is `app.fetch(req: Request) → Promise<Response>`. Add
it to `perry.compilePackages` and the entire `app.fetch` surface
including middleware (`hono/logger`, `hono/cors`, `hono/jwt`), route
groups, and JSON responses works unchanged (issues #421, #486, #487
closed). `app.fetch` is enough for testing, edge-runtime deployments
(Cloudflare Workers / Vercel Edge / AWS Lambda / Deno Deploy — those
runtimes call `app.fetch` themselves), and any scenario where some
outer host hands you a `Request`.

```typescript,no-test
import { Hono } from "hono"
import { logger } from "hono/logger"

const app = new Hono()
app.use("*", logger())
app.get("/", (c) => c.json({ message: "hello", ok: true }))

// app.fetch() works end-to-end — feed it a Request, get a Response.
const res = await app.fetch(new Request("http://localhost/"))
console.log(res.status, await res.text())

export default app  // for CF Workers / similar runtimes
```

`package.json`:

```json
{
  "perry": {
    "compilePackages": ["hono"]
  }
}
```

### Long-lived HTTP server (port-listening)

The canonical "deploy a hono app as a native binary on a Linux VM"
pattern compiles and links on a stock Perry binary. A hand-rolled
`node:http` adapter that drives `app.fetch` works directly:

```typescript,no-test
import { createServer } from "node:http";

const server = createServer((req, res) => {
  const headers = new Headers();
  headers.set("content-type", "text/plain");
  const fetchReq = new Request(`http://localhost${req.url}`, { method: req.method });
  // ... await app.fetch(fetchReq), then copy status/headers/body onto `res`.
  res.end("ok");
});
server.listen(3000);
```

The `node:http` server FFIs and the Web Fetch `Headers` / `Request` /
`Response` constructors now link together (issues #589, #1652). For a
turnkey adapter, prefer [perry's Fastify binding](#fastify-server) with a
single catch-all route delegating to `app.fetch`.

### `@perryts/hono-server`

`@perryts/hono-server` (in-tree at `packages/hono-perry-server`) packages that
catch-all-over-Fastify shim as Hono's standard `serve({ fetch, port })`
contract — the Perry counterpart to `@hono/node-server` / `@hono/bun`:

```typescript,no-test
import { Hono } from "hono"
import { serve } from "@perryts/hono-server"

const app = new Hono()
app.get("/", (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`listening on :${info.port}`)
})
```

It translates each Fastify request into a Web `Request`, awaits `app.fetch`,
and copies the `Response`'s status / headers / body back onto the reply.
Requires Perry ≥ 0.5.1027 (`Request.headers`, #1649). The adapter shipped
under closed issue #1654.

## Fastify Server

```typescript,no-test
import fastify from "fastify"

const app = fastify()

app.get("/", async (request: any, reply: any) => {
    return { hello: "world" }
})

app.get("/users/:id", async (request: any, reply: any) => {
    const id = request.params.id
    return { id, name: "User " + id }
})

app.post("/data", async (request: any, reply: any) => {
    const body = request.body
    reply.code(201)
    return { received: body }
})

app.listen({ port: 3000 }, () => {
    console.log("Server running on port 3000")
})
```

Perry's Fastify implementation is API-compatible with the npm package. Routes, request/reply objects, params, query strings, and JSON body parsing all work.

## Fetch API

```typescript,no-test
async function fetchExamples(): Promise<void> {
    // GET request
    const response = await fetch("https://jsonplaceholder.typicode.com/posts/1")
    const data = await response.json()

    // POST request
    const result = await fetch("https://jsonplaceholder.typicode.com/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "hello", body: "world", userId: 1 }),
    })

    console.log(`fetch ok: ${data !== null} status=${result.status}`)
}
```

## Axios

```typescript,no-test
import axios from "axios"

async function axiosExamples(): Promise<void> {
    const getResp = await axios.get("https://jsonplaceholder.typicode.com/users/1")
    const data = getResp.data

    const response = await axios.post("https://jsonplaceholder.typicode.com/users", {
        name: "Perry",
        email: "perry@example.com",
    })

    console.log(`axios ok: ${data !== null} status=${response.status}`)
}
```

## WebSocket

```typescript,no-test
import { WebSocket } from "ws"

function wsExample(): void {
    const ws = new WebSocket("ws://localhost:8080")

    ws.on("open", () => {
        ws.send("Hello, server!")
    })

    ws.on("message", (data: any) => {
        console.log(`Received: ${data}`)
    })

    ws.on("close", () => {
        console.log("Connection closed")
    })
}
```

## AWS S3 / S3-Compatible Object Storage

[`@bradenmacdonald/s3-lite-client`](https://github.com/bradenmacdonald/s3-lite-client) is a zero-dependency, MIT-licensed S3 client (~1.9k LoC, derived from the official MinIO JS client without the lodash/async/xml2js baggage). It compiles natively under `perry.compilePackages` with no patches required — verified against a SigV4 presigned-URL byte-for-byte match with `bun` (issue #551).

```json
{
  "perry": {
    "compilePackages": ["@bradenmacdonald/s3-lite-client"]
  }
}
```

```typescript,no-test
import { S3Client } from "@bradenmacdonald/s3-lite-client"

const s3 = new S3Client({
    endPoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    bucket: "my-bucket",
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
})

// Presigned GET URL (no network I/O — pure SigV4 signing)
const url = await s3.presignedGetObject("path/to/object.png", { expirySeconds: 3600 })
console.log(url)

// Upload bytes
await s3.putObject("path/to/object.txt", "hello world", {
    metadata: { "x-amz-acl": "public-read" },
})

// Stream a download — returns a standard fetch Response
const res = await s3.getObject("path/to/object.txt")
console.log(await res.text())

// Head / Delete / List
const meta = await s3.statObject("path/to/object.txt")
console.log(meta.size, meta.lastModified)

for await (const obj of s3.listObjects({ prefix: "path/to/" })) {
    console.log(obj.key, obj.size)
}

await s3.deleteObject("path/to/object.txt")
```

Same code works against any S3-compatible service — only `endPoint` changes:

| Service | `endPoint` |
|---------|-----------|
| AWS S3 | `https://s3.<region>.amazonaws.com` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |
| MinIO | `http://localhost:9000` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` |
| DigitalOcean Spaces | `https://<region>.digitaloceanspaces.com` |
| Supabase Storage | `https://<project>.supabase.co/storage/v1/s3` |
| LocalStack (testing) | `http://localhost:4566` |

The full SigV4 signing chain (Web Crypto HMAC-SHA-256 + SHA-256, TextEncoder, URLSearchParams, Headers iteration, typed-array byte marshalling) is exercised end-to-end. Read paths (`getObject`, `statObject`, `deleteObject`, `listObjects`, `presignedGetObject`, `presignedPostObject`) are verified byte-identical to `bun` against pinned test vectors and will authenticate against real S3.

Multipart uploads (`putObject` with a `ReadableStream` source large enough to chunk) exercise additional surface — `WritableStream` / `TransformStream` subclassing per #562 — that path compiles but isn't independently verified against pinned vectors here.

For the AWS SDK v3 (`@aws-sdk/client-s3`): Perry currently can't compile it. Its dependency tree pulls in `@smithy/*` and runtime middleware registration that uses `Proxy` and dynamic property assignment, neither of which is in Perry's [TypeScript subset](https://docs.perryts.com/language/limitations.html). `@bradenmacdonald/s3-lite-client` covers the same surface (Put/Get/Head/Delete/List/presign + multipart) for almost every real-world need.

## Next Steps

- [Databases](https://docs.perryts.com/stdlib/database.html)
- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules


---

<!-- source: docs/src/stdlib/database.md -->

# Databases

Perry natively implements clients for MySQL, PostgreSQL, SQLite, MongoDB, and Redis.

## MySQL

```typescript
import mysql from "mysql2/promise"

async function mysqlExample(): Promise<void> {
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "password",
        database: "mydb",
    })

    const [rows] = await connection.execute("SELECT * FROM users WHERE id = ?", [1])
    console.log(rows)

    await connection.end()
}
```

## PostgreSQL

```typescript
import { Client } from "pg"

async function postgresExample(): Promise<void> {
    const client = new Client({
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "password",
        database: "mydb",
    })

    await client.connect()
    const result = await client.query("SELECT * FROM users WHERE id = $1", [1])
    console.log(result.rows)
    await client.end()
}
```

## SQLite

```typescript
import Database from "better-sqlite3"

function sqliteExample(): void {
    const db = new Database("mydb.sqlite")

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `)

    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
    insert.run("Perry", "perry@example.com")

    const users = db.prepare("SELECT * FROM users").all()
    console.log(users)
}
```

## MongoDB

```typescript
import { MongoClient } from "mongodb"

async function mongoExample(): Promise<void> {
    const client = new MongoClient("mongodb://localhost:27017")
    await client.connect()

    const db = client.db("mydb")
    const users = db.collection("users")

    await users.insertOne({ name: "Perry", email: "perry@example.com" })
    const user = await users.findOne({ name: "Perry" })
    console.log(user)

    await client.close()
}
```

## Redis

```typescript
import Redis from "ioredis"

async function redisExample(): Promise<void> {
    const redis = new Redis()

    await redis.set("key", "value")
    const value = await redis.get("key")
    console.log(value) // "value"

    await redis.del("key")
    await redis.quit()
}
```

## Next Steps

- [Cryptography](https://docs.perryts.com/stdlib/crypto.html)
- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules


---

<!-- source: docs/src/stdlib/crypto.md -->

# Cryptography

Perry natively implements password hashing, JWT tokens, and Ethereum cryptography.

## bcrypt

```typescript
import bcrypt from "bcrypt"

async function bcryptExample(): Promise<void> {
    const hash = await bcrypt.hash("mypassword", 10)
    const match = await bcrypt.compare("mypassword", hash)
    console.log(match) // true
}
```

## Argon2

```typescript
import argon2 from "argon2"

async function argon2Example(): Promise<void> {
    const hash = await argon2.hash("mypassword")
    const valid = await argon2.verify(hash, "mypassword")
    console.log(valid) // true
}
```

## JSON Web Tokens

```typescript
import jwt from "jsonwebtoken"

function jwtExample(): void {
    const secret = "my-secret-key"

    // Sign a token
    const token = jwt.sign({ userId: 123, role: "admin" }, secret, {
        expiresIn: "1h",
    })

    // Verify a token
    const decoded: any = jwt.verify(token, secret)
    console.log(decoded.userId) // 123
}
```

## Node.js Crypto

```typescript
import crypto from "crypto"

function cryptoExample(): void {
    // Hash
    const hash = crypto.createHash("sha256").update("data").digest("hex")

    // HMAC
    const hmac = crypto.createHmac("sha256", "secret").update("data").digest("hex")

    // Random bytes
    const bytes = crypto.randomBytes(32)

    console.log(`hash_len=${hash.length} hmac_len=${hmac.length} bytes_len=${bytes.length}`)
}
```

## Ethers

```typescript
import { ethers } from "ethers"

function ethersExample(): void {
    // Utility functions
    const addr = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")
    const wei = ethers.parseEther("1.5")
    const ether = ethers.formatEther(wei)
    console.log(`checksum: ${addr}`)
    console.log(`1.5 ether in wei → formatted back: ${ether}`)

    // Create a random wallet
    const wallet = ethers.Wallet.createRandom()
    console.log(`address: ${wallet.address}`)
    console.log(`privateKey length: ${wallet.privateKey.length}`)
}
```

## Next Steps

- [Utilities](https://docs.perryts.com/stdlib/utilities.html)
- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules


---

<!-- source: docs/src/stdlib/container.md -->

# Containers

The `perry/container` and `perry/compose` modules manage OCI containers
and multi-container stacks directly from Perry programs — same model as
`docker compose up`, but with the spec as a TS object literal and the
orchestration engine running natively in-process (no shell-out to
`docker-compose`).

For the full container subsystem documentation see the dedicated
**Containers** section:

- **[Overview](https://docs.perryts.com/container/overview.html)** — module layout, backend
  auto-detection, and the canonical lifecycle pattern.
- **[Single-Container Lifecycle](https://docs.perryts.com/container/containers.html)** —
  `perry/container`: `run`, `inspect`, `logs`, `exec`, image management.
- **[Compose Orchestration](https://docs.perryts.com/container/compose.html)** —
  `perry/compose`: `up`, `down`, `ps`, healthcheck-gated `depends_on`,
  env-var interpolation.
- **[Networking](https://docs.perryts.com/container/networking.html)** — internal-only
  networks, port maps, and the cross-service-DNS workaround.
- **[Volumes](https://docs.perryts.com/container/volumes.html)** — named vs. bind mounts and
  preservation semantics on `down()`.
- **[Security](https://docs.perryts.com/container/security.html)** — capability isolation,
  cosign image verification, workload-graph policy tiers.
- **[Production Patterns](https://docs.perryts.com/container/production-patterns.html)** —
  full Forgejo deployment case study with the patterns it surfaced.

## Quick start

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

See the linked pages above for the full API surface, production
patterns, and case studies.


---

<!-- source: docs/src/stdlib/utilities.md -->

# Utilities

Perry natively implements common utility packages.

## lodash

Perry wires a focused lodash subset through **named imports**. Supported
operations include `chunk`, `compact`, `drop`, `first`/`head`, `last`,
`flatten`, `uniq`, `reverse`, `take`, `camelCase`, `kebabCase`, `snakeCase`,
`clamp`, `range`, `times`, `size`, `tail`, `sum`, `mean`, `sumBy`, `meanBy`,
`max`, `min`, `maxBy`, `minBy`, and `inRange`.

Use named imports: the default-import receiver form (`import _ from "lodash";
_.chunk(...)`) is not routed to these native signatures because it would pass
the module object as an extra receiver argument.

```typescript,no-test
import { chunk, uniq, range, sum, camelCase } from "lodash";

chunk([1, 2, 3, 4, 5], 2); // [[1,2], [3,4], [5]]
uniq([1, 2, 2, 3, 3]);      // [1, 2, 3]
range(0, 5, 1);              // [0, 1, 2, 3, 4]
sum([2, 3, 4]);              // 9
camelCase("hello world");    // "helloWorld"
```

## dayjs

The default and named `dayjs` factories and their native instance-method
dispatch are wired. The supported surface includes formatting, component
getters, `valueOf`, `unix`, `toISOString`, `add`, `subtract`, `startOf`,
`endOf`, comparisons, validation, and `diff`.

```typescript,no-test
import dayjs from "dayjs";

const now = dayjs();
console.log(now.format("YYYY-MM-DD"));
console.log(now.add(7, "day").format("YYYY-MM-DD"));
console.log(now.subtract(1, "month").toISOString());

const diff = dayjs("2025-12-31").diff(now, "day");
console.log(`${diff} days until end of year`);
```

## moment

`moment` uses the same native handle model as `dayjs`. Its factory and instance
methods are wired, including formatting, date component getters, arithmetic,
comparisons, `diff`, `clone`, `fromNow`, and `toDate`.

```typescript,no-test
import moment from "moment";

const now = moment();
console.log(now.format("MMMM Do YYYY"));
console.log(now.fromNow());
console.log(moment("2025-01-01").isBefore(now));
```

## uuid

```typescript
import { v4 as uuidv4 } from "uuid"

const id = uuidv4()
console.log(id) // e.g., "550e8400-e29b-41d4-a716-446655440000"
```

## nanoid

Both `nanoid()` and `nanoid(length)` route through the native sized entry point;
an omitted length uses nanoid's 21-character default.

```typescript
import { nanoid } from "nanoid"

const nid = nanoid() // Default 21 chars
console.log(nid)
```

## slugify

Both the single-argument form and the replacement/options overload route to
the native implementation. The supported options are `replacement`, `lower`,
`strict`, and `trim`; `remove`, `locale`, `extend`, and the complete upstream
character map remain outside the current faithfulness boundary.

```typescript,no-test
import slugify from "slugify";

slugify("Hello World!", { lower: true }); // "hello-world"
slugify("foo bar", "_");                 // "foo_bar"
```

```typescript
<!-- missing anchor slugify in ../examples/stdlib/utilities/snippets.ts -->
```

## validator

```typescript
import validator from "validator"

console.log(validator.isEmail("test@example.com"))  // true
console.log(validator.isURL("https://example.com")) // true
console.log(validator.isUUID(id))                   // true
console.log(validator.isEmpty(""))                  // true
```

## Next Steps

- [Other Modules](https://docs.perryts.com/stdlib/other.html)
- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules


---

<!-- source: docs/src/stdlib/other.md -->

# Other Modules

Additional npm packages and Node.js APIs supported by Perry. All listed here
are wired through Perry's well-known native bindings registry (#466) and
compile to native code with no JavaScript runtime involvement.

## sharp (Image Processing)

Native bindings via `perry-ext-sharp` (v0.5.551). Resizes, format conversion,
and buffer/file output all work.

```typescript,no-test
import sharp from "sharp";

const buf = await sharp("input.jpg")
  .resize(1600, 900)
  .jpeg({ quality: 80 })
  .toBuffer();

await sharp("input.png")
  .resize(300, 200)
  .toFile("output.png");

const placeholder = await sharp({
  create: {
    width: 300,
    height: 200,
    channels: 4,
    background: { r: 30, g: 41, b: 59, alpha: 1 },
  },
})
  .png()
  .toBuffer();
```

## cheerio (HTML Parsing)

Native bindings via `perry-ext-cheerio` (v0.5.550).

```typescript,no-test
import * as cheerio from "cheerio";

const html = "<html><body><h1>Hello</h1><p>World</p></body></html>";
const $ = cheerio.load(html);
console.log($("h1").text()); // "Hello"
```

## nodemailer (Email)

```typescript,no-test
import nodemailer from "nodemailer"

async function nodemailerExample(): Promise<void> {
    const transporter = nodemailer.createTransport({
        host: "smtp.example.com",
        port: 587,
        auth: { user: "user", pass: "pass" },
    })

    await transporter.sendMail({
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Hello from Perry",
        text: "This email was sent from a compiled TypeScript binary!",
    })
}
```

## zlib (Compression)

Native bindings via `perry-ext-zlib` (v0.5.541).

```typescript,no-test
import zlib from "zlib";

const compressed = zlib.gzipSync("Hello, World!");
const decompressed = zlib.gunzipSync(compressed);
console.log(decompressed.toString()); // "Hello, World!"
```

## cron / node-cron (Job Scheduling)

Native bindings via `perry-ext-cron` (v0.5.564). Both `cron` and `node-cron`
package names route to the same backend.

```typescript,no-test
import { CronJob } from "cron";

const job = new CronJob("*/5 * * * *", () => {
  console.log("Runs every 5 minutes");
});
job.start();
```

## ethers (Ethereum)

Native bindings via `perry-ext-ethers` (v0.5.556) — backed by
[`ethers-rs`](https://github.com/gakonst/ethers-rs)-style ABI plumbing through
`perry-ffi`'s BigInt + Buffer surfaces.

```typescript,no-test
import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();
console.log("address:", wallet.address);
console.log("private key:", wallet.privateKey);
```

## events (EventEmitter)

Native bindings via `perry-ext-events` (v0.5.546). The `EventEmitter` shape
matches Node.js — `on`, `off`, `once`, `emit`, `removeAllListeners`.

```typescript,no-test
import { EventEmitter } from "events";

const ee = new EventEmitter();
ee.on("data", (chunk) => console.log("got:", chunk));
ee.emit("data", "hello");
```

## exponential-backoff (Retry Logic)

Native bindings via `perry-ext-exponential-backoff` (v0.5.542).

```typescript,no-test
import { backOff } from "exponential-backoff";

const result = await backOff(() => fetchUnstableEndpoint(), {
  numOfAttempts: 5,
  startingDelay: 200,
  timeMultiple: 2,
});
```

## decimal.js / bignumber.js (Arbitrary Precision)

Native bindings via `perry-ext-decimal` (v0.5.547). Both package names route
to the same backend — `Decimal` and `BigNumber` are both exposed.

```typescript,no-test
import Decimal from "decimal.js"

function decimalExample(): void {
    const a = new Decimal("0.1")
    const b = new Decimal("0.2")
    const sum = a.plus(b) // Exactly 0.3 (no floating point errors)

    console.log(sum.toFixed(2))      // "0.30"
    console.log(sum.toNumber())      // 0.3
    console.log(a.times(b).toFixed(2)) // "0.02"
    console.log(a.div(b).toFixed(1))   // "0.5"
    console.log(a.pow(10).toString())  // 1e-10
    console.log(a.sqrt().toFixed(3))   // "0.316"
}
```

## dayjs / date-fns (Date Manipulation)

Native bindings via `perry-ext-dayjs` (v0.5.548). Both package names route to
the same Rust backend — same parse/format/diff surface.

```typescript,no-test
import dayjs from "dayjs";

const now = dayjs();
const tomorrow = now.add(1, "day");
console.log(tomorrow.format("YYYY-MM-DD"));
```

## moment (Legacy Date)

Native bindings via `perry-ext-moment` (v0.5.549). `moment` is in maintenance
mode upstream — prefer `dayjs` for new code, but Perry supports both for
existing codebases.

```typescript,no-test
import moment from "moment";

const m = moment().add(7, "days");
console.log(m.format());
```

## rate-limiter-flexible

Native bindings via `perry-ext-ratelimit` (v0.5.552). In-memory limiter is
wired; Redis / cluster backing stores are follow-ups.

```typescript,no-test
import { RateLimiterMemory } from "rate-limiter-flexible";

const limiter = new RateLimiterMemory({ points: 5, duration: 1 });
try {
  await limiter.consume("ip-1.2.3.4");
} catch (rateLimitErr) {
  console.warn("blocked:", rateLimitErr);
}
```

## worker_threads

Perry compiles statically resolvable worker entry files as separate native
module entry functions. Both the Node `worker_threads` API and the Web/Bun
global `Worker` shape use the same in-process worker runtime; worker source is
never passed to a runtime JavaScript engine. For closure-oriented data-parallel
work, `parallelMap` / `parallelFilter` / `spawn` from `perry/thread` remain the
simpler interface (see [Threading](https://docs.perryts.com/threading/overview.html)).

```text
import { Worker, parentPort, workerData } from "worker_threads";

if (parentPort) {
  // Worker thread
  const data = workerData;
  parentPort.postMessage({ result: data.value * 2 });
} else {
  // Main thread
  const worker = new Worker("./worker.ts", {
    workerData: { value: 21 },
  });
  worker.on("message", (msg) => {
    console.log(msg.result); // 42
  });
}
```

Web Worker module URLs are discovered relative to the importing source file:

```typescript,no-test
// main.ts
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});
worker.onmessage = (event) => console.log(event.data);
worker.postMessage({ value: 21 });

// worker.ts
onmessage = (event) => {
  postMessage({ result: event.data.value * 2 });
  close();
};
```

## commander (CLI Parsing)

```typescript,no-test
import { Command } from "commander"

function commanderExample(): void {
    const program = new Command()
    program.name("my-cli").version("1.0.0").description("My CLI tool")

    program
        .command("serve")
        .option("-p, --port <number>", "Port number")
        .option("--verbose", "Verbose output")
        .action((options: any) => {
            console.log(`Starting server on port ${options.port}`)
        })

    program.parse(process.argv)
}
```

## lru-cache

The wired constructor takes the npm v7+ options-object shape
(`new LRUCache({ max: 100 })`) and validates it the way npm does, throwing
the same errors rather than clamping: `max` must be a positive integer no
larger than the JS array-length limit, `ttl` must be a positive integer,
and at least one of `max` or `ttl` is required — so `new LRUCache()` and
the older positional form `new LRUCache(100)` both throw a `TypeError`,
exactly as they do on npm. `ttl`, `updateAgeOnGet` and `peek` are honored;
`maxSize`/`sizeCalculation`, `dispose`, `fetch`, `allowStale` and the
iterator surface are not yet implemented.

```typescript,no-test
import { LRUCache } from "lru-cache"

function lruCacheExample(): void {
    const cache = new LRUCache({ max: 100 }) // max 100 entries

    cache.set("key", "value")
    console.log(cache.get("key"))   // "value"
    console.log(cache.has("key"))   // true
    cache.delete("key")
    cache.clear()
}
```

## child_process

```typescript,no-test
// `spawnBackground` / `getProcessStatus` / `killProcess` are Perry EXTENSIONS —
// Node's `child_process` has no such named exports, so importing them by name
// is rejected (correctly) with U006. Reach them through the module namespace.
import * as child_process from "child_process"

function childProcessExample(): void {
    // Spawn a background process
    const { pid, handleId } = child_process.spawnBackground("sleep", ["10"], "/tmp/log.txt")

    // Check if it's still running
    const status = child_process.getProcessStatus(handleId)
    console.log(status.alive) // true
    console.log(`pid=${pid}`)

    // Kill it
    child_process.killProcess(handleId)
}
```

## node-pty (Pseudo-terminals)

A runtime-native pty (#6563) — `openpty`/`fork` with the slave as the child's
controlling terminal, no N-API addon. Importable as both `node-pty` and the
API-identical `@lydell/node-pty` fork, statically or via dynamic `import()`.
POSIX only for now (macOS + Linux); on other hosts `spawn` throws, which
triggers consumers' non-pty fallback paths.

`onData` delivers UTF-8 strings (multi-byte sequences split across reads are
reassembled); `onExit` fires `{ exitCode, signal }` with the numeric signal
for a signal death and `undefined` otherwise; `kill()` defaults to `SIGHUP`
like node-pty. `TERM` in the child comes from `name`.

```typescript,no-test
import { spawn } from "node-pty";

const term = spawn("bash", [], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
});

const sub = term.onData((data) => process.stdout.write(data));
term.onExit(({ exitCode, signal }) => {
  console.log(`exited: code=${exitCode} signal=${signal ?? "none"}`);
});

term.write("echo hello\n");
term.resize(120, 40);   // TIOCSWINSZ → child sees SIGWINCH
term.kill("SIGTERM");   // no argument = SIGHUP
sub.dispose();          // unsubscribe onData
```

## @parcel/watcher

Perry provides the low-level `@parcel/watcher` binding object and all eight
published platform-package names through one `notify`-backed native facade.
The pure-JavaScript `@parcel/watcher/wrapper` continues to compile normally;
its target-dependent platform `require` is folded to the native facade at
compile time. The behavior was checked against `@parcel/watcher` 2.5.1.

Subscriptions use FSEvents on macOS, inotify on Linux,
ReadDirectoryChangesW on Windows, and notify's native backend on other
supported systems. An unknown or unavailable requested backend falls back to
the platform default. Events are delivered on Perry's main thread in
coalesced batches: create followed by update remains one `create`, create
followed by delete disappears, and rename is `delete` for the old path plus
`create` for the new path. Backend overflow/rescan notifications trigger a
fresh tree snapshot and emit its diff.

`ignorePaths` are absolute path prefixes. `ignoreGlobs` are the regex sources
produced by the package's JS wrapper and match root-relative paths, including
dot-files. `unsubscribe` matches directory, callback identity, and normalized
options; it stops the native watcher and drains queued events before its
promise resolves, so no callback fires afterward. Live subscriptions keep the
event loop active. `writeSnapshot` and `getEventsSince` use the same snapshot
diff semantics as overflow recovery.

## External native bindings

Two packages live in their own GitHub repos with their own semver — they're
imported by `bun add` like any npm package, but Rust-backed and compiled
natively via `perry-ffi`:

- **`@perryts/tursodb`** — Turso (libSQL fork) database client. See
  [PerryTS/tursodb-bindings](https://github.com/PerryTS/tursodb-bindings).
- **`@perryts/iroh`** — Iroh peer-to-peer networking. See
  [PerryTS/iroh-bindings](https://github.com/PerryTS/iroh-bindings).

Pure-TypeScript drivers compiled via `compilePackages`:

- **`@perryts/postgres`**, **`@perryts/mysql`**, **`@perryts/mongodb`**, **`@perryts/redis`** — wire-protocol clients that
  also run on Node.js and Bun unchanged.

See [Native Bindings — Overview](https://docs.perryts.com/native-libraries/overview.html) for the
contract these external packages follow.

## Next Steps

- [Overview](https://docs.perryts.com/stdlib/overview.html) — All stdlib modules
- [File System](https://docs.perryts.com/stdlib/fs.html) — fs and path APIs
- [Native Bindings](https://docs.perryts.com/native-libraries/overview.html) — Authoring your own
