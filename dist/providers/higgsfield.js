import { resolveProviderKey } from "../config.js";
import { saveImageFromUrl } from "../util/saveImage.js";
const HIGGSFIELD_BASE_URL = "https://platform.higgsfield.ai/v1";
/**
 * Higgsfield bills per generation in USD with no free tier. Prices are the
 * published starting rates; the live price list is authoritative.
 */
export const HIGGSFIELD_IMAGE_MODELS = [
    { id: "soul-2", label: "Soul 2", approxUsd: "$0.0032 / image" },
    { id: "soul-cinema", label: "Soul Cinema", approxUsd: "$0.0032 / image" },
    { id: "marketing-studio-image", label: "Marketing Studio Image", approxUsd: "$0.0059 / image" },
];
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // ~5 minutes
const IMAGE_RESULT = /^image\//i;
async function pollUntilDone(requestId, apiKey, signal) {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const res = await fetch(`${HIGGSFIELD_BASE_URL}/generations/${requestId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal,
        });
        if (res.status === 404)
            continue;
        if (!res.ok) {
            throw new Error(`Higgsfield status check failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
        }
        const job = (await res.json());
        if (job.status === "failed" || job.error) {
            throw new Error(`Higgsfield generation failed: ${job.error || job.status}`);
        }
        const imageUrl = job.results?.find((r) => r.url && IMAGE_RESULT.test(r.type ?? "image"))?.url;
        if (job.status === "completed" && imageUrl)
            return imageUrl;
        // Some responses carry results before the status flips to completed.
        const anyImage = job.results?.find((r) => r.url)?.url;
        if (anyImage)
            return anyImage;
    }
    throw new Error("Higgsfield generation timed out after 5 minutes.");
}
export const higgsfieldProvider = {
    id: "higgsfield",
    name: "Higgsfield",
    description: "Soul 2 and Soul Cinema image models. Pay-per-use USD billing, no free tier.",
    defaultModel: "soul-2",
    supportedModels: HIGGSFIELD_IMAGE_MODELS.map((m) => m.id),
    requiresApiKey: true,
    isConfigured() {
        return Boolean(resolveProviderKey("HIGGSFIELD_API_KEY"));
    },
    async generateImage(options) {
        const apiKey = options.apiKey || resolveProviderKey("HIGGSFIELD_API_KEY");
        if (!apiKey) {
            throw new Error("No Higgsfield API key configured. Run 'claude-media-bridge setup' and choose Higgsfield. Create a key at https://higgsfield.ai");
        }
        const model = options.model || this.defaultModel;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 330000);
        try {
            const submitRes = await fetch(`${HIGGSFIELD_BASE_URL}/text-to-image`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    prompt: options.prompt,
                    aspect_ratio: options.aspectRatio || "1:1",
                    n: 1,
                }),
                signal: controller.signal,
            });
            if (!submitRes.ok) {
                const detail = await submitRes.text();
                if (submitRes.status === 401 || submitRes.status === 403) {
                    throw new Error(`Higgsfield rejected the API key (HTTP ${submitRes.status}). ${detail.slice(0, 300)}`);
                }
                if (submitRes.status === 402) {
                    throw new Error("Higgsfield balance is empty. Top up at https://higgsfield.ai to continue.");
                }
                throw new Error(`Higgsfield returned HTTP ${submitRes.status}: ${detail.slice(0, 300)}`);
            }
            const submitted = (await submitRes.json());
            const requestId = submitted.id || submitted.request_id;
            if (!requestId) {
                throw new Error("Higgsfield did not return a request id.");
            }
            const imageUrl = await pollUntilDone(requestId, apiKey, controller.signal);
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
                provider: "higgsfield",
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
