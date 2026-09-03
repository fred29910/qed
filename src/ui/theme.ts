/**
 * UI palette tokens and runtime application helpers.
 *
 * `src/app/theme.ts` defines the *canonical* `Palette` type and the
 * `LIGHT` / `DARK` palettes. This file re-exports them and adds
 * imperative `applyTheme` / `currentPalette` helpers that the views
 * use to colour widgets.
 *
 * Why split app/theme and ui/theme? `app/` defines the palette
 * *contract*; `ui/` knows about the `perry/ui` widget API. Keeping
 * them apart means tests can import the palette without pulling in
 * any UI code.
 */
export { LIGHT, DARK, paletteFor, rgbaToCss } from '../app/theme.js';
export type { Palette, RGBA } from '../app/theme.js';

import { textSetColor, type Widget } from 'perry/ui';
import { DARK, LIGHT, type Palette, type RGBA } from '../app/theme.js';
import type { ResolvedTheme } from '../state/app-state.js';

/**
 * The current palette, picked by resolved theme.
 *
 * Default is LIGHT so the very first frame (before the store is
 * constructed) is readable.
 */
let currentPalette: Palette = LIGHT;

let currentTheme: ResolvedTheme = 'light';

/** Return the active palette. */
export function getPalette(): Palette {
    return currentPalette;
}

/** Return the active resolved theme. */
export function getCurrentTheme(): ResolvedTheme {
    return currentTheme;
}

/**
 * Switch the active palette. Idempotent — calling with the same
 * theme is a no-op. Use this from a store subscription so all
 * widgets re-skin when the user toggles theme.
 */
export function applyTheme(theme: ResolvedTheme): void {
    if (theme === currentTheme) {
        return;
    }
    currentTheme = theme;
    currentPalette = theme === 'dark' ? DARK : LIGHT;
}

/* ---------------------------------------------------------------- *
 * Imperative widget colouring helpers.                              *
 * ---------------------------------------------------------------- */

/** Apply the surface colour to a widget's background. */
export function paintBackground(widget: Widget, c: RGBA = currentPalette.surface): void {
    textSetColor(widget, c[0], c[1], c[2], c[3]);
}

/** Apply the text colour to a widget. */
export function paintText(widget: Widget, c: RGBA = currentPalette.text): void {
    textSetColor(widget, c[0], c[1], c[2], c[3]);
}

/** Apply the muted (de-emphasised) text colour. */
export function paintMuted(widget: Widget): void {
    paintText(widget, currentPalette.muted);
}

/** Apply the accent colour (selected / brand state). */
export function paintAccent(widget: Widget): void {
    paintText(widget, currentPalette.accent);
}

/** Apply the border / divider colour. */
export function paintBorder(widget: Widget): void {
    paintText(widget, currentPalette.border);
}

/** Apply the danger colour. */
export function paintDanger(widget: Widget): void {
    paintText(widget, currentPalette.danger);
}

/** Apply the success colour. */
export function paintSuccess(widget: Widget): void {
    paintText(widget, currentPalette.success);
}
