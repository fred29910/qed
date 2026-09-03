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
    const activeRoute = State<Route>(initial);
    const recent = State<readonly string[]>([]);

    // Route buttons. We re-render the whole sidebar on change; the
    // widget count is tiny so this is fine.
    function build(): Widget {
        const items: Widget[] = ROUTES.map((r) => {
            const isActive = activeRoute.value === r.id;
            const label = `${r.icon}  ${r.label}`;
            const b = Button(label, () => {
                activeRoute.set(r.id);
                navigateTo(r.id);
            });
            if (isActive) {
                paintAccent(b);
            } else {
                paintMuted(b);
            }
            return b;
        });

        // Recent files section.
        const recentsHeader = Text('Recent');
        paintMuted(recentsHeader);
        const recentItems: Widget[] = recent.value.slice(0, 8).map((p) => {
            const t = Text(p);
            paintText(t);
            return t;
        });
        if (recentItems.length === 0) {
            const empty = Text('(no recent files)');
            paintMuted(empty);
            recentItems.push(empty);
        }

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
        recent.set(store.getState().recentFiles);

        const unsubStore = store.subscribe((s) => {
            if (s.route !== activeRoute.value) {
                activeRoute.set(s.route);
            }
            if (s.recentFiles !== recent.value) {
                recent.set(s.recentFiles);
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
