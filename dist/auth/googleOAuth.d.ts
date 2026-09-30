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
export declare function loginInteractive(options?: {
    port?: number;
    manual?: boolean;
}): Promise<StoredCredentials>;
