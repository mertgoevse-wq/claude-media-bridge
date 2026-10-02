import { resolveProviderKey } from "../config.js";
import { saveImageBuffer } from "../util/saveImage.js";
export const stabilityProvider = {
    id: "stability",
    name: "Stability AI",
    description: "Stable Diffusion 3.5, SDXL and Core models from Stability AI.",
    defaultModel: "sd3.5",
    supportedModels: ["sd3.5", "core", "sdxl"],
    requiresApiKey: true,
    isConfigured() {
        return Boolean(resolveProviderKey("STABILITY_API_KEY"));
    },
    async generateImage(options) {
        const apiKey = options.apiKey || resolveProviderKey("STABILITY_API_KEY");
        if (!apiKey) {
            throw new Error("No Stability AI key configured. Run 'claude-media-bridge setup' and choose Stability AI. Create one at https://platform.stability.ai/account/keys");
        }
        const model = options.model || "sd3.5";
        const endpoint = model === "core"
            ? "https://api.stability.ai/v2beta/stable-image/generate/core"
            : "https://api.stability.ai/v2beta/stable-image/generate/sd3";
        const formData = new FormData();
        formData.append("prompt", options.prompt);
        formData.append("aspect_ratio", options.aspectRatio || "1:1");
        formData.append("output_format", "jpeg");
        if (model !== "core") {
            formData.append("model", "sd3.5-large");
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90000);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey.trim()}`,
                    Accept: "image/*",
                },
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                throw new Error(`Stability AI returned HTTP ${res.status}: ${await res.text()}`);
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            const saved = await saveImageBuffer(buffer, {
                prompt: options.prompt,
                filename: options.filename,
                outputDir: options.outputDir,
                syncToGallery: options.syncToGallery,
                openInGallery: options.openInGallery,
            });
            return {
                filePath: saved.filePath,
                fileSizeBytes: saved.fileSizeBytes,
                provider: "stability",
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
