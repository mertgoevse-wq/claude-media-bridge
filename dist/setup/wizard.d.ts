import { findCatalogEntry } from "./catalog.js";
export interface SetupOptions {
    /** Skip every prompt and apply the free defaults. */
    nonInteractive?: boolean;
    /** Prompt for Google sign-in during setup. */
    loginGoogle?: boolean;
    /** Do not touch Claude Code settings. */
    skipClaudeCode?: boolean;
}
export interface SetupReport {
    actions: string[];
    warnings: string[];
}
/**
 * One-time setup. Safe to re-run: existing keys are kept unless overwritten and
 * nothing is ever printed in full.
 */
export declare function runSetup(options?: SetupOptions): Promise<SetupReport>;
/** Removes every stored credential. */
export declare function runUninstall(): void;
export { findCatalogEntry };
