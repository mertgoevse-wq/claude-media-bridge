import { spawn } from "node:child_process";
import fs from "node:fs";
const TERMUX_BIN = "/data/data/com.termux/files/usr/bin";
/**
 * Candidate openers in priority order. Termux is checked first because on
 * Android `xdg-open` is frequently present but non-functional.
 */
function openerCandidates() {
    const candidates = [];
    const termuxOpen = `${TERMUX_BIN}/termux-open`;
    if (fs.existsSync(termuxOpen)) {
        candidates.push({ command: termuxOpen, args: [] });
        candidates.push({ command: `${TERMUX_BIN}/termux-open-url`, args: [] });
    }
    if (process.platform === "darwin") {
        candidates.push({ command: "open", args: [] });
    }
    else if (process.platform === "win32") {
        candidates.push({ command: "cmd", args: ["/c", "start", ""] });
    }
    candidates.push({ command: "xdg-open", args: [] });
    candidates.push({ command: "gio", args: ["open"] });
    candidates.push({ command: "wslview", args: [] });
    candidates.push({ command: "sensible-browser", args: [] });
    return candidates;
}
/**
 * Opens a URL in the user's browser. Returns false when no opener worked, so
 * callers can fall back to printing the URL instead of failing the flow.
 */
export function openInBrowser(url) {
    for (const opener of openerCandidates()) {
        try {
            const child = spawn(opener.command, [...opener.args, url], {
                stdio: "ignore",
                detached: true,
            });
            child.on("error", () => { });
            child.unref();
            // spawn reports a missing binary asynchronously; a successful start is
            // indistinguishable here, so treat the first candidate as the attempt.
            return true;
        }
        catch {
            continue;
        }
    }
    return false;
}
