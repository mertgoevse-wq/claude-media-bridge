export declare const MCP_SERVER_NAME = "media-bridge";
/** Resolves the package root from the compiled file location. */
export declare function getPackageRoot(): string;
/** Absolute path to the CLI entry point that Claude Code should execute. */
export declare function getCliPath(): string;
export declare function getUserSettingsPath(): string;
export interface McpRegistration {
    changed: boolean;
    settingsPath: string;
    reason?: string;
}
/**
 * Registers the bridge in Claude Code's user settings so the tools appear in
 * every project. `enableAllProjectMcpServers` is what turns a user-level entry
 * into something non-interactive sessions actually trust.
 */
export declare function registerMcpServer(settingsPath?: string): McpRegistration;
export declare function isMcpRegistered(settingsPath?: string): boolean;
export declare const COMMAND_NAME = "claude-media-bridge";
/** Where the unscoped slash command lives so /claude-media-bridge works. */
export declare function getCommandDir(): string;
/**
 * The plugin exposes the skill as /media-bridge:claude-media-bridge. This copies
 * the same instructions to the user command directory so the plain
 * /claude-media-bridge form works without the plugin namespace.
 */
export declare function installSlashCommand(): {
    path: string;
    changed: boolean;
};
/** Removes the bridge from user settings. */
export declare function unregisterMcpServer(settingsPath?: string): McpRegistration;
