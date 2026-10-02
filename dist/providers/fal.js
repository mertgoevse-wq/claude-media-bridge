import { resolveProviderKey } from "../config.js";
import { saveImageFromUrl } from "../util/saveImage.js";
export function getFalImageSize(aspectRatio) {
    switch (aspectRatio) {
        case "16:9":
            return "landscape_16_9";
        case "9:16":
            return "portrait_16_9";
        case "4:3":
            return "landscape_4_3";
        case "3:4":
            return "portrait_4_3";
        case "1:1":
        default:
            return "square_hd";
    }
}
export const falProvider = {
    id: "fal",
    name: "Fal.ai",
    description: "Ultra-fast FLUX.1 (Schnell & Dev) and Recraft generation via Fal.ai.",
    defaultModel: "flux-schnell",
    supportedModels: ["flux-schnell", "flux-dev", "recraft-v3"],
    requiresApiKey: true,
    isConfigured() {
        return Boolean(resolveProviderKey("FAL_KEY"));
    },
    async generateImage(options) {
        const apiKey = options.apiKey || resolveProviderKey("FAL_KEY");
        if (!apiKey) {
            throw new Error("No Fal.ai key configured. Run 'claude-media-bridge setup' and choose Fal.ai. Create one at https://fal.ai/dashboard/keys");
        }
        const model = options.model || "flux-schnell";
        let endpoint = "https://fal.run/fal-ai/flux/schnell";
        if (model === "flux-dev") {
            endpoint = "https://fal.run/fal-ai/flux/dev";
        }
        else if (model === "recraft-v3") {
            endpoint = "https://fal.run/fal-ai/recraft-v3";
        }
        const imageSize = getFalImageSize(options.aspectRatio);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90000);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Key ${apiKey.trim()}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: options.prompt,
                    image_size: imageSize,
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                throw new Error(`Fal.ai returned HTTP ${res.status}: ${await res.text()}`);
            }
            const json = (await res.json());
            const imageUrl = json.images?.[0]?.url;
            if (!imageUrl) {
                throw new Error("No image URL returned from Fal.ai.");
            }
            const saved = await saveImageFromUrl(imageUrl, {
                prompt: options.prompt,
                filename: options.filename,
                outputDir: options.outputDir,
                syncToGallery: options.syncToGallery,
                openInGallery: options.openInGallery,
            });
            return {
                filePath: saved.filePath,
                fileSizeBytes: saved.fileSizeBytes,
                provider: "fal",
                model,
                aspectRatio: options.aspectRatio || "1:1",
                galleryPath: saved.galleryPath,
                openedOnScreen: saved.openedOnScreen,
            };
        }
        catch (err) {
            clearTimeout(timer);
            throw err;
        }
    },
};
