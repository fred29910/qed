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
import { explainFsError } from "../platform/index.js";
import type {
    IpcChannel,
    IpcErr,
    IpcId,
    IpcRequest,
    IpcResponse,
} from "../types/index.js";

/** A handler for a single channel. May return a value or throw. */
export type IpcHandler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>;

/** Map of channel → handler. */
export type IpcHandlerMap = {
    [K in IpcChannel]?: IpcHandler<unknown, unknown>;
};

const DEFAULT_TIMEOUT_MS = 5000;

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
    async send<TPayload, TResult>(channel: IpcChannel, payload: TPayload): Promise<TResult> {
        const handler = this.handlers.get(channel);
        if (handler === undefined) {
            throw new Error(`no handler registered for channel "${channel}"`);
        }
        const id = this.makeId();
        const ts = Date.now();
        const request: IpcRequest<TPayload> = { id, channel, payload, ts };
        let response: IpcResponse<TResult>;
        try {
            const value = await Promise.resolve().then(() => handler(payload));
            response = { id, ok: true, value: value as TResult };
        } catch (err) {
            response = { id, ok: false, message: explainFsError(err) };
        }
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
    async call<TPayload, TResult>(channel: IpcChannel, payload: TPayload): Promise<IpcResponse<TResult>> {
        const handler = this.handlers.get(channel);
        if (handler === undefined) {
            return { id: this.makeId(), ok: false, message: `no handler for ${channel}` };
        }
        const id = this.makeId();
        try {
            const value = await Promise.resolve().then(() => handler(payload));
            return { id, ok: true, value: value as TResult };
        } catch (err) {
            return { id, ok: false, message: explainFsError(err) };
        }
    }

    private makeId(): IpcId {
        this.nextId = (this.nextId + 1) & 0xffff;
        const timePart = Date.now() & 0xffffff;
        return timePart.toString(16).padStart(6, "0") + this.nextId.toString(16).padStart(4, "0");
    }
}

/** Convenience: build a typed request envelope (mainly for tests). */
export function makeRequest<T>(channel: IpcChannel, payload: T): IpcRequest<T> {
    return { id: "test", channel, payload, ts: Date.now() };
}

// Re-export for callers that want a single import.
export type { IpcChannel, IpcRequest, IpcResponse } from "../types/index.js";
