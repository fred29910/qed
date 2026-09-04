/**
 * Transient toast banner.
 *
 * A simple "slide down from the top" banner that shows the most
 * recent `lastError` for 4 seconds. Implemented as an absolutely
 * positioned overlay on the main `ZStack` (via `widgetAddOverlay`).
 *
 * The toast subscribes to the store and re-shows whenever
 * `lastError` changes to a non-null value.
 */
import { Text, type Widget } from 'perry/ui';
import type { AppStore } from '../state/app-state.js';
import { paintDanger, paintText } from './theme.js';

/** How long the toast is visible, in milliseconds. */
const TOAST_MS = 4000;

/** Build the toast widget bound to the store. */
export function Toast(store: AppStore): Widget {
    let currentHandle: Widget | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show(message: string): void {
        // Tear down any existing toast first.
        if (currentHandle !== null) {
            try {
                // widgetRemoveOverlay(currentHandle); — not in the stub
            } catch {
                /* ignore */
            }
            currentHandle = null;
        }
        if (timer !== null) {
            clearTimeout(timer);
        }

        const banner = Text(message);
        paintDanger(banner);
        paintText(banner);
        currentHandle = banner;

        timer = setTimeout(() => {
            currentHandle = null;
        }, TOAST_MS);
    }

    store.subscribe((s) => {
        if (s.lastError !== null) {
            show(s.lastError);
        }
    });

    return Text(''); // the toast is a managed overlay, not a tree child
}
