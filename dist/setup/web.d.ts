export interface WebSetupOptions {
    port?: number;
    openBrowser?: boolean;
}
/**
 * Serves the one-click setup page on loopback. The token in the query string
 * gates every mutating endpoint.
 */
export declare function runWebSetup(options?: WebSetupOptions): Promise<{
    url: string;
    close: () => void;
}>;
/** Path used by tests and the CLI to confirm where images land by default. */
export declare function defaultOutputDir(): string;
export declare function ensureOutputDir(): string;
