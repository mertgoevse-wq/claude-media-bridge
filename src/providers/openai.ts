import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveUserPath, slugify } from "../config.js";
import type { MediaProvider, ProviderImageOptions, GeneratedImageResult, AspectRatio } from "./types.js";

const execAsync = promisify(exec);

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
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  },

  async generateImage(options: ProviderImageOptions): Promise<GeneratedImageResult> {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        "OpenAI API key missing. Please set OPENAI_API_KEY in your environment or configuration."
      );
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

      if (item.b64_json) {
        const buffer = Buffer.from(item.b64_json, "base64");
        fs.writeFileSync(filePath, buffer);
      } else if (item.url) {
        const dlRes = await fetch(item.url);
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
      } else {
        throw new Error("Missing both b64_json and url in OpenAI response.");
      }

      const stat = fs.statSync(filePath);

      let galleryPath: string | undefined;
      let openedOnScreen: boolean | undefined;

      const shouldSync = options.syncToGallery !== false && fs.existsSync("/sdcard/Pictures");
      if (shouldSync) {
        const targetSdcard = path.join("/sdcard/Pictures", `${baseName}.jpg`);
        try {
          fs.copyFileSync(filePath, targetSdcard);
          galleryPath = targetSdcard;
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
          // Ignore Android gallery errors
        }
      }

      return {
        filePath,
        fileSizeBytes: stat.size,
        provider: "openai",
        model,
        aspectRatio: options.aspectRatio || "1:1",
        revisedPrompt: item.revised_prompt,
        galleryPath,
        openedOnScreen,
      };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },
};
