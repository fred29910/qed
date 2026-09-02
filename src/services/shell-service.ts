/**
 * Shell integration.
 *
 * One-call wrappers around `perry/system.openURL` and the per-platform
 * "open this file in the OS file manager" idiom.
 */
import { openURL } from "perry/system";
import { execFile } from "child_process";
import { isLinux, isMacOS, isWindows } from "../platform/index.js";

export class ShellService {
    /** Open a URL in the user's default browser. */
    openUrl(url: string): void {
        openURL(url);
    }

    /**
     * Reveal a path in the OS file manager.
     *
     *  - macOS  : `open -R <path>` selects the file in Finder.
     *  - Windows: `explorer.exe /select,<path>` opens the parent folder
     *             and highlights the file.
     *  - Linux  : We open the parent directory; the `xdg-open` family
     *             has no portable "select file" command.
     */
    revealInFileManager(path: string): void {
        if (isMacOS()) {
            execFile("open", ["-R", path]);
            return;
        }
        if (isWindows()) {
            // explorer.exe expects the comma form with no space.
            execFile("explorer.exe", ["/select," + path]);
            return;
        }
        if (isLinux()) {
            // Best-effort: open the parent directory.
            const idx = path.lastIndexOf("/");
            const dir = idx > 0 ? path.substring(0, idx) : ".";
            execFile("xdg-open", [dir]);
        }
    }
}
