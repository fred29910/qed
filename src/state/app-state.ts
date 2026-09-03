/**
 * Global app store.
 *
 * A small pub-sub container that holds:
 *   - the active route (which module the sidebar has selected),
 *   - the current `AppConfig` (kept in sync with the ConfigService),
 *   - the recent-files list (kept in sync with the RecentFilesService),
 *   - a transient `lastError` string and an `isBusy` flag for the
 *     status bar / toast,
 *   - the resolved theme (computed from `config.theme` and
 *     `isDarkMode()`).
 *
 * The store is the *only* place that owns mutable, observable app
 * state. UI modules read from it (via `getState()`) and write through
 * it (via setters). The store emits change events on every mutation
 * so widgets that build their tree from a `State<>` getter can be
 * re-rendered.
 *
 * Why a custom store and not just `State<T>` everywhere? `State<T>`
 * is great for fine-grained reactivity, but the app also has
 * imperative events ("open settings window", "show error toast")
 * that aren't a `T` you can put in a cell. The store gives us a
 * single seam for both.
 */
import { isDarkMode } from 'perry/system';
import { isLinux, isMacOS, isWindows } from '../platform/index.js';
import { logger } from '../diag.js';
import type { AppConfig, ThemeMode } from '../types/index.js';
import type { ConfigService } from '../services/config-service.js';
import type { RecentFilesService } from '../services/recent-files-service.js';

/** The three modules the sidebar can route to. */
export type Route = 'file-manager' | 'settings' | 'about';

/** A concrete palette selection, derived from the config + system. */
export type ResolvedTheme = 'light' | 'dark';

/** Immutable snapshot of the store. Consumers must not mutate. */
export interface AppState {
    readonly route: Route;
    readonly config: AppConfig;
    readonly resolvedTheme: ResolvedTheme;
    readonly recentFiles: readonly string[];
    readonly lastError: string | null;
    readonly isBusy: boolean;
}

/** Subscriber callback. Receives the new state. */
export type StoreListener = (state: AppState) => void;

const INITIAL: AppState = {
    route: 'file-manager',
    config: {
        version: 2,
        theme: 'system',
        autostart: false,
        notifications: true,
        backgroundMode: false,
        lastFolder: '',
        fontSize: 13,
        displayName: '',
        logLevel: 'info',
    },
    resolvedTheme: 'light',
    recentFiles: [],
    lastError: null,
    isBusy: false,
};

export class AppStore {
    private state: AppState = INITIAL;
    private readonly listeners: Set<StoreListener> = new Set();
    private readonly configUnsub: () => void;
    private readonly recentFiles: RecentFilesService;

    constructor(config: ConfigService, recent: RecentFilesService) {
        this.configUnsub = config.subscribe((c) => this.applyConfig(c));
        this.recentFiles = recent;
        this.state = {
            ...this.state,
            config: config.snapshot(),
            resolvedTheme: resolveTheme(config.snapshot().theme),
            recentFiles: recent.list(),
        };
    }

    /** Return the current state snapshot. */
    getState(): AppState {
        return this.state;
    }

    /** Subscribe to *all* state changes. Returns an unsubscribe. */
    subscribe(listener: StoreListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Switch the active sidebar route. */
    setRoute(route: Route): void {
        if (this.state.route === route) {
            return;
        }
        this.update({ route });
    }

    /** Set a transient error message (cleared by `clearError()` or replaced). */
    setError(message: string): void {
        this.update({ lastError: message });
    }

    /** Clear the last error. */
    clearError(): void {
        if (this.state.lastError === null) {
            return;
        }
        this.update({ lastError: null });
    }

    /** Set the busy flag (used by long-running ops). */
    setBusy(busy: boolean): void {
        if (this.state.isBusy === busy) {
            return;
        }
        this.update({ isBusy: busy });
    }

    /** Force a re-resolution of the theme (call when the OS theme changes). */
    refreshTheme(): void {
        this.update({ resolvedTheme: resolveTheme(this.state.config.theme) });
    }

    /** Tear down. */
    dispose(): void {
        this.listeners.clear();
        this.configUnsub();
    }

    // ----------------------------------------------------------------
    // Internal
    // ----------------------------------------------------------------

    private applyConfig(config: AppConfig): void {
        this.update({
            config,
            resolvedTheme: resolveTheme(config.theme),
        });
    }

    private update(patch: Partial<AppState>): void {
        this.state = { ...this.state, ...patch };
        for (const l of this.listeners) {
            try {
                l(this.state);
            } catch (err) {
                // Listeners must not break the dispatcher.
                logger.error('store', 'listener threw', err);
            }
        }
    }

    // Used by tests / extensions that want to track *just* the recent list.
    refreshRecentFiles(): void {
        const list = this.recentFiles.list();
        this.update({ recentFiles: list });
    }
}

/**
 * Pure helper exposed for tests. Resolves a config theme to a
 * concrete light / dark.
 */
export function resolveTheme(theme: ThemeMode): ResolvedTheme {
    if (theme === 'light') {
        return 'light';
    }
    if (theme === 'dark') {
        return 'dark';
    }
    return isDarkMode() ? 'dark' : 'light';
}

/** A tiny standalone helper used by the about module. */
export function describePlatform(): string {
    if (isMacOS()) {
        return 'macOS';
    }
    if (isWindows()) {
        return 'Windows';
    }
    if (isLinux()) {
        return 'Linux';
    }
    return 'Unknown';
}
