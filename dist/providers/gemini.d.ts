import type { MediaProvider } from "./types.js";
export interface GeminiImageModel {
    id: string;
    label: string;
    cost: "free-tier" | "paid";
}
/**
 * Nano Banana family on the public Gemini API. Nano Banana 2 is the default
 * because it is the model that stays inside the free tier.
 */
export declare const GEMINI_IMAGE_MODELS: GeminiImageModel[];
interface GeminiPart {
    text?: string;
    inlineData?: {
        mimeType?: string;
        data?: string;
    };
}
export interface GeminiGenerateContentResponse {
    candidates?: Array<{
        content?: {
            parts?: GeminiPart[];
        };
    }>;
}
/**
 * Picks the first inline image out of a generateContent response and keeps any
 * text the model emitted alongside it as the revised prompt.
 */
export declare function parseGeminiImageResponse(data: unknown): {
    base64: string;
    mimeType: string;
    revisedPrompt?: string;
};
export declare function callGeminiImageApi(options: {
    apiKey: string;
    model: string;
    prompt: string;
    aspectRatio?: string;
    signal?: AbortSignal;
}): Promise<{
    base64: string;
    mimeType: string;
    revisedPrompt?: string;
}>;
export declare const geminiProvider: MediaProvider;
export {};
