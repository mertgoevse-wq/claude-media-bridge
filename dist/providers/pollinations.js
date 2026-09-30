import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveUserPath, slugify } from "../config.js";
const execAsync = promisify(exec);
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
export const pollinationsProvider = {
    id: "pollinations",
    name: "Pollinations.ai",
    description: "Free, zero-config image generation with FLUX/Turbo (no API key required).",
    defaultModel: "flux",
    supportedModels: ["flux", "turbo"],
    requiresApiKey: false,
    isConfigured() {
        return true; // Always available without an API key!
    },
    async generateImage(options) {
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
        const model = options.model || "flux";
        const url = buildPollinationsUrl(options.prompt, { model, aspectRatio: options.aspectRatio });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "User-Agent": "claude-media-bridge/2.0.0",
                },
            });
            clearTimeout(timer);
            if (!res.ok) {
                throw new Error(`Pollinations AI responded with HTTP ${res.status}: ${await res.text()}`);
            }
            const buffer = Buffer.from(await res.arrayBuffer());
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
                provider: "pollinations",
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
