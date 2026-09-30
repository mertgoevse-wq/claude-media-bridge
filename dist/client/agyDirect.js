import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CLOUD_CODE_ENDPOINTS, DEFAULT_IMAGE_MODEL, ANTIGRAVITY_USER_AGENT, ANTIGRAVITY_X_GOOG_API_CLIENT, } from "../auth/constants.js";
import { getValidAccessToken } from "../auth/googleOAuth.js";
import { resolveUserPath, slugify } from "../config.js";
const execAsync = promisify(exec);
export function buildCloudCodeImagePayload(options) {
    const ratio = options.aspectRatio || "1:1";
    return {
        project: options.projectId,
        requestId: `image_gen/${Date.now()}/${crypto.randomUUID()}/0`,
        request: {
            contents: [
                {
                    role: "user",
                    parts: [{ text: options.prompt }],
                },
            ],
            generationConfig: {
                candidateCount: options.candidateCount || 1,
                imageConfig: {
                    aspectRatio: ratio,
                },
            },
        },
        model: DEFAULT_IMAGE_MODEL,
        userAgent: ANTIGRAVITY_USER_AGENT,
        requestType: "image_gen",
    };
}
export function parseCloudCodeImageResponse(data, promptText) {
    const resp = data?.response || data;
    const candidates = resp
        ?.candidates;
    if (Array.isArray(candidates)) {
        for (const candidate of candidates) {
            const parts = candidate.content?.parts;
            if (Array.isArray(parts)) {
                let b64;
                let revisedPrompt;
                for (const part of parts) {
                    if (part.text && typeof part.text === "string") {
                        revisedPrompt = part.text;
                    }
                    if (part.inlineData && typeof part.inlineData === "object") {
                        const inline = part.inlineData;
                        if (typeof inline.data === "string" && inline.data.length > 0) {
                            b64 = inline.data;
                        }
                    }
                }
                if (b64) {
                    return {
                        b64_json: b64,
                        revised_prompt: revisedPrompt || promptText,
                    };
                }
            }
        }
    }
    throw new Error(`No image data found in Cloud Code response: ${JSON.stringify(data)}`);
}
export async function generateImageDirect(options) {
    const { token, projectId } = await getValidAccessToken();
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
    const payload = buildCloudCodeImagePayload({
        prompt: options.prompt,
        projectId,
        aspectRatio: options.aspectRatio || "1:1",
    });
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": ANTIGRAVITY_USER_AGENT,
        "X-Goog-Api-Client": ANTIGRAVITY_X_GOOG_API_CLIENT,
    };
    // Try daily endpoint first, fallback to standard endpoint on error
    const endpoints = [
        CLOUD_CODE_ENDPOINTS.generateContentDaily,
        CLOUD_CODE_ENDPOINTS.generateContentStandard,
    ];
    let lastError = null;
    let parsedResult = null;
    for (const endpoint of endpoints) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 90000);
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Google Cloud Code returned HTTP ${res.status}: ${errText}`);
            }
            const json = await res.json();
            parsedResult = parseCloudCodeImageResponse(json, options.prompt);
            break; // Succeeded!
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // Retry with next endpoint if available
        }
    }
    if (!parsedResult) {
        throw lastError || new Error("Image generation failed on all Google Cloud Code endpoints.");
    }
    const buffer = Buffer.from(parsedResult.b64_json, "base64");
    fs.writeFileSync(filePath, buffer);
    const stat = fs.statSync(filePath);
    // Android Gallery sync & open integration
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
            // Fallback silently if /sdcard permissions are unavailable
        }
    }
    return {
        filePath,
        fileSizeBytes: stat.size,
        provider: "google",
        model: DEFAULT_IMAGE_MODEL,
        aspectRatio: options.aspectRatio || "1:1",
        revisedPrompt: parsedResult.revised_prompt,
        galleryPath,
        openedOnScreen,
    };
}
