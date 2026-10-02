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
export declare const PROVIDER_CATALOG: ProviderCatalogEntry[];
export declare function findCatalogEntry(id: string): ProviderCatalogEntry | undefined;
/** Entries that need a key pasted in during setup. */
export declare function keyCatalogEntries(): ProviderCatalogEntry[];
