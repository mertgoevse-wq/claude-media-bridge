#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Resolve OmniRoute credentials and URL
function getOmniRouteConfig() {
  const baseUrl = process.env.OMNIROUTE_BASE_URL || process.env.ANTHROPIC_BASE_URL || "http://localhost:20128";
  let apiKey = process.env.OMNIROUTE_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";

  if (!apiKey) {
    const envFile = path.join(os.homedir(), ".config/mll/providers/omniroute.env");
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, "utf8");
        for (const line of content.split("\n")) {
          if (line.startsWith("OMNIROUTE_API_KEY=")) {
            apiKey = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // Normalize baseUrl
  const cleanBase = baseUrl.replace(/\/v1\/?$/, "");
  return { baseUrl: cleanBase, apiKey };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "image";
}

const server = new McpServer({
  name: "claude-media-mcp",
  version: "1.0.0"
});

// Tool 1: generate_image
server.tool(
  "generate_image",
  "Generate an image using Google's Nano Banana 2 (gemini-3.1-flash-image) via the Antigravity/OmniRoute bridge. Saves output to disk as a real file (.jpg/.png) and returns the file path for further agent processing.",
  {
    prompt: z.string().describe("Detailed description of the image to generate"),
    filename: z.string().optional().describe("Desired output filename without extension"),
    output_dir: z.string().optional().describe("Directory where the image will be saved (default: ~/media/images)"),
    aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio for the generated image")
  },
  async ({ prompt, filename, output_dir, aspect_ratio }) => {
    const { baseUrl, apiKey } = getOmniRouteConfig();

    const targetDir = output_dir
      ? (output_dir.startsWith("~") ? path.join(os.homedir(), output_dir.slice(1)) : path.resolve(output_dir))
      : path.join(os.homedir(), "media", "images");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const baseName = filename ? filename.replace(/\.(jpg|jpeg|png)$/i, "") : `${slugify(prompt)}-${Date.now()}`;
    const filePath = path.join(targetDir, `${baseName}.jpg`);

    const imageModel = "antigravity/gemini-3.1-flash-image";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const requestBody: Record<string, unknown> = {
        prompt,
        model: imageModel
      };
      if (aspect_ratio) {
        requestBody.size = aspect_ratio === "16:9" ? "1792x1024" : aspect_ratio === "9:16" ? "1024x1792" : "1024x1024";
      }

      const res = await fetch(`${baseUrl}/v1/images/generations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.text();
        return {
          content: [
            {
              type: "text",
              text: `Error generating image via OmniRoute (${res.status}): ${errData}`
            }
          ],
          isError: true
        };
      }

      const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      const imgData = data?.data?.[0];

      if (!imgData) {
        return {
          content: [
            {
              type: "text",
              text: `OmniRoute returned an empty image list: ${JSON.stringify(data)}`
            }
          ],
          isError: true
        };
      }

      if (imgData.b64_json) {
        const buffer = Buffer.from(imgData.b64_json, "base64");
        fs.writeFileSync(filePath, buffer);
        const stats = fs.statSync(filePath);
        return {
          content: [
            {
              type: "text",
              text: `Image successfully generated via Nano Banana (${imageModel}) and saved to:\n${filePath}\n\nFile size: ${(stats.size / 1024).toFixed(1)} KB\nThe agent can now inspect or process this file.`
            }
          ]
        };
      } else if (imgData.url) {
        // Download from URL
        const dlRes = await fetch(imgData.url);
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        return {
          content: [
            {
              type: "text",
              text: `Image downloaded from remote URL and saved to:\n${filePath}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `No image data (b64_json or url) found in OmniRoute response.`
            }
          ],
          isError: true
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Failed to connect to OmniRoute at ${baseUrl}: ${msg}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool 2: generate_video
server.tool(
  "generate_video",
  "Generate video (Veo) or query video generation capability on the current AGY/OmniRoute setup.",
  {
    prompt: z.string().describe("Description of the video to generate"),
    model: z.string().optional().describe("Video model to request (e.g. veo-3.1-generate, veo)"),
    output_dir: z.string().optional().describe("Directory where the video will be saved")
  },
  async ({ prompt, model }) => {
    const { baseUrl, apiKey } = getOmniRouteConfig();
    const videoModel = model || "veo";

    // Attempt request to OmniRoute to inspect current backend capability
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${baseUrl}/v1/videos/generations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt, model: videoModel }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Video generation task accepted: ${JSON.stringify(data, null, 2)}`
            }
          ]
        };
      }
    } catch (e) {
      // ignore
    }

    return {
      content: [
        {
          type: "text",
          text: `AGY MEDIA NICHT UNTERSTÜTZT: Google Veo Video-Generierung ist über den Antigravity/Cloud Code OAuth-Kanal technisch nicht verfügbar.\n\nErklärung:\nDie vorhandene AGY-Authentifizierung (Google Cloud Code OAuth) umfasst ausschließlich Entwickler-APIs (Text/Reasoning sowie Nano Banana Bildgenerierung via gemini-3.1-flash-image). Google stellt Veo-Videomodelle nicht über Cloud Code OAuth bereit, sondern ausschließlich über die kostenpflichtige Google AI Studio Gemini API (GEMINI_API_KEY mit aktivierter Abrechnung) oder Google Vertex AI.`
        }
      ]
    };
  }
);

// Tool 3: generate_music
server.tool(
  "generate_music",
  "Generate music/audio (Lyria) or query audio generation capability on the current AGY/OmniRoute setup.",
  {
    prompt: z.string().describe("Description of the music or audio to generate"),
    model: z.string().optional().describe("Music model to request (e.g. lyria-002)"),
    output_dir: z.string().optional().describe("Directory where the audio will be saved")
  },
  async ({ prompt, model }) => {
    const { baseUrl, apiKey } = getOmniRouteConfig();
    const musicModel = model || "lyria-002";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${baseUrl}/v1/music/generations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt, model: musicModel }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Music generation task accepted: ${JSON.stringify(data, null, 2)}`
            }
          ]
        };
      }
    } catch (e) {
      // ignore
    }

    return {
      content: [
        {
          type: "text",
          text: `AGY MEDIA NICHT UNTERSTÜTZT: Google Lyria Musik-Generierung ist über den Antigravity/Cloud Code OAuth-Kanal technisch nicht verfügbar.\n\nErklärung:\nDie vorhandene AGY-Authentifizierung (Google Cloud Code OAuth) umfasst keine Lyria-Endpunkte. Google Lyria ist ein Modell für Google Vertex AI bzw. spezielle Studio-APIs und existiert nicht im Antigravity-Katalog.`
        }
      ]
    };
  }
);

// Tool 4: check_media_capabilities
server.tool(
  "check_media_capabilities",
  "Inspect current AGY and OmniRoute media capabilities and model availability.",
  {},
  async () => {
    const { baseUrl, apiKey } = getOmniRouteConfig();
    let omniRouteOnline = false;
    let agyImageSupported = false;

    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (res.ok) {
        omniRouteOnline = true;
      }
    } catch (e) {
      // offline
    }

    agyImageSupported = omniRouteOnline;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            omniroute_status: omniRouteOnline ? "connected" : "unreachable",
            omniroute_url: baseUrl,
            authentication_source: "Antigravity/AGY Google OAuth via OmniRoute",
            capabilities: {
              image_generation: {
                supported: agyImageSupported,
                provider: "antigravity",
                model: "antigravity/gemini-3.1-flash-image",
                alias: "Nano Banana 2",
                requires_gemini_api_key: false
              },
              video_generation: {
                supported_via_agy: false,
                reason: "Google Veo endpoints are not part of Google Cloud Code / Antigravity OAuth scopes",
                status_verdict: "AGY MEDIA NICHT UNTERSTÜTZT (requires Gemini API Key or Vertex AI)"
              },
              music_generation: {
                supported_via_agy: false,
                reason: "Google Lyria endpoints are not part of Google Cloud Code / Antigravity OAuth scopes",
                status_verdict: "AGY MEDIA NICHT UNTERSTÜTZT (requires Vertex AI or Gemini API Key)"
              }
            }
          }, null, 2)
        }
      ]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting claude-media-mcp:", err);
  process.exit(1);
});
