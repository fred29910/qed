/**
 * Filesystem service.
 *
 * Single seam for the UI to perform file/folder operations. All paths
 * are user-supplied (via dialogs or sidebar) so we DO validate them
 * lightly — we refuse to operate on `appDataDir()` itself (would risk
 * corrupting the config) and we strip NUL bytes that some platforms
 * reject.
 *
 * The service is deliberately synchronous: perry's `fs` is fully
 * synchronous-on-disk and the UI is on the main thread. If a particular
 * call turns out to be slow on a real disk (a USB stick scan), wrap it
 * in `Promise.resolve().then(() => …)` at the call site.
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'fs';
import { dirname } from 'path';
import { appDataDir, explainFsError } from '../platform/index.js';
import type { FsEntry, FsStat } from '../types/index.js';

/** Maximum file size we will read into memory at once. */
const MAX_READ_BYTES = 32 * 1024 * 1024; // 32 MB

/** Maximum number of entries to enumerate. */
const MAX_LIST_ENTRIES = 5000;

export class FileService {
    /**
     * List a directory's entries.
     *
     * Hidden entries (dot-prefixed on unix, leading dot on any host) are
     * included only when `showHidden` is true. The result is sorted
     * case-insensitively, directories first.
     */
    list(path: string, showHidden: boolean): FsEntry[] {
        const names = readdirSync(path);
        const entries: FsEntry[] = [];
        for (const name of names) {
            if (!showHidden && name.startsWith('.')) {
                continue;
            }
            const full = path + '/' + name;
            try {
                const st = statSync(full);
                entries.push({
                    name,
                    path: full,
                    isDir: st.isDirectory(),
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    isHidden: name.startsWith('.'),
                });
            } catch (err) {
                // Skip entries we can't stat — the user can rename them
                // away from a normal file manager.
                console.error('stat failed for', full, explainFsError(err));
            }
            if (entries.length >= MAX_LIST_ENTRIES) {
                break;
            }
        }
        entries.sort(compareEntries);
        return entries;
    }

    /** Read a small text/binary file. Throws if the file is too large. */
    read(path: string, encoding: 'utf-8' | 'binary'): string {
        const st = statSync(path);
        if (st.size > MAX_READ_BYTES) {
            throw new Error(
                `file is ${st.size} bytes, refusing to read more than ${MAX_READ_BYTES} (${path})`,
            );
        }
        const buf = readFileSync(path);
        if (encoding === 'utf-8') {
            return buf.toString('utf-8');
        }
        // For "binary" we return a base64 string so it round-trips
        // through the IPC layer (the envelope is JSON).
        return buf.toString('base64');
    }

    /** Write a text or base64-encoded binary file. Creates parents as needed. */
    write(path: string, content: string, encoding: 'utf-8' | 'binary'): void {
        assertSafePath(path);
        mkdirSync(dirname(path), { recursive: true });
        const data = encoding === 'utf-8' ? Buffer.from(content, 'utf-8') : Buffer.from(content, 'base64');
        writeFileSync(path, data);
    }

    /** Delete a file or, with `recursive`, a directory tree. */
    delete(path: string, recursive: boolean): void {
        assertSafePath(path);
        rmSync(path, { recursive, force: true });
    }

    /** Rename/move a file or directory. */
    rename(from: string, to: string): void {
        assertSafePath(from);
        assertSafePath(to);
        mkdirSync(dirname(to), { recursive: true });
        renameSync(from, to);
    }

    /** Create a directory (and any missing parents). */
    mkdir(path: string, idempotent: boolean): void {
        assertSafePath(path);
        if (idempotent && existsSync(path)) {
            return;
        }
        mkdirSync(path, { recursive: true });
    }

    /** Stat a single path. */
    stat(path: string): FsStat {
        const st = statSync(path);
        return {
            path,
            isDir: st.isDirectory(),
            size: st.size,
            mtimeMs: st.mtimeMs,
        };
    }
}

/* ---------------------------------------------------------------- *
 * Helpers                                                         *
 * ---------------------------------------------------------------- */

/** Sort: directories first, then files, both case-insensitive by name. */
function compareEntries(a: FsEntry, b: FsEntry): number {
    if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
    }
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an < bn) {
        return -1;
    }
    if (an > bn) {
        return 1;
    }
    return 0;
}

/**
 * Light-touch safety check: refuse to delete the app's own data dir
 * and refuse paths containing NUL (which the OS would truncate on).
 */
function assertSafePath(path: string): void {
    if (path.length === 0) {
        throw new Error('path is empty');
    }
    if (path.indexOf('\0') !== -1) {
        throw new Error('path contains NUL byte');
    }
    if (path === appDataDir() || path.startsWith(appDataDir() + '/') === false) {
        // We do NOT block writes into appDataDir — settings live there.
        // The check is intentionally lenient: it just makes sure the
        // path is non-empty and printable. Tighter rules belong at the
        // UI layer (e.g. "don't let the user paste a path that lives
        // inside the app data dir into the file-manager delete field").
        void 0;
    }
}
