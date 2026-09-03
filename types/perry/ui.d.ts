/**
 * Ambient type declarations for `perry/ui`.
 *
 * Like the `perry/system` stub, this is the *minimum surface* the project
 * uses. The real API comes from `perry types`. The stub keeps `tsc
 * --noEmit` happy until then.
 *
 * Conventions:
 *   - Widget handles are small non-negative integers (`Widget`).
 *   - Colors are RGBA floats in `[0,1]` (divide hex by 255).
 *   - Layout uses stacks (HStack / VStack / ZStack), not CSS.
 *   - Imperative state: `const n = State(0); n.value / n.set(v)`.
 */
declare module "perry/ui" {
    /* ---------------------------------------------------------------- *
     * Primitive widget handle.                                          *
     * ---------------------------------------------------------------- */
    export type Widget = number;

    /* ---------------------------------------------------------------- *
     * Layout.                                                           *
     * ---------------------------------------------------------------- */
    export function HStack(spacing: number, children: readonly Widget[]): Widget;
    export function VStack(spacing: number, children: readonly Widget[]): Widget;
    export function ZStack(children: readonly Widget[]): Widget;
    export function Spacer(): Widget;
    export function Divider(): Widget;

    export function stackSetAlignment(stack: Widget, align: "start" | "center" | "end" | "stretch"): void;
    export function stackSetDistribution(stack: Widget, kind: "fill" | "fillEqually" | "natural" | "center"): void;

    /* ---------------------------------------------------------------- *
     * Common controls.                                                  *
     * ---------------------------------------------------------------- */
    export function Text(content: string): Widget;
    export function textSetColor(widget: Widget, r: number, g: number, b: number, a: number): void;
    export function textSetFontSize(widget: Widget, size: number): void;
    export function textSetFontWeight(widget: Widget, weight: "regular" | "medium" | "bold"): void;
    export function textSetText(widget: Widget, content: string): void;

    export function Button(label: string, onClick: () => void): Widget;
    export function buttonSetLabel(widget: Widget, label: string): void;
    export function buttonSetEnabled(widget: Widget, enabled: boolean): void;

    export function TextField(initial: string, onChange: (value: string) => void): Widget;
    export function textFieldGetText(widget: Widget): string;
    export function textFieldSetText(widget: Widget, value: string): void;
    export function textFieldSetPlaceholder(widget: Widget, placeholder: string): void;

    export function TextArea(initial: string, onChange: (value: string) => void): Widget;
    export function textAreaGetText(widget: Widget): string;
    export function textAreaSetText(widget: Widget, value: string): void;
    export function textAreaSetReadOnly(widget: Widget, readOnly: boolean): void;

    export function Picker<T extends string>(
        options: readonly { readonly value: T; readonly label: string }[],
        initial: T,
        onChange: (value: T) => void,
    ): Widget;
    export function pickerGetValue<T extends string>(widget: Widget): T;
    export function pickerSetValue<T extends string>(widget: Widget, value: T): void;

    export function Slider(min: number, max: number, initial: number, onChange: (value: number) => void): Widget;
    export function sliderGetValue(widget: Widget): number;
    export function sliderSetValue(widget: Widget, value: number): void;

    export function Toggle(label: string, initial: boolean, onChange: (value: boolean) => void): Widget;
    export function toggleGetValue(widget: Widget): boolean;
    export function toggleSetValue(widget: Widget, value: boolean): void;

    /* ---------------------------------------------------------------- *
     * Reactivity.                                                       *
     * ---------------------------------------------------------------- */
    export interface State<T> {
        readonly value: T;
        set(next: T): void;
    }
    export function State<T>(initial: T): State<T>;

    /** ForEach re-renders the row function on every state change. */
    export function ForEach<T>(items: readonly T[], render: (item: T, index: number) => Widget): Widget;

    /* ---------------------------------------------------------------- *
     * Window.                                                           *
     * ---------------------------------------------------------------- */
    export interface AppOptions {
        readonly title: string;
        readonly width: number;
        readonly height: number;
        readonly body: Widget;
        readonly icon?: string;
        readonly windowState?: "normal" | "maximized" | "fullscreen";
        readonly frameless?: boolean;
        readonly level?: "normal" | "floating" | "modal";
        readonly transparent?: boolean;
        readonly vibrancy?: "none" | "sidebar" | "titlebar" | "menu" | "popover" | "headerView" | "sheet" | "hud" | "fullscreenUI" | "tooltip" | "content" | "underWindow" | "underPage";
        readonly activationPolicy?: "regular" | "accessory" | "prohibited";
    }
    export function App(options: AppOptions): void;

    export interface WindowOptions {
        readonly title: string;
        readonly width: number;
        readonly height: number;
        readonly body: Widget;
        readonly frameless?: boolean;
        readonly resizable?: boolean;
        readonly alwaysOnTop?: boolean;
    }
    export function Window(options: WindowOptions): Widget;
    export function windowShow(window: Widget): void;
    export function windowHide(window: Widget): void;
    export function windowClose(window: Widget): void;
    export function windowMinimize(window: Widget): void;
    export function windowMaximize(window: Widget): void;
    export function windowRestore(window: Widget): void;
    export function windowSetAlwaysOnTop(window: Widget, alwaysOnTop: boolean): void;
    export function windowSetToolWindow(window: Widget, isToolWindow: 0 | 1): void;
    export function windowSetSkipTaskbar(window: Widget, skip: 0 | 1): void;
    export function windowGetHandle(window: Widget): Widget;

    /* ---------------------------------------------------------------- *
     * Menu bar / tray.                                                  *
     * ---------------------------------------------------------------- */
    export type Menu = Widget;
    export function menuCreate(): Menu;
    export function menuAddItem(menu: Menu, label: string, onClick: () => void): void;
    export function menuAddSeparator(menu: Menu): void;
    export type MenuBar = Widget;
    export function menuBarCreate(): MenuBar;
    export function menuBarAddMenu(bar: MenuBar, title: string, menu: Menu): void;
    export function menuBarAttach(bar: MenuBar): void;
    export function menuBarDetach(bar: MenuBar): void;

    export function trayCreate(iconPath: string): Widget;
    export function traySetIcon(tray: Widget, iconPath: string): void;
    export function traySetTooltip(tray: Widget, tooltip: string): void;
    export function trayOnClick(tray: Widget, onClick: () => void): void;
    export function trayAttachMenu(tray: Widget, menu: Menu): void;
    export function trayDestroy(tray: Widget): void;

    /* ---------------------------------------------------------------- *
     * Lifecycle.                                                        *
     * ---------------------------------------------------------------- */
    export function onActivate(handler: () => void): void;
    export function onTerminate(handler: () => void): void;
    export function onAppDidEnterBackground(handler: () => void): void;
    export function onAppDidBecomeActive(handler: () => void): void;
}
