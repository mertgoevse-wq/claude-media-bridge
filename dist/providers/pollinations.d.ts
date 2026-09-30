import type { MediaProvider, AspectRatio } from "./types.js";
export declare function getPollinationsDimensions(aspectRatio?: AspectRatio): {
    width: number;
    height: number;
};
export declare function buildPollinationsUrl(prompt: string, options?: {
    model?: string;
    aspectRatio?: AspectRatio;
}): string;
export declare const pollinationsProvider: MediaProvider;
