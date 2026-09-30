import http from "node:http";
import readline from "node:readline";
import crypto from "node:crypto";
import {
  GOOGLE_OAUTH_URLS,
  GOOGLE_OAUTH_SCOPES,
  CLOUD_CODE_ENDPOINTS,
  DEFAULT_LOOPBACK_PORT,
  getGoogleOAuthClientId,
  getGoogleOAuthClientSecret,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_X_GOOG_API_CLIENT,
} from "./constants.js";
import {
  loadStoredCredentials,
  saveStoredCredentials,
  isTokenExpired,
  type StoredCredentials,
} from "./tokenStorage.js";

export function buildAuthorizationUrl(redirectUri: string, state: string): string {
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

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<StoredCredentials> {
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

  const tokenData = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;

  // Attempt to fetch user email
  let email: string | undefined;
  try {
    const userRes = await fetch(`${GOOGLE_OAUTH_URLS.userInfoUrl}?alt=json`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userRes.ok) {
      const userJson = (await userRes.json()) as { email?: string };
      email = userJson.email;
    }
  } catch {
    // Non-fatal if userinfo fails
  }

  // Attempt to discover or onboard Google Cloud Code project
  let projectId: string | undefined;
  try {
    projectId = await discoverProjectId(tokenData.access_token);
  } catch {
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

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiryDate: number }> {
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

  const tokenData = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;
  return { accessToken: tokenData.access_token, expiryDate };
}

export async function discoverProjectId(accessToken: string): Promise<string> {
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
      const data = (await res.json()) as Record<string, unknown>;
      const project = data.cloudaicompanionProject;
      if (typeof project === "string" && project.trim()) return project.trim();
      if (project && typeof project === "object" && "id" in project) {
        const id = (project as { id: unknown }).id;
        if (typeof id === "string" && id.trim()) return id.trim();
      }
    }
  } catch {
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
        const data = (await retryRes.json()) as Record<string, unknown>;
        const project = data.cloudaicompanionProject;
        if (typeof project === "string" && project.trim()) return project.trim();
        if (project && typeof project === "object" && "id" in project) {
          const id = (project as { id: unknown }).id;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      }
    }
  } catch {
    // Ignore error
  }

  return "";
}

export async function getValidAccessToken(): Promise<{ token: string; projectId: string }> {
  // Check env overrides first
  const envToken = process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
  if (envToken && envToken.trim()) {
    const envProject =
      process.env.AGY_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      "";
    return { token: envToken.trim(), projectId: envProject.trim() };
  }

  const creds = loadStoredCredentials();
  if (!creds || !creds.accessToken) {
    throw new Error(
      "No Google credentials found for claude-media-bridge.\n" +
        "Please run 'claude-media-bridge login' in your terminal to authenticate with your Google account."
    );
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
    } catch (refreshErr) {
      throw new Error(
        `Failed to refresh Google access token: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}.\n` +
          "Please re-authenticate by running 'claude-media-bridge login'."
      );
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
    } catch {
      // Fallback
    }
  }

  return { token, projectId };
}

export async function loginInteractive(options?: {
  port?: number;
  manual?: boolean;
}): Promise<StoredCredentials> {
  const port = options?.port || DEFAULT_LOOPBACK_PORT;
  const redirectUri = `http://localhost:${port}/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildAuthorizationUrl(redirectUri, state);

  console.log("\n=======================================================");
  console.log("   🔑 Claude Media Bridge - Google Account Login");
  console.log("=======================================================\n");
  console.log("1. Open the following URL in your browser:\n");
  console.log(`\x1b[36m${authUrl}\x1b[0m\n`);
  console.log("2. Sign in with your Google Account and approve permissions.\n");

  return new Promise<StoredCredentials>((resolve, reject) => {
    let resolved = false;

    // Start local loopback HTTP server
    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (!req.url) return;
      const parsedUrl = new URL(req.url, `http://localhost:${port}`);

      if (parsedUrl.pathname === "/callback") {
        const code = parsedUrl.searchParams.get("code");
        const returnedState = parsedUrl.searchParams.get("state");
        const error = parsedUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>Login Failed</h1><p>Error: ${error}</p>`);
          if (!resolved) {
            resolved = true;
            server.close();
            reject(new Error(`Google authorization error: ${error}`));
          }
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Invalid Request</h1><p>State mismatch or missing authorization code.</p>");
          return;
        }

        try {
          const creds = await exchangeCodeForTokens(code, redirectUri);
          saveStoredCredentials(creds);

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #f8fafc;">
                <h1 style="color: #38bdf8;">✓ Authentifizierung erfolgreich!</h1>
                <p>Claude Media Bridge ist jetzt mit deinem Google-Account verbunden.</p>
                <p style="color: #94a3b8;">Du kannst dieses Fenster schließen und zum Terminal zurückkehren.</p>
              </body>
            </html>
          `);

          if (!resolved) {
            resolved = true;
            server.close();
            console.log("\x1b[32m✔ Authentifizierung erfolgreich abgeschlossen!\x1b[0m");
            if (creds.email) console.log(`   Account:    ${creds.email}`);
            if (creds.projectId) console.log(`   Project ID: ${creds.projectId}`);
            resolve(creds);
          }
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>Token Exchange Error</h1><p>${err instanceof Error ? err.message : String(err)}</p>`);
          if (!resolved) {
            resolved = true;
            server.close();
            reject(err);
          }
        }
      }
    });

    server.listen(port, () => {
      console.log(`Waiting for browser callback on http://localhost:${port}/callback ...`);
      console.log("(If you are on a remote/headless machine, you can also paste the full redirect URL below)");

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question("\nPaste redirect URL or authorization code (press Enter to skip): ", async (answer: string) => {
        rl.close();
        const trimmed = answer.trim();
        if (!trimmed || resolved) return;

        let code = trimmed;
        if (trimmed.includes("code=")) {
          try {
            const urlObj = new URL(trimmed.startsWith("http") ? trimmed : `http://localhost?${trimmed}`);
            code = urlObj.searchParams.get("code") || trimmed;
          } catch {
            // Keep code as trimmed
          }
        }

        try {
          const creds = await exchangeCodeForTokens(code, redirectUri);
          saveStoredCredentials(creds);
          if (!resolved) {
            resolved = true;
            server.close();
            console.log("\x1b[32m✔ Authentifizierung erfolgreich abgeschlossen!\x1b[0m");
            if (creds.email) console.log(`   Account:    ${creds.email}`);
            if (creds.projectId) console.log(`   Project ID: ${creds.projectId}`);
            resolve(creds);
          }
        } catch (err) {
          if (!resolved) {
            resolved = true;
            server.close();
            reject(err);
          }
        }
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${port} in use, waiting for manual URL paste...`);
      } else {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  });
}
