/**
 * Platform identifier — single source of truth for which host we're on.
 *
 * `__platform__` is a Perry compile-time constant (see references/platforms-apple.md):
 *
 *   0 = macOS
 *   1 = iOS
 *   2 = Android
 *   3 = Windows
 *   4 = Linux
 *   5 = Web
 *   6 = tvOS
 *   7 = watchOS
 *   8 = visionOS
 *
 * The compiler constant-folds `__platform__` comparisons and eliminates the
 * dead branches, so guarding code with these helpers has zero runtime cost.
 */
declare const __platform__: number;

export const PlatformId = {
    macOS: 0,
    iOS: 1,
    Android: 2,
    Windows: 3,
    Linux: 4,
    Web: 5,
    tvOS: 6,
    watchOS: 7,
    visionOS: 8,
} as const;

export type PlatformId = (typeof PlatformId)[keyof typeof PlatformId];

/** The platform this build was compiled for. */
export const PLATFORM: PlatformId = __platform__ as PlatformId;

/** Coarse-grained host classification used by the rest of the app. */
export type HostKind = "macos" | "windows" | "linux" | "other";

export function getHostKind(): HostKind {
    if (PLATFORM === PlatformId.macOS) {
        return "macos";
    }
    if (PLATFORM === PlatformId.Windows) {
        return "windows";
    }
    if (PLATFORM === PlatformId.Linux) {
        return "linux";
    }
    return "other";
}

/** True when running on a desktop-class host (mac / win / linux). */
export function isDesktop(): boolean {
    return (
        PLATFORM === PlatformId.macOS ||
        PLATFORM === PlatformId.Windows ||
        PLATFORM === PlatformId.Linux
    );
}

/** True when running on macOS — used to gate AppKit-only affordances. */
export function isMacOS(): boolean {
    return PLATFORM === PlatformId.macOS;
}

/** True when running on Windows. */
export function isWindows(): boolean {
    return PLATFORM === PlatformId.Windows;
}

/** True when running on Linux (GTK4). */
export function isLinux(): boolean {
    return PLATFORM === PlatformId.Linux;
}

/** A short label suitable for status bars and About screens. */
export function platformLabel(): string {
    switch (PLATFORM) {
        case PlatformId.macOS:
            return "macOS";
        case PlatformId.Windows:
            return "Windows";
        case PlatformId.Linux:
            return "Linux";
        case PlatformId.iOS:
            return "iOS";
        case PlatformId.Android:
            return "Android";
        case PlatformId.Web:
            return "Web";
        case PlatformId.tvOS:
            return "tvOS";
        case PlatformId.watchOS:
            return "watchOS";
        case PlatformId.visionOS:
            return "visionOS";
        default:
            return "Unknown";
    }
}
