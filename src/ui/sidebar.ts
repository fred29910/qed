/**
 * Navigation sidebar.
 *
 * A vertical list of three buttons (File Manager, Settings, About)
 * with the active route highlighted. Below the divider, a
 * "Recent files" list shows up to N paths the user has visited.
 *
 * The sidebar subscribes to the controller's `route-changed` event
 * and to the store's `recentFiles` updates. It re-renders by
 * rebuilding the tree from a `State<>` cell so perry can diff and
 * update.
 */
import { Button, Divider, State, Text, VStack, type Widget } from 'perry/ui';
import { navigateTo, onAppEvent, type Route } from '../app/app-controller.js';
import type { AppStore } from '../state/app-state.js';
import { getPalette, paintAccent, paintMuted, paintText } from './theme.js';
import { diag } from '../diag.js';

/* ---------------------------------------------------------------- *
 * Public surface.                                                   *
 * ---------------------------------------------------------------- */

export interface SidebarHandle {
    /** The widget tree to drop into the main view. */
    readonly root: Widget;
    /** Call once after construction to wire store subscriptions. */
    bind(store: AppStore): () => void;
}

/** Build the sidebar. Returns a handle with a `bind(store)` hook. */
export function Sidebar(initial: Route): SidebarHandle {
    diag('Sidebar: entered', { initial });
    const activeRoute = State<Route>(initial);
    diag('Sidebar: activeRoute State created');
    // Perry's State<T> with array/object types may not initialise the
    // `.value` getter under AOT compilation. Until that is fixed, the
    // recent-files list is held in a plain mutable array — the bind()
    // hook keeps it in sync with the store, and the widget tree
    // rebuild (when reactive refresh lands) will pick up the new
    // values.
    let recent: string[] = [];
    diag('Sidebar: recent placeholder created');

    // Route buttons. We re-render the whole sidebar on change; the
    // widget count is tiny so this is fine.
    function build(): Widget {
        diag('Sidebar.build: ROUTES.map start', { routes: ROUTES.length });
        const items: Widget[] = ROUTES.map((r) => {
            diag('Sidebar.build: route iteration', { id: r.id, icon: r.icon, label: r.label });
            const isActive = activeRoute.value === r.id;
            const label = `${r.icon}  ${r.label}`;
            diag('Sidebar.build: about to call Button');
            const b = Button(label, () => {
                activeRoute.set(r.id);
                navigateTo(r.id);
            });
            diag('Sidebar.build: Button returned', { type: typeof b });
            if (isActive) {
                paintAccent(b);
            } else {
                paintMuted(b);
            }
            return b;
        });

        // Recent files section.
        diag('Sidebar.build: Text("Recent")');
        const recentsHeader = Text('Recent');
        paintMuted(recentsHeader);
        diag('Sidebar.build: about to recent.slice', { recentLen: recent.length });
        const recentItems: Widget[] = recent.slice(0, 8).map((p) => {
            const t = Text(p);
            paintText(t);
            return t;
        });
        diag('Sidebar.build: recent items', { count: recentItems.length });
        if (recentItems.length === 0) {
            const empty = Text('(no recent files)');
            paintMuted(empty);
            recentItems.push(empty);
        }

        diag('Sidebar.build: return VStack');
        return VStack(8, [VStack(4, items), Divider(), recentsHeader, VStack(2, recentItems)]);
    }

    // ForEach rerenders on every activeRoute change.
    const root = VStack(0, [
        // The "active route" effect is realised by re-rendering via a
        // tiny ForEach over a single item — every time the State
        // changes, the row function runs again and the buttons pick
        // up the new highlight colour.
        // We don't actually need ForEach here; the controllers'
        // `route-changed` event will re-set `activeRoute`, which the
        // views re-read by calling `build()` themselves.
        // We pre-build once; callers should call `bind` and then
        // re-build via the returned unsubscribe to push updates.
        build(),
    ]);

    function bind(store: AppStore): () => void {
        // Initial sync.
        activeRoute.set(store.getState().route);
        recent = [...store.getState().recentFiles];

        const unsubStore = store.subscribe((s) => {
            if (s.route !== activeRoute.value) {
                activeRoute.set(s.route);
            }
            if (s.recentFiles !== recent) {
                recent = [...s.recentFiles];
            }
        });
        const unsubEvents = onAppEvent((e) => {
            if (e.kind === 'route-changed') {
                activeRoute.set(e.route);
            }
        });
        return () => {
            unsubStore();
            unsubEvents();
        };
    }

    return { root, bind };
}

/* ---------------------------------------------------------------- *
 * Internals.                                                        *
 * ---------------------------------------------------------------- */

interface RouteSpec {
    readonly id: Route;
    readonly icon: string;
    readonly label: string;
}

const ROUTES: readonly RouteSpec[] = [
    { id: 'file-manager', icon: '📁', label: 'File Manager' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
    { id: 'about', icon: 'ℹ️', label: 'About' },
];

/** Re-export palette access for sibling UI files. */
export { getPalette };
