import { type ProviderKeyName } from "./auth/tokenStorage.js";
export interface MediaBridgeConfig {
    baseUrl: string;
    apiKey: string;
    defaultOutputDir: string;
    defaultModel: string;
    defaultProvider?: string;
}
export declare function loadConfig(): MediaBridgeConfig;
/**
 * Resolves a provider API key from the environment first, then from the keys
 * collected during `claude-media-bridge setup`.
 */
export declare function resolveProviderKey(name: ProviderKeyName): string | undefined;
export declare function resolveUserPath(p: string): string;
export declare function slugify(text: string): string;
