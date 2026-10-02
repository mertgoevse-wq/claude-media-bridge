import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadBridgeState } from "./auth/tokenStorage.js";
/**
 * Values the user set through `/plugin` on the Claude Code plugin. Claude Code
 * exposes plugin userConfig as CLAUDE_PLUGIN_OPTION_<KEY> in hook and MCP
 * processes, which is what makes the plugin's config dialog take effect.
 */
function pluginOption(key) {
    const value = process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`];
    return value?.trim() || undefined;
}
export function loadConfig() {
    const envBaseUrl = process.env.OMNIROUTE_BASE_URL ||
        process.env.ANTHROPIC_BASE_URL ||
        "http://localhost:20128";
    let apiKey = process.env.OMNIROUTE_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        "";
    // If apiKey is not directly in env, read from standard OmniRoute config location
    if (!apiKey) {
        const envFile = path.join(os.homedir(), ".config/mll/providers/omniroute.env");
        if (fs.existsSync(envFile)) {
            try {
                const content = fs.readFileSync(envFile, "utf8");
                for (const line of content.split("\n")) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("OMNIROUTE_API_KEY=")) {
                        apiKey = trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
                        break;
                    }
                }
            }
            catch {
                // Fallback gracefully
            }
        }
    }
    const cleanBase = envBaseUrl.replace(/\/v1\/?$/, "");
    const state = loadBridgeState();
    const defaultOutputDir = process.env.MEDIA_OUTPUT_DIR
        ? resolveUserPath(process.env.MEDIA_OUTPUT_DIR)
        : state?.outputDir
            ? resolveUserPath(state.outputDir)
            : pluginOption("output_dir")
                ? resolveUserPath(pluginOption("output_dir"))
                : path.join(os.homedir(), "media", "images");
    return {
        baseUrl: cleanBase,
        apiKey,
        defaultOutputDir,
        // Explicit setup choices win over the /plugin defaults dialog.
        defaultModel: state?.defaultModel || pluginOption("default_model") || "gemini-3.1-flash-image",
        defaultProvider: state?.defaultProvider || pluginOption("default_provider"),
    };
}
/**
 * Resolves a provider API key from the environment first, then from the keys
 * collected during `claude-media-bridge setup`.
 */
export function resolveProviderKey(name) {
    const fromEnv = process.env[name];
    if (fromEnv && fromEnv.trim())
        return fromEnv.trim();
    return loadBridgeState()?.providerKeys?.[name]?.trim() || undefined;
}
export function resolveUserPath(p) {
    if (p === "~" || p.startsWith("~/")) {
        return path.join(os.homedir(), p.slice(p.startsWith("~/") ? 2 : 1));
    }
    return path.resolve(p);
}
export function slugify(text) {
    return (text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || "image");
}
