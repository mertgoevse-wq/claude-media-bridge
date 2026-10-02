import { saveImageBuffer } from "../util/saveImage.js";
export function getPollinationsDimensions(aspectRatio) {
    switch (aspectRatio) {
        case "16:9":
            return { width: 1280, height: 720 };
        case "9:16":
            return { width: 720, height: 1280 };
        case "4:3":
            return { width: 1024, height: 768 };
        case "3:4":
            return { width: 768, height: 1024 };
        case "1:1":
        default:
            return { width: 1024, height: 1024 };
    }
}
export function buildPollinationsUrl(prompt, options) {
    const { width, height } = getPollinationsDimensions(options?.aspectRatio);
    const model = options?.model || "flux";
    const seed = Math.floor(Math.random() * 1000000);
    const cleanPrompt = encodeURIComponent(prompt.trim());
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&model=${model}&nologo=true&seed=${seed}`;
}
/**
 * Anonymous Pollinations requests are heavily throttled and intermittently
 * answered with 402/429 rather than an image, so a single attempt fails often.
 * Retrying with backoff turns that into a usable success rate.
 */
export const POLLINATIONS_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2500;
function isRetryableStatus(status) {
    return status === 402 || status === 429 || status === 408 || status >= 500;
}
async function fetchWithRetry(url, signal) {
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 1; attempt <= POLLINATIONS_MAX_ATTEMPTS; attempt++) {
        const res = await fetch(url, {
            signal,
            headers: { "User-Agent": "claude-media-bridge/2.2.0" },
        });
        if (res.ok)
            return res;
        lastStatus = res.status;
        lastBody = await res.text().catch(() => "");
        if (!isRetryableStatus(res.status) || attempt === POLLINATIONS_MAX_ATTEMPTS)
            break;
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt + Math.random() * 1000));
    }
    const reason = lastStatus === 402 || lastStatus === 429
        ? "its anonymous tier is rate limited"
        : "the service returned an error";
    throw new Error(`Pollinations.ai did not return an image after ${POLLINATIONS_MAX_ATTEMPTS} attempts (${reason}, last status ${lastStatus}). ` +
        "This free fallback is best effort. For reliable generation run 'claude-media-bridge setup' and sign in with Google for Nano Banana 2.");
}
export const pollinationsProvider = {
    id: "pollinations",
    name: "Pollinations.ai",
    description: "Keyless FLUX fallback. Best effort: the anonymous tier is rate limited, so this is a backup rather than a guarantee.",
    defaultModel: "flux",
    supportedModels: ["flux", "turbo"],
    requiresApiKey: false,
    isConfigured() {
        return true; // No credentials needed, though it is throttled.
    },
    async generateImage(options) {
        const model = options.model || "flux";
        const url = buildPollinationsUrl(options.prompt, { model, aspectRatio: options.aspectRatio });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        try {
            const res = await fetchWithRetry(url, controller.signal);
            const saved = await saveImageBuffer(Buffer.from(await res.arrayBuffer()), {
                prompt: options.prompt,
                filename: options.filename,
                outputDir: options.outputDir,
                syncToGallery: options.syncToGallery,
                openInGallery: options.openInGallery,
            });
            return {
                filePath: saved.filePath,
                fileSizeBytes: saved.fileSizeBytes,
                provider: "pollinations",
                model,
                aspectRatio: options.aspectRatio || "1:1",
                galleryPath: saved.galleryPath,
                openedOnScreen: saved.openedOnScreen,
            };
        }
        finally {
            clearTimeout(timer);
        }
    },
};
