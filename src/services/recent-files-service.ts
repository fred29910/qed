/**
 * Recent-files registry.
 *
 * Persists the last N paths the user opened in the file manager so the
 * sidebar can offer quick re-entry. Stored as a JSON array at
 * `appDataDir()/recent-files.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { explainFsError, recentFilesPath } from "../platform/index.js";

/** Maximum number of recent paths we remember. */
const MAX_RECENT = 20;

export class RecentFilesService {
    private paths: string[] = [];

    constructor() {
        this.paths = loadFromDisk();
    }

    /** Return the current list, most-recent first. */
    list(): readonly string[] {
        return this.paths.slice();
    }

    /** Push a path to the front of the list, dedup and cap. */
    add(path: string): void {
        // Remove any prior occurrence so the entry ends up at the top.
        const filtered = this.paths.filter((p) => p !== path);
        filtered.unshift(path);
        this.paths = filtered.slice(0, MAX_RECENT);
        this.flush();
    }

    /** Clear the list. */
    clear(): void {
        this.paths = [];
        this.flush();
    }

    private flush(): void {
        const path = recentFilesPath();
        try {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, JSON.stringify(this.paths, null, 2), "utf-8");
        } catch (err) {
            console.error("recent-files flush failed:", explainFsError(err));
        }
    }
}

function loadFromDisk(): string[] {
    const path = recentFilesPath();
    if (!existsSync(path)) {
        return [];
    }
    try {
        const raw = readFileSync(path, "utf-8") as string;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT);
    } catch (err) {
        console.error("recent-files load failed:", explainFsError(err));
        return [];
    }
}
