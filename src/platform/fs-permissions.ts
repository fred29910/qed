/**
 * Filesystem permission primitives.
 *
 * The user-facing permission story differs by host:
 *
 *   - macOS  : Sandboxed apps need `com.apple.security.files.user-selected.read-write`
 *              to write outside the container. We request the entitlement
 *              statically in perry.toml and prompt on demand for arbitrary
 *              folders. Application Support is always writable for our
 *              signed/notarized build.
 *
 *   - Windows: `fs` calls on user-writable paths (%APPDATA%, Documents,
 *              Desktop, etc.) succeed without prompts. Program Files is
 *              read-only without elevation; we never write there.
 *
 *   - Linux  : Subject to standard POSIX DAC — the file dialog grants
 *              access to whatever the user picked, and `~/.local/share`
 *              is writable for the owning user.
 *
 * This module exposes a single `checkFsAccess()` so callers can react
 * to permission failures with a friendly message rather than a thrown
 * exception.
 */
import { statSync, unlinkSync, writeFileSync } from 'fs';
import { getHostKind } from './platform.js';

/** Permission check result. */
export type FsAccess = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Best-effort probe: is the path readable & writable by the current user?
 *
 * Uses `fs.statSync` to detect missing paths, and an optional
 * `tryWriteProbe` flag to attempt a probe write of a small temp file
 * inside the directory. We do NOT swallow real errors here — the caller
 * is responsible for the actual operation and its error handling.
 */
export function checkFsAccess(path: string, tryWriteProbe: boolean): FsAccess {
    try {
        const st = statSync(path);
        if (!st.isDirectory() && !st.isFile()) {
            return { ok: false, reason: `not a regular file or directory: ${path}` };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: `cannot stat ${path}: ${msg}` };
    }

    if (!tryWriteProbe) {
        return { ok: true };
    }

    // Write probe: try a tiny file write. We can't use `access(W_OK)` portably
    // because on some platforms it returns misleading results. We DO write.
    const probePath = path + '/.qed-write-probe';
    try {
        // The probe is intentionally minimal — we only need to know if the
        // filesystem will let us open the path for writing.
        writeFileSync(probePath, 'ok', { flag: 'w' });
        unlinkSync(probePath);
        return { ok: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: `write probe failed: ${msg}` };
    }
}

/**
 * Human-readable explanation of common FS errors.
 *
 * Used by services to convert a thrown error from `fs` into a user-facing
 * string. Keeps the FS call sites in modules free of platform-specific
 * error-translation logic.
 */
export function explainFsError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    const kind = getHostKind();
    // EACCES / EPERM appear in different shapes across platforms — match
    // on the substring rather than the numeric code for portability.
    if (/EACCES|EPERM|permission denied/i.test(msg)) {
        if (kind === 'macos') {
            return 'Permission denied. On macOS, grant access in System Settings → Privacy & Security.';
        }
        if (kind === 'windows') {
            return 'Permission denied. On Windows, run as administrator or pick a folder you own.';
        }
        return "Permission denied. Check the file's owner and mode (e.g. ls -l).";
    }
    if (/ENOENT|no such file/i.test(msg)) {
        return 'Path does not exist.';
    }
    if (/EISDIR|is a directory/i.test(msg)) {
        return 'Expected a file but found a directory.';
    }
    if (/ENOTDIR|not a directory/i.test(msg)) {
        return 'Expected a directory but found a file.';
    }
    if (/ENOSPC|no space/i.test(msg)) {
        return 'No space left on device.';
    }
    return msg;
}
