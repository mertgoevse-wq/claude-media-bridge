import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number; // Epoch milliseconds
  projectId?: string;
  email?: string;
}

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
] as const;

export type ProviderKeyName = (typeof PROVIDER_KEY_NAMES)[number];

export type StoredProviderKeys = Partial<Record<ProviderKeyName, string>>;

interface BridgeSettings {
  providerKeys?: StoredProviderKeys;
  defaultProvider?: string;
  defaultModel?: string;
  outputDir?: string;
}

/**
 * The on-disk settings file. Older installs only had Google credentials, so
 * accessToken is required by the Google code path but the file is still loaded
 * when only provider keys are present.
 */
export interface StoredBridgeState extends BridgeSettings {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  projectId?: string;
  email?: string;
}

let customCredentialsDir: string | null = null;

export function setCredentialsDirectoryForTesting(dir: string | null): void {
  customCredentialsDir = dir;
}

export function getCredentialsDir(): string {
  if (customCredentialsDir) {
    return customCredentialsDir;
  }
  return path.join(os.homedir(), ".config", "claude-media-bridge");
}

export function getCredentialsPath(): string {
  return path.join(getCredentialsDir(), "credentials.json");
}

export function loadBridgeState(): StoredBridgeState | null {
  const filePath = getCredentialsPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as StoredBridgeState;
  } catch {
    return null;
  }
}

export function loadStoredCredentials(): StoredCredentials | null {
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

export function loadProviderKeys(): StoredProviderKeys {
  return loadBridgeState()?.providerKeys ?? {};
}

export function saveProviderKey(name: ProviderKeyName, value: string): void {
  const state = loadBridgeState() ?? {};
  state.providerKeys = { ...(state.providerKeys ?? {}), [name]: value.trim() };
  saveBridgeState(state);
}

export function clearProviderKey(name: ProviderKeyName): void {
  const state = loadBridgeState();
  if (!state?.providerKeys) return;
  delete state.providerKeys[name];
  saveBridgeState(state);
}

export function saveBridgeState(state: StoredBridgeState): void {
  writeCredentialsFile(JSON.stringify(state, null, 2));
}

export function saveStoredCredentials(creds: StoredCredentials): void {
  // Merge so saving refreshed Google tokens never wipes collected API keys.
  const state = loadBridgeState() ?? {};
  saveBridgeState({ ...state, ...creds });
}

function writeCredentialsFile(content: string): void {
  const dir = getCredentialsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const filePath = getCredentialsPath();
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Ignore chmod errors on systems without POSIX permissions
  }
}

export function clearStoredCredentials(): void {
  const filePath = getCredentialsPath();
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore deletion errors
    }
  }
}

export function isTokenExpired(expiryDate?: number, bufferMs: number = 60000): boolean {
  if (!expiryDate || typeof expiryDate !== "number") {
    return true;
  }
  return Date.now() + bufferMs >= expiryDate;
}
