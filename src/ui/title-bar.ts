/**
 * Frameless custom title bar.
 *
 * The main window is created with `frameless: true`, so we have to
 * draw our own title bar. It is a horizontal stack with three
 * regions:
 *
 *   [app-name ............ module-title ............ window-controls]
 *
 * The window controls (minimize / maximize / close) call into the
 * controller, which owns the window handles.
 *
 * On macOS, AppKit draws the traffic lights in the top-left even
 * when the window is frameless. We reserve space for them with a
 * leading spacer so the app name doesn't overlap.
 */
import { Button, HStack, Spacer, Text, VStack, type Widget } from 'perry/ui';
import { isMacOS } from '../platform/index.js';
import {
    closeMainWindow,
    maximizeMainWindow,
    minimizeMainWindow,
    restoreMainWindow,
} from '../app/app-controller.js';
import { paintMuted, paintText, paintDanger } from './theme.js';

/** A title bar bound to a particular module name. */
export function TitleBar(moduleTitle: string): Widget {
    // On macOS, leave room for the traffic lights (~78 px).
    const leading = isMacOS() ? Spacer() : Text('');

    const appName = Text('qed');
    paintText(appName);

    const title = Text(moduleTitle);
    paintMuted(title);

    const controls = WindowControls();
    return HStack(8, [leading, appName, Spacer(), title, Spacer(), controls]);
}

/* ---------------------------------------------------------------- *
 * Window controls.                                                  *
 * ---------------------------------------------------------------- */

/** The minimise / maximise / close cluster on the right of the bar. */
function WindowControls(): Widget {
    const min = Button('—', () => minimizeMainWindow());
    const max = Button('◻', () => maximizeMainWindow());
    const restore = Button('◱', () => restoreMainWindow());
    const close = Button('✕', () => closeMainWindow());
    paintDanger(close);
    paintMuted(min);
    paintMuted(max);
    paintMuted(restore);
    // Wrap the cluster in a small VStack so it keeps its height
    // consistent across hosts (the perry runtime infers the
    // intrinsic height from the tallest child).
    return VStack(2, [HStack(4, [min, max, restore, close])]);
}
