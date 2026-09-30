import { generateImageDirect } from "../client/agyDirect.js";
import { loadStoredCredentials } from "../auth/tokenStorage.js";
export const googleProvider = {
    id: "google",
    name: "Google Antigravity & Cloud Code",
    description: "Google Nano Banana 2 (gemini-3.1-flash-image) via direct Google Account OAuth.",
    defaultModel: "gemini-3.1-flash-image",
    supportedModels: ["gemini-3.1-flash-image", "imagen-3.0"],
    requiresApiKey: false,
    isConfigured() {
        const hasEnvToken = Boolean(process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN);
        const creds = loadStoredCredentials();
        return hasEnvToken || Boolean(creds?.accessToken);
    },
    async generateImage(options) {
        const res = await generateImageDirect({
            prompt: options.prompt,
            filename: options.filename,
            outputDir: options.outputDir,
            aspectRatio: options.aspectRatio,
            syncToGallery: options.syncToGallery,
            openInGallery: options.openInGallery,
        });
        return {
            filePath: res.filePath,
            fileSizeBytes: res.fileSizeBytes,
            provider: "google",
            model: res.model,
            aspectRatio: res.aspectRatio,
            revisedPrompt: res.revisedPrompt,
            galleryPath: res.galleryPath,
            openedOnScreen: res.openedOnScreen,
        };
    },
};
