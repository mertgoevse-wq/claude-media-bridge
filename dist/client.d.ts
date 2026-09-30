import { generateImageDirect, type GenerateImageOptions, type GeneratedImageResult } from "./client/agyDirect.js";
import { generateImageWithRouting, listProviders, resolveProvider } from "./providers/router.js";
import type { ProviderImageOptions } from "./providers/types.js";
export type { GenerateImageOptions, GeneratedImageResult, ProviderImageOptions };
export { generateImageDirect, generateImageWithRouting, listProviders, resolveProvider };
export declare function generateImage(options: GenerateImageOptions & {
    provider?: string;
    model?: string;
    apiKey?: string;
}): Promise<GeneratedImageResult>;
export declare function generateImageViaOmniRoute(options: GenerateImageOptions): Promise<GeneratedImageResult>;
export declare function probeVideoEndpoint(prompt: string, model?: string): Promise<{
    status: number;
    ok: boolean;
}>;
export declare function probeMusicEndpoint(prompt: string, model?: string): Promise<{
    status: number;
    ok: boolean;
}>;
