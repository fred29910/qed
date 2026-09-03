/**
 * Persisted configuration shape.
 *
 * The on-disk format is JSON; the schema is versioned so we can migrate
 * older configs without crashing. The runtime is free to add new fields
 * to `AppConfig` as long as the default value satisfies the type.
 */
import type { LogLevel } from '../diag.js';

export type ThemeMode = 'system' | 'light' | 'dark';

/** User-facing config. */
export interface AppConfig {
    /** Schema version. Bump when fields are added/removed/renamed. */
    readonly version: 2;
    /** Last explicitly chosen theme. */
    readonly theme: ThemeMode;
    /** Whether the app should run at login. */
    readonly autostart: boolean;
    /** Show notifications when long-running ops complete. */
    readonly notifications: boolean;
    /** Hide the dock/taskbar icon and live in the tray. */
    readonly backgroundMode: boolean;
    /** Last folder the file manager opened. */
    readonly lastFolder: string;
    /** Editor font size in points. */
    readonly fontSize: number;
    /** User-set display name (optional). */
    readonly displayName: string;
    /**
     * Minimum severity written by the in-app logger. `silent` disables
     * every entry; `trace` is the most verbose. Default `info`.
     */
    readonly logLevel: LogLevel;
}

/** Default config. Used when no file is present or the file is corrupt. */
export const DEFAULT_CONFIG: AppConfig = {
    version: 2,
    theme: 'system',
    autostart: false,
    notifications: true,
    backgroundMode: false,
    lastFolder: '',
    fontSize: 13,
    displayName: '',
    logLevel: 'info',
};
