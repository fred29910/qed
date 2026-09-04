/**
 * Settings change helpers.
 *
 * Pure wrappers around the config service. The view layer calls
 * these in onChange handlers; the actual config service takes care
 * of debounced disk writes and listener fan-out.
 */
import type { IpcBus } from '../../ipc/bus.js';
import type { ThemeMode } from '../../types/index.js';
import { applyTheme } from '../../ui/theme.js';

/** Apply a new theme both to the config and to the active widgets. */
export async function onThemeChange(bus: IpcBus, next: ThemeMode): Promise<void> {
    await bus.send('config:update', { patch: { theme: next } });
    applyTheme(next === 'system' ? 'light' : next);
}

/** Apply a new font size. */
export async function onFontSizeChange(bus: IpcBus, size: number): Promise<void> {
    await bus.send('config:update', { patch: { fontSize: size } });
}

/** Apply a new display name. */
export async function onDisplayNameChange(bus: IpcBus, name: string): Promise<void> {
    await bus.send('config:update', { patch: { displayName: name } });
}

/** Apply an autostart toggle. The platform manifest is updated separately. */
export async function onAutostartToggle(bus: IpcBus, enabled: boolean): Promise<void> {
    await bus.send('config:update', { patch: { autostart: enabled } });
}

/** Apply a notifications toggle. */
export async function onNotificationsToggle(bus: IpcBus, enabled: boolean): Promise<void> {
    await bus.send('config:update', { patch: { notifications: enabled } });
}

/** Apply a background-mode toggle. */
export async function onBackgroundModeToggle(bus: IpcBus, enabled: boolean): Promise<void> {
    await bus.send('config:update', { patch: { backgroundMode: enabled } });
}
