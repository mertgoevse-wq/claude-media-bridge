import { resolveProviderKey } from "../config.js";
import { saveImageBuffer } from "../util/saveImage.js";
import type { MediaProvider, ProviderImageOptions, GeneratedImageResult, AspectRatio } from "./types.js";

export function getOpenAISize(aspectRatio?: AspectRatio): "1024x1024" | "1792x1024" | "1024x1792" {
  if (aspectRatio === "16:9") return "1792x1024";
  if (aspectRatio === "9:16") return "1024x1792";
  return "1024x1024";
}

export const openaiProvider: MediaProvider = {
  id: "openai",
  name: "OpenAI DALL-E",
  description: "High-fidelity prompt comprehension using OpenAI DALL-E 3.",
  defaultModel: "dall-e-3",
  supportedModels: ["dall-e-3", "dall-e-2"],
  requiresApiKey: true,

  isConfigured(): boolean {
    return Boolean(resolveProviderKey("OPENAI_API_KEY"));
  },

  async generateImage(options: ProviderImageOptions): Promise<GeneratedImageResult> {
    const apiKey = options.apiKey || resolveProviderKey("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "No OpenAI API key configured. Run 'claude-media-bridge setup' and choose OpenAI."
      );
    }

    const model = options.model || "dall-e-3";
    const size = getOpenAISize(options.aspectRatio);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);

    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          size,
          n: 1,
          response_format: "b64_json",
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`OpenAI API returned HTTP ${res.status}: ${await res.text()}`);
      }

      const json = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
      };
      const item = json.data?.[0];
      if (!item) {
        throw new Error("No image data returned from OpenAI endpoint.");
      }

      if (!item.b64_json && !item.url) {
        throw new Error("Missing both b64_json and url in OpenAI response.");
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
        provider: "openai",
        model,
        aspectRatio: options.aspectRatio || "1:1",
        revisedPrompt: item.revised_prompt,
        galleryPath: saved.galleryPath,
        openedOnScreen: saved.openedOnScreen,
      };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },
};
