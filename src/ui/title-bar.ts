/**
 * Frameless custom title bar.
 *
 * The main window is created with `App({...})`. Perry's runtime draws
 * the native title bar / traffic lights where appropriate, so this
 * widget is a thin wrapper that shows the app name and the current
 * module title.
 *
 * Layout:
 *
 *   [app-name ............................... module-title]
 *
 * Future work: add custom minimize / maximize / close buttons once
 * Perry's `Window` exposes those methods.
 */
import { HStack, Spacer, Text, type Widget } from 'perry/ui';
import { paintMuted, paintText } from './theme.js';

/** A title bar bound to a particular module name. */
export function TitleBar(moduleTitle: string): Widget {
    const appName = Text('qed');
    paintText(appName);

    const title = Text(moduleTitle);
    paintMuted(title);

    return HStack(8, [appName, Spacer(), title]);
}
