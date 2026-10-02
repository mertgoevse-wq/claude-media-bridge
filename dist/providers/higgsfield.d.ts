import type { MediaProvider } from "./types.js";
export interface HiggsfieldImageModel {
    id: string;
    label: string;
    approxUsd: string;
}
/**
 * Higgsfield bills per generation in USD with no free tier. Prices are the
 * published starting rates; the live price list is authoritative.
 */
export declare const HIGGSFIELD_IMAGE_MODELS: HiggsfieldImageModel[];
export declare const higgsfieldProvider: MediaProvider;
