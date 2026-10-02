import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadBridgeState, saveProviderKey, clearProviderKey, saveBridgeState, } from "../auth/tokenStorage.js";
import { loginInteractive } from "../auth/googleOAuth.js";
import { listProviders } from "../providers/router.js";
import { registerMcpServer, getCliPath, getUserSettingsPath } from "./claudeCode.js";
import { PROVIDER_CATALOG } from "./catalog.js";
import { openInBrowser } from "../util/browser.js";
const DEFAULT_PORT = 51180;
/** A per-run secret so other local processes cannot write to your key store. */
const TOKEN = crypto.randomBytes(16).toString("hex");
let googleLogin = { status: "idle" };
let googlePending = null;
function currentState() {
    const state = loadBridgeState();
    const live = listProviders();
    const keys = state?.providerKeys ?? {};
    return {
        providers: PROVIDER_CATALOG.map((entry) => ({
            id: entry.id,
            name: entry.name,
            tagline: entry.tagline,
            auth: entry.auth,
            cost: entry.cost,
            costNote: entry.costNote,
            signupUrl: entry.signupUrl,
            keyName: entry.keyName,
            models: entry.models,
            defaultModel: entry.defaultModel,
            configured: entry.auth === "none"
                ? true
                : entry.auth === "oauth"
                    ? Boolean(state?.accessToken)
                    : Boolean(keys[entry.keyName]?.trim() || process.env[entry.keyName]?.trim()),
            account: entry.auth === "oauth" ? (state?.email ?? null) : null,
        })),
        google: googleLogin,
        defaultProvider: state?.defaultProvider ?? null,
        defaultModel: state?.defaultModel ?? null,
        mcpServer: live.find((p) => p.id === "google") ? "media-bridge" : null,
        cliPath: getCliPath(),
        settingsPath: getUserSettingsPath(),
    };
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => {
        switch (c) {
            case "&": return "&amp;";
            case "<": return "&lt;";
            case ">": return "&gt;";
            case '"': return "&quot;";
            default: return "&#39;";
        }
    });
}
const STYLE = `
  :root { color-scheme: dark; --bg:#0b1220; --panel:#111c2e; --line:#1e2d45;
          --text:#e6edf7; --muted:#93a4bd; --accent:#38bdf8; --ok:#34d399; --warn:#fbbf24; }
  * { box-sizing: border-box; }
  body { margin:0; padding:2.5rem 1.25rem 4rem; background:var(--bg); color:var(--text);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         line-height:1.55; }
  .wrap { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.6rem; letter-spacing:-.02em; margin:0 0 .35rem; }
  .sub { color:var(--muted); margin:0 0 2rem; }
  .row { display:flex; align-items:flex-start; gap:1rem; padding:1.1rem 0;
         border-top:1px solid var(--line); }
  .row:first-of-type { border-top:none; }
  .body { flex:1; min-width:0; }
  .name { font-weight:600; }
  .tagline { color:var(--muted); font-size:.9rem; margin-top:.15rem; }
  .note { color:var(--muted); font-size:.8rem; margin-top:.35rem; }
  .actions { display:flex; gap:.5rem; align-items:center; flex-shrink:0; }
  button, a.btn { font:inherit; font-size:.875rem; padding:.45rem .85rem; border-radius:.5rem;
                  border:1px solid var(--line); background:var(--panel); color:var(--text);
                  cursor:pointer; text-decoration:none; display:inline-block; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#04121f; font-weight:600; }
  button:disabled { opacity:.5; cursor:default; }
  .pill { font-size:.75rem; padding:.15rem .5rem; border-radius:999px; border:1px solid var(--line);
          color:var(--muted); white-space:nowrap; }
  .pill.ok { color:var(--ok); border-color:#17563c; background:#0d2a1e; }
  .pill.warn { color:var(--warn); border-color:#5c4413; background:#2a2109; }
  .pill.free { color:var(--ok); }
  .pill.paid { color:var(--warn); }
  input { font:inherit; font-size:.875rem; padding:.45rem .6rem; border-radius:.5rem;
          border:1px solid var(--line); background:#0b1220; color:var(--text); width:15rem; }
  .msg { margin:.5rem 0 0; font-size:.8rem; color:var(--muted); }
  .msg.err { color:#f87171; }
  .foot { margin-top:2.5rem; padding-top:1.25rem; border-top:1px solid var(--line);
          color:var(--muted); font-size:.8rem; }
  code { background:var(--panel); padding:.1rem .35rem; border-radius:.3rem; font-size:.85em; }
`;
function renderPage(state) {
    const rows = state.providers
        .map((p) => {
        const pill = p.configured
            ? `<span class="pill ok">connected</span>`
            : p.auth === "none"
                ? `<span class="pill ok">ready</span>`
                : `<span class="pill">not set up</span>`;
        const costPill = `<span class="pill ${p.cost === "paid" ? "paid" : "free"}">${escapeHtml(p.cost)}</span>`;
        let control;
        if (p.auth === "oauth") {
            control = `<button data-action="google" data-id="${p.id}">${p.configured ? "Reconnect" : "Connect with Google"}</button>`;
        }
        else if (p.auth === "api-key") {
            control = `<input type="password" placeholder="API key" id="key-${p.id}" autocomplete="off" />
          <button class="primary" data-action="save" data-id="${p.id}">Save</button>
          ${p.signupUrl ? `<a class="btn" href="${escapeHtml(p.signupUrl)}" target="_blank" rel="noreferrer">Get key</a>` : ""}`;
        }
        else {
            control = `<span class="pill">no key needed</span>`;
        }
        const account = p.account ? `<div class="note">Signed in as ${escapeHtml(p.account)}</div>` : "";
        return `
      <div class="row">
        <div class="body">
          <div class="name">${escapeHtml(p.name)} ${costPill}</div>
          <div class="tagline">${escapeHtml(p.tagline)}</div>
          <div class="note">${escapeHtml(p.costNote)}</div>
          ${account}
          <p class="msg" id="msg-${p.id}"></p>
        </div>
        <div class="actions">${control}</div>
      </div>`;
    })
        .join("");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Media Bridge - Setup</title>
<style>${STYLE}</style></head>
<body><div class="wrap">
  <h1>Claude Media Bridge</h1>
  <p class="sub">Connect a provider. Google and free FLUX need no API key.</p>
  ${rows}
  <div class="foot">
    MCP server <code>media-bridge</code> registered in <code>${escapeHtml(state.settingsPath)}</code>.<br>
    When you are done, close this tab and run <code>/claude-media-bridge &lt;prompt&gt;</code> in Claude Code.
  </div>
</div>
<script>
const TOKEN = ${JSON.stringify(TOKEN)};
const say = (id, text, isError) => {
  const el = document.getElementById('msg-' + id);
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'msg err' : 'msg';
};

async function post(path, body) {
  const res = await fetch(path + '?t=' + TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

document.querySelectorAll('button[data-action]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    btn.disabled = true;
    try {
      if (btn.dataset.action === 'save') {
        const value = document.getElementById('key-' + id).value.trim();
        if (!value) { say(id, 'Paste a key first.', true); return; }
        const out = await post('/api/key', { provider: id, key: value });
        say(id, out.ok ? 'Saved. Reload to see it as connected.' : out.error, !out.ok);
      } else {
        say(id, 'Opening Google sign-in in your browser...');
        const out = await post('/api/google/start');
        if (!out.ok) { say(id, out.error, true); return; }
        if (out.authUrl) window.open(out.authUrl, '_blank');
        poll(id);
      }
    } catch (err) {
      say(id, String(err), true);
    } finally {
      btn.disabled = false;
    }
  });
});

async function poll(id) {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    let s;
    try { s = await (await fetch('/api/state?t=' + TOKEN)).json(); } catch { continue; }
    if (s.google.status === 'done') { say(id, 'Connected' + (s.google.email ? ' as ' + s.google.email : '') + '.'); return; }
    if (s.google.status === 'error') { say(id, s.google.message, true); return; }
  }
}
</script>
</body></html>`;
}
function json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    if (chunks.length === 0)
        return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        return {};
    }
}
/**
 * Serves the one-click setup page on loopback. The token in the query string
 * gates every mutating endpoint.
 */
export async function runWebSetup(options = {}) {
    const port = options.port ?? DEFAULT_PORT;
    // Make sure the tools are wired up even if setup was launched directly.
    try {
        registerMcpServer();
    }
    catch {
        // Non-fatal: the page still works, it just will not be pre-registered.
    }
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.searchParams.get("t") !== TOKEN) {
            res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Invalid setup token. Reopen the URL printed by 'claude-media-bridge setup --web'.");
            return;
        }
        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderPage(currentState()));
            return;
        }
        if (req.method === "GET" && url.pathname === "/api/state") {
            json(res, 200, currentState());
            return;
        }
        if (req.method === "POST" && url.pathname === "/api/key") {
            const body = await readBody(req);
            const entry = PROVIDER_CATALOG.find((p) => p.id === body.provider && p.auth === "api-key");
            const key = typeof body.key === "string" ? body.key.trim() : "";
            if (!entry)
                return json(res, 400, { ok: false, error: "Unknown provider." });
            if (!key)
                return json(res, 400, { ok: false, error: "Empty key." });
            saveProviderKey(entry.keyName, key);
            return json(res, 200, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/key/clear") {
            const body = await readBody(req);
            const entry = PROVIDER_CATALOG.find((p) => p.id === body.provider && p.auth === "api-key");
            if (!entry)
                return json(res, 400, { ok: false, error: "Unknown provider." });
            clearProviderKey(entry.keyName);
            return json(res, 200, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/defaults") {
            const body = await readBody(req);
            const state = loadBridgeState() ?? {};
            saveBridgeState({
                ...state,
                defaultProvider: typeof body.provider === "string" ? body.provider : state.defaultProvider,
                defaultModel: typeof body.model === "string" ? body.model : state.defaultModel,
            });
            return json(res, 200, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/google/start") {
            if (googlePending)
                return json(res, 200, { ok: true, authUrl: null, pending: true });
            googleLogin = { status: "waiting", authUrl: "" };
            googlePending = loginInteractive({
                interactive: false,
                openBrowser: false,
                onReady: ({ authUrl }) => {
                    googleLogin = { status: "waiting", authUrl };
                },
            })
                .then((creds) => {
                googleLogin = { status: "done", email: creds.email };
            })
                .catch((err) => {
                googleLogin = { status: "error", message: err instanceof Error ? err.message : String(err) };
            })
                .finally(() => {
                googlePending = null;
            });
            // Give the listener a moment to publish the URL before responding.
            await new Promise((r) => setTimeout(r, 250));
            return json(res, 200, {
                ok: true,
                authUrl: googleLogin.status === "waiting" ? googleLogin.authUrl : null,
            });
        }
        json(res, 404, { ok: false, error: "Not found" });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${port}/?t=${TOKEN}`;
    console.log();
    console.log(`  Setup page ready:`);
    console.log(`  \x1b[36m${url}\x1b[0m`);
    console.log();
    console.log(`  Press Ctrl+C to stop.`);
    console.log();
    if (options.openBrowser !== false) {
        openInBrowser(url);
    }
    return { url, close: () => server.close() };
}
/** Path used by tests and the CLI to confirm where images land by default. */
export function defaultOutputDir() {
    return path.join(os.homedir(), "media", "images");
}
export function ensureOutputDir() {
    const dir = defaultOutputDir();
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
