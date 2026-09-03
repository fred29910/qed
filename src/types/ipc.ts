/**
 * IPC envelope types.
 *
 * The IPC layer is implemented as a typed message bus: services publish
 * envelopes into a central router, the UI subscribes to channels and
 * receives the same envelopes back. Every request gets a correlation id
 * so the UI can pair a request with its eventual response.
 *
 * Why a custom IPC layer? Perry's UI and `perry/system` are designed
 * such that file IO, notifications, and preferences are called directly
 * from the main thread; there is no separate worker process. The "IPC"
 * abstraction in this project is therefore an *in-process* command
 * dispatcher that:
 *
 *   1. Keeps UI callbacks free of service boilerplate.
 *   2. Normalises errors so the UI can show a single, friendly toast.
 *   3. Makes async operations cancellable and awaitable uniformly.
 *   4. Provides a single, mockable seam for unit tests.
 *
 * The shape mirrors a JSON-RPC-ish envelope so we can keep the door
 * open for a future worker-mode split.
 */
import type { AppConfig, ThemeMode } from './config.js';

/** A unique request id, used to correlate request/response pairs. */
export type IpcId = string;

/** IPC channel names. Centralised so typos surface at compile time. */
export type IpcChannel =
    | 'config:get'
    | 'config:update'
    | 'fs:list'
    | 'fs:read'
    | 'fs:write'
    | 'fs:delete'
    | 'fs:rename'
    | 'fs:mkdir'
    | 'fs:stat'
    | 'shell:open-path'
    | 'shell:open-url'
    | 'notify:send'
    | 'platform:info'
    | 'recent:add'
    | 'recent:list'
    | 'recent:clear';

/** Request envelope sent over the bus. */
export interface IpcRequest<T = unknown> {
    readonly id: IpcId;
    readonly channel: IpcChannel;
    readonly payload: T;
    /** Wall-clock ms when the request was created. */
    readonly ts: number;
}

/** Successful response. */
export interface IpcOk<T = unknown> {
    readonly id: IpcId;
    readonly ok: true;
    readonly value: T;
}

/** Error response. */
export interface IpcErr {
    readonly id: IpcId;
    readonly ok: false;
    /** A short, user-facing message. */
    readonly message: string;
    /** Optional structured detail (stack, code, etc.). */
    readonly detail?: string;
}

export type IpcResponse<T = unknown> = IpcOk<T> | IpcErr;

/* ---------------------------------------------------------------- *
 * Payload shapes per channel. Keep these colocated with the channel *
 * name so it's obvious from one place what the contract is.        *
 * ---------------------------------------------------------------- */

export interface ConfigUpdatePayload {
    /** Partial update — only the keys present are written. */
    readonly patch: Partial<AppConfig>;
}

export interface FsListPayload {
    readonly path: string;
    /** If true, include hidden (dot-prefixed) entries. */
    readonly showHidden: boolean;
}

export interface FsReadPayload {
    readonly path: string;
    /** Encoding hint. Default "utf-8". "binary" returns a Uint8Array-like view. */
    readonly encoding: 'utf-8' | 'binary';
}

export interface FsWritePayload {
    readonly path: string;
    readonly content: string;
    readonly encoding: 'utf-8' | 'binary';
}

export interface FsDeletePayload {
    readonly path: string;
    /** If true, allow deleting non-empty directories (recursive). */
    readonly recursive: boolean;
}

export interface FsRenamePayload {
    readonly from: string;
    readonly to: string;
}

export interface FsMkdirPayload {
    readonly path: string;
    /** If true and the path already exists, treat as success. */
    readonly idempotent: boolean;
}

export interface FsStatPayload {
    readonly path: string;
}

export interface FsEntry {
    readonly name: string;
    readonly path: string;
    readonly isDir: boolean;
    readonly size: number;
    readonly mtimeMs: number;
    readonly isHidden: boolean;
}

export interface FsStat {
    readonly path: string;
    readonly isDir: boolean;
    readonly size: number;
    readonly mtimeMs: number;
}

export interface ShellOpenPathPayload {
    readonly path: string;
}

export interface ShellOpenUrlPayload {
    readonly url: string;
}

export interface NotifySendPayload {
    readonly title: string;
    readonly body: string;
}

export interface PlatformInfo {
    readonly host: string;
    readonly platformLabel: string;
    readonly arch: string;
    readonly execPath: string;
    readonly appDataDir: string;
    readonly logDir: string;
    readonly cacheDir: string;
    readonly currentTheme: ThemeMode;
    readonly systemDarkMode: boolean;
}

export interface RecentAddPayload {
    readonly path: string;
}

export type RecentList = readonly string[];
