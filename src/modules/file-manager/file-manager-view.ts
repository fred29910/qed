/**
 * File Manager view.
 *
 * Layout:
 *
 *   ┌─ Path bar (current path, ↑, 🏠) ─────────────┐
 *   ├─ Toolbar (Refresh, New Folder, New File, …)  ┤
 *   ├─ Listing (VStack of FsEntry rows)            ┤
 *   └─ Preview (TextArea, if a text file is open)  ┘
 *
 * State is held in module-local `State<>` cells so the perry runtime
 * can diff efficiently. All side effects (FS calls, reveals) go
 * through the IPC bus.
 */
import { Button, Divider, HStack, State, Text, TextArea, TextField, VStack, type Widget } from 'perry/ui';
import { homedir } from 'os';
import type { IpcBus } from '../../ipc/bus.js';
import type { AppStore } from '../../state/app-state.js';
import type { FsEntry } from '../../types/index.js';
import {
    createFile,
    createFolder,
    deleteEntry,
    pushRecent,
    readText,
    refresh,
    revealInFinder,
} from './file-operations.js';
import { paintMuted, paintText } from '../../ui/theme.js';

/** Build the file manager view. */
export function FileManagerView(bus: IpcBus, store: AppStore): Widget {
    const startPath = store.getState().config.lastFolder || homedir();
    const currentPath = State<string>(startPath);
    const entries = State<readonly FsEntry[]>([]);
    const showHidden = State<boolean>(false);
    const previewText = State<string>('');
    const previewPath = State<string | null>(null);
    const error = State<string | null>(null);

    const backStack: string[] = [];

    async function reload(): Promise<void> {
        try {
            error.set(null);
            const list = await refresh(bus, currentPath.value, showHidden.value);
            entries.set(list);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error.set(message);
            entries.set([]);
        }
    }

    // Initial load.
    void reload();

    /* ---------------------------------------------------------------- *
     * Path bar.                                                         *
     * ---------------------------------------------------------------- */
    const pathField = TextField(currentPath.value, (v) => currentPath.set(v));
    const upBtn = Button('↑', () => {
        const parent = parentOf(currentPath.value);
        if (parent !== null) {
            backStack.push(currentPath.value);
            currentPath.set(parent);
            void reload();
        }
    });
    const homeBtn = Button('🏠', () => {
        backStack.push(currentPath.value);
        currentPath.set(homedir());
        void reload();
    });
    const goBtn = Button('Go', () => {
        void reload();
    });
    const pathBar = HStack(8, [upBtn, homeBtn, pathField, goBtn]);

    /* ---------------------------------------------------------------- *
     * Toolbar.                                                          *
     * ---------------------------------------------------------------- */
    const refreshBtn = Button('Refresh', () => {
        void reload();
    });
    const newFolderBtn = Button('New Folder', async () => {
        const name = `new-folder-${Date.now()}`;
        try {
            await createFolder(bus, joinPath(currentPath.value, name), false);
            await reload();
        } catch (err) {
            error.set(messageOf(err));
        }
    });
    const newFileBtn = Button('New File', async () => {
        const name = `new-file-${Date.now()}.txt`;
        try {
            await createFile(bus, joinPath(currentPath.value, name));
            await reload();
        } catch (err) {
            error.set(messageOf(err));
        }
    });
    const deleteBtn = Button('Delete', async () => {
        const target = previewPath.value;
        if (target === null) {
            return;
        }
        try {
            await deleteEntry(bus, target, true);
            previewPath.set(null);
            previewText.set('');
            await reload();
        } catch (err) {
            error.set(messageOf(err));
        }
    });
    const revealBtn = Button('Reveal', () => {
        const target = previewPath.value;
        if (target !== null) {
            void revealInFinder(bus, target);
        }
    });
    const toggleHiddenBtn = Button('Show Hidden', () => {
        showHidden.set(!showHidden.value);
        void reload();
    });
    const toolbar = HStack(8, [refreshBtn, newFolderBtn, newFileBtn, deleteBtn, revealBtn, toggleHiddenBtn]);

    /* ---------------------------------------------------------------- *
     * Listing.                                                          *
     * ---------------------------------------------------------------- */
    const listing = VStack(2, entries.value.map(rowForEntry));
    // Touch `entries` to keep the reactive read alive.
    void entries.value;

    function rowForEntry(e: FsEntry): Widget {
        const icon = e.isDir ? '📁' : '📄';
        const label = `${icon}  ${e.name}  ${formatSize(e.size)}`;
        const b = Button(label, async () => {
            if (e.isDir) {
                backStack.push(currentPath.value);
                currentPath.set(e.path);
                void reload();
            } else {
                try {
                    const text = await readText(bus, e.path);
                    previewText.set(text);
                    previewPath.set(e.path);
                    await pushRecent(bus, e.path);
                } catch (err) {
                    error.set(messageOf(err));
                }
            }
        });
        return b;
    }

    /* ---------------------------------------------------------------- *
     * Preview.                                                          *
     * ---------------------------------------------------------------- */
    const preview = TextArea(previewText.value, (v) => previewText.set(v));

    /* ---------------------------------------------------------------- *
     * Error row.                                                        *
     * ---------------------------------------------------------------- */
    const errorRow = Text(error.value ?? '');
    if (error.value !== null) {
        paintText(errorRow);
    } else {
        paintMuted(errorRow);
    }

    /* ---------------------------------------------------------------- *
     * Top-level layout.                                                 *
     * ---------------------------------------------------------------- */
    return VStack(8, [pathBar, toolbar, Divider(), listing, Divider(), preview, errorRow]);

    // ---- nested helpers -----------------------------------------------

    function parentOf(p: string): string | null {
        const idx = p.lastIndexOf('/');
        if (idx <= 0) {
            return '/';
        }
        return p.substring(0, idx);
    }

    function joinPath(base: string, leaf: string): string {
        if (base.endsWith('/')) {
            return base + leaf;
        }
        return base + '/' + leaf;
    }

    function formatSize(n: number): string {
        if (n < 1024) {
            return `${n} B`;
        }
        if (n < 1024 * 1024) {
            return `${(n / 1024).toFixed(1)} KB`;
        }
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    function messageOf(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
