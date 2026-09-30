import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, resolveUserPath, slugify } from "./config.js";
import {
  generateImageDirect,
  type GenerateImageOptions,
  type GeneratedImageResult,
} from "./client/agyDirect.js";
import {
  generateImageWithRouting,
  listProviders,
  resolveProvider,
} from "./providers/router.js";
import type { ProviderImageOptions } from "./providers/types.js";

const execAsync = promisify(exec);

export type { GenerateImageOptions, GeneratedImageResult, ProviderImageOptions };
export { generateImageDirect, generateImageWithRouting, listProviders, resolveProvider };

export async function generateImage(
  options: GenerateImageOptions & { provider?: string; model?: string; apiKey?: string }
): Promise<GeneratedImageResult> {
  return generateImageWithRouting(options);
}

export async function generateImageViaOmniRoute(
  options: GenerateImageOptions
): Promise<GeneratedImageResult> {
  const config = loadConfig();
  const targetDir = options.outputDir
    ? resolveUserPath(options.outputDir)
    : config.defaultOutputDir;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const baseName = options.filename
    ? options.filename.replace(/\.(jpg|jpeg|png|webp)$/i, "")
    : `${slugify(options.prompt)}-${Date.now()}`;
  const filePath = path.join(targetDir, `${baseName}.jpg`);

  const requestBody: Record<string, unknown> = {
    prompt: options.prompt,
    model: config.defaultModel,
  };

  const ratio = options.aspectRatio || "1:1";
  if (ratio === "16:9") requestBody.size = "1792x1024";
  else if (ratio === "9:16") requestBody.size = "1024x1792";
  else requestBody.size = "1024x1024";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`${config.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OmniRoute returned HTTP ${res.status}: ${errText}`);
    }

    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const item = json.data?.[0];

    if (!item) {
      throw new Error("No image data returned from generation endpoint.");
    }

    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, "base64");
      fs.writeFileSync(filePath, buffer);
    } else if (item.url) {
      const dlRes = await fetch(item.url);
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    } else {
      throw new Error("Missing both b64_json and url in image response.");
    }

    const stat = fs.statSync(filePath);

    // Android Gallery sync & open integration
    let galleryPath: string | undefined;
    let openedOnScreen: boolean | undefined;

    const shouldSync = options.syncToGallery !== false && fs.existsSync("/sdcard/Pictures");
    if (shouldSync) {
      const targetSdcard = path.join("/sdcard/Pictures", `${baseName}.jpg`);
      try {
        fs.copyFileSync(filePath, targetSdcard);
        galleryPath = targetSdcard;

        // Trigger Android media scanner
        const amPath = "/data/data/com.termux/files/usr/bin/am";
        if (fs.existsSync(amPath)) {
          await execAsync(
            `${amPath} broadcast --user 0 -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${targetSdcard}"`
          ).catch(() => {});
        }

        if (options.openInGallery) {
          const termuxOpen = "/data/data/com.termux/files/usr/bin/termux-open";
          if (fs.existsSync(termuxOpen)) {
            await execAsync(`${termuxOpen} "${targetSdcard}"`).catch(() => {});
            openedOnScreen = true;
          } else if (fs.existsSync(amPath)) {
            await execAsync(
              `${amPath} start --user 0 -a android.intent.action.VIEW -d "file://${targetSdcard}" -t "image/jpeg"`
            ).catch(() => {});
            openedOnScreen = true;
          }
        }
      } catch {
        // Fallback silently if /sdcard permissions are unavailable
      }
    }

    return {
      filePath,
      fileSizeBytes: stat.size,
      model: config.defaultModel,
      aspectRatio: ratio,
      revisedPrompt: item.revised_prompt,
      galleryPath,
      openedOnScreen,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

export async function probeVideoEndpoint(prompt: string, model?: string) {
  const config = loadConfig();
  const videoModel = model || "veo";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.baseUrl}/v1/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, model: videoModel }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, ok: res.ok };
  } catch {
    return { status: 500, ok: false };
  }
}

export async function probeMusicEndpoint(prompt: string, model?: string) {
  const config = loadConfig();
  const musicModel = model || "lyria-002";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.baseUrl}/v1/music/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, model: musicModel }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, ok: res.ok };
  } catch {
    return { status: 500, ok: false };
  }
}
