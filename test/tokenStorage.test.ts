import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadStoredCredentials,
  saveStoredCredentials,
  clearStoredCredentials,
  isTokenExpired,
  getCredentialsPath,
  setCredentialsDirectoryForTesting,
  type StoredCredentials,
} from "../dist/auth/tokenStorage.js";

describe("Token Storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmb-auth-test-"));
    setCredentialsDirectoryForTesting(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    setCredentialsDirectoryForTesting(null);
  });

  test("loadStoredCredentials returns null when no credentials file exists", () => {
    const creds = loadStoredCredentials();
    assert.strictEqual(creds, null);
  });

  test("saveStoredCredentials persists credentials and sets 0600 file mode", () => {
    const sample: StoredCredentials = {
      accessToken: "ya29.sample-token",
      refreshToken: "1//sample-refresh",
      expiryDate: Date.now() + 3600 * 1000,
      projectId: "sample-project-123",
      email: "developer@example.com",
    };

    saveStoredCredentials(sample);
    const loaded = loadStoredCredentials();
    assert.deepStrictEqual(loaded, sample);

    const credFilePath = getCredentialsPath();
    const stats = fs.statSync(credFilePath);
    const mode = stats.mode & 0o777;
    assert.strictEqual(mode, 0o600);
  });

  test("clearStoredCredentials removes credentials file cleanly", () => {
    const sample: StoredCredentials = {
      accessToken: "ya29.sample-token",
      refreshToken: "1//sample-refresh",
      expiryDate: Date.now() + 3600 * 1000,
    };
    saveStoredCredentials(sample);
    assert.notStrictEqual(loadStoredCredentials(), null);

    clearStoredCredentials();
    assert.strictEqual(loadStoredCredentials(), null);
  });

  test("loadStoredCredentials handles corrupted JSON gracefully", () => {
    const credFilePath = getCredentialsPath();
    fs.mkdirSync(path.dirname(credFilePath), { recursive: true });
    fs.writeFileSync(credFilePath, "NOT_VALID_JSON{:::broken");

    const creds = loadStoredCredentials();
    assert.strictEqual(creds, null);
  });

  test("isTokenExpired correctly flags expired or expiring tokens", () => {
    const now = Date.now();
    assert.strictEqual(isTokenExpired(undefined), true);
    assert.strictEqual(isTokenExpired(now - 10000), true);
    assert.strictEqual(isTokenExpired(now + 30000), true); // within 60s threshold
    assert.strictEqual(isTokenExpired(now + 300000), false); // 5 minutes in future
  });
});
