import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildAuthorizationUrl,
  getValidAccessToken,
} from "../src/auth/googleOAuth.ts";
import {
  setCredentialsDirectoryForTesting,
  saveStoredCredentials,
} from "../src/auth/tokenStorage.ts";

describe("Google OAuth Core", () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmb-oauth-test-"));
    setCredentialsDirectoryForTesting(tempDir);
    delete process.env.AGY_ACCESS_TOKEN;
    delete process.env.GOOGLE_ACCESS_TOKEN;
    delete process.env.AGY_PROJECT_ID;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    setCredentialsDirectoryForTesting(null);
    process.env = { ...originalEnv };
  });

  test("buildAuthorizationUrl includes client_id, scopes, and redirect_uri", () => {
    const redirectUri = "http://localhost:51128/callback";
    const state = "test-state-123";
    const urlStr = buildAuthorizationUrl(redirectUri, state);
    const parsed = new URL(urlStr);

    assert.strictEqual(parsed.origin, "https://accounts.google.com");
    assert.strictEqual(parsed.pathname, "/o/oauth2/v2/auth");
    assert.strictEqual(parsed.searchParams.get("redirect_uri"), redirectUri);
    assert.strictEqual(parsed.searchParams.get("state"), state);
    assert.strictEqual(parsed.searchParams.get("response_type"), "code");
    assert.strictEqual(parsed.searchParams.get("access_type"), "offline");

    const scopes = parsed.searchParams.get("scope") || "";
    assert.ok(scopes.includes("cloud-platform"));
    assert.ok(scopes.includes("userinfo.email"));
  });

  test("getValidAccessToken prioritizes AGY_ACCESS_TOKEN environment variable", async () => {
    process.env.AGY_ACCESS_TOKEN = "ya29.env-override-token";
    process.env.AGY_PROJECT_ID = "env-project-456";

    const result = await getValidAccessToken();
    assert.strictEqual(result.token, "ya29.env-override-token");
    assert.strictEqual(result.projectId, "env-project-456");
  });

  test("getValidAccessToken returns unexpired stored token", async () => {
    saveStoredCredentials({
      accessToken: "ya29.valid-stored-token",
      refreshToken: "1//refresh-token",
      expiryDate: Date.now() + 3600 * 1000,
      projectId: "stored-project-789",
      email: "user@example.com",
    });

    const result = await getValidAccessToken();
    assert.strictEqual(result.token, "ya29.valid-stored-token");
    assert.strictEqual(result.projectId, "stored-project-789");
  });

  test("getValidAccessToken throws actionable login guidance when no credentials exist", async () => {
    await assert.rejects(
      async () => {
        await getValidAccessToken();
      },
      (err: Error) => {
        return (
          err.message.includes("claude-media-bridge login") ||
          err.message.includes("No Google credentials")
        );
      }
    );
  });
});
