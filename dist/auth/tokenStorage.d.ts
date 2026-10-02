export interface StoredCredentials {
    accessToken: string;
    refreshToken?: string;
    expiryDate?: number;
    projectId?: string;
    email?: string;
}
/**
 * Provider API keys that can be collected once during `claude-media-bridge setup`
 * and then reused without exporting environment variables in every shell.
 */
export declare const PROVIDER_KEY_NAMES: readonly ["GEMINI_API_KEY", "OPENAI_API_KEY", "STABILITY_API_KEY", "FAL_KEY", "HIGGSFIELD_API_KEY"];
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
export declare function setCredentialsDirectoryForTesting(dir: string | null): void;
export declare function getCredentialsDir(): string;
export declare function getCredentialsPath(): string;
export declare function loadBridgeState(): StoredBridgeState | null;
export declare function loadStoredCredentials(): StoredCredentials | null;
export declare function loadProviderKeys(): StoredProviderKeys;
export declare function saveProviderKey(name: ProviderKeyName, value: string): void;
export declare function clearProviderKey(name: ProviderKeyName): void;
export declare function saveBridgeState(state: StoredBridgeState): void;
export declare function saveStoredCredentials(creds: StoredCredentials): void;
export declare function clearStoredCredentials(): void;
export declare function isTokenExpired(expiryDate?: number, bufferMs?: number): boolean;
export {};
