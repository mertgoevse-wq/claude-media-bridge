import type { MediaProvider, ProviderInfo, ProviderImageOptions, GeneratedImageResult } from "./types.js";
import { googleProvider } from "./google.js";
import { geminiProvider } from "./gemini.js";
import { openaiProvider } from "./openai.js";
import { stabilityProvider } from "./stability.js";
import { falProvider } from "./fal.js";
import { higgsfieldProvider } from "./higgsfield.js";
import { pollinationsProvider } from "./pollinations.js";
import { loadConfig } from "../config.js";

export const ALL_PROVIDERS: Record<string, MediaProvider> = {
  google: googleProvider,
  gemini: geminiProvider,
  pollinations: pollinationsProvider,
  fal: falProvider,
  stability: stabilityProvider,
  openai: openaiProvider,
  higgsfield: higgsfieldProvider,
};

/** Friendly aliases so `/claude-media-bridge nano-banana ...` just works. */
const PROVIDER_ALIASES: Record<string, string> = {
  banana: "google",
  "nano-banana": "google",
  "nano-banana-pro": "gemini",
  aistudio: "gemini",
  "google-ai-studio": "gemini",
  "ai-studio": "gemini",
  flux: "pollinations",
  fluxschnell: "pollinations",
  "flux-schnell": "pollinations",
  sd: "stability",
  "stable-diffusion": "stability",
  "stability-ai": "stability",
  soul: "higgsfield",
  "soul-2": "higgsfield",
  dalle: "openai",
  "dall-e": "openai",
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

/**
 * Maps a model name to the providers that serve it, most preferred first.
 * Several Nano Banana model ids exist on both the Google account channel and
 * the AI Studio channel, so both are listed and the configured one wins.
 */
function providersForModel(model: string): MediaProvider[] {
  const m = model.toLowerCase().trim();
  const groups: Array<[string, MediaProvider[]]> = [
    ["gemini-3-pro-image", [geminiProvider]],
    ["gemini-3.1-flash-lite-image", [geminiProvider]],
    ["gemini-3.1-flash-image", [googleProvider, geminiProvider]],
    ["gemini-", [geminiProvider]],
    ["imagen", [googleProvider]],
    ["dall-e", [openaiProvider]],
    ["gpt-image", [openaiProvider]],
    ["sd3", [stabilityProvider]],
    ["sdxl", [stabilityProvider]],
    ["core", [stabilityProvider]],
    ["flux-schnell", [falProvider]],
    ["flux-dev", [falProvider]],
    ["recraft", [falProvider]],
    ["soul-2", [higgsfieldProvider]],
    ["soul-cinema", [higgsfieldProvider]],
    ["marketing-studio-image", [higgsfieldProvider]],
    ["flux", [pollinationsProvider]],
    ["turbo", [pollinationsProvider]],
  ];

  const match = groups.find(([prefix]) => m.includes(prefix));
  return match?.[1] ?? [];
}

export function resolveProvider(
  requestedProvider?: string,
  requestedModel?: string
): MediaProvider {
  // 1. Explicit provider, accepting aliases.
  if (requestedProvider) {
    const provider = lookupProvider(requestedProvider);
    if (provider) return provider;
  }

  // 2. Resolve from the model name, preferring a channel that is configured.
  if (requestedModel) {
    const candidates = providersForModel(requestedModel);
    const configured = candidates.find((p) => p.isConfigured());
    if (configured) return configured;
    if (candidates.length > 0) return candidates[0];
  }

  // 3. Honour the configured default, but only if it can actually run.
  const preferred = preferredProviderId();
  if (preferred) {
    const provider = lookupProvider(preferred);
    if (provider?.isConfigured()) return provider;
  }

  // 4. Fall back to the first configured provider, free ones first.
  const configured = Object.values(ALL_PROVIDERS).filter((p) => p.isConfigured());
  const freeFirst = configured.find((p) => !p.requiresApiKey);
  if (freeFirst) return freeFirst;
  if (configured.length > 0) return configured[0];

  // 5. Universal zero-config fallback so generation never hard-fails.
  return pollinationsProvider;
}

function lookupProvider(name: string): MediaProvider | undefined {
  const key = name.toLowerCase().trim();
  return ALL_PROVIDERS[key] ?? ALL_PROVIDERS[PROVIDER_ALIASES[key]];
}

function preferredProviderId(): string | undefined {
  return loadConfig().defaultProvider;
}

export async function generateImageWithRouting(
  options: ProviderImageOptions
): Promise<GeneratedImageResult> {
  const provider = resolveProvider(options.provider, options.model);
  return provider.generateImage(options);
}