import crypto from "node:crypto";
import {
  CLOUD_CODE_ENDPOINTS,
  DEFAULT_IMAGE_MODEL,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_X_GOOG_API_CLIENT,
} from "../auth/constants.js";
import { getValidAccessToken } from "../auth/googleOAuth.js";
import { saveImageBuffer } from "../util/saveImage.js";

export interface GenerateImageOptions {
  prompt: string;
  filename?: string;
  outputDir?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  syncToGallery?: boolean;
  openInGallery?: boolean;
}

export interface GeneratedImageResult {
  filePath: string;
  fileSizeBytes: number;
  provider?: string;
  model: string;
  aspectRatio: string;
  revisedPrompt?: string;
  galleryPath?: string;
  openedOnScreen?: boolean;
}

export interface CloudCodeImagePayloadOptions {
  prompt: string;
  projectId: string;
  aspectRatio?: string;
  candidateCount?: number;
}

export interface CloudCodeImagePayload {
  project: string;
  requestId: string;
  request: {
    contents: Array<{
      role: string;
      parts: Array<{ text: string }>;
    }>;
    generationConfig: {
      candidateCount: number;
      imageConfig: {
        aspectRatio: string;
      };
    };
  };
  model: string;
  userAgent: string;
  requestType: string;
}

export function buildCloudCodeImagePayload(
  options: CloudCodeImagePayloadOptions
): CloudCodeImagePayload {
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

export function parseCloudCodeImageResponse(
  data: unknown,
  promptText: string
): { b64_json: string; revised_prompt?: string } {
  const resp = (data as { response?: unknown })?.response || data;
  const candidates = (resp as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })
    ?.candidates;

  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = candidate.content?.parts;
      if (Array.isArray(parts)) {
        let b64: string | undefined;
        let revisedPrompt: string | undefined;

        for (const part of parts) {
          if (part.text && typeof part.text === "string") {
            revisedPrompt = part.text;
          }
          if (part.inlineData && typeof part.inlineData === "object") {
            const inline = part.inlineData as { data?: unknown };
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

export async function generateImageDirect(
  options: GenerateImageOptions
): Promise<GeneratedImageResult> {
  const { token, projectId } = await getValidAccessToken();

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

  let lastError: Error | null = null;
  let parsedResult: { b64_json: string; revised_prompt?: string } | null = null;

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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry with next endpoint if available
    }
  }

  if (!parsedResult) {
    throw lastError || new Error("Image generation failed on all Google Cloud Code endpoints.");
  }

  const saved = await saveImageBuffer(Buffer.from(parsedResult.b64_json, "base64"), {
    prompt: options.prompt,
    filename: options.filename,
    outputDir: options.outputDir,
    syncToGallery: options.syncToGallery,
    openInGallery: options.openInGallery,
  });

  return {
    filePath: saved.filePath,
    fileSizeBytes: saved.fileSizeBytes,
    provider: "google",
    model: DEFAULT_IMAGE_MODEL,
    aspectRatio: options.aspectRatio || "1:1",
    revisedPrompt: parsedResult.revised_prompt,
    galleryPath: saved.galleryPath,
    openedOnScreen: saved.openedOnScreen,
  };
}
