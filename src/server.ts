import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateImage, probeVideoEndpoint, probeMusicEndpoint, listProviders } from "./client.js";
import { loadConfig } from "./config.js";
import { loadStoredCredentials } from "./auth/tokenStorage.js";

export function createMediaServer(): McpServer {
  const server = new McpServer({
    name: "claude-media-bridge",
    version: "2.1.0",
  });

  // Tool 1: generate_image (Multi-Provider Media Generation)
  server.tool(
    "generate_image",
    "Generate high-fidelity images via Google's Nano Banana 2 (gemini-3.1-flash-image), OpenAI DALL-E 3, Stability SD3.5, Fal.ai FLUX, or free Pollinations AI. Saves output directly to disk as a real file (.jpg) and returns the file path for inspection and further agentic workflows.",
    {
      prompt: z.string().describe("Detailed description of the image to generate"),
      provider: z.string().optional().describe("Optional provider: 'google', 'openai', 'stability', 'fal', 'pollinations', or 'auto' (default: auto)"),
      model: z.string().optional().describe("Optional specific model name (e.g. 'gemini-3.1-flash-image', 'dall-e-3', 'flux', 'sd3.5')"),
      filename: z.string().optional().describe("Desired output filename without extension"),
      output_dir: z.string().optional().describe("Directory where the image will be saved (default: ~/media/images)"),
      aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio for the generated image"),
      sync_to_gallery: z.boolean().optional().describe("Auto-sync image to Android /sdcard/Pictures and trigger media scanner (default: true if available)"),
      open_in_gallery: z.boolean().optional().describe("Open the image in Android Gallery/Viewer on device screen (default: false)"),
    },
    async ({ prompt, provider, model, filename, output_dir, aspect_ratio, sync_to_gallery, open_in_gallery }) => {
      try {
        const result = await generateImage({
          prompt,
          provider,
          model,
          filename,
          outputDir: output_dir,
          aspectRatio: aspect_ratio,
          syncToGallery: sync_to_gallery,
          openInGallery: open_in_gallery,
        });
        const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);

        let extraDetails = "";
        if (result.galleryPath) {
          extraDetails += `\nAndroid Gallery Sync: ${result.galleryPath}`;
        }
        if (result.openedOnScreen) {
          extraDetails += `\nDisplay Status: Opened on screen in Android Gallery viewer.`;
        }

        return {
          content: [
            {
              type: "text",
              text: `Image successfully generated via ${result.provider} (${result.model}) and saved to:\n${result.filePath}\n\nFile Size: ${sizeKb} KB\nAspect Ratio: ${result.aspectRatio}${extraDetails}\nThe agent can now inspect, transform, or use this file.`,
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
      const creds = loadStoredCredentials();
      const hasEnvToken = Boolean(
        process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN
      );
      const directAgyReady = hasEnvToken || Boolean(creds?.accessToken);

      let omniRouteOnline = false;
      try {
        const res = await fetch(`${config.baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        omniRouteOnline = res.ok;
      } catch {
        omniRouteOnline = false;
      }

      const isImageSupported = directAgyReady || omniRouteOnline;
      const authMode = directAgyReady
        ? "direct_google_oauth"
        : omniRouteOnline
          ? "omniroute_proxy"
          : "not_authenticated";

      const providers = listProviders();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                bridge: "claude-media-bridge",
                version: "2.1.0",
                auth_mode: authMode,
                direct_google_oauth: {
                  authenticated: directAgyReady,
                  account: creds?.email || (hasEnvToken ? "environment_variable" : null),
                  project_id:
                    creds?.projectId ||
                    process.env.AGY_PROJECT_ID ||
                    process.env.GOOGLE_CLOUD_PROJECT ||
                    null,
                },
                omniroute_fallback: {
                  status: omniRouteOnline ? "connected" : "unreachable",
                  url: config.baseUrl,
                },
                providers: providers.map((p) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  default_model: p.defaultModel,
                  supported_models: p.supportedModels,
                  requires_api_key: p.requiresApiKey,
                  configured: p.isConfigured,
                })),
                capabilities: {
                  image_generation: {
                    supported: true, // Always true thanks to Pollinations.ai zero-config fallback!
                    primary_provider: directAgyReady ? "Google Antigravity / Cloud Code" : "Pollinations.ai (Free)",
                    default_model: directAgyReady ? config.defaultModel : "flux",
                    android_gallery_sync: true,
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
