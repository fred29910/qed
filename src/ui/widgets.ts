/**
 * Small reusable widget primitives.
 *
 * Perry's UI is intentionally low-level — there's no `<Section>` or
 * `<Row>` out of the box. This module wraps the most common
 * compositional patterns so the views stay short.
 *
 * The helpers are *purely structural*; they don't paint anything,
 * they just return widget handles. The caller is responsible for
 * passing the resulting handle to one of the `paint*` helpers in
 * `ui/theme.ts` if it wants to override the default colour.
 */
import { Divider, HStack, Text, VStack, type Widget } from 'perry/ui';
import { paintMuted, paintText, paintDanger, paintAccent, paintSuccess } from './theme.js';

/* ---------------------------------------------------------------- *
 * Section.                                                          *
 * ---------------------------------------------------------------- */

/**
 * A vertical group with a title at the top and a horizontal divider
 * underneath. Used to break a settings form into "Appearance",
 * "Behaviour", etc.
 */
export function Section(title: string, children: Widget[]): Widget {
    return VStack(8, [Text(title), Divider(), VStack(8, children)]);
}

/* ---------------------------------------------------------------- *
 * Row.                                                              *
 * ---------------------------------------------------------------- */

/**
 * A labelled row used in forms: the label sits on the left, the
 * control on the right, with a small gap between them.
 */
export function Row(label: string, control: Widget): Widget {
    const lbl = Text(label);
    paintMuted(lbl);
    return HStack(12, [lbl, control]);
}

/* ---------------------------------------------------------------- *
 * Badge.                                                            *
 * ---------------------------------------------------------------- */

/** Visual severity of a badge. */
export type BadgeKind = 'info' | 'warn' | 'error' | 'success';

/**
 * A small coloured pill displayed inline next to text. Used in the
 * status bar and the about page to surface a state.
 */
export function Badge(text: string, kind: BadgeKind = 'info'): Widget {
    const w = Text(text);
    switch (kind) {
        case 'info':
            paintAccent(w);
            break;
        case 'warn':
            paintAccent(w);
            break;
        case 'error':
            paintDanger(w);
            break;
        case 'success':
            paintSuccess(w);
            break;
    }
    return w;
}

/* ---------------------------------------------------------------- *
 * Spacer & Divider re-exports.                                      *
 * ---------------------------------------------------------------- */

export { Divider, Text, HStack, VStack };

/** Wrap a list of buttons in a horizontal row with a fixed gap. */
export function ButtonRow(buttons: Widget[], gap = 8): Widget {
    return HStack(gap, buttons);
}

/** Apply the default text colour to a widget (helper for non-Text widgets). */
export function withDefaultTextColor<T extends Widget>(w: T): T {
    paintText(w);
    return w;
}
