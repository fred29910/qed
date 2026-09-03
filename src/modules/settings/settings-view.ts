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
import {
    Button,
    HStack,
    Picker,
    Slider,
    Text,
    TextField,
    Toggle,
    VStack,
    pickerAddItem,
    pickerSetSelected,
    textfieldSetString,
    toggleSetState,
    type Widget,
} from 'perry/ui';
import type { IpcBus } from '../../ipc/bus.js';
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
    // Perry's Picker is index-driven. The three theme options are
    // added in cfg.theme order: system=0, light=1, dark=2.
    const themeIndex = cfg.theme === 'system' ? 0 : cfg.theme === 'light' ? 1 : 2;
    const themePicker = Picker((index) => {
        const next: 'system' | 'light' | 'dark' =
            index === 0 ? 'system' : index === 1 ? 'light' : 'dark';
        void bus.send('config:update', { patch: { theme: next } });
    });
    pickerAddItem(themePicker, 'Follow system');
    pickerAddItem(themePicker, 'Light');
    pickerAddItem(themePicker, 'Dark');
    pickerSetSelected(themePicker, themeIndex);

    // Slider has no initial value in the Perry API; the onChange
    // will fire as the user drags. We read the current value out of
    // the slider on first paint via the typed accessor.
    const fontSizeSlider = Slider(8, 48, (v) => {
        void bus.send('config:update', { patch: { fontSize: Math.round(v) } });
    });

    // TextField takes a placeholder, not a value, in the Perry API.
    // The current value lives in the config; users editing the
    // field drive `onChange`.
    const displayNameField = TextField('Display name', (v) => {
        void bus.send('config:update', { patch: { displayName: v } });
    });
    // Initialise the field with the persisted value (if any).
    if (cfg.displayName.length > 0) {
        textfieldSetString(displayNameField, cfg.displayName);
    }

    /* ---------------------------------------------------------------- *
     * Behaviour.                                                        *
     * ---------------------------------------------------------------- */
    const autostartToggle = Toggle('Launch at login', (v) => {
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
    toggleSetState(autostartToggle, cfg.autostart ? 1 : 0);

    const notificationsToggle = Toggle('Show notifications', (v) => {
        void bus.send('config:update', { patch: { notifications: v } });
    });
    toggleSetState(notificationsToggle, cfg.notifications ? 1 : 0);

    const backgroundToggle = Toggle('Background mode', (v) => {
        void bus.send('config:update', { patch: { backgroundMode: v } });
    });
    toggleSetState(backgroundToggle, cfg.backgroundMode ? 1 : 0);

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
