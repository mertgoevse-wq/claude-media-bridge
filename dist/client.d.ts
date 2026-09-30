import { generateImageDirect, type GenerateImageOptions, type GeneratedImageResult } from "./client/agyDirect.js";
export type { GenerateImageOptions, GeneratedImageResult };
export { generateImageDirect };
export declare function generateImage(options: GenerateImageOptions): Promise<GeneratedImageResult>;
export declare function generateImageViaOmniRoute(options: GenerateImageOptions): Promise<GeneratedImageResult>;
export declare function probeVideoEndpoint(prompt: string, model?: string): Promise<{
    status: number;
    ok: boolean;
}>;
export declare function probeMusicEndpoint(prompt: string, model?: string): Promise<{
    status: number;
    ok: boolean;
}>;
