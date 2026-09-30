export interface MediaBridgeConfig {
    baseUrl: string;
    apiKey: string;
    defaultOutputDir: string;
    defaultModel: string;
}
export declare function loadConfig(): MediaBridgeConfig;
export declare function resolveUserPath(p: string): string;
export declare function slugify(text: string): string;
