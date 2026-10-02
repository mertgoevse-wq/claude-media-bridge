import type { ProviderKeyName } from "../auth/tokenStorage.js";

export type AuthKind = "oauth" | "api-key" | "none";
export type CostKind = "free" | "free-tier" | "paid";

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  auth: AuthKind;
  cost: CostKind;
  /** Shown in the wizard so users know what signing in costs them. */
  costNote: string;
  /** Where to obtain a key, or the page the OAuth flow starts from. */
  signupUrl?: string;
  /** Env/key name collected during setup. Absent for oauth and keyless providers. */
  keyName?: ProviderKeyName;
  models: string[];
  defaultModel: string;
  tagline: string;
}

/**
 * Every provider the bridge can reach, with its real access model. Cost labels
 * are deliberately explicit so the wizard never implies something is free when
 * it is not.
 */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "google",
    name: "Google Account (Nano Banana 2)",
    auth: "oauth",
    cost: "free",
    costNote: "Free. Uses your existing Google account, no API key, no billing.",
    signupUrl: "https://accounts.google.com",
    models: ["gemini-3.1-flash-image", "imagen-3.0"],
    defaultModel: "gemini-3.1-flash-image",
    tagline: "One click sign-in. Nano Banana 2 on Google's Cloud Code channel.",
  },
  {
    id: "gemini",
    name: "Google AI Studio (Gemini API)",
    auth: "api-key",
    cost: "free-tier",
    costNote: "Free tier with rate limits. Nano Banana Pro is billed per image.",
    signupUrl: "https://aistudio.google.com/apikey",
    keyName: "GEMINI_API_KEY",
    models: ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image"],
    defaultModel: "gemini-3.1-flash-image",
    tagline: "Official Gemini API. Works with or without OmniRoute.",
  },
  {
    id: "pollinations",
    name: "Pollinations.ai (FLUX)",
    auth: "none",
    cost: "free",
    costNote:
      "Free and keyless, but the anonymous tier is heavily rate limited and often answers 402. Treat it as a backup, not a guarantee.",
    models: ["flux", "turbo"],
    defaultModel: "flux",
    tagline: "Needs no account. Works before you sign in to anything, but retries may be needed.",
  },
  {
    id: "fal",
    name: "Fal.ai (FLUX.1 / Recraft)",
    auth: "api-key",
    cost: "paid",
    costNote: "Pay per image. New accounts get trial credits.",
    signupUrl: "https://fal.ai/dashboard/keys",
    keyName: "FAL_KEY",
    models: ["flux-schnell", "flux-dev", "recraft-v3"],
    defaultModel: "flux-schnell",
    tagline: "FLUX.1 Dev and Recraft v3.",
  },
  {
    id: "stability",
    name: "Stability AI (Stable Diffusion)",
    auth: "api-key",
    cost: "paid",
    costNote: "Pay per image. New accounts get trial credits.",
    signupUrl: "https://platform.stability.ai/account/keys",
    keyName: "STABILITY_API_KEY",
    models: ["sd3.5", "core", "sdxl"],
    defaultModel: "sd3.5",
    tagline: "Stable Diffusion 3.5 Large and SDXL Core.",
  },
  {
    id: "openai",
    name: "OpenAI (DALL-E)",
    auth: "api-key",
    cost: "paid",
    costNote: "Paid per image.",
    signupUrl: "https://platform.openai.com/api-keys",
    keyName: "OPENAI_API_KEY",
    models: ["dall-e-3", "dall-e-2"],
    defaultModel: "dall-e-3",
    tagline: "DALL-E 3 prompt adherence.",
  },
  {
    id: "higgsfield",
    name: "Higgsfield (Soul)",
    auth: "api-key",
    cost: "paid",
    costNote: "Pay per use in USD. No free tier.",
    signupUrl: "https://higgsfield.ai",
    keyName: "HIGGSFIELD_API_KEY",
    models: ["soul-2", "soul-cinema", "marketing-studio-image"],
    defaultModel: "soul-2",
    tagline: "Soul 2 and Soul Cinema image models.",
  },
];

export function findCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  const key = id.trim().toLowerCase();
  return PROVIDER_CATALOG.find((p) => p.id === key);
}

/** Entries that need a key pasted in during setup. */
export function keyCatalogEntries(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.auth === "api-key");
}