import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
export function loadStoredCredentials() {
    const filePath = getCredentialsPath();
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || typeof parsed.accessToken !== "string") {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export function saveStoredCredentials(creds) {
    const dir = getCredentialsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const filePath = getCredentialsPath();
    const content = JSON.stringify(creds, null, 2);
    fs.writeFileSync(filePath, content, { mode: 0o600 });
    try {
        fs.chmodSync(filePath, 0o600);
    }
    catch {
        // Ignore chmod errors on systems with non-POSIX ACLs
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
