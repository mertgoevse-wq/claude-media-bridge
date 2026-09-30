import type { MediaProvider, AspectRatio } from "./types.js";
export declare function getOpenAISize(aspectRatio?: AspectRatio): "1024x1024" | "1792x1024" | "1024x1792";
export declare const openaiProvider: MediaProvider;
