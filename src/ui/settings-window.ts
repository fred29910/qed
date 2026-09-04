/**
 * Settings window factory.
 *
 * `createSettingsWindow()` returns a fresh `Window` handle whose
 * body is the Settings module's view. The controller keeps the
 * handle around and reuses it (hide / show) so reopening is instant.
 */
import { Window, type Window as PerryWindow, type Widget } from 'perry/ui';
import { SettingsView } from '../modules/settings/index.js';
import type { IpcBus } from '../ipc/bus.js';
import type { AppStore } from '../state/app-state.js';
import type { ShellService } from '../services/shell-service.js';

/** Standard size of the settings window, in DIPs. */
const WIDTH = 640;
const HEIGHT = 480;

/** Build and show the settings window. */
export function createSettingsWindow(bus: IpcBus, store: AppStore, shell: ShellService): PerryWindow {
    const body: Widget = SettingsView(bus, store, shell);
    const win = Window('Settings — qed', WIDTH, HEIGHT);
    win.setBody(body);
    return win;
}
