/**
 * Cross-platform path resolution.
 *
 * Perry implements `node:os` and `node:path` for real, so we can use them
 * directly. This module wraps them into a stable, documented surface so
 * callers don't need to reason about which OS uses which folder layout.
 *
 * Conventions:
 *  - macOS   : `~/Library/Application Support/<bundle>/`  (writable)
 *  - Linux   : `${XDG_DATA_HOME:-~/.local/share}/<bundle>/` (writable)
 *  - Windows : `%APPDATA%\<bundle>\`  (writable)
 *
 * The `bundle` slug is used as the per-app subdirectory and must be stable
 * across versions so users don't lose their settings on upgrade.
 */
import { homedir } from 'os';
import { join, sep } from 'path';
import { getHostKind, type HostKind } from './platform.js';

/** Per-app slug — the leaf directory under the user data root. */
export const APP_SLUG = 'qed';

/**
 * Root directory for all per-user, persistent, writable application data.
 *
 * Resolution per host:
 *  - macOS   : `~/Library/Application Support/qed`
 *  - Linux   : `$XDG_DATA_HOME/qed`  (falls back to `~/.local/share/qed`)
 *  - Windows : `%APPDATA%/qed`  (i.e. `C:\Users\<u>\AppData\Roaming\qed`)
 *
 * The directory is *not* created on import — `ensureAppDataDir()` is the
 * single place that does the `mkdir -p` so error handling is consistent.
 */
export function appDataDir(): string {
    const kind = getHostKind();
    const home = homedir();
    if (kind === 'macos') {
        return join(home, 'Library', 'Application Support', APP_SLUG);
    }
    if (kind === 'windows') {
        // On Windows, %APPDATA% is the writable per-user root. We prefer it
        // over the env var so the call works even if env vars are stripped.
        const appData = readEnv('APPDATA');
        if (appData !== '') {
            return join(appData, APP_SLUG);
        }
        return join(home, 'AppData', 'Roaming', APP_SLUG);
    }
    // Linux / other unix-ish
    const xdg = readEnv('XDG_DATA_HOME');
    if (xdg !== '') {
        return join(xdg, APP_SLUG);
    }
    return join(home, '.local', 'share', APP_SLUG);
}

/** Subdirectory used for non-sensitive cached files (thumbnails, previews). */
export function cacheDir(): string {
    const kind = getHostKind();
    if (kind === 'macos') {
        return join(homedir(), 'Library', 'Caches', APP_SLUG);
    }
    if (kind === 'windows') {
        const local = readEnv('LOCALAPPDATA');
        if (local !== '') {
            return join(local, APP_SLUG, 'Cache');
        }
        return join(homedir(), 'AppData', 'Local', APP_SLUG, 'Cache');
    }
    const xdgCache = readEnv('XDG_CACHE_HOME');
    if (xdgCache !== '') {
        return join(xdgCache, APP_SLUG);
    }
    return join(homedir(), '.cache', APP_SLUG);
}

/** Subdirectory for human-visible log files. */
export function logDir(): string {
    const kind = getHostKind();
    if (kind === 'macos') {
        return join(homedir(), 'Library', 'Logs', APP_SLUG);
    }
    if (kind === 'windows') {
        const local = readEnv('LOCALAPPDATA');
        if (local !== '') {
            return join(local, APP_SLUG, 'Logs');
        }
        return join(homedir(), 'AppData', 'Local', APP_SLUG, 'Logs');
    }
    const xdgState = readEnv('XDG_STATE_HOME');
    if (xdgState !== '') {
        return join(xdgState, APP_SLUG);
    }
    return join(homedir(), '.local', 'state', APP_SLUG);
}

/** Resolve the JSON config file path. */
export function configFilePath(): string {
    return join(appDataDir(), 'config.json');
}

/** Resolve the per-app "recent files" registry. */
export function recentFilesPath(): string {
    return join(appDataDir(), 'recent-files.json');
}

/** Path of the user-tunable "autostart" manifest. */
export function autostartManifestPath(): string {
    const kind = getHostKind();
    if (kind === 'macos') {
        return join(homedir(), 'Library', 'LaunchAgents', `com.${APP_SLUG}.app.plist`);
    }
    if (kind === 'windows') {
        const appData = readEnv('APPDATA');
        const base = appData !== '' ? appData : join(homedir(), 'AppData', 'Roaming');
        return join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', `${APP_SLUG}.lnk`);
    }
    // Linux: ~/.config/autostart/<desktop>.desktop (XDG)
    const xdgConfig = readEnv('XDG_CONFIG_HOME');
    const base = xdgConfig !== '' ? xdgConfig : join(homedir(), '.config');
    return join(base, 'autostart', `${APP_SLUG}.desktop`);
}

/** Path separator native to the host filesystem. */
export function pathSeparator(): string {
    return sep;
}

/** True if the host uses CRLF line endings in newly-written text files. */
export function usesCrlfLineEndings(): boolean {
    return getHostKind() === 'windows';
}

/** The host kind, exposed here so callers don't need a second import. */
export function hostKind(): HostKind {
    return getHostKind();
}

/**
 * Read an env var. Returns "" if not set.
 *
 * Perry's `process.env` is iterable and indexed by string. We wrap the
 * lookup so the rest of the file can stay strictly typed.
 */
function readEnv(name: string): string {
    const value = (process.env as Record<string, string | undefined>)[name];
    return typeof value === 'string' ? value : '';
}
