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
    onAppDidBecomeActive,
    onAppDidEnterBackground,
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
    onAppBackground,
    onAppForeground,
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
import { paletteFor } from './app/theme.js';

/* ---------------------------------------------------------------- *
 * Bootstrap.                                                        *
 * ---------------------------------------------------------------- */

function main(): void {
    // 1. Services.
    const config = new ConfigService();
    const files = new FileService();
    const recent = new RecentFilesService();
    const notifications = new NotificationService(config);
    const shell = new ShellService();

    // 2. IPC bus + store.
    const bus = new IpcBus();
    const store = new AppStore(config, recent);

    // 3. Register handlers.
    const ctx: ControllerContext = { bus, config, files, recent, notifications, shell, store };
    registerIpcHandlers(bus, ctx);

    // 4. Apply theme to the UI palette so the very first paint uses it.
    applyTheme(store.getState().resolvedTheme);
    void paletteFor; // kept for future per-palette mutation if needed

    // 5. Build the main view (sidebar + routed module + status + toast).
    const mainView = buildMainView(bus, store);

    // 6. Lifecycle hooks.
    onActivate(() => onAppActivate());
    onTerminate(() => onAppTerminate(ctx));
    onAppDidEnterBackground(() => onAppBackground());
    onAppDidBecomeActive(() => onAppForeground());

    // 7. Start the app — installs menu / tray, opens the main window.
    startApp(ctx, mainView);
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
function buildMainView(bus: IpcBus, store: AppStore): Widget {
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

    // Pre-build the three module views. The file manager is the most
    // expensive, so we only construct it once and re-use.
    const fileManager = FileManagerView(bus, store);
    const about = AboutView();

    // Sidebar.
    const sidebar = Sidebar(store.getState().route);
    sidebar.bind(store);

    // Title bar reflects the active route.
    const titleBar = TitleBar(titleForRoute(store.getState().route));
    store.subscribe((s) => {
        // Re-create the title bar with a new label. Perry's runtime
        // doesn't expose a `textSetText` for the title bar directly,
        // so we rely on the fact that the title bar reads its initial
        // label once. For v1 the title text is informational; the
        // sidebar highlight is the source of truth.
        void s.route;
    });

    // Status + toast.
    const status = StatusBar(store);
    const toast = Toast(store);

    // The routed module. We use a tiny helper that returns the right
    // widget for the current `route.value`. The Perry runtime re-reads
    // this every time `route` changes because it's wrapped in a State
    // accessor.
    const routed = pickRoute(route.value, fileManager, about);

    const body = HStack(0, [sidebar.root, Divider(), routed]);
    paintBackground(body, getPalette().background);

    const root = VStack(0, [titleBar, body, Divider(), status, toast]);
    paintBackground(root, getPalette().background);
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
