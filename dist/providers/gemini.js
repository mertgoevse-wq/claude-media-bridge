import { resolveProviderKey } from "../config.js";
import { saveImageBuffer } from "../util/saveImage.js";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
/**
 * Nano Banana family on the public Gemini API. Nano Banana 2 is the default
 * because it is the model that stays inside the free tier.
 */
export const GEMINI_IMAGE_MODELS = [
    { id: "gemini-3.1-flash-image", label: "Nano Banana 2", cost: "free-tier" },
    { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite", cost: "free-tier" },
    { id: "gemini-3-pro-image", label: "Nano Banana Pro", cost: "paid" },
];
/** Gemini returns base64 image parts under this MIME type. */
const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp)$/i;
/**
 * Picks the first inline image out of a generateContent response and keeps any
 * text the model emitted alongside it as the revised prompt.
 */
export function parseGeminiImageResponse(data) {
    const candidates = data?.candidates;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const textParts = [];
    for (const part of parts) {
        if (part.inlineData?.data && IMAGE_MIME.test(part.inlineData.mimeType ?? "")) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
                revisedPrompt: textParts.length ? textParts.join(" ").trim() : undefined,
            };
        }
        if (part.text)
            textParts.push(part.text);
    }
    const refusal = textParts.join(" ").trim();
    throw new Error(refusal
        ? `Gemini returned no image data. Model said: ${refusal.slice(0, 300)}`
        : "Gemini returned no image data in the response.");
}
function extensionForMime(mimeType) {
    if (mimeType === "image/png")
        return "png";
    if (mimeType === "image/webp")
        return "webp";
    return "jpg";
}
export async function callGeminiImageApi(options) {
    const res = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(options.model)}:generateContent`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: options.prompt }] }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio: options.aspectRatio || "1:1" },
            },
        }),
        signal: options.signal,
    });
    if (!res.ok) {
        const detail = await res.text();
        if (res.status === 400 || res.status === 401 || res.status === 403) {
            throw new Error(`Google AI Studio rejected the request (HTTP ${res.status}). Check GEMINI_API_KEY. ${detail.slice(0, 300)}`);
        }
        if (res.status === 429) {
            throw new Error("Google AI Studio rate limit reached. The free tier allows a limited number of images per minute - retry shortly.");
        }
        throw new Error(`Google AI Studio returned HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    return parseGeminiImageResponse(await res.json());
}
export const geminiProvider = {
    id: "gemini",
    name: "Google AI Studio (Gemini API)",
    description: "Nano Banana 2 and Nano Banana Pro via the official Gemini API. Free tier available with a Google AI Studio key.",
    defaultModel: "gemini-3.1-flash-image",
    supportedModels: GEMINI_IMAGE_MODELS.map((m) => m.id),
    requiresApiKey: true,
    isConfigured() {
        return Boolean(resolveProviderKey("GEMINI_API_KEY"));
    },
    async generateImage(options) {
        const apiKey = options.apiKey || resolveProviderKey("GEMINI_API_KEY");
        if (!apiKey) {
            throw new Error("No Google AI Studio API key configured. Run 'claude-media-bridge setup' and choose Google AI Studio, or set GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey");
        }
        const model = options.model || this.defaultModel;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        let parsed;
        try {
            parsed = await callGeminiImageApi({
                apiKey,
                model,
                prompt: options.prompt,
                aspectRatio: options.aspectRatio,
                signal: controller.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
        const saved = await saveImageBuffer(Buffer.from(parsed.base64, "base64"), {
            prompt: options.prompt,
            filename: options.filename,
            outputDir: options.outputDir,
            extension: extensionForMime(parsed.mimeType),
            syncToGallery: options.syncToGallery,
            openInGallery: options.openInGallery,
        });
        return {
            filePath: saved.filePath,
            fileSizeBytes: saved.fileSizeBytes,
            provider: "gemini",
            model,
            aspectRatio: options.aspectRatio || "1:1",
            revisedPrompt: parsed.revisedPrompt,
            galleryPath: saved.galleryPath,
            openedOnScreen: saved.openedOnScreen,
        };
    },
};
