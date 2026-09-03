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
 */
import {
    App,
    windowShow,
    windowHide,
    windowClose,
    windowMinimize,
    windowMaximize,
    windowRestore,
    windowSetAlwaysOnTop,
    type Widget,
} from 'perry/ui';
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
import { ShellService } from '../services/shell-service.js';
import { createSettingsWindow } from '../ui/settings-window.js';
import { resolveTheme, type AppStore } from '../state/app-state.js';
import type { ControllerContext } from './app-controller-types.js';
import type { AppEvent, AppEventListener } from './app-controller-types.js';

/* ---------------------------------------------------------------- *
 * Internal state.                                                   *
 * ---------------------------------------------------------------- */

let mainWindowHandle: Widget | null = null;
let backgroundModeEnabled = false;
let alwaysOnTopEnabled = false;
let settingsWindowHandle: Widget | null = null;
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
            // eslint-disable-next-line no-console
            console.error('app event listener threw:', err);
        }
    }
}

function emitFileManagerIntent(intent: FileManagerIntent): void {
    for (const l of fileManagerIntentListeners) {
        try {
            l(intent);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('file manager intent listener threw:', err);
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
    activeContext = ctx;
    applyAutostartFromConfig(ctx);
    applyBackgroundModeFromConfig(ctx);

    installAppMenu(handleCommand);
    const tray = installTray(handleCommand, 'qed — Cross-platform desktop skeleton');
    trayHandle = tray.widget;

    // The main window is special: it owns the run loop.
    // App({...}) returns void in our perry stub but a real window handle
    // on a build with the perry runtime; we cast for type compatibility.
    const handle = App({
        title: 'qed',
        width: 1100,
        height: 720,
        body,
        frameless: true,
        vibrancy: isMacOS() ? 'sidebar' : 'none',
        activationPolicy: isMacOS() ? (backgroundModeEnabled ? 'accessory' : 'regular') : undefined,
    }) as unknown as Widget;
    mainWindowHandle = handle;
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
            if (isMacOS() && mainWindowHandle !== null) {
                windowHide(mainWindowHandle);
            }
            return;
        case 'app.hideOthers':
            return;
        case 'app.showAll':
            if (mainWindowHandle !== null) {
                windowShow(mainWindowHandle);
            }
            return;
        case 'app.quit':
            if (mainWindowHandle !== null) {
                windowClose(mainWindowHandle);
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
            // Perry's UI has no built-in text editor; the OS handles
            // clipboard edits when a TextField / TextArea is focused.
            return;
        case 'view.toggleTheme':
            cycleTheme();
            return;
        case 'view.toggleAlwaysOnTop':
            toggleAlwaysOnTop();
            return;
        case 'help.docs':
            new ShellService().openUrl('https://docs.perryts.com/');
            return;
        case 'help.openLogDir':
            new ShellService().revealInFileManager(logDir());
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
    if (settingsWindowHandle === null) {
        settingsWindowHandle = createSettingsWindow(activeContext.bus, activeContext.store);
    } else {
        windowShow(settingsWindowHandle);
    }
    emit({ kind: 'settings-window-opened' });
}

/** Hide the settings window without destroying it. */
export function closeSettingsWindow(): void {
    if (settingsWindowHandle === null) {
        return;
    }
    windowHide(settingsWindowHandle);
    emit({ kind: 'settings-window-closed' });
}

/** Minimize the main window. */
export function minimizeMainWindow(): void {
    if (mainWindowHandle === null) {
        return;
    }
    windowMinimize(mainWindowHandle);
}

/** Maximize the main window. */
export function maximizeMainWindow(): void {
    if (mainWindowHandle === null) {
        return;
    }
    windowMaximize(mainWindowHandle);
}

/** Restore the main window from a maximized / fullscreen state. */
export function restoreMainWindow(): void {
    if (mainWindowHandle === null) {
        return;
    }
    windowRestore(mainWindowHandle);
}

/** Close (or hide, in background mode) the main window. */
export function closeMainWindow(): void {
    if (mainWindowHandle === null) {
        return;
    }
    if (backgroundModeEnabled) {
        windowHide(mainWindowHandle);
    } else {
        windowClose(mainWindowHandle);
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
            // eslint-disable-next-line no-console
            console.error('autostart enable failed:', err);
        }
    } else if (!want && have) {
        try {
            disableAutostart();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('autostart disable failed:', err);
        }
    }
}

function applyBackgroundModeFromConfig(ctx: ControllerContext): void {
    backgroundModeEnabled = ctx.config.snapshot().backgroundMode;
}

/** Toggle the main window's always-on-top state. */
export function toggleAlwaysOnTop(): void {
    alwaysOnTopEnabled = !alwaysOnTopEnabled;
    if (mainWindowHandle !== null) {
        windowSetAlwaysOnTop(mainWindowHandle, alwaysOnTopEnabled);
    }
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
export function onAppActivate(): void {
    if (mainWindowHandle !== null) {
        windowShow(mainWindowHandle);
    }
}

/** Called on graceful shutdown. */
export function onAppTerminate(ctx: ControllerContext): void {
    try {
        ctx.config.flushNow();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('config flush failed on terminate:', err);
    }
    // Touch the handles so the variables aren't flagged as unused.
    if (trayHandle !== null) {
        trayHandle = null;
    }
    if (settingsWindowHandle !== null) {
        settingsWindowHandle = null;
    }
}

/** Called when the app moves to the background. */
export function onAppBackground(): void {
    // v1: just log. Future work: pause background tasks here.
    // eslint-disable-next-line no-console
    console.log('app entered background');
}

/** Called when the app becomes active again. */
export function onAppForeground(): void {
    // v1: just log. Future work: refresh caches here.
    // eslint-disable-next-line no-console
    console.log('app became active');
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

/** Type guard for whether the controller has been started. */
export function isStarted(): boolean {
    return mainWindowHandle !== null;
}

/* ---------------------------------------------------------------- *
 * Re-exports.                                                       *
 * ---------------------------------------------------------------- */

export type { ControllerContext, AppEvent, AppEventListener } from './app-controller-types.js';
export type { AppCommand, CommandHandler } from '../platform/menu-bar.js';

/**
 * Helper for the views: a no-op `AppStore` is fine here because the
 * store is created at startup and the controller talks to it via the
 * `activeContext` reference. This re-export keeps the public surface
 * small.
 */
export type { AppStore };
