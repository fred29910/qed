/**
 * IPC bus.
 *
 * A typed in-process command dispatcher. UI code calls
 * `bus.send("fs:list", { path, showHidden })` and awaits a typed
 * response; the bus routes the call to the registered handler,
 * traps exceptions, and resolves / rejects.
 *
 * Why a bus rather than direct service calls? The UI should be
 * free of try/catch noise and should never import `fs` or
 * `perry/system` directly. The bus is the seam that:
 *   1. Provides a uniform `Promise<T>` shape (no callbacks).
 *   2. Normalises errors (handler exceptions → IpcErr).
 *   3. Keeps the UI pure: it can be unit-tested by swapping the
 *      bus for an in-memory mock.
 *   4. Leaves the door open for a future worker-mode split.
 *
 * The bus is intentionally synchronous over a single host thread —
 * the perry runtime has no pre-emptive scheduling, so async-ness
 * comes from "schedule later" (`Promise.resolve().then(...)`), not
 * from real concurrency. The bus doesn't need to care.
 */
import { explainFsError } from '../platform/index.js';
import type { IpcChannel, IpcErr, IpcId, IpcRequest, IpcResponse } from '../types/index.js';

/** A handler for a single channel. May return a value or throw. */
export type IpcHandler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>;

/** Map of channel → handler. */
export type IpcHandlerMap = {
    [K in IpcChannel]?: IpcHandler<unknown, unknown>;
};

/**
 * Default handler timeout in milliseconds. Handlers that take longer
 * than this will reject with a `timeout` message rather than hang
 * the UI. Per-call override via `send(channel, payload, { timeoutMs })`.
 */
const DEFAULT_TIMEOUT_MS = 5000;

/** Optional overrides for a single send. */
export interface SendOptions {
    /** Timeout in milliseconds. Defaults to 5000. Pass `0` to disable. */
    readonly timeoutMs?: number;
}

export class IpcBus {
    private readonly handlers: Map<IpcChannel, IpcHandler<unknown, unknown>> = new Map();
    private nextId: number = 0;

    /** Register a handler. Last write wins; calling twice replaces. */
    register<TPayload, TResult>(channel: IpcChannel, handler: IpcHandler<TPayload, TResult>): void {
        this.handlers.set(channel, handler as IpcHandler<unknown, unknown>);
    }

    /**
     * Send a request and await the typed result.
     *
     * Throws an `Error` whose `.message` is the user-facing error
     * string from the handler (or a timeout message). UI code can
     * catch and toast the message directly.
     */
    async send<TPayload, TResult>(
        channel: IpcChannel,
        payload: TPayload,
        options?: SendOptions,
    ): Promise<TResult> {
        const handler = this.handlers.get(channel);
        if (handler === undefined) {
            throw new Error(`no handler registered for channel "${channel}"`);
        }
        const id = this.makeId();
        // Build the request envelope (used for logging and for
        // future worker-mode transport). We don't pass it to the
        // handler today.
        const request: IpcRequest<TPayload> = { id, channel, payload, ts: Date.now() };
        void request;
        const response = await this.invokeWithTimeout(id, channel, handler, payload, options);
        if (!response.ok) {
            throw new Error((response as IpcErr).message);
        }
        return (response as { ok: true; value: TResult }).value;
    }

    /**
     * Send a request and resolve the envelope itself (success or
     * error). Useful when the caller wants to *display* the error
     * rather than throw.
     */
    async call<TPayload, TResult>(
        channel: IpcChannel,
        payload: TPayload,
        options?: SendOptions,
    ): Promise<IpcResponse<TResult>> {
        const handler = this.handlers.get(channel);
        if (handler === undefined) {
            return { id: this.makeId(), ok: false, message: `no handler for ${channel}` };
        }
        const id = this.makeId();
        // The handler map stores `IpcHandler<unknown, unknown>` for
        // erasure; the cast below restores the call-site types. Channel
        // registration is validated by `IpcHandlerMap`, which maps every
        // `IpcChannel` to the right typed handler.
        const typed = handler as IpcHandler<TPayload, TResult>;
        return this.invokeWithTimeout<TPayload, TResult>(id, channel, typed, payload, options);
    }

    /**
     * Run a handler under a timeout race. Returns an envelope that
     * either succeeds or carries an error message (timeout / handler
     * exception).
     */
    private async invokeWithTimeout<TPayload, TResult>(
        id: IpcId,
        channel: IpcChannel,
        handler: IpcHandler<TPayload, TResult>,
        payload: TPayload,
        options?: SendOptions,
    ): Promise<IpcResponse<TResult>> {
        const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const work = Promise.resolve().then(() => handler(payload));
        if (timeoutMs <= 0) {
            try {
                const value = await work;
                return { id, ok: true, value: value as TResult };
            } catch (err) {
                return { id, ok: false, message: explainFsError(err) };
            }
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`timeout after ${timeoutMs}ms on channel "${channel}"`));
            }, timeoutMs);
        });
        try {
            const value = await Promise.race([work, timeout]);
            return { id, ok: true, value: value as TResult };
        } catch (err) {
            return { id, ok: false, message: explainFsError(err) };
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }

    private makeId(): IpcId {
        this.nextId = (this.nextId + 1) & 0xffff;
        const timePart = Date.now() & 0xffffff;
        return timePart.toString(16).padStart(6, '0') + this.nextId.toString(16).padStart(4, '0');
    }
}

/** Convenience: build a typed request envelope (mainly for tests). */
export function makeRequest<T>(channel: IpcChannel, payload: T): IpcRequest<T> {
    return { id: 'test', channel, payload, ts: Date.now() };
}

// Re-export for callers that want a single import.
export type { IpcChannel, IpcRequest, IpcResponse } from '../types/index.js';
