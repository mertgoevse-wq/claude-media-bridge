import type { MediaProvider, ProviderInfo, ProviderImageOptions, GeneratedImageResult } from "./types.js";
import { googleProvider } from "./google.js";
import { openaiProvider } from "./openai.js";
import { stabilityProvider } from "./stability.js";
import { falProvider } from "./fal.js";
import { pollinationsProvider } from "./pollinations.js";

export const ALL_PROVIDERS: Record<string, MediaProvider> = {
  google: googleProvider,
  openai: openaiProvider,
  stability: stabilityProvider,
  fal: falProvider,
  pollinations: pollinationsProvider,
};

export function listProviders(): ProviderInfo[] {
  return Object.values(ALL_PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    defaultModel: p.defaultModel,
    supportedModels: p.supportedModels,
    requiresApiKey: p.requiresApiKey,
    isConfigured: p.isConfigured(),
  }));
}

export function resolveProvider(
  requestedProvider?: string,
  requestedModel?: string
): MediaProvider {
  // 1. Explicit provider requested
  if (requestedProvider) {
    const key = requestedProvider.toLowerCase().trim();
    if (ALL_PROVIDERS[key]) {
      return ALL_PROVIDERS[key];
    }
  }

  // 2. Resolve by model name if model is specified
  if (requestedModel) {
    const m = requestedModel.toLowerCase().trim();
    if (m.includes("dall-e")) return openaiProvider;
    if (m.includes("sd3") || m.includes("stability") || m === "core") return stabilityProvider;
    if (m.includes("fal") || m.includes("recraft") || m === "flux-schnell" || m === "flux-dev") return falProvider;
    if (m.includes("gemini") || m.includes("banana") || m.includes("imagen")) return googleProvider;
  }

  // 3. Auto-select by configuration priority:
  // Google AGY (free for Google users) -> OpenAI -> Stability -> Fal -> Pollinations (free zero-key)
  if (googleProvider.isConfigured()) return googleProvider;
  if (openaiProvider.isConfigured()) return openaiProvider;
  if (stabilityProvider.isConfigured()) return stabilityProvider;
  if (falProvider.isConfigured()) return falProvider;

  // Universal zero-config fallback
  return pollinationsProvider;
}

export async function generateImageWithRouting(
  options: ProviderImageOptions
): Promise<GeneratedImageResult> {
  const provider = resolveProvider(options.provider, options.model);
  return provider.generateImage(options);
}
