/**
 * Bottom status bar.
 *
 * Shows the most recent error (or empty when there is none), the
 * current folder, and a small "●" indicator for `isBusy`. The bar
 * subscribes to the store so it updates automatically.
 */
import { HStack, Spacer, State, Text, type Widget } from 'perry/ui';
import type { AppStore } from '../state/app-state.js';
import { paintDanger, paintMuted, paintSuccess, paintText } from './theme.js';

/** Build a status bar bound to the store. */
export function StatusBar(store: AppStore): Widget {
    const lastError = State<string | null>(store.getState().lastError);
    const isBusy = State<boolean>(store.getState().isBusy);

    const errLabel = Text(lastError.value ?? '');
    if (lastError.value !== null) {
        paintDanger(errLabel);
    } else {
        paintMuted(errLabel);
    }

    const busyDot = Text(isBusy.value ? '● busy' : '●');
    if (isBusy.value) {
        paintSuccess(busyDot);
    } else {
        paintMuted(busyDot);
    }

    const root = HStack(12, [errLabel, Spacer(), busyDot]);

    store.subscribe((s) => {
        if (s.lastError !== lastError.value) {
            lastError.set(s.lastError);
            errLabel // re-paint the label colour
                ? (paintDanger(errLabel), undefined)
                : undefined;
            if (s.lastError === null) {
                paintMuted(errLabel);
            } else {
                paintDanger(errLabel);
            }
        }
        if (s.isBusy !== isBusy.value) {
            isBusy.set(s.isBusy);
            busyDot ? (paintText(busyDot), undefined) : undefined;
            if (s.isBusy) {
                paintSuccess(busyDot);
            } else {
                paintMuted(busyDot);
            }
        }
    });

    return root;
}
