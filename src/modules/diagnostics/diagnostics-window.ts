/**
 * Diagnostics (log viewer) window factory.
 *
 * `createDiagnosticsWindow()` returns a fresh `Window` handle whose body
 * is the Diagnostics view. The controller keeps the handle and reuses
 * it (hide / show) so reopening is instant.
 *
 * The window is a plain `Window(title, w, h)` — no `level: 'floating'`
 * because `perry/ui` `Window` does not expose `setAlwaysOnTop`. Users
 * reopen via the Help menu's "Open Log Viewer" item.
 */
import { Window, type Window as PerryWindow, type Widget } from 'perry/ui';
import { DiagnosticsView } from './diagnostics-view.js';

/** Standard size of the log viewer window, in DIPs. */
const WIDTH = 900;
const HEIGHT = 600;

/** Build and show the diagnostics window. */
export function createDiagnosticsWindow(): PerryWindow {
    const body: Widget = DiagnosticsView();
    const win = Window('Log viewer — qed', WIDTH, HEIGHT);
    win.setBody(body);
    return win;
}
