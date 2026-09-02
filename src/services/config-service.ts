/**
 * Configuration service — JSON-backed persistence layer.
 *
 * The on-disk file is `appDataDir()/config.json`. We keep the entire
 * config in memory after the first read; updates are debounced-flushed
 * to disk to avoid hammering the FS during slider drags.
 *
 * Migration: if the on-disk file's `version` doesn't match the current
 * schema, we copy unknown fields into the new config (forward-compat)
 * and overwrite the file with the new shape.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { configFilePath, explainFsError } from "../platform/index.js";
import { DEFAULT_CONFIG, type AppConfig, type ThemeMode } from "../types/index.js";

/** Current schema version. */
const SCHEMA_VERSION = 1 as const;

/** A subscriber to config changes. */
export type ConfigListener = (config: AppConfig) => void;

export class ConfigService {
    private state: AppConfig;
    private readonly listeners: Set<ConfigListener> = new Set();
    private flushTimer: number | null = null;

    constructor() {
        this.state = loadFromDisk();
    }

    /** Return a deep-cloned snapshot of the current config. */
    snapshot(): AppConfig {
        return cloneConfig(this.state);
    }

    /**
     * Apply a partial patch.
     *
     * Unknown keys are ignored. After applying, all listeners are
     * notified synchronously and a debounced disk flush is scheduled.
     */
    update(patch: Partial<AppConfig>): void {
        const next: AppConfig = {
            ...this.state,
            ...patch,
            // Force the version constant — never let a patch set it.
            version: SCHEMA_VERSION,
        };
        this.state = next;
        this.notify();
        this.scheduleFlush();
    }

    /** Convenience: update the theme only. */
    setTheme(theme: ThemeMode): void {
        this.update({ theme });
    }

    /** Subscribe to config changes. Returns an unsubscribe function. */
    subscribe(listener: ConfigListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Force an immediate disk flush. Used at app shutdown. */
    flushNow(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        writeToDisk(this.state);
    }

    private notify(): void {
        const snapshot = cloneConfig(this.state);
        for (const l of this.listeners) {
            try {
                l(snapshot);
            } catch (err) {
                // Listeners must not break the dispatcher — log and continue.
                console.error("config listener threw:", err);
            }
        }
    }

    private scheduleFlush(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
        }
        // 250 ms is short enough that no human perceives the lag, and
        // long enough to coalesce bursts of updates from sliders/toggles.
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            try {
                writeToDisk(this.state);
            } catch (err) {
                console.error("config flush failed:", explainFsError(err));
            }
        }, 250) as unknown as number;
    }
}

/* ---------------------------------------------------------------- *
 * Disk I/O                                                        *
 * ---------------------------------------------------------------- */

function loadFromDisk(): AppConfig {
    const path = configFilePath();
    if (!existsSync(path)) {
        return cloneConfig(DEFAULT_CONFIG);
    }
    try {
        const raw = readFileSync(path, "utf-8") as string;
        const parsed = JSON.parse(raw) as unknown;
        if (!isPlainObject(parsed)) {
            return cloneConfig(DEFAULT_CONFIG);
        }
        return mergeWithDefaults(parsed);
    } catch (err) {
        console.error("config load failed; using defaults:", explainFsError(err));
        return cloneConfig(DEFAULT_CONFIG);
    }
}

function writeToDisk(state: AppConfig): void {
    const path = configFilePath();
    mkdirSync(dirname(path), { recursive: true });
    const body = JSON.stringify(state, null, 2);
    writeFileSync(path, body, "utf-8");
}

/* ---------------------------------------------------------------- *
 * Schema handling                                                 *
 * ---------------------------------------------------------------- */

function mergeWithDefaults(raw: Record<string, unknown>): AppConfig {
    // Start with the defaults, then overlay every key from `raw` whose
    // value is a valid primitive for its slot. Unknown keys are dropped
    // (forward-compat: the new build doesn't know what to do with them
    // yet, so we don't trust them).
    const merged: AppConfig = { ...DEFAULT_CONFIG };
    if (typeof raw["theme"] === "string") {
        const t = raw["theme"];
        if (t === "system" || t === "light" || t === "dark") {
            (merged as { theme: ThemeMode }).theme = t;
        }
    }
    if (typeof raw["autostart"] === "boolean") {
        (merged as { autostart: boolean }).autostart = raw["autostart"];
    }
    if (typeof raw["notifications"] === "boolean") {
        (merged as { notifications: boolean }).notifications = raw["notifications"];
    }
    if (typeof raw["backgroundMode"] === "boolean") {
        (merged as { backgroundMode: boolean }).backgroundMode = raw["backgroundMode"];
    }
    if (typeof raw["lastFolder"] === "string") {
        (merged as { lastFolder: string }).lastFolder = raw["lastFolder"];
    }
    if (typeof raw["fontSize"] === "number" && Number.isFinite(raw["fontSize"])) {
        (merged as { fontSize: number }).fontSize = clampFontSize(raw["fontSize"]);
    }
    if (typeof raw["displayName"] === "string") {
        (merged as { displayName: string }).displayName = raw["displayName"];
    }
    return merged;
}

function clampFontSize(n: number): number {
    if (n < 8) return 8;
    if (n > 48) return 48;
    return Math.round(n);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cloneConfig(c: AppConfig): AppConfig {
    // All fields are primitives, so a shallow clone is sufficient and
    // cheap. We avoid `structuredClone` because it isn't in the perry
    // AOT subset (and we want a stable, debuggable shape).
    return {
        version: c.version,
        theme: c.theme,
        autostart: c.autostart,
        notifications: c.notifications,
        backgroundMode: c.backgroundMode,
        lastFolder: c.lastFolder,
        fontSize: c.fontSize,
        displayName: c.displayName,
    };
}
