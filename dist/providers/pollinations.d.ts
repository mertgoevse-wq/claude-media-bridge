import type { MediaProvider, AspectRatio } from "./types.js";
export declare function getPollinationsDimensions(aspectRatio?: AspectRatio): {
    width: number;
    height: number;
};
export declare function buildPollinationsUrl(prompt: string, options?: {
    model?: string;
    aspectRatio?: AspectRatio;
}): string;
/**
 * Anonymous Pollinations requests are heavily throttled and intermittently
 * answered with 402/429 rather than an image, so a single attempt fails often.
 * Retrying with backoff turns that into a usable success rate.
 */
export declare const POLLINATIONS_MAX_ATTEMPTS = 5;
export declare const pollinationsProvider: MediaProvider;
