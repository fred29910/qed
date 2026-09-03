/**
 * Settings window factory.
 *
 * `createSettingsWindow()` returns a fresh `Window` handle whose
 * body is the Settings module's view. The controller keeps the
 * handle around and reuses it (hide / show) so reopening is instant.
 *
 * The window is 640×480, resizable=false (so the form layout doesn't
 * break), and always-on-top by default. The user can toggle the
 * always-on-top bit from the View menu.
 */
import { Window, type Widget } from 'perry/ui';
import { SettingsView } from '../modules/settings/index.js';
import type { IpcBus } from '../ipc/bus.js';
import type { AppStore } from '../state/app-state.js';

/** Standard size of the settings window, in DIPs. */
const WIDTH = 640;
const HEIGHT = 480;

/** Build and show the settings window. */
export function createSettingsWindow(bus: IpcBus, store: AppStore): Widget {
    const body: Widget = SettingsView(bus, store);
    return Window({
        title: 'Settings — qed',
        width: WIDTH,
        height: HEIGHT,
        body,
        resizable: false,
        alwaysOnTop: true,
        frameless: false,
    });
}
