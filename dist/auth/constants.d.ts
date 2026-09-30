/**
 * Google OAuth and Antigravity Cloud Code Constants
 */
export declare function getGoogleOAuthClientId(): string;
export declare function getGoogleOAuthClientSecret(): string;
export declare const GOOGLE_OAUTH_URLS: {
    readonly authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth";
    readonly tokenUrl: "https://oauth2.googleapis.com/token";
    readonly userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo";
};
export declare const GOOGLE_OAUTH_SCOPES: readonly ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/cclog", "https://www.googleapis.com/auth/experimentsandconfigs"];
export declare const CLOUD_CODE_ENDPOINTS: {
    readonly loadCodeAssist: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
    readonly onboardUser: "https://cloudcode-pa.googleapis.com/v1internal:onboardUser";
    readonly generateContentDaily: "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent";
    readonly generateContentStandard: "https://cloudcode-pa.googleapis.com/v1internal:generateContent";
};
export declare const DEFAULT_LOOPBACK_PORT = 51128;
export declare const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
export declare const ANTIGRAVITY_USER_AGENT = "antigravity/2.0.1 linux/arm64 google-api-nodejs-client/10.3.0";
export declare const ANTIGRAVITY_X_GOOG_API_CLIENT = "gl-node/22.21.1";
