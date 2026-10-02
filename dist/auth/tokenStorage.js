import fs from "node:fs";
import path from "node:path";
import os from "node:os";
/**
 * Provider API keys that can be collected once during `claude-media-bridge setup`
 * and then reused without exporting environment variables in every shell.
 */
export const PROVIDER_KEY_NAMES = [
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "STABILITY_API_KEY",
    "FAL_KEY",
    "HIGGSFIELD_API_KEY",
];
let customCredentialsDir = null;
export function setCredentialsDirectoryForTesting(dir) {
    customCredentialsDir = dir;
}
export function getCredentialsDir() {
    if (customCredentialsDir) {
        return customCredentialsDir;
    }
    return path.join(os.homedir(), ".config", "claude-media-bridge");
}
export function getCredentialsPath() {
    return path.join(getCredentialsDir(), "credentials.json");
}
export function loadBridgeState() {
    const filePath = getCredentialsPath();
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export function loadStoredCredentials() {
    const state = loadBridgeState();
    if (!state || typeof state.accessToken !== "string" || !state.accessToken) {
        return null;
    }
    return {
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiryDate: state.expiryDate,
        projectId: state.projectId,
        email: state.email,
    };
}
export function loadProviderKeys() {
    return loadBridgeState()?.providerKeys ?? {};
}
export function saveProviderKey(name, value) {
    const state = loadBridgeState() ?? {};
    state.providerKeys = { ...(state.providerKeys ?? {}), [name]: value.trim() };
    saveBridgeState(state);
}
export function clearProviderKey(name) {
    const state = loadBridgeState();
    if (!state?.providerKeys)
        return;
    delete state.providerKeys[name];
    saveBridgeState(state);
}
export function saveBridgeState(state) {
    writeCredentialsFile(JSON.stringify(state, null, 2));
}
export function saveStoredCredentials(creds) {
    // Merge so saving refreshed Google tokens never wipes collected API keys.
    const state = loadBridgeState() ?? {};
    saveBridgeState({ ...state, ...creds });
}
function writeCredentialsFile(content) {
    const dir = getCredentialsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const filePath = getCredentialsPath();
    fs.writeFileSync(filePath, content, { mode: 0o600 });
    try {
        fs.chmodSync(filePath, 0o600);
    }
    catch {
        // Ignore chmod errors on systems without POSIX permissions
    }
}
export function clearStoredCredentials() {
    const filePath = getCredentialsPath();
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        }
        catch {
            // Ignore deletion errors
        }
    }
}
export function isTokenExpired(expiryDate, bufferMs = 60000) {
    if (!expiryDate || typeof expiryDate !== "number") {
        return true;
    }
    return Date.now() + bufferMs >= expiryDate;
}
