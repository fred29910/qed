/**
 * File-manager operations.
 *
 * Pure helpers that wrap the IPC bus. The view layer (file-manager-view)
 * wires them to button clicks. The split keeps the view code free of
 * IPC envelope juggling.
 */
import type { IpcBus } from '../../ipc/bus.js';
import type {
    FsEntry,
    FsStat,
    FsListPayload,
    FsMkdirPayload,
    FsReadPayload,
    FsRenamePayload,
    FsStatPayload,
    FsDeletePayload,
    FsWritePayload,
    ShellOpenPathPayload,
    RecentAddPayload,
} from '../../types/index.js';

/** Refresh the listing for `path`. Returns the entries or throws. */
export async function refresh(bus: IpcBus, path: string, showHidden: boolean): Promise<FsEntry[]> {
    const payload: FsListPayload = { path, showHidden };
    return bus.send<FsListPayload, FsEntry[]>('fs:list', payload);
}

/** Enter a directory (push onto the back-stack happens in the view). */
export function enterDirectory(bus: IpcBus, path: string): Promise<FsEntry[]> {
    return refresh(bus, path, false);
}

/** Stat a single path. */
export async function stat(bus: IpcBus, path: string): Promise<FsStat> {
    const payload: FsStatPayload = { path };
    return bus.send<FsStatPayload, FsStat>('fs:stat', payload);
}

/** Create a directory. `idempotent=true` accepts "already exists". */
export async function createFolder(bus: IpcBus, path: string, idempotent: boolean): Promise<void> {
    const payload: FsMkdirPayload = { path, idempotent };
    await bus.send<FsMkdirPayload, void>('fs:mkdir', payload);
}

/** Create a new empty file. */
export async function createFile(bus: IpcBus, path: string): Promise<void> {
    const payload: FsWritePayload = { path, content: '', encoding: 'utf-8' };
    await bus.send<FsWritePayload, void>('fs:write', payload);
}

/** Rename / move a file or directory. */
export async function rename(bus: IpcBus, from: string, to: string): Promise<void> {
    const payload: FsRenamePayload = { from, to };
    await bus.send<FsRenamePayload, void>('fs:rename', payload);
}

/** Delete a file or directory. `recursive=true` allows non-empty dirs. */
export async function deleteEntry(bus: IpcBus, path: string, recursive: boolean): Promise<void> {
    const payload: FsDeletePayload = { path, recursive };
    await bus.send<FsDeletePayload, void>('fs:delete', payload);
}

/** Read a text file (utf-8). */
export async function readText(bus: IpcBus, path: string): Promise<string> {
    const payload: FsReadPayload = { path, encoding: 'utf-8' };
    return bus.send<FsReadPayload, string>('fs:read', payload);
}

/** Reveal a path in the OS file manager. */
export async function revealInFinder(bus: IpcBus, path: string): Promise<void> {
    const payload: ShellOpenPathPayload = { path };
    await bus.send<ShellOpenPathPayload, void>('shell:open-path', payload);
}

/** Push a path onto the recent-files list. */
export async function pushRecent(bus: IpcBus, path: string): Promise<void> {
    const payload: RecentAddPayload = { path };
    await bus.send<RecentAddPayload, void>('recent:add', payload);
}
