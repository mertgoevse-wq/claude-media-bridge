import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveUserPath, slugify } from "../config.js";
const execAsync = promisify(exec);
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
        return Boolean(process.env.FAL_KEY && process.env.FAL_KEY.trim());
    },
    async generateImage(options) {
        const apiKey = options.apiKey || process.env.FAL_KEY;
        if (!apiKey || !apiKey.trim()) {
            throw new Error("Fal.ai API key missing. Please set FAL_KEY in your environment or configuration.");
        }
        const targetDir = options.outputDir
            ? resolveUserPath(options.outputDir)
            : path.join(os.homedir(), "media", "images");
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const baseName = options.filename
            ? options.filename.replace(/\.(jpg|jpeg|png|webp)$/i, "")
            : `${slugify(options.prompt)}-${Date.now()}`;
        const filePath = path.join(targetDir, `${baseName}.jpg`);
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
            const dlRes = await fetch(imageUrl);
            const buffer = Buffer.from(await dlRes.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            const stat = fs.statSync(filePath);
            let galleryPath;
            let openedOnScreen;
            const shouldSync = options.syncToGallery !== false && fs.existsSync("/sdcard/Pictures");
            if (shouldSync) {
                const targetSdcard = path.join("/sdcard/Pictures", `${baseName}.jpg`);
                try {
                    fs.copyFileSync(filePath, targetSdcard);
                    galleryPath = targetSdcard;
                    const amPath = "/data/data/com.termux/files/usr/bin/am";
                    if (fs.existsSync(amPath)) {
                        await execAsync(`${amPath} broadcast --user 0 -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${targetSdcard}"`).catch(() => { });
                    }
                    if (options.openInGallery) {
                        const termuxOpen = "/data/data/com.termux/files/usr/bin/termux-open";
                        if (fs.existsSync(termuxOpen)) {
                            await execAsync(`${termuxOpen} "${targetSdcard}"`).catch(() => { });
                            openedOnScreen = true;
                        }
                        else if (fs.existsSync(amPath)) {
                            await execAsync(`${amPath} start --user 0 -a android.intent.action.VIEW -d "file://${targetSdcard}" -t "image/jpeg"`).catch(() => { });
                            openedOnScreen = true;
                        }
                    }
                }
                catch {
                    // Ignore Android gallery errors
                }
            }
            return {
                filePath,
                fileSizeBytes: stat.size,
                provider: "fal",
                model,
                aspectRatio: options.aspectRatio || "1:1",
                galleryPath,
                openedOnScreen,
            };
        }
        catch (err) {
            clearTimeout(timer);
            throw err;
        }
    },
};
