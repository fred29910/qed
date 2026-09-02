/**
 * IPC handler wiring.
 *
 * One function per channel. Registered against the `IpcBus` at startup.
 * Each handler delegates to a service and is the only place where
 * `try { … } catch` is allowed.
 */
import {
    arch as osArch,
    execPath as osExecPath,
    homedir as osHomedir,
} from "os";
import {
    appDataDir,
    cacheDir,
    isMacOS,
    logDir,
    platformLabel,
} from "../platform/index.js";
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
} from "../types/index.js";
import { resolveTheme } from "../state/app-state.js";
import { isDarkMode } from "perry/system";
import type { IpcBus } from "./bus.js";
import type { ConfigService } from "../services/config-service.js";
import type { FileService } from "../services/file-service.js";
import type { NotificationService } from "../services/notification-service.js";
import type { RecentFilesService } from "../services/recent-files-service.js";
import type { ShellService } from "../services/shell-service.js";
import type { AppStore } from "../state/app-state.js";

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
    bus.register<undefined, ReturnType<ConfigService["snapshot"]>>("config:get", () =>
        ctx.config.snapshot(),
    );
    bus.register<ConfigUpdatePayload, ReturnType<ConfigService["snapshot"]>>(
        "config:update",
        (payload) => {
            ctx.config.update(payload.patch);
            return ctx.config.snapshot();
        },
    );

    bus.register<FsListPayload, FsEntry[]>("fs:list", (p) => ctx.files.list(p.path, p.showHidden));
    bus.register<FsReadPayload, string>("fs:read", (p) => ctx.files.read(p.path, p.encoding));
    bus.register<FsWritePayload, void>("fs:write", (p) => {
        ctx.files.write(p.path, p.content, p.encoding);
    });
    bus.register<FsDeletePayload, void>("fs:delete", (p) => {
        ctx.files.delete(p.path, p.recursive);
    });
    bus.register<FsRenamePayload, void>("fs:rename", (p) => {
        ctx.files.rename(p.from, p.to);
    });
    bus.register<FsMkdirPayload, void>("fs:mkdir", (p) => {
        ctx.files.mkdir(p.path, p.idempotent);
    });
    bus.register<FsStatPayload, FsStat>("fs:stat", (p) => ctx.files.stat(p.path));

    bus.register<ShellOpenPathPayload, void>("shell:open-path", (p) => {
        ctx.shell.revealInFileManager(p.path);
    });
    bus.register<ShellOpenUrlPayload, void>("shell:open-url", (p) => {
        ctx.shell.openUrl(p.url);
    });

    bus.register<NotifySendPayload, { delivered: boolean }>("notify:send", (p) => {
        const delivered = ctx.notifications.send(p.title, p.body);
        return { delivered };
    });

    bus.register<undefined, PlatformInfo>("platform:info", () => buildPlatformInfo(ctx));

    bus.register<RecentAddPayload, void>("recent:add", (p) => {
        ctx.recent.add(p.path);
        ctx.store.notifyRecentChanged();
    });
    bus.register<undefined, RecentList>("recent:list", () => ctx.recent.list());
    bus.register<undefined, void>("recent:clear", () => {
        ctx.recent.clear();
        ctx.store.notifyRecentChanged();
    });
}

function buildPlatformInfo(_ctx: HandlerContext): PlatformInfo {
    // We deliberately use a parameter-prefixed underscore on unused ctx
    // so the function stays open to future handlers that need it
    // (e.g. "config not yet loaded" check).
    void _ctx;
    const cfg = _ctx.config.snapshot();
    return {
        host: platformLabel(),
        platformLabel: platformLabel(),
        arch: osArch(),
        execPath: osExecPath(),
        appDataDir: appDataDir(),
        logDir: logDir(),
        cacheDir: cacheDir(),
        currentTheme: cfg.theme,
        systemDarkMode: isMacOS() ? isDarkMode() : isDarkMode(),
    };
}

/** Helper exported for the controller to update its cached theme. */
export { resolveTheme };
