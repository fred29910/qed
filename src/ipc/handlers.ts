/**
 * IPC handler wiring.
 *
 * One function per channel. Registered against the `IpcBus` at startup.
 * Each handler delegates to a service and is the only place where
 * `try { … } catch` is allowed.
 */
import { arch as osArch } from 'os';
import { appDataDir, cacheDir, isMacOS, logDir, platformLabel } from '../platform/index.js';
import type {
    ConfigUpdatePayload,
    FsEntry,
    FsListPayload,
    FsMkdirPayload,
    FsReadPayload,
    FsRenamePayload,
    FsStat,
    FsStatPayload,
    FsWritePayload,
    FsDeletePayload,
    NotifySendPayload,
    PlatformInfo,
    RecentAddPayload,
    RecentList,
    ShellOpenPathPayload,
    ShellOpenUrlPayload,
    LogSnapshot,
    LogFilePath,
} from '../types/index.js';
import { resolveTheme } from '../state/app-state.js';
import { isDarkMode } from 'perry/system';
import type { IpcBus } from './bus.js';
import type { IpcChannel } from '../types/index.js';
import { logger } from '../diag.js';
import type { ConfigService } from '../services/config-service.js';
import type { FileService } from '../services/file-service.js';
import type { NotificationService } from '../services/notification-service.js';
import type { RecentFilesService } from '../services/recent-files-service.js';
import type { ShellService } from '../services/shell-service.js';
import type { AppStore } from '../state/app-state.js';

/** All services the handlers need. */
export interface HandlerContext {
    readonly config: ConfigService;
    readonly files: FileService;
    readonly recent: RecentFilesService;
    readonly notifications: NotificationService;
    readonly shell: ShellService;
    readonly store: AppStore;
}

/**
 * Register every channel the app uses.
 *
 * Call exactly once at startup, after the services and store are
 * constructed and before the UI is built.
 */
export function registerIpcHandlers(bus: IpcBus, ctx: HandlerContext): void {
    bus.register<undefined, ReturnType<ConfigService['snapshot']>>(
        'config:get',
        trace('config:get', () => ctx.config.snapshot()),
    );
    bus.register<ConfigUpdatePayload, ReturnType<ConfigService['snapshot']>>(
        'config:update',
        trace('config:update', (payload) => {
            ctx.config.update(payload.patch);
            return ctx.config.snapshot();
        }),
    );

    bus.register<FsListPayload, FsEntry[]>(
        'fs:list',
        trace('fs:list', (p) => ctx.files.list(p.path, p.showHidden)),
    );
    bus.register<FsReadPayload, string>(
        'fs:read',
        trace('fs:read', (p) => ctx.files.read(p.path, p.encoding)),
    );
    bus.register<FsWritePayload, void>(
        'fs:write',
        trace('fs:write', (p) => {
            ctx.files.write(p.path, p.content, p.encoding);
        }),
    );
    bus.register<FsDeletePayload, void>(
        'fs:delete',
        trace('fs:delete', (p) => {
            ctx.files.delete(p.path, p.recursive);
        }),
    );
    bus.register<FsRenamePayload, void>(
        'fs:rename',
        trace('fs:rename', (p) => {
            ctx.files.rename(p.from, p.to);
        }),
    );
    bus.register<FsMkdirPayload, void>(
        'fs:mkdir',
        trace('fs:mkdir', (p) => {
            ctx.files.mkdir(p.path, p.idempotent);
        }),
    );
    bus.register<FsStatPayload, FsStat>(
        'fs:stat',
        trace('fs:stat', (p) => ctx.files.stat(p.path)),
    );

    bus.register<ShellOpenPathPayload, void>(
        'shell:open-path',
        trace('shell:open-path', (p) => {
            ctx.shell.revealInFileManager(p.path);
        }),
    );
    bus.register<ShellOpenUrlPayload, void>(
        'shell:open-url',
        trace('shell:open-url', (p) => {
            ctx.shell.openUrl(p.url);
        }),
    );

    bus.register<NotifySendPayload, { delivered: boolean }>(
        'notify:send',
        trace('notify:send', (p) => {
            const delivered = ctx.notifications.send(p.title, p.body);
            return { delivered };
        }),
    );

    bus.register<undefined, PlatformInfo>(
        'platform:info',
        trace('platform:info', () => buildPlatformInfo(ctx)),
    );

    bus.register<RecentAddPayload, void>(
        'recent:add',
        trace('recent:add', (p) => {
            ctx.recent.add(p.path);
            ctx.store.refreshRecentFiles();
        }),
    );
    bus.register<undefined, RecentList>('recent:list', trace('recent:list', () => ctx.recent.list()));
    bus.register<undefined, void>(
        'recent:clear',
        trace('recent:clear', () => {
            ctx.recent.clear();
            ctx.store.refreshRecentFiles();
        }),
    );

    // Logging channels. `log:snapshot` and `log:current-file-path` are
    // read-only and safe to expose to the UI. `view:open-diagnostics`
    // is registered separately in main.ts after the controller is
    // built, so the controller can own the window lifecycle.
    bus.register<undefined, LogSnapshot>(
        'log:snapshot',
        trace('log:snapshot', () => logger.snapshot()),
    );
    bus.register<undefined, LogFilePath>(
        'log:current-file-path',
        trace('log:current-file-path', () => logger.currentFilePath()),
    );
}

/**
 * Wrap a handler so each call is traced at the `trace` level.
 *
 * The bus (`src/ipc/bus.ts`) is intentionally logger-free to keep it
 * as a thin platform primitive; tracing lives here at the handler
 * seam instead. Because `trace` is below the default `info` level,
 * the wrapper is a single branch on the level — production code
 * pays the cost of one map lookup and the level check, nothing more.
 */
function trace<TPayload, TResult>(
    channel: IpcChannel,
    handler: (payload: TPayload) => TResult | Promise<TResult>,
): (payload: TPayload) => TResult | Promise<TResult> {
    return (payload) => {
        logger.trace('ipc', 'handler:in', channel, { payload });
        try {
            const result = handler(payload);
            if (result instanceof Promise) {
                return result
                    .then((value) => {
                        logger.trace('ipc', 'handler:ok', channel);
                        return value;
                    })
                    .catch((err: unknown) => {
                        logger.trace('ipc', 'handler:err', channel, { err: String(err) });
                        throw err;
                    });
            }
            logger.trace('ipc', 'handler:ok', channel);
            return result;
        } catch (err) {
            logger.trace('ipc', 'handler:err', channel, { err: String(err) });
            throw err;
        }
    };
}

function buildPlatformInfo(ctx: HandlerContext): PlatformInfo {
    const cfg = ctx.config.snapshot();
    return {
        host: platformLabel(),
        platformLabel: platformLabel(),
        arch: osArch(),
        execPath: process.execPath,
        appDataDir: appDataDir(),
        logDir: logDir(),
        cacheDir: cacheDir(),
        currentTheme: cfg.theme,
        systemDarkMode: isMacOS() ? isDarkMode() : isDarkMode(),
    };
}

/** Helper exported for the controller to update its cached theme. */
export { resolveTheme };
