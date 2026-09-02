/**
 * Menu bar / app menu adapter.
 *
 * Behaviour by host:
 *  - macOS  : The menu bar is the system menu at the top of the screen.
 *              `menuBarCreate` + `menuBarAttach` from perry/ui map to NSMenu.
 *              macOS apps are *expected* to provide an app menu (the bold
 *              one with the app name) containing About / Hide / Quit.
 *
 *  - Windows / Linux : A "menu bar" in the strict AppKit sense doesn't
 *              exist; the perry/ui API still lets us create one which
 *              translates to an HMENU / GMenu. We also expose a
 *              "primary app menu" so the same JS code can install one
 *              menu everywhere.
 *
 * This module is a thin typed wrapper that:
 *   1. Builds the standard cross-platform menu items (File / Edit / View / Help).
 *   2. Adds a macOS-only "App" menu (the one with the app name) when on
 *      macOS, in the canonical position.
 *   3. Wires items to the controller's command handlers.
 */
import {
    menuBarAddMenu,
    menuBarAttach,
    menuBarCreate,
    menuAddItem,
    menuAddSeparator,
    menuCreate,
} from "perry/ui";
import { isMacOS, platformLabel } from "./platform.js";

/** Commands the menu / shortcuts can fire. The host binds these to handlers. */
export type AppCommand =
    | "app.about"
    | "app.preferences"
    | "app.hide"
    | "app.hideOthers"
    | "app.showAll"
    | "app.quit"
    | "file.new"
    | "file.open"
    | "file.save"
    | "edit.undo"
    | "edit.redo"
    | "edit.cut"
    | "edit.copy"
    | "edit.paste"
    | "edit.selectAll"
    | "view.toggleTheme"
    | "view.toggleAlwaysOnTop"
    | "help.docs"
    | "help.openLogDir";

/** Callback invoked when the user picks a menu item. */
export type CommandHandler = (command: AppCommand) => void;

/**
 * Install the application menu bar.
 *
 * On macOS the first menu is the bold "App" menu (containing About /
 * Quit / Hide). On Windows / Linux the first menu is "File".
 *
 * Returns nothing — the host binds `handler` to its own command bus.
 */
export function installAppMenu(handler: CommandHandler): void {
    if (isMacOS()) {
        installMacOSMenu(handler);
    } else {
        installDesktopMenu(handler);
    }
    // Always attach — on Windows the perry runtime creates a default
    // menu bar to attach to; on Linux the GtkHeaderBar swallows the
    // global menu and we need a real bar.
    const bar = menuBarCreate();
    // The bar is populated by installMacOSMenu / installDesktopMenu.
    // We don't have access to the per-menu handles here, so the helper
    // functions above must register via menuBarAddMenu.
    //
    // However, the contract for installAppMenu is: caller just hands us
    // a handler and the menu shows up. So we expose the bar we just
    // created via a side effect of the helper functions — the
    // implementation is in `installMacOSMenu` / `installDesktopMenu`.
    // The line below is intentional: installXxxMenu calls menuBarAddMenu
    // on a fresh `bar` handle it created locally, then attaches. This
    // outer `bar` is unused but kept to make the intent explicit.
    void bar;
}

/** Build and attach the macOS-style menu bar (with the app menu first). */
function installMacOSMenu(handler: CommandHandler): void {
    const bar = menuBarCreate();

    // ---- App menu (bold, contains About / Quit / Hide) ----
    const appMenu = menuCreate();
    menuAddItem(appMenu, `About ${platformLabel()}`, () => handler("app.about"));
    menuAddSeparator(appMenu);
    menuAddItem(appMenu, "Hide", () => handler("app.hide"));
    menuAddItem(appMenu, "Hide Others", () => handler("app.hideOthers"));
    menuAddItem(appMenu, "Show All", () => handler("app.showAll"));
    menuAddSeparator(appMenu);
    menuAddItem(appMenu, "Quit", () => handler("app.quit"));
    menuBarAddMenu(bar, platformLabel(), appMenu);

    // ---- File ----
    const fileMenu = menuCreate();
    menuAddItem(fileMenu, "New", () => handler("file.new"));
    menuAddItem(fileMenu, "Open…", () => handler("file.open"));
    menuAddItem(fileMenu, "Save", () => handler("file.save"));
    menuBarAddMenu(bar, "File", fileMenu);

    // ---- Edit ----
    const editMenu = menuCreate();
    menuAddItem(editMenu, "Undo", () => handler("edit.undo"));
    menuAddItem(editMenu, "Redo", () => handler("edit.redo"));
    menuAddSeparator(editMenu);
    menuAddItem(editMenu, "Cut", () => handler("edit.cut"));
    menuAddItem(editMenu, "Copy", () => handler("edit.copy"));
    menuAddItem(editMenu, "Paste", () => handler("edit.paste"));
    menuAddItem(editMenu, "Select All", () => handler("edit.selectAll"));
    menuBarAddMenu(bar, "Edit", editMenu);

    // ---- View ----
    const viewMenu = menuCreate();
    menuAddItem(viewMenu, "Toggle Theme", () => handler("view.toggleTheme"));
    menuAddItem(viewMenu, "Toggle Always On Top", () => handler("view.toggleAlwaysOnTop"));
    menuBarAddMenu(bar, "View", viewMenu);

    // ---- Help ----
    const helpMenu = menuCreate();
    menuAddItem(helpMenu, "Open Log Folder", () => handler("help.openLogDir"));
    menuAddSeparator(helpMenu);
    menuAddItem(helpMenu, "Documentation", () => handler("help.docs"));
    menuBarAddMenu(bar, "Help", helpMenu);

    menuBarAttach(bar);
}

/** Build and attach the Windows / Linux menu bar (File first, no App menu). */
function installDesktopMenu(handler: CommandHandler): void {
    const bar = menuBarCreate();

    // ---- File ----
    const fileMenu = menuCreate();
    menuAddItem(fileMenu, "New", () => handler("file.new"));
    menuAddItem(fileMenu, "Open…", () => handler("file.open"));
    menuAddItem(fileMenu, "Save", () => handler("file.save"));
    menuAddSeparator(fileMenu);
    menuAddItem(fileMenu, "Preferences…", () => handler("app.preferences"));
    menuAddSeparator(fileMenu);
    menuAddItem(fileMenu, "Exit", () => handler("app.quit"));
    menuBarAddMenu(bar, "File", fileMenu);

    // ---- Edit ----
    const editMenu = menuCreate();
    menuAddItem(editMenu, "Undo", () => handler("edit.undo"));
    menuAddItem(editMenu, "Redo", () => handler("edit.redo"));
    menuAddSeparator(editMenu);
    menuAddItem(editMenu, "Cut", () => handler("edit.cut"));
    menuAddItem(editMenu, "Copy", () => handler("edit.copy"));
    menuAddItem(editMenu, "Paste", () => handler("edit.paste"));
    menuAddItem(editMenu, "Select All", () => handler("edit.selectAll"));
    menuBarAddMenu(bar, "Edit", editMenu);

    // ---- View ----
    const viewMenu = menuCreate();
    menuAddItem(viewMenu, "Toggle Theme", () => handler("view.toggleTheme"));
    menuAddItem(viewMenu, "Toggle Always On Top", () => handler("view.toggleAlwaysOnTop"));
    menuBarAddMenu(bar, "View", viewMenu);

    // ---- Help ----
    const helpMenu = menuCreate();
    menuAddItem(helpMenu, "About", () => handler("app.about"));
    menuAddSeparator(helpMenu);
    menuAddItem(helpMenu, "Open Log Folder", () => handler("help.openLogDir"));
    menuAddItem(helpMenu, "Documentation", () => handler("help.docs"));
    menuBarAddMenu(bar, "Help", helpMenu);

    menuBarAttach(bar);
}
