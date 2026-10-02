import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateImage, probeVideoEndpoint, probeMusicEndpoint, listProviders } from "./client.js";
import { loadConfig } from "./config.js";
import { loadStoredCredentials, loadBridgeState, saveProviderKey } from "./auth/tokenStorage.js";
import { loginInteractive } from "./auth/googleOAuth.js";
import { PROVIDER_CATALOG, findCatalogEntry } from "./setup/catalog.js";
import { registerMcpServer } from "./setup/claudeCode.js";
/** Kept in sync with package.json. */
const VERSION = "2.2.0";
function hasGoogleAccount() {
    return Boolean(loadStoredCredentials()?.accessToken);
}
export function createMediaServer() {
    const server = new McpServer({
        name: "claude-media-bridge",
        version: VERSION,
    });
    // Tool 1: generate_image (Multi-Provider Media Generation)
    server.tool("generate_image", "Generate high-fidelity images via Google's Nano Banana 2 (gemini-3.1-flash-image), OpenAI DALL-E 3, Stability SD3.5, Fal.ai FLUX, or free Pollinations AI. Saves output directly to disk as a real file (.jpg) and returns the file path for inspection and further agentic workflows.", {
        prompt: z.string().describe("Detailed description of the image to generate"),
        provider: z.string().optional().describe("Optional provider: 'google', 'openai', 'stability', 'fal', 'pollinations', or 'auto' (default: auto)"),
        model: z.string().optional().describe("Optional specific model name (e.g. 'gemini-3.1-flash-image', 'dall-e-3', 'flux', 'sd3.5')"),
        filename: z.string().optional().describe("Desired output filename without extension"),
        output_dir: z.string().optional().describe("Directory where the image will be saved (default: ~/media/images)"),
        aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio for the generated image"),
        sync_to_gallery: z.boolean().optional().describe("Auto-sync image to Android /sdcard/Pictures and trigger media scanner (default: true if available)"),
        open_in_gallery: z.boolean().optional().describe("Open the image in Android Gallery/Viewer on device screen (default: false)"),
    }, async ({ prompt, provider, model, filename, output_dir, aspect_ratio, sync_to_gallery, open_in_gallery }) => {
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
        }
        catch (err) {
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
    });
    // Tool 2: generate_video (Veo diagnostic probe)
    server.tool("generate_video", "Generate video (Veo) or query video generation capability on the current AGY/OmniRoute setup.", {
        prompt: z.string().describe("Description of the video to generate"),
        model: z.string().optional().describe("Video model to request (e.g. veo-3.1-generate, veo)"),
        output_dir: z.string().optional().describe("Directory where the video will be saved"),
    }, async ({ prompt, model }) => {
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
    });
    // Tool 3: generate_music (Lyria diagnostic probe)
    server.tool("generate_music", "Generate music/audio (Lyria) or query audio generation capability on the current AGY/OmniRoute setup.", {
        prompt: z.string().describe("Description of the music or audio to generate"),
        model: z.string().optional().describe("Music model to request (e.g. lyria-002)"),
        output_dir: z.string().optional().describe("Directory where the audio will be saved"),
    }, async ({ prompt, model }) => {
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
    });
    // Tool 4: connect_account - sign in or store a key without leaving the chat
    server.tool("connect_account", "Connect a media provider. Use provider 'google' for a one-click Google sign-in (Nano Banana 2), or pass an api_key for Google AI Studio, Fal.ai, Stability AI, OpenAI or Higgsfield. Call this before the first generate_image if no provider is set up yet.", {
        provider: z
            .string()
            .optional()
            .describe("Provider id: google, gemini, pollinations, fal, stability, openai, higgsfield"),
        api_key: z
            .string()
            .optional()
            .describe("API key to store. Omit for the Google sign-in flow."),
        port: z.number().optional().describe("Loopback port for the OAuth callback (default 51128)"),
    }, async ({ provider, api_key, port }) => {
        try {
            if (!provider) {
                const catalog = PROVIDER_CATALOG.map((p) => `${p.id} (${p.auth}, ${p.cost}): ${p.tagline}`).join("\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Specify a provider to connect.\n\n${catalog}\n\nFor 'google' no key is needed; the browser opens automatically.`,
                        },
                    ],
                };
            }
            const entry = findCatalogEntry(provider);
            if (entry?.auth === "oauth") {
                const creds = await loginInteractive({
                    port,
                    interactive: false,
                    openBrowser: true,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Google account connected${creds.email ? ` (${creds.email})` : ""}. Nano Banana 2 is ready. Generate an image with generate_image, or let the user run /claude-media-bridge <prompt>.`,
                        },
                    ],
                };
            }
            if (!entry) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Unknown provider '${provider}'. Available: ${PROVIDER_CATALOG.map((p) => p.id).join(", ")}`,
                        },
                    ],
                    isError: true,
                };
            }
            if (!api_key) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `${entry.name} needs an API key. Cost: ${entry.costNote}\nCreate one at ${entry.signupUrl} then call connect_account again with api_key set.`,
                        },
                    ],
                };
            }
            saveProviderKey(entry.keyName, api_key);
            return {
                content: [
                    {
                        type: "text",
                        text: `${entry.name} key saved. The bridge will use ${entry.defaultModel} unless another model is requested.`,
                    },
                ],
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Could not connect ${provider ?? "provider"}: ${msg}` }],
                isError: true,
            };
        }
    });
    // Tool 5: list_media_models
    server.tool("list_media_models", "List every provider and model that can be passed to generate_image, with the current setup state and the real cost of each.", {}, async () => {
        const state = loadBridgeState();
        const providers = listProviders();
        const lines = providers.map((p) => {
            const entry = findCatalogEntry(p.id);
            const cost = entry?.cost ?? "unknown";
            const ready = p.isConfigured ? "ready" : p.requiresApiKey ? "needs key" : "ready";
            return [
                `${p.id} - ${p.name} [${cost}, ${ready}]`,
                `  default: ${p.defaultModel}`,
                `  models:  ${p.supportedModels.join(", ")}`,
                p.isConfigured ? "" : `  note:    ${entry?.costNote ?? ""}`,
            ]
                .filter(Boolean)
                .join("\n");
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Default provider: ${state?.defaultProvider ?? "auto"}\n\n${lines.join("\n\n")}`,
                },
            ],
        };
    });
    // Tool 6: run_setup
    server.tool("run_setup", "Run the one-time setup: register the MCP server in Claude Code and report what still needs connecting. Returns a setup URL for the browser-based flow.", {
        web: z
            .boolean()
            .optional()
            .describe("Print the localhost setup URL the user can open to connect providers with one click"),
    }, async ({ web }) => {
        try {
            const result = registerMcpServer();
            const missing = PROVIDER_CATALOG.filter((entry) => {
                if (entry.auth === "none")
                    return false;
                if (entry.auth === "oauth")
                    return !hasGoogleAccount();
                return !loadBridgeState()?.providerKeys?.[entry.keyName];
            });
            const lines = [
                `MCP server: ${result.changed ? `registered (${result.reason})` : "already registered"} in ${result.settingsPath}`,
                `Google account: ${hasGoogleAccount() ? "connected" : "not connected"}`,
                missing.length > 0
                    ? `Still to set up:\n${missing.map((m) => `  - ${m.name} (${m.cost}): ${m.costNote}`).join("\n")}`
                    : "All catalogued providers are ready.",
            ];
            if (web) {
                lines.push("");
                lines.push("Run `claude-media-bridge setup --web` for the one-click browser page.");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Setup failed: ${msg}` }],
                isError: true,
            };
        }
    });
    // Tool 7: check_media_capabilities
    server.tool("check_media_capabilities", "Inspect current AGY and OmniRoute media capabilities and model availability.", {}, async () => {
        const config = loadConfig();
        const creds = loadStoredCredentials();
        const hasEnvToken = Boolean(process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN);
        const directAgyReady = hasEnvToken || Boolean(creds?.accessToken);
        let omniRouteOnline = false;
        try {
            const res = await fetch(`${config.baseUrl}/v1/models`, {
                headers: { Authorization: `Bearer ${config.apiKey}` },
            });
            omniRouteOnline = res.ok;
        }
        catch {
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
                    text: JSON.stringify({
                        bridge: "claude-media-bridge",
                        version: VERSION,
                        auth_mode: authMode,
                        direct_google_oauth: {
                            authenticated: directAgyReady,
                            account: creds?.email || (hasEnvToken ? "environment_variable" : null),
                            project_id: creds?.projectId ||
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
                    }, null, 2),
                },
            ],
        };
    });
    return server;
}
