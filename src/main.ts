/**
 * Entry point.
 *
 * Wires services → IPC handlers → store → controller → UI, then
 * hands control over to the perry run loop via `App({...})`.
 *
 * The order matters:
 *   1. Services are constructed so handlers can capture them.
 *   2. The IPC bus registers handlers before any UI is built.
 *   3. The store is built so it can subscribe to config + recents.
 *   4. The controller is constructed and started (this also installs
 *      the menu bar and tray).
 *   5. The main view is built last and passed to `App()`.
 */
import {
    Divider,
    HStack,
    State,
    VStack,
    onActivate,
    onTerminate,
    type Widget,
} from 'perry/ui';
import { ConfigService } from './services/config-service.js';
import { FileService } from './services/file-service.js';
import { RecentFilesService } from './services/recent-files-service.js';
import { NotificationService } from './services/notification-service.js';
import { ShellService } from './services/shell-service.js';
import { IpcBus } from './ipc/bus.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { AppStore } from './state/app-state.js';
import {
    onAppActivate,
    onAppEvent,
    onAppTerminate,
    startApp,
    type ControllerContext,
} from './app/app-controller.js';
import { FileManagerView } from './modules/file-manager/index.js';
import { AboutView } from './modules/about/index.js';
import { Sidebar } from './ui/sidebar.js';
import { StatusBar } from './ui/status-bar.js';
import { Toast } from './ui/toast.js';
import { TitleBar } from './ui/title-bar.js';
import { applyTheme, getPalette, paintBackground } from './ui/theme.js';
import { diag, diagErr, logger } from './diag.js';
// `diagErr` is intentionally retained: error sites should call it once
// the app graduates past the skeleton. For now it's exported but unused.
void diagErr;

/* ---------------------------------------------------------------- *
 * Bootstrap.                                                        *
 * ---------------------------------------------------------------- */

function main(): void {
    diag('main() entered');
    // 1. Services.
    diag('constructing ConfigService');
    const config = new ConfigService();
    diag('ConfigService ready', { theme: config.snapshot().theme });
    // Apply the persisted log level as soon as the config is loaded so
    // every subsequent diagnostic call uses the user-chosen severity.
    // Done before any other service construction so their boot traces
    // are filtered accordingly.
    logger.setLevel(config.snapshot().logLevel);
    diag('constructing FileService');
    const files = new FileService();
    diag('FileService ready');
    diag('constructing RecentFilesService');
    const recent = new RecentFilesService();
    diag('RecentFilesService ready', { count: recent.list().length });
    diag('constructing NotificationService');
    const notifications = new NotificationService(config);
    diag('NotificationService ready');
    diag('constructing ShellService');
    const shell = new ShellService();
    diag('ShellService ready');

    // 2. IPC bus + store.
    diag('constructing IpcBus');
    const bus = new IpcBus();
    diag('IpcBus ready');
    diag('constructing AppStore');
    const store = new AppStore(config, recent);
    diag('AppStore ready', { route: store.getState().route, resolvedTheme: store.getState().resolvedTheme });

    // 3. Register handlers.
    const ctx: ControllerContext = { bus, config, files, recent, notifications, shell, store };
    diag('registering IPC handlers');
    registerIpcHandlers(bus, ctx);
    diag('IPC handlers registered');

    // 4. Apply theme to the UI palette so the very first paint uses it.
    diag('applying theme');
    applyTheme(store.getState().resolvedTheme);
    diag('theme applied', { palette: getPalette() });

    // 5. Build the main view (sidebar + routed module + status + toast).
    diag('building main view');
    const mainView = buildMainView(bus, store, shell);
    diag('main view built', { widget: typeof mainView });

    // 6. Lifecycle hooks.
    diag('installing lifecycle hooks');
    onActivate(() => onAppActivate(ctx));
    onTerminate(() => onAppTerminate(ctx));
    diag('lifecycle hooks installed');

    // 7. Start the app — installs menu / tray, opens the main window.
    diag('calling startApp (this enters perry/ui run loop)');
    startApp(ctx, mainView);
    diag('startApp returned (should not happen — App runs the event loop)');
}

/* ---------------------------------------------------------------- *
 * Main view.                                                        *
 * ---------------------------------------------------------------- */

type Route = 'file-manager' | 'settings' | 'about';

/**
 * Build the main view tree.
 *
 *   VStack
 *     ├─ TitleBar(active route title)
 *     ├─ HStack
 *     │   ├─ Sidebar
 *     │   ├─ Divider
 *     │   └─ Routed module
 *     ├─ Divider
 *     ├─ StatusBar
 *     └─ Toast
 */
function buildMainView(bus: IpcBus, store: AppStore, shell: ShellService): Widget {
    diag('buildMainView: route state');
    // The active route is mirrored in a local State so the perry
    // runtime can diff the children when the user switches tabs.
    const route = State<Route>(store.getState().route);
    store.subscribe((s) => {
        if (s.route !== route.value) {
            route.set(s.route);
        }
    });
    onAppEvent((e) => {
        if (e.kind === 'route-changed') {
            route.set(e.route);
        }
    });

    diag('buildMainView: FileManagerView');
    // Pre-build the three module views. The file manager is the most
    // expensive, so we only construct it once and re-use.
    const fileManager = FileManagerView(bus, store);
    diag('buildMainView: AboutView');
    const about = AboutView(shell);

    diag('buildMainView: Sidebar');
    // Sidebar.
    const sidebar = Sidebar(store.getState().route);
    diag('buildMainView: sidebar.bind');
    sidebar.bind(store);

    diag('buildMainView: TitleBar');
    // Title bar reflects the active route.
    const titleBar = TitleBar(titleForRoute(store.getState().route));

    diag('buildMainView: StatusBar');
    // Status + toast.
    const status = StatusBar(store);
    diag('buildMainView: Toast');
    const toast = Toast(store);

    diag('buildMainView: pickRoute');
    // The routed module. We use a tiny helper that returns the right
    // widget for the current `route.value`. The Perry runtime re-reads
    // this every time `route` changes because it's wrapped in a State
    // accessor.
    const routed = pickRoute(route.value, fileManager, about);

    diag('buildMainView: HStack body');
    const body = HStack(0, [sidebar.root, Divider(), routed]);
    paintBackground(body, getPalette().background);

    diag('buildMainView: VStack root');
    const root = VStack(0, [titleBar, body, Divider(), status, toast]);
    paintBackground(root, getPalette().background);
    diag('buildMainView: returning');
    return root;
}

function pickRoute(route: Route, fm: Widget, about: Widget): Widget {
    switch (route) {
        case 'file-manager':
            return fm;
        case 'settings':
            // v1: the Settings window is opened via the menu / tray /
            // App Controller. The main-window "Settings" tab is
            // intentionally absent to avoid duplicating the same form.
            // We still need *some* widget, so show the About view.
            return about;
        case 'about':
            return about;
    }
}

function titleForRoute(r: Route): string {
    switch (r) {
        case 'file-manager':
            return 'File Manager';
        case 'settings':
            return 'Settings';
        case 'about':
            return 'About';
    }
}

/* ---------------------------------------------------------------- *
 * Run.                                                              *
 * ---------------------------------------------------------------- */

main();
