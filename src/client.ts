import { loadConfig } from "./config.js";
import { saveImageBuffer } from "./util/saveImage.js";
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

    if (!item.b64_json && !item.url) {
      throw new Error("Missing both b64_json and url in image response.");
    }

    const buffer = item.b64_json
      ? Buffer.from(item.b64_json, "base64")
      : Buffer.from(await (await fetch(item.url!)).arrayBuffer());

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
      model: config.defaultModel,
      aspectRatio: ratio,
      revisedPrompt: item.revised_prompt,
      galleryPath: saved.galleryPath,
      openedOnScreen: saved.openedOnScreen,
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
