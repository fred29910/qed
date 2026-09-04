/**
 * Leveled diagnostic logger.
 *
 * Perry AOT 编译把 stdout 经常截断或缓冲,这里用 `process.stderr.write`
 * 直写到 stderr(无缓冲)+ `appendFileSync` 兜底写文件,确保崩溃前
 * 的所有日志一定能被宿主看到。
 *
 * 用法:
 *   - 历史兼容:  `diag('step')` / `diagErr('step', err)`  (boot trace, 60+ 处既有调用)
 *   - 推荐用法:  `logger.info('boot', 'main()', 'entered', { foo: 1 })`
 *
 * 这是 `src/` 树中除 `services/` 与 `main.ts` 外唯一允许 `import 'fs'` 的
 * 模块,详见 `AGENTS.md` "Logger exception" 段。
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { logDir } from './platform/paths.js';

/* ---------------------------------------------------------------- *
 * Types.                                                            *
 * ---------------------------------------------------------------- */

/** Severity levels. Order matters: `silent=0 < error=1 < ... < trace=5`. */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** A single log record. */
export interface LogEntry {
    readonly ts: number;
    readonly level: LogLevel;
    readonly category: string;
    readonly step: string;
    readonly message: string;
    readonly context?: unknown;
    readonly error?: { readonly name: string; readonly message: string; readonly stack?: string };
}

/** Runtime configuration. All fields mutable via setters on `Logger`. */
export interface LoggerConfig {
    /** Current minimum level. Entries below this are dropped. */
    level: LogLevel;
    /** Whether to write to per-day log file under `logDir()`. */
    fileEnabled: boolean;
    /** Whether to also write to `process.stderr`. */
    stderrEnabled: boolean;
    /** Single-file rotation threshold in bytes. */
    fileRotationBytes: number;
    /** Max entries kept in the in-memory ring buffer. */
    ringBufferSize: number;
    /** Max number of `Error.stack` lines kept per entry. */
    stackLines: number;
    /** Days to keep rotated files. */
    retentionDays: number;
    /** Hard cap on file count (oldest dropped first). */
    retentionMaxFiles: number;
}

/** The logger surface. */
export interface Logger {
    error(category: string, step: string, err: unknown, ctx?: unknown): void;
    warn(category: string, step: string, message: string, ctx?: unknown): void;
    info(category: string, step: string, message: string, ctx?: unknown): void;
    debug(category: string, step: string, message: string, ctx?: unknown): void;
    trace(category: string, step: string, message: string, ctx?: unknown): void;
    setLevel(level: LogLevel): void;
    getConfig(): LoggerConfig;
    snapshot(): readonly LogEntry[];
    flush(): void;
    currentFilePath(): string;
}

/* ---------------------------------------------------------------- *
 * Implementation.                                                   *
 * ---------------------------------------------------------------- */

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};

const DEFAULT_CONFIG: LoggerConfig = {
    level: 'info',
    fileEnabled: true,
    stderrEnabled: true,
    fileRotationBytes: 1024 * 1024,
    ringBufferSize: 500,
    stackLines: 8,
    retentionDays: 7,
    retentionMaxFiles: 20,
};

/** Internal mutable state. */
interface LoggerState {
    config: LoggerConfig;
    buffer: LogEntry[];
    writeIndex: number; // next slot to write
    bootstrapped: boolean;
    currentFile: string;
    currentDate: string; // YYYY-MM-DD
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function todayString(now: Date): string {
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

function timeString(now: Date): string {
    return `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}.${String(
        now.getUTCMilliseconds(),
    ).padStart(3, '0')}`;
}

/** Try to JSON-stringify; return undefined on failure. Drops functions/symbols. */
function safeStringify(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(value, (_key, v) => {
            if (typeof v === 'function' || typeof v === 'symbol') {
                return undefined;
            }
            if (typeof v === 'object' && v !== null) {
                if (seen.has(v as object)) {
                    return '<circular>';
                }
                seen.add(v as object);
            }
            if (typeof v === 'bigint') {
                return v.toString();
            }
            return v;
        });
    } catch {
        return undefined;
    }
}

class LoggerImpl implements Logger {
    private state: LoggerState;

    constructor() {
        this.state = {
            config: { ...DEFAULT_CONFIG },
            buffer: [],
            writeIndex: 0,
            bootstrapped: false,
            currentFile: '',
            currentDate: '',
        };
    }

    /* ---------------------------------------------------------------- *
     * Public API.                                                       *
     * ---------------------------------------------------------------- */

    error(category: string, step: string, err: unknown, ctx?: unknown): void {
        this.emit('error', category, step, this.formatError(err, this.state.config.stackLines), err, ctx);
    }

    warn(category: string, step: string, message: string, ctx?: unknown): void {
        this.emit('warn', category, step, message, undefined, ctx);
    }

    info(category: string, step: string, message: string, ctx?: unknown): void {
        this.emit('info', category, step, message, undefined, ctx);
    }

    debug(category: string, step: string, message: string, ctx?: unknown): void {
        this.emit('debug', category, step, message, undefined, ctx);
    }

    trace(category: string, step: string, message: string, ctx?: unknown): void {
        this.emit('trace', category, step, message, undefined, ctx);
    }

    setLevel(level: LogLevel): void {
        this.state.config.level = level;
    }

    getConfig(): LoggerConfig {
        return { ...this.state.config };
    }

    snapshot(): readonly LogEntry[] {
        // Return in chronological order (oldest first). Buffer may not be full,
        // so we wrap around `writeIndex`.
        const buf = this.state.buffer;
        const start = buf.length < this.state.config.ringBufferSize ? 0 : this.state.writeIndex;
        const out: LogEntry[] = [];
        for (let i = 0; i < buf.length; i += 1) {
            out.push(buf[(start + i) % buf.length] as LogEntry);
        }
        return out;
    }

    flush(): void {
        // Best-effort: try to ensure directory & file exist. The actual
        // per-line append is synchronous and immediate; there's nothing
        // to drain here. We expose the method so callers (e.g. shutdown
        // hooks) have a stable seam.
        this.ensureBootstrapped();
    }

    currentFilePath(): string {
        this.ensureBootstrapped();
        return this.state.currentFile;
    }

    /* ---------------------------------------------------------------- *
     * Internals.                                                        *
     * ---------------------------------------------------------------- */

    private formatError(err: unknown, maxStackLines: number): string {
        if (err instanceof Error) {
            const head = `${err.name}: ${err.message}`;
            if (err.stack === undefined) {
                return head;
            }
            const lines = err.stack.split('\n').slice(0, maxStackLines);
            return `${head}\n${lines.join('\n')}`;
        }
        return String(err);
    }

    private emit(
        level: LogLevel,
        category: string,
        step: string,
        message: string,
        err: unknown,
        ctx: unknown | undefined,
    ): void {
        if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[this.state.config.level]) {
            return;
        }
        const entry: LogEntry = {
            ts: Date.now(),
            level,
            category,
            step,
            message,
            context: ctx,
            error: err instanceof Error
                ? { name: err.name, message: err.message, stack: this.truncateStack(err.stack) }
                : err === undefined
                    ? undefined
                    : { name: 'NonError', message: String(err) },
        };
        this.appendBuffer(entry);
        this.appendFile(entry);
        this.appendStderr(entry);
    }

    private truncateStack(stack: string | undefined): string | undefined {
        if (stack === undefined) {
            return undefined;
        }
        const lines = stack.split('\n');
        if (lines.length <= this.state.config.stackLines) {
            return stack;
        }
        return lines.slice(0, this.state.config.stackLines).join('\n');
    }

    private appendBuffer(entry: LogEntry): void {
        const cap = this.state.config.ringBufferSize;
        if (this.state.buffer.length < cap) {
            this.state.buffer.push(entry);
        } else {
            this.state.buffer[this.state.writeIndex] = entry;
        }
        this.state.writeIndex = (this.state.writeIndex + 1) % cap;
    }

    private appendFile(entry: LogEntry): void {
        if (!this.state.config.fileEnabled) {
            return;
        }
        this.ensureBootstrapped();
        const line = this.formatLine(entry) + '\n';
        try {
            appendFileSync(this.state.currentFile, line);
            this.maybeRotate();
        } catch {
            // Best-effort; never throw from a logger.
        }
    }

    private appendStderr(entry: LogEntry): void {
        if (!this.state.config.stderrEnabled) {
            return;
        }
        const line = this.formatLine(entry) + '\n';
        try {
            process.stderr.write(line);
        } catch {
            // ignore
        }
    }

    private formatLine(entry: LogEntry): string {
        const d = new Date(entry.ts);
        const level = entry.level.toUpperCase().padEnd(5);
        const cat = entry.category.padEnd(10);
        const ctx = entry.context !== undefined ? ` :: ${safeStringify(entry.context) ?? '<unserialisable>'}` : '';
        const errSuffix = entry.error !== undefined ? ` !! ${entry.error.name}: ${entry.error.message}` : '';
        return `${timeString(d)} ${level} ${cat} ${entry.step} ${entry.message}${errSuffix}${ctx}`;
    }

    private ensureBootstrapped(): void {
        if (this.state.bootstrapped) {
            this.maybeRolloverDate();
            return;
        }
        try {
            const dir = logDir();
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            this.state.currentDate = todayString(new Date());
            this.state.currentFile = join(dir, `qed-${this.state.currentDate}.log`);
        } catch {
            // Fallback: file logging disabled for this session.
            this.state.config.fileEnabled = false;
            this.state.currentFile = '';
        }
        this.state.bootstrapped = true;
    }

    /** If the day has rolled over, switch to a new file. */
    private maybeRolloverDate(): void {
        const today = todayString(new Date());
        if (today === this.state.currentDate) {
            return;
        }
        this.state.currentDate = today;
        const dir = dirname(this.state.currentFile);
        this.state.currentFile = join(dir, `qed-${today}.log`);
    }

    /** Rotate file if it exceeds the size threshold. */
    private maybeRotate(): void {
        if (this.state.currentFile === '') {
            return;
        }
        try {
            const st = statSync(this.state.currentFile);
            if (st.size < this.state.config.fileRotationBytes) {
                return;
            }
        } catch {
            return;
        }
        const now = new Date();
        const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(
            now.getUTCDate(),
        )}-${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
        const dir = dirname(this.state.currentFile);
        const archived = join(dir, `qed-${this.state.currentDate}.${stamp}.log`);
        try {
            renameSync(this.state.currentFile, archived);
        } catch {
            return; // Can't rename; keep appending to the existing file.
        }
        this.evictOld(dir);
    }

    /** Drop rotated files older than `retentionDays` or beyond `retentionMaxFiles`. */
    private evictOld(dir: string): void {
        try {
            const names = readdirSync(dir).filter((n) => n.startsWith('qed-') && n.endsWith('.log'));
            const files = names
                .map((name) => {
                    const full = join(dir, name);
                    try {
                        const st = statSync(full);
                        return { full, name, mtimeMs: st.mtimeMs };
                    } catch {
                        return null;
                    }
                })
                .filter((x): x is { full: string; name: string; mtimeMs: number } => x !== null);
            // Sort oldest first by mtime; same-mtime tie-break by name (lexicographic).
            files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
            const cutoff = Date.now() - this.state.config.retentionDays * 24 * 60 * 60 * 1000;
            for (const f of files) {
                if (f.mtimeMs < cutoff || files.indexOf(f) < files.length - this.state.config.retentionMaxFiles) {
                    try {
                        unlinkSync(f.full);
                    } catch {
                        // ignore
                    }
                }
            }
        } catch {
            // ignore
        }
    }
}

/* ---------------------------------------------------------------- *
 * Singleton.                                                        *
 * ---------------------------------------------------------------- */

/** The default logger instance. Use this from all call sites. */
export const logger: Logger = new LoggerImpl();

/** Accessor for tests / DI. */
export function getLogger(): Logger {
    return logger;
}

/* ---------------------------------------------------------------- *
 * Backward-compatible shims.                                       *
 * ---------------------------------------------------------------- */

/**
 * Legacy boot tracer. Maps to `logger.debug('boot', step, step, extra)`.
 *
 * Kept for the 60+ existing call sites in `main.ts`, `app-controller.ts`,
 * and `ui/sidebar.ts`. New code should use `logger.*` directly.
 */
export function diag(step: string, extra?: unknown): void {
    _stepCount += 1;
    logger.debug('boot', step, step, extra);
}

/**
 * Legacy error tracer. Maps to `logger.error('boot', step, err)`.
 */
export function diagErr(step: string, err: unknown): void {
    _stepCount += 1;
    logger.error('boot', step, err);
}

/**
 * Internal monotonic counter incremented by every `diag`/`diagErr` call.
 * Exposed for tests that want to assert log call counts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _stepCount = 0;

/** Read the legacy step counter (incremented by `diag`/`diagErr`). */
export function diagStepCount(): number {
    return _stepCount;
}
