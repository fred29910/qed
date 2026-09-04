/**
 * App-level command / event types.
 *
 * The controller is the single dispatcher: menu items, tray actions,
 * keyboard shortcuts, and in-app button presses all funnel into
 * `AppController.handleCommand(command)`. Keeping the union exhaustive
 * in one place makes it easy to add a command and impossible to forget
 * to handle it (TypeScript exhaustiveness check).
 *
 * NOTE: This file is a *superset* of `platform/menu-bar.ts`'s
 * `AppCommand`. We re-export it so the rest of the app only needs to
 * import from `app/`.
 */
import type { AppCommand } from '../platform/menu-bar.js';
export type { AppCommand, CommandHandler } from '../platform/menu-bar.js';

/** All current app commands. Mirrors the menu bar union. */
export type KnownAppCommand = AppCommand;

/* ---------------------------------------------------------------- *
 * Internal events the controller emits (UI observes, doesn't reply). *
 * ---------------------------------------------------------------- */

/** An internal event the controller publishes via the store. */
export type AppEvent =
    | { readonly kind: 'route-changed'; readonly route: 'file-manager' | 'settings' | 'about' }
    | { readonly kind: 'settings-window-opened' }
    | { readonly kind: 'settings-window-closed' }
    | { readonly kind: 'always-on-top-changed'; readonly enabled: boolean }
    | { readonly kind: 'background-mode-changed'; readonly enabled: boolean }
    | { readonly kind: 'theme-changed'; readonly theme: 'light' | 'dark' };

/** A subscriber to controller events. */
export type AppEventListener = (event: AppEvent) => void;

/* ---------------------------------------------------------------- *
 * Controller construction shape.                                     *
 * ---------------------------------------------------------------- */

/** Bag of services the controller needs to do its job. */
export interface ControllerContext {
    readonly bus: import('../ipc/bus.js').IpcBus;
    readonly config: import('../services/config-service.js').ConfigService;
    readonly files: import('../services/file-service.js').FileService;
    readonly recent: import('../services/recent-files-service.js').RecentFilesService;
    readonly notifications: import('../services/notification-service.js').NotificationService;
    readonly shell: import('../services/shell-service.js').ShellService;
    readonly store: import('../state/app-state.js').AppStore;
}
