/**
 * AppController — the top-level coordinator.
 *
 * Owns the main + settings window handles, the tray handle, and the
 * "background mode" / "always-on-top" booleans. Every cross-cutting
 * action (menu picks, tray clicks, button presses, IPC events) is
 * routed through `handleCommand(command)`, which dispatches to the
 * right service / window / system call.
 *
 * The controller is constructed once at startup with the bag of
 * services it needs. After that, it owns the lifecycle.
 *
 * Compatibility note: the Perry `Window` type is a *struct*, not a
 * raw `Widget` handle. It exposes `show()` / `hide()` / `close()` /
 * `setBody()` / `setSize()` / `onFocusLost()` instance methods. The
 * controller keeps `Window` objects (not raw handles) so we can call
 * those methods directly.
 */
import { App, type Window as PerryWindow, type Widget } from 'perry/ui';
import {
    appDataDir,
    cacheDir,
    enableAutostart,
    disableAutostart,
    isAutostartEnabled,
    isMacOS,
    logDir,
    platformLabel,
} from '../platform/index.js';
import type { AppCommand } from '../platform/menu-bar.js';
import { installAppMenu } from '../platform/menu-bar.js';
import { installTray } from '../platform/tray-adapter.js';
import { createSettingsWindow } from '../ui/settings-window.js';
import { createDiagnosticsWindow } from '../modules/diagnostics/index.js';
import { resolveTheme, type AppStore } from '../state/app-state.js';
import type { ControllerContext } from './app-controller-types.js';
import type { AppEvent, AppEventListener } from './app-controller-types.js';
import { diag, logger } from '../diag.js';

/* ---------------------------------------------------------------- *
 * Internal state.                                                   *
 * ---------------------------------------------------------------- */

let mainWindow: PerryWindow | null = null;
let backgroundModeEnabled = false;
let alwaysOnTopEnabled = false;
let settingsWindow: PerryWindow | null = null;
let diagnosticsWindow: PerryWindow | null = null;
let trayHandle: Widget | null = null;
let activeContext: ControllerContext | null = null;

const eventListeners: Set<AppEventListener> = new Set();
const fileManagerIntentListeners: Set<FileManagerIntentListener> = new Set();

/* ---------------------------------------------------------------- *
 * Event bus.                                                        *
 * ---------------------------------------------------------------- */

/** Subscribe to controller events. Returns an unsubscribe function. */
export function onAppEvent(listener: AppEventListener): () => void {
    eventListeners.add(listener);
    return () => {
        eventListeners.delete(listener);
    };
}

/** Subscribe to file-manager intents (menu → file manager). */
export type FileManagerIntent = 'new' | 'open' | 'save';
export type FileManagerIntentListener = (intent: FileManagerIntent) => void;
export function onFileManagerIntent(listener: FileManagerIntentListener): () => void {
    fileManagerIntentListeners.add(listener);
    return () => {
        fileManagerIntentListeners.delete(listener);
    };
}

function emit(event: AppEvent): void {
    for (const l of eventListeners) {
        try {
            l(event);
        } catch (err) {
            logger.error('controller', 'event listener threw', err);
        }
    }
}

function emitFileManagerIntent(intent: FileManagerIntent): void {
    for (const l of fileManagerIntentListeners) {
        try {
            l(intent);
        } catch (err) {
            logger.error('controller', 'intent listener threw', err);
        }
    }
}

/* ---------------------------------------------------------------- *
 * Entry point.                                                      *
 * ---------------------------------------------------------------- */

/**
 * Build the main window, install the menu bar and tray, and start the
 * run loop. This is the only function the entry point needs to call.
 *
 * Must be called exactly once, after services and IPC handlers are
 * registered, with the body widget that the main view returns.
 */
export function startApp(ctx: ControllerContext, body: Widget): void {
    diag('startApp: entered');
    activeContext = ctx;
    diag('startApp: applyAutostartFromConfig');
    applyAutostartFromConfig(ctx);
    backgroundModeEnabled = ctx.config.snapshot().backgroundMode;
    diag('startApp: backgroundMode read');

    // Wire the logger to the persisted log level. After this, every
    // config-level flip (via Settings → Advanced → Log level) is
    // applied immediately, no restart required.
    ctx.config.subscribe((c) => {
        logger.setLevel(c.logLevel);
    });

    // Wire the UI-side "Open log viewer" button to the controller's
    // openDiagnosticsWindow(). The IPC seam keeps the settings view
    // free of controller imports.
    ctx.bus.register<undefined, void>('view:open-diagnostics', () => {
        openDiagnosticsWindow();
    });

    diag('startApp: installAppMenu');
    installAppMenu(handleCommand);
    diag('startApp: menu installed');
    const tray = installTray(handleCommand, 'qed — Cross-platform desktop skeleton');
    trayHandle = tray.widget;
    diag('startApp: tray installed');

    // The main window is special: it owns the run loop.
    // Perry's `App({...})` returns void; the window is created
    // internally and tracked via the controller's `mainWindow`
    // state. We only need a handle for the rare commands that
    // hide / close the main window.
    diag('startApp: calling App({...}) (enters perry-ui run loop)');
    App({
        title: 'qed',
        width: 1100,
        height: 720,
        body,
        icon: '',
    });
    diag('startApp: App({...}) returned');
    // @todo(perry-stub): Perry's stub does not give us a Window handle
    // back from `App({...})`. The placeholder below lets subsequent
    // commands no-op gracefully instead of crashing on a null handle.
    // Replace with `mainWindow = returnedWindow` once Perry exposes
    // a Window return type from `App()`.
    mainWindow = null;
}

function isStarted(): boolean {
    // @todo(perry-stub): this is always `false` until Perry returns
    // a Window handle from `App()`. Tracks the same placeholder as
    // `mainWindow` above.
    return mainWindow !== null;
}

/* ---------------------------------------------------------------- *
 * Command dispatcher.                                               *
 * ---------------------------------------------------------------- */

/** Route a single app command to the right behaviour. */
export function handleCommand(command: AppCommand): void {
    switch (command) {
        case 'app.about':
            navigateTo('about');
            return;
        case 'app.preferences':
            openSettingsWindow();
            return;
        case 'app.hide':
            if (mainWindow !== null) {
                mainWindow.hide();
            }
            return;
        case 'app.hideOthers':
            return;
        case 'app.showAll':
            if (mainWindow !== null) {
                mainWindow.show();
            }
            return;
        case 'app.quit':
            if (mainWindow !== null) {
                mainWindow.close();
            }
            return;
        case 'file.new':
            navigateTo('file-manager');
            emitFileManagerIntent('new');
            return;
        case 'file.open':
            navigateTo('file-manager');
            emitFileManagerIntent('open');
            return;
        case 'file.save':
            navigateTo('file-manager');
            emitFileManagerIntent('save');
            return;
        case 'edit.undo':
        case 'edit.redo':
        case 'edit.cut':
        case 'edit.copy':
        case 'edit.paste':
        case 'edit.selectAll':
            return;
        case 'view.toggleTheme':
            cycleTheme();
            return;
        case 'view.toggleAlwaysOnTop':
            toggleAlwaysOnTop();
            return;
        case 'view.openDiagnostics':
            openDiagnosticsWindow();
            return;
        case 'help.docs':
            if (activeContext !== null) {
                activeContext.shell.openUrl('https://docs.perryts.com/');
            }
            return;
        case 'help.openLogDir':
            if (activeContext !== null) {
                activeContext.shell.revealInFileManager(logDir());
            }
            return;
        default: {
            const _exhaustive: never = command;
            void _exhaustive;
        }
    }
}

/* ---------------------------------------------------------------- *
 * Public actions (also exposed as buttons in the UI).               *
 * ---------------------------------------------------------------- */

export type Route = 'file-manager' | 'settings' | 'about';

/** Switch the sidebar's active route. */
export function navigateTo(route: Route): void {
    emit({ kind: 'route-changed', route });
}

/** Open (or show, if already open) the secondary settings window. */
export function openSettingsWindow(): void {
    if (activeContext === null) {
        return;
    }
    if (settingsWindow === null) {
        settingsWindow = createSettingsWindow(activeContext.bus, activeContext.store, activeContext.shell);
    } else {
        settingsWindow.show();
    }
    emit({ kind: 'settings-window-opened' });
}

/** Hide the settings window without destroying it. */
export function closeSettingsWindow(): void {
    if (settingsWindow === null) {
        return;
    }
    settingsWindow.hide();
    emit({ kind: 'settings-window-closed' });
}

/** Open (or show, if already open) the diagnostics (log viewer) window. */
export function openDiagnosticsWindow(): void {
    if (diagnosticsWindow === null) {
        diagnosticsWindow = createDiagnosticsWindow();
    } else {
        diagnosticsWindow.show();
    }
}

/** Hide the diagnostics window without destroying it. */
export function closeDiagnosticsWindow(): void {
    if (diagnosticsWindow === null) {
        return;
    }
    diagnosticsWindow.hide();
}

/** Close (or hide, in background mode) the main window. */
export function closeMainWindow(): void {
    if (mainWindow === null) {
        return;
    }
    if (backgroundModeEnabled) {
        mainWindow.hide();
    } else {
        mainWindow.close();
    }
}

/* ---------------------------------------------------------------- *
 * Settings that affect the OS shell.                               *
 * ---------------------------------------------------------------- */

function applyAutostartFromConfig(ctx: ControllerContext): void {
    const want = ctx.config.snapshot().autostart;
    const have = isAutostartEnabled();
    if (want && !have) {
        try {
            enableAutostart();
        } catch (err) {
            logger.error('autostart', 'enable failed', err);
        }
    } else if (!want && have) {
        try {
            disableAutostart();
        } catch (err) {
            logger.error('autostart', 'disable failed', err);
        }
    }
}

/** Toggle the main window's always-on-top state. */
export function toggleAlwaysOnTop(): void {
    alwaysOnTopEnabled = !alwaysOnTopEnabled;
    // Perry's `Window` does not expose always-on-top today. The
    // flag is tracked so the menu reflects the current state; a
    // future perry release can call into it.
    emit({ kind: 'always-on-top-changed', enabled: alwaysOnTopEnabled });
}

/** Cycle System → Light → Dark → System. */
function cycleTheme(): void {
    if (activeContext === null) {
        return;
    }
    const current = activeContext.config.snapshot().theme;
    const next: 'system' | 'light' | 'dark' =
        current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    activeContext.config.setTheme(next);
    emit({ kind: 'theme-changed', theme: resolveTheme(next) });
}

/* ---------------------------------------------------------------- *
 * Lifecycle.                                                        *
 * ---------------------------------------------------------------- */

/** Called when the user re-activates the app. */
export function onAppActivate(_ctx: ControllerContext): void {
    void _ctx;
    if (mainWindow !== null) {
        mainWindow.show();
    }
}

/** Called on graceful shutdown. */
export function onAppTerminate(ctx: ControllerContext): void {
    // Flush the in-memory ring buffer first so trailing diagnostics
    // survive a clean shutdown. (Buffer is currently append-on-write;
    // flush is a sync point, future-proofing for buffered I/O.)
    logger.flush();
    try {
        ctx.config.flushNow();
    } catch (err) {
        logger.error('controller', 'terminate: config flush failed', err);
    }
    if (trayHandle !== null) {
        trayHandle = null;
    }
    if (settingsWindow !== null) {
        settingsWindow = null;
    }
}

/** Called when the app moves to the background (Perry has no native
 * hook for this today; we expose the function so the entry point
 * can wire it in once a hook ships). */
export function onAppBackground(): void {
    logger.info('lifecycle', 'background', 'entered background');
}

/** Called when the app becomes active again. */
export function onAppForeground(): void {
    logger.info('lifecycle', 'foreground', 'became active');
}

/* ---------------------------------------------------------------- *
 * Diagnostics — re-exported for the about / settings pages.         *
 * ---------------------------------------------------------------- */

/** A snapshot of platform paths, used by the about and settings views. */
export function describeEnvironment(): {
    readonly host: string;
    readonly appDataDir: string;
    readonly cacheDir: string;
    readonly logDir: string;
} {
    return {
        host: platformLabel(),
        appDataDir: appDataDir(),
        cacheDir: cacheDir(),
        logDir: logDir(),
    };
}

export { isStarted };
export { isMacOS };

/* ---------------------------------------------------------------- *
 * Re-exports.                                                       *
 * ---------------------------------------------------------------- */

export type { ControllerContext, AppEvent, AppEventListener } from './app-controller-types.js';
export type { AppCommand } from '../platform/menu-bar.js';
export type { AppStore };
