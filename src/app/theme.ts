/**
 * Centralised colour palette.
 *
 * Perry has no stylesheet — every colour is set imperatively with
 * `textSetColor(handle, r, g, b, a)`. The `Palette` constants below
 * are the *only* place we hard-code RGB values; everywhere else reads
 * from `currentPalette()` which is selected by the resolved theme.
 *
 * Colours are RGBA floats in `[0,1]`. To convert a hex like `#3366ff`:
 *
 *   r = 0x33 / 255
 *   g = 0x66 / 255
 *   b = 0xff / 255
 *
 * Keep the palette frozen so callers can't mutate it accidentally.
 */
import type { ResolvedTheme } from '../state/app-state.js';

/** RGBA float tuple (each component in `[0, 1]`). */
export type RGBA = readonly [number, number, number, number];

/** A full colour palette. */
export interface Palette {
    /** Window / root background. */
    readonly background: RGBA;
    /** Cards, sidebars, secondary surfaces. */
    readonly surface: RGBA;
    /** Primary text colour. */
    readonly text: RGBA;
    /** De-emphasised text. */
    readonly muted: RGBA;
    /** Brand accent / selected state. */
    readonly accent: RGBA;
    /** Borders, dividers, hairlines. */
    readonly border: RGBA;
    /** Destructive actions. */
    readonly danger: RGBA;
    /** Success / confirm. */
    readonly success: RGBA;
}

/** Light theme. */
export const LIGHT: Palette = Object.freeze({
    background: Object.freeze([0.98, 0.98, 0.98, 1.0] as RGBA),
    surface: Object.freeze([1.0, 1.0, 1.0, 1.0] as RGBA),
    text: Object.freeze([0.1, 0.1, 0.12, 1.0] as RGBA),
    muted: Object.freeze([0.5, 0.5, 0.55, 1.0] as RGBA),
    accent: Object.freeze([0.2, 0.45, 0.95, 1.0] as RGBA),
    border: Object.freeze([0.85, 0.85, 0.88, 1.0] as RGBA),
    danger: Object.freeze([0.85, 0.25, 0.25, 1.0] as RGBA),
    success: Object.freeze([0.2, 0.7, 0.4, 1.0] as RGBA),
});

/** Dark theme. */
export const DARK: Palette = Object.freeze({
    background: Object.freeze([0.1, 0.1, 0.12, 1.0] as RGBA),
    surface: Object.freeze([0.16, 0.16, 0.18, 1.0] as RGBA),
    text: Object.freeze([0.95, 0.95, 0.97, 1.0] as RGBA),
    muted: Object.freeze([0.65, 0.65, 0.7, 1.0] as RGBA),
    accent: Object.freeze([0.4, 0.65, 1.0, 1.0] as RGBA),
    border: Object.freeze([0.3, 0.3, 0.33, 1.0] as RGBA),
    danger: Object.freeze([1.0, 0.45, 0.45, 1.0] as RGBA),
    success: Object.freeze([0.4, 0.85, 0.55, 1.0] as RGBA),
});

/** Return the palette for a resolved theme. */
export function paletteFor(theme: ResolvedTheme): Palette {
    return theme === 'dark' ? DARK : LIGHT;
}

/** Tiny helper: format an RGBA as a CSS-like string for logs. */
export function rgbaToCss(c: RGBA): string {
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
}
