/**
 * System tray adapter.
 *
 * Perry ships a cross-platform tray API (`perry/ui`). Each host has its
 * own conventions for what the tray icon *means* and when its menu pops:
 *
 *   - macOS  : The tray is the menu bar status item (top-right). The
 *              menu pops on every left-click. There is no "left-click
 *              = show window, right-click = menu" split.
 *   - Windows: The tray is the notification area (bottom-right). Left
 *              click fires `onClick`; right click pops the menu.
 *   - Linux  : StatusNotifierItem (KSNI). Behaves like Windows in our
 *              config; GNOME without the `appindicator` extension keeps
 *              the service alive but doesn't render the icon.
 *
 * This adapter unifies the click behaviour: on every host the user can
 * both left-click to show the main window AND right-click to open the
 * context menu. macOS is the only host where both triggers are folded
 * into the same click (pop menu).
 *
 * The adapter is intentionally minimal — the controller wires the
 * onClick / menu actions to its command bus.
 */
import {
    menuAddItem,
    menuAddSeparator,
    menuCreate,
    trayAttachMenu,
    trayCreate,
    trayOnClick,
    traySetTooltip,
    type Widget,
} from 'perry/ui';
import { isMacOS } from './platform.js';
import type { CommandHandler } from './menu-bar.js';

/** Result of setting up the tray. */
export interface TrayHandle {
    /** The tray widget handle — exposed for icon hot-swap or removal. */
    readonly widget: Widget;
    /** True if the host actually rendered a visible icon. */
    readonly visible: boolean;
}

/**
 * Install the system tray icon, tooltip, and context menu.
 *
 * The onClick handler fires on Windows / Linux when the user left-clicks
 * the icon. On macOS the menu always pops on click, so `onClick` only
 * fires when no menu is attached. We always attach a menu, so the
 * effective behaviour is:
 *
 *   - macOS  : click → menu pops
 *   - Windows: left-click → `onShowMain`, right-click → menu
 *   - Linux  : left-click → `onShowMain`, right-click → menu
 */
export function installTray(handler: CommandHandler, tooltip: string): TrayHandle {
    // Empty path → "●" placeholder. We intentionally don't ship a PNG
    // because the cross-platform icon format requirements differ
    // (PNG everywhere, .icns on macOS, .ico on Windows). Users can
    // replace the placeholder with `traySetIcon` once a real asset is
    // added to `platforms/<host>/tray.png`.
    const tray: Widget = trayCreate('');
    traySetTooltip(tray, tooltip);

    const menu = menuCreate();
    menuAddItem(menu, 'Show Main Window', () => handler('app.about'));
    menuAddSeparator(menu);
    menuAddItem(menu, 'Open File Manager', () => handler('file.open'));
    menuAddItem(menu, 'Preferences…', () => handler('app.preferences'));
    menuAddSeparator(menu);
    menuAddItem(menu, 'About', () => handler('app.about'));
    menuAddItem(menu, 'Quit', () => handler('app.quit'));
    trayAttachMenu(tray, menu);

    // On Windows / Linux, the user gets an "extra" left-click → show main.
    // On macOS this callback would only fire when the menu is missing, so
    // we still register it for consistency; macOS users see the menu.
    if (!isMacOS()) {
        trayOnClick(tray, () => handler('app.about'));
    }

    return { widget: tray, visible: true };
}
