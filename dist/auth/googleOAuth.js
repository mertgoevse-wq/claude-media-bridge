import http from "node:http";
import readline from "node:readline";
import crypto from "node:crypto";
import { openInBrowser } from "../util/browser.js";
import { GOOGLE_OAUTH_URLS, GOOGLE_OAUTH_SCOPES, CLOUD_CODE_ENDPOINTS, DEFAULT_LOOPBACK_PORT, getGoogleOAuthClientId, getGoogleOAuthClientSecret, ANTIGRAVITY_USER_AGENT, ANTIGRAVITY_X_GOOG_API_CLIENT, } from "./constants.js";
import { loadStoredCredentials, saveStoredCredentials, isTokenExpired, } from "./tokenStorage.js";
export function buildAuthorizationUrl(redirectUri, state) {
    const clientId = getGoogleOAuthClientId();
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: GOOGLE_OAUTH_SCOPES.join(" "),
        state,
        access_type: "offline",
        prompt: "consent",
    });
    return `${GOOGLE_OAUTH_URLS.authorizeUrl}?${params.toString()}`;
}
export async function exchangeCodeForTokens(code, redirectUri) {
    const clientId = getGoogleOAuthClientId();
    const clientSecret = getGoogleOAuthClientSecret();
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
    });
    const res = await fetch(GOOGLE_OAUTH_URLS.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": ANTIGRAVITY_USER_AGENT,
        },
        body: body.toString(),
    });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google OAuth token exchange failed (${res.status}): ${errorText}`);
    }
    const tokenData = (await res.json());
    const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;
    // Attempt to fetch user email
    let email;
    try {
        const userRes = await fetch(`${GOOGLE_OAUTH_URLS.userInfoUrl}?alt=json`, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
            const userJson = (await userRes.json());
            email = userJson.email;
        }
    }
    catch {
        // Non-fatal if userinfo fails
    }
    // Attempt to discover or onboard Google Cloud Code project
    let projectId;
    try {
        projectId = await discoverProjectId(tokenData.access_token);
    }
    catch {
        // Ignore initial discovery error; can be retried on demand
    }
    return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiryDate,
        projectId,
        email,
    };
}
export async function refreshAccessToken(refreshToken) {
    const clientId = getGoogleOAuthClientId();
    const clientSecret = getGoogleOAuthClientSecret();
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });
    const res = await fetch(GOOGLE_OAUTH_URLS.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": ANTIGRAVITY_USER_AGENT,
        },
        body: body.toString(),
    });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google OAuth token refresh failed (${res.status}): ${errorText}`);
    }
    const tokenData = (await res.json());
    const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;
    return { accessToken: tokenData.access_token, expiryDate };
}
export async function discoverProjectId(accessToken) {
    const metadata = {
        ideType: 9, // Antigravity IDE
        platform: 4, // Linux ARM64 / standard
        pluginType: 2, // Gemini
    };
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": ANTIGRAVITY_USER_AGENT,
        "X-Goog-Api-Client": ANTIGRAVITY_X_GOOG_API_CLIENT,
    };
    // 1. Try loadCodeAssist
    try {
        const res = await fetch(CLOUD_CODE_ENDPOINTS.loadCodeAssist, {
            method: "POST",
            headers,
            body: JSON.stringify({ metadata }),
        });
        if (res.ok) {
            const data = (await res.json());
            const project = data.cloudaicompanionProject;
            if (typeof project === "string" && project.trim())
                return project.trim();
            if (project && typeof project === "object" && "id" in project) {
                const id = project.id;
                if (typeof id === "string" && id.trim())
                    return id.trim();
            }
        }
    }
    catch {
        // Continue to onboardUser
    }
    // 2. Try onboardUser if loadCodeAssist didn't return a project
    try {
        const onboardRes = await fetch(CLOUD_CODE_ENDPOINTS.onboardUser, {
            method: "POST",
            headers,
            body: JSON.stringify({ tier_id: "legacy-tier", metadata }),
        });
        if (onboardRes.ok) {
            // Retry loadCodeAssist after onboarding
            const retryRes = await fetch(CLOUD_CODE_ENDPOINTS.loadCodeAssist, {
                method: "POST",
                headers,
                body: JSON.stringify({ metadata }),
            });
            if (retryRes.ok) {
                const data = (await retryRes.json());
                const project = data.cloudaicompanionProject;
                if (typeof project === "string" && project.trim())
                    return project.trim();
                if (project && typeof project === "object" && "id" in project) {
                    const id = project.id;
                    if (typeof id === "string" && id.trim())
                        return id.trim();
                }
            }
        }
    }
    catch {
        // Ignore error
    }
    return "";
}
export async function getValidAccessToken() {
    // Check env overrides first
    const envToken = process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
    if (envToken && envToken.trim()) {
        const envProject = process.env.AGY_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCP_PROJECT ||
            "";
        return { token: envToken.trim(), projectId: envProject.trim() };
    }
    const creds = loadStoredCredentials();
    if (!creds || !creds.accessToken) {
        throw new Error("No Google credentials found for claude-media-bridge.\n" +
            "Please run 'claude-media-bridge login' in your terminal to authenticate with your Google account.");
    }
    let token = creds.accessToken;
    let projectId = creds.projectId || "";
    // Auto-refresh token if expired
    if (isTokenExpired(creds.expiryDate) && creds.refreshToken) {
        try {
            const refreshed = await refreshAccessToken(creds.refreshToken);
            token = refreshed.accessToken;
            creds.accessToken = token;
            creds.expiryDate = refreshed.expiryDate;
            saveStoredCredentials(creds);
        }
        catch (refreshErr) {
            throw new Error(`Failed to refresh Google access token: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}.\n` +
                "Please re-authenticate by running 'claude-media-bridge login'.");
        }
    }
    // Auto-discover projectId if missing
    if (!projectId) {
        try {
            projectId = await discoverProjectId(token);
            if (projectId) {
                creds.projectId = projectId;
                saveStoredCredentials(creds);
            }
        }
        catch {
            // Fallback
        }
    }
    return { token, projectId };
}
const SUCCESS_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Media Bridge - Signed in</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         background:#0b1220; color:#e6edf7; }
  .card { max-width:34rem; padding:2.5rem; text-align:center; }
  .mark { width:56px; height:56px; margin:0 auto 1.25rem; border-radius:50%;
          display:grid; place-items:center; background:#0f2a1c; color:#34d399; font-size:1.75rem; }
  h1 { margin:0 0 .5rem; font-size:1.5rem; letter-spacing:-.02em; }
  p { margin:0 0 .35rem; color:#9fb0c9; line-height:1.6; }
  code { color:#cbd5e1; background:#111c2e; padding:.15rem .4rem; border-radius:.35rem; font-size:.9em; }
</style></head>
<body><div class="card">
  <div class="mark">&#10003;</div>
  <h1>Signed in</h1>
  <p>Claude Media Bridge is now connected to your Google account.</p>
  <p>Nano Banana 2 is ready. You can close this tab and return to the terminal.</p>
  <p style="margin-top:1.25rem;opacity:.6">In chat: <code>/claude-media-bridge nano-banana &lt;your prompt&gt;</code></p>
</div></body></html>`;
const ERROR_PAGE = (title, detail) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Media Bridge - ${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e6edf7; }
  .card { max-width:34rem; padding:2.5rem; text-align:center; }
  h1 { margin:0 0 .75rem; font-size:1.4rem; }
  p { margin:0; color:#9fb0c9; line-height:1.6; word-break:break-word; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${detail}</p></div></body></html>`;
/** Codes pasted by hand, or full redirect URLs captured on another machine. */
function extractCode(input) {
    const trimmed = input.trim();
    if (!trimmed.includes("code="))
        return trimmed;
    try {
        const url = new URL(trimmed.startsWith("http") ? trimmed : `http://localhost?${trimmed}`);
        return url.searchParams.get("code") || trimmed;
    }
    catch {
        return trimmed;
    }
}
async function completeLogin(code, redirectUri) {
    const creds = await exchangeCodeForTokens(code, redirectUri);
    saveStoredCredentials(creds);
    return creds;
}
/**
 * Runs the Google OAuth loopback flow.
 *
 * The server binds to 127.0.0.1 only. When the preferred port is taken it walks
 * upward rather than failing, because a stale login is a common case on phones.
 */
export async function loginInteractive(options = {}) {
    const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
    const openBrowser = options.openBrowser ?? true;
    const basePort = options.port || DEFAULT_LOOPBACK_PORT;
    const state = crypto.randomBytes(16).toString("hex");
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn) => {
            if (settled)
                return;
            settled = true;
            server.close();
            fn();
        };
        const fail = (err) => finish(() => reject(err));
        const server = http.createServer(async (req, res) => {
            if (!req.url)
                return;
            const url = new URL(req.url, `http://localhost:${basePort}`);
            if (url.pathname === "/callback") {
                const code = url.searchParams.get("code");
                const error = url.searchParams.get("error");
                if (error) {
                    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(ERROR_PAGE("Sign-in failed", `Google returned: ${error}`));
                    fail(new Error(`Google authorization error: ${error}`));
                    return;
                }
                if (!code || url.searchParams.get("state") !== state) {
                    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(ERROR_PAGE("Invalid request", "The sign-in request could not be verified. Please try again."));
                    return;
                }
                try {
                    const creds = await completeLogin(code, `http://localhost:${actualPort}/callback`);
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(SUCCESS_PAGE);
                    finish(() => resolve(creds));
                }
                catch (err) {
                    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(ERROR_PAGE("Token exchange failed", String(err instanceof Error ? err.message : err)));
                    fail(err instanceof Error ? err : new Error(String(err)));
                }
                return;
            }
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
        });
        let actualPort = basePort;
        const tryListen = (port, attemptsLeft) => {
            const onError = (err) => {
                server.removeListener("error", onError);
                if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
                    tryListen(port + 1, attemptsLeft - 1);
                    return;
                }
                fail(err);
            };
            server.once("error", onError);
            server.listen(port, "127.0.0.1", () => {
                actualPort = port;
                server.removeListener("error", onError);
                server.on("error", fail);
                const redirectUri = `http://localhost:${actualPort}/callback`;
                const authUrl = buildAuthorizationUrl(redirectUri, state);
                console.log(`\n  Listening for the Google callback on http://localhost:${actualPort}/callback\n`);
                if (openBrowser && openInBrowser(authUrl)) {
                    console.log("  Opened your browser. Approve the request to continue.\n");
                }
                else {
                    console.log("  Open this URL in a browser to continue:\n");
                    console.log(`  \x1b[36m${authUrl}\x1b[0m\n`);
                }
                options.onReady?.({ authUrl, port: actualPort });
                if (!interactive)
                    return;
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question("  Headless or remote machine? Paste the redirect URL here (Enter to skip): ", async (answer) => {
                    rl.close();
                    const trimmed = answer.trim();
                    if (!trimmed || settled)
                        return;
                    try {
                        const creds = await completeLogin(extractCode(trimmed), redirectUri);
                        finish(() => resolve(creds));
                    }
                    catch (err) {
                        fail(err instanceof Error ? err : new Error(String(err)));
                    }
                });
            });
        };
        tryListen(basePort, 10);
    });
}
