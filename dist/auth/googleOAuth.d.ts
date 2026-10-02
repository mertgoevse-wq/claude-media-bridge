import { type StoredCredentials } from "./tokenStorage.js";
export declare function buildAuthorizationUrl(redirectUri: string, state: string): string;
export declare function exchangeCodeForTokens(code: string, redirectUri: string): Promise<StoredCredentials>;
export declare function refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiryDate: number;
}>;
export declare function discoverProjectId(accessToken: string): Promise<string>;
export declare function getValidAccessToken(): Promise<{
    token: string;
    projectId: string;
}>;
export interface LoginOptions {
    port?: number;
    /** Open the consent URL in a browser automatically (default: true). */
    openBrowser?: boolean;
    /**
     * Allow pasting the redirect URL in the terminal. Disable when there is no
     * TTY, e.g. when login is driven from the MCP server or the web setup UI.
     */
    interactive?: boolean;
    /** Called once the loopback server is listening. */
    onReady?: (info: {
        authUrl: string;
        port: number;
    }) => void;
}
/**
 * Runs the Google OAuth loopback flow.
 *
 * The server binds to 127.0.0.1 only. When the preferred port is taken it walks
 * upward rather than failing, because a stale login is a common case on phones.
 */
export declare function loginInteractive(options?: LoginOptions): Promise<StoredCredentials>;
