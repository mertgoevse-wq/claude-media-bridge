/**
 * Opens a URL in the user's browser. Returns false when no opener worked, so
 * callers can fall back to printing the URL instead of failing the flow.
 */
export declare function openInBrowser(url: string): boolean;
