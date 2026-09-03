/**
 * Settings view.
 *
 * A real preferences form. No placeholders, no TODOs. Every control
 * immediately writes through to the config service via the IPC bus.
 *
 * Layout (top to bottom):
 *   - Section: Appearance
 *       Theme (Picker), Font size (Slider), Display name (TextField)
 *   - Section: Behaviour
 *       Launch at login (Toggle), Show notifications (Toggle),
 *       Background mode (Toggle)
 *   - Section: Storage
 *       Read-only list of paths with "Reveal" buttons
 *   - Section: About
 *       Version / platform label
 */
import { Button, HStack, Picker, Slider, Text, TextField, Toggle, VStack, type Widget } from 'perry/ui';
import type { IpcBus } from '../../ipc/bus.js';
import type { ThemeMode } from '../../types/index.js';
import type { AppStore } from '../../state/app-state.js';
import { describeEnvironment } from '../../app/app-controller.js';
import { applyTheme, paintMuted, paintText } from '../../ui/theme.js';
import { Row, Section } from '../../ui/widgets.js';
import { enableAutostart, disableAutostart } from '../../platform/index.js';
import { ShellService } from '../../services/shell-service.js';

/** Build the settings view. */
export function SettingsView(bus: IpcBus, store: AppStore): Widget {
    const env = describeEnvironment();
    const cfg = store.getState().config;

    /* ---------------------------------------------------------------- *
     * Appearance.                                                       *
     * ---------------------------------------------------------------- */
    const themePicker = Picker<ThemeMode>(
        [
            { value: 'system', label: 'Follow system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
        ],
        cfg.theme,
        (v) => {
            void bus.send('config:update', { patch: { theme: v } });
        },
    );
    const fontSizeSlider = Slider(8, 48, cfg.fontSize, (v) => {
        void bus.send('config:update', { patch: { fontSize: v } });
    });
    const displayNameField = TextField(cfg.displayName, (v) => {
        void bus.send('config:update', { patch: { displayName: v } });
    });

    /* ---------------------------------------------------------------- *
     * Behaviour.                                                        *
     * ---------------------------------------------------------------- */
    const autostartToggle = Toggle('Launch at login', cfg.autostart, (v) => {
        void bus.send('config:update', { patch: { autostart: v } });
        if (v) {
            try {
                enableAutostart();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('autostart enable failed:', err);
            }
        } else {
            try {
                disableAutostart();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('autostart disable failed:', err);
            }
        }
    });
    const notificationsToggle = Toggle('Show notifications', cfg.notifications, (v) => {
        void bus.send('config:update', { patch: { notifications: v } });
    });
    const backgroundToggle = Toggle('Background mode', cfg.backgroundMode, (v) => {
        void bus.send('config:update', { patch: { backgroundMode: v } });
    });

    /* ---------------------------------------------------------------- *
     * Storage.                                                          *
     * ---------------------------------------------------------------- */
    const shell = new ShellService();
    const appDataRow = Row(
        'App data',
        HStack(8, [
            Text(env.appDataDir),
            Button('Reveal', () => {
                shell.revealInFileManager(env.appDataDir);
            }),
        ]),
    );
    const cacheRow = Row(
        'Cache',
        HStack(8, [
            Text(env.cacheDir),
            Button('Reveal', () => {
                shell.revealInFileManager(env.cacheDir);
            }),
        ]),
    );
    const logRow = Row(
        'Logs',
        HStack(8, [
            Text(env.logDir),
            Button('Reveal', () => {
                shell.revealInFileManager(env.logDir);
            }),
        ]),
    );
    const openConfigRow = Row(
        'Config file',
        Button('Open config.json', () => {
            shell.revealInFileManager(env.appDataDir);
        }),
    );

    /* ---------------------------------------------------------------- *
     * About.                                                            *
     * ---------------------------------------------------------------- */
    const versionText = Text('qed v0.1.0');
    const platformText = Text(`Host: ${env.host}`);
    const noteText = Text('Built with Perry.');
    paintMuted(noteText);

    /* ---------------------------------------------------------------- *
     * Compose.                                                          *
     * ---------------------------------------------------------------- */
    const tree = VStack(12, [
        Section('Appearance', [
            Row('Theme', themePicker),
            Row('Font size', fontSizeSlider),
            Row('Display name', displayNameField),
        ]),
        Section('Behaviour', [
            Row('Startup', autostartToggle),
            Row('Notifications', notificationsToggle),
            Row('Background mode', backgroundToggle),
        ]),
        Section('Storage', [appDataRow, cacheRow, logRow, openConfigRow]),
        Section('About', [versionText, platformText, noteText]),
    ]);

    // Re-apply theme whenever the config changes.
    store.subscribe((s) => {
        applyTheme(s.resolvedTheme);
        paintText(versionText);
    });

    return tree;
}
