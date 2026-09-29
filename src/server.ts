import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateImage, probeVideoEndpoint, probeMusicEndpoint } from "./client.js";
import { loadConfig } from "./config.js";

export function createMediaServer(): McpServer {
  const server = new McpServer({
    name: "claude-media-bridge",
    version: "1.0.0",
  });

  // Tool 1: generate_image (Nano Banana / Gemini 3.1 Flash Image via AGY)
  server.tool(
    "generate_image",
    "Generate high-fidelity images using Google's Nano Banana 2 (gemini-3.1-flash-image) via the Antigravity/AGY OmniRoute bridge. Saves output directly to disk as a real file (.jpg) and returns the file path for inspection and further agentic workflows.",
    {
      prompt: z.string().describe("Detailed description of the image to generate"),
      filename: z.string().optional().describe("Desired output filename without extension"),
      output_dir: z.string().optional().describe("Directory where the image will be saved (default: ~/media/images)"),
      aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio for the generated image"),
    },
    async ({ prompt, filename, output_dir, aspect_ratio }) => {
      try {
        const result = await generateImage({ prompt, filename, output_dir, aspect_ratio });
        const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);
        return {
          content: [
            {
              type: "text",
              text: `Image successfully generated via Nano Banana (${result.model}) and saved to:\n${result.filePath}\n\nFile Size: ${sizeKb} KB\nAspect Ratio: ${result.aspectRatio}\nThe agent can now inspect, transform, or use this file.`,
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Image generation failed: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: generate_video (Veo diagnostic probe)
  server.tool(
    "generate_video",
    "Generate video (Veo) or query video generation capability on the current AGY/OmniRoute setup.",
    {
      prompt: z.string().describe("Description of the video to generate"),
      model: z.string().optional().describe("Video model to request (e.g. veo-3.1-generate, veo)"),
      output_dir: z.string().optional().describe("Directory where the video will be saved"),
    },
    async ({ prompt, model }) => {
      const probe = await probeVideoEndpoint(prompt, model);
      if (probe.ok) {
        return {
          content: [{ type: "text", text: `Video generation task accepted by backend.` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `AGY MEDIA NICHT UNTERSTÜTZT: Google Veo Video-Generierung ist über den Antigravity/Cloud Code OAuth-Kanal technisch nicht verfügbar.\n\nErklärung:\nDie vorhandene AGY-Authentifizierung (Google Cloud Code OAuth) umfasst Entwickler-APIs (Text/Reasoning sowie Nano Banana Bildgenerierung via gemini-3.1-flash-image). Google stellt Veo-Videomodelle nicht über Cloud Code OAuth bereit, sondern ausschließlich über die kostenpflichtige Google AI Studio Gemini API (GEMINI_API_KEY mit aktivierter Abrechnung) oder Google Vertex AI.`,
          },
        ],
      };
    }
  );

  // Tool 3: generate_music (Lyria diagnostic probe)
  server.tool(
    "generate_music",
    "Generate music/audio (Lyria) or query audio generation capability on the current AGY/OmniRoute setup.",
    {
      prompt: z.string().describe("Description of the music or audio to generate"),
      model: z.string().optional().describe("Music model to request (e.g. lyria-002)"),
      output_dir: z.string().optional().describe("Directory where the audio will be saved"),
    },
    async ({ prompt, model }) => {
      const probe = await probeMusicEndpoint(prompt, model);
      if (probe.ok) {
        return {
          content: [{ type: "text", text: `Music generation task accepted by backend.` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `AGY MEDIA NICHT UNTERSTÜTZT: Google Lyria Musik-Generierung ist über den Antigravity/Cloud Code OAuth-Kanal technisch nicht verfügbar.\n\nErklärung:\nDie vorhandene AGY-Authentifizierung (Google Cloud Code OAuth) umfasst keine Lyria-Endpunkte. Google Lyria ist ein Modell für Google Vertex AI bzw. spezielle Studio-APIs und existiert nicht im Antigravity-Katalog.`,
          },
        ],
      };
    }
  );

  // Tool 4: check_media_capabilities
  server.tool(
    "check_media_capabilities",
    "Inspect current AGY and OmniRoute media capabilities and model availability.",
    {},
    async () => {
      const config = loadConfig();
      let omniRouteOnline = false;

      try {
        const res = await fetch(`${config.baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        omniRouteOnline = res.ok;
      } catch {
        omniRouteOnline = false;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                bridge: "claude-media-bridge",
                omniroute_status: omniRouteOnline ? "connected" : "unreachable",
                omniroute_url: config.baseUrl,
                authentication_source: "Antigravity/AGY Google OAuth via OmniRoute",
                capabilities: {
                  image_generation: {
                    supported: omniRouteOnline,
                    provider: "antigravity",
                    model: config.defaultModel,
                    alias: "Nano Banana 2",
                    requires_gemini_api_key: false,
                  },
                  video_generation: {
                    supported_via_agy: false,
                    reason: "Veo endpoints are not part of Google Cloud Code / Antigravity OAuth",
                    status_verdict: "AGY MEDIA NICHT UNTERSTÜTZT (requires paid Gemini API Key or Vertex AI)",
                  },
                  music_generation: {
                    supported_via_agy: false,
                    reason: "Lyria endpoints are not part of Google Cloud Code / Antigravity OAuth",
                    status_verdict: "AGY MEDIA NICHT UNTERSTÜTZT (requires Vertex AI or Gemini API Key)",
                  },
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}
