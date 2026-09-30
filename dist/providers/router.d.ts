import type { MediaProvider, ProviderInfo, ProviderImageOptions, GeneratedImageResult } from "./types.js";
export declare const ALL_PROVIDERS: Record<string, MediaProvider>;
export declare function listProviders(): ProviderInfo[];
export declare function resolveProvider(requestedProvider?: string, requestedModel?: string): MediaProvider;
export declare function generateImageWithRouting(options: ProviderImageOptions): Promise<GeneratedImageResult>;
