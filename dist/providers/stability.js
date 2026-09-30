import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveUserPath, slugify } from "../config.js";
const execAsync = promisify(exec);
export const stabilityProvider = {
    id: "stability",
    name: "Stability AI",
    description: "Stable Diffusion 3.5, SDXL and Core models from Stability AI.",
    defaultModel: "sd3.5",
    supportedModels: ["sd3.5", "core", "sdxl"],
    requiresApiKey: true,
    isConfigured() {
        return Boolean(process.env.STABILITY_API_KEY && process.env.STABILITY_API_KEY.trim());
    },
    async generateImage(options) {
        const apiKey = options.apiKey || process.env.STABILITY_API_KEY;
        if (!apiKey || !apiKey.trim()) {
            throw new Error("Stability API key missing. Please set STABILITY_API_KEY in your environment or configuration.");
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
                provider: "stability",
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
