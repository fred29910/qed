/**
 * Cross-platform adaptation layer.
 *
 * Re-exports the per-host modules so callers can do:
 *
 *   import { installTray, appDataDir, isMacOS } from "../platform/index.js";
 *
 * The split is by concern (paths / fs / autostart / menu / tray) so each
 * file is testable in isolation, but the barrel hides that from the
 * controller / module layer.
 */
export * from "./platform.js";
export * from "./paths.js";
export * from "./fs-permissions.js";
export * from "./autostart.js";
export * from "./menu-bar.js";
export * from "./tray-adapter.js";
