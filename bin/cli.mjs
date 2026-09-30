#!/usr/bin/env node
import { loginInteractive } from "../dist/auth/googleOAuth.js";
import { loadStoredCredentials, clearStoredCredentials, getCredentialsPath, isTokenExpired } from "../dist/auth/tokenStorage.js";
import { generateImage, listProviders } from "../dist/client.js";
import { loadConfig } from "../dist/config.js";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
Claude Media Bridge - Zero-config Media Generation Bridge

USAGE:
  claude-media-bridge [command] [options]

COMMANDS:
  (no args)             Start MCP Server over Stdio (for Claude Code)
  login                 Interactive Google Account authentication (Antigravity/Cloud Code)
  status                Check Google OAuth status, project ID and capabilities
  providers             List all supported media generation providers & models
  logout                Remove saved Google credentials
  generate <prompt>     Generate an image directly via CLI
  help, --help, -h      Show this help message

OPTIONS for 'generate':
  --provider <name>     Provider: google (default), openai, stability, fal, pollinations
  --model <name>        Model: gemini-3.1-flash-image, dall-e-3, sd3.5, flux, etc.
  --ratio <ratio>       Aspect ratio: 1:1 (default), 16:9, 9:16, 4:3, 3:4
  --filename <name>     Output filename without extension
  --out <dir>           Directory to save output (default: ~/media/images)
  --open                Open generated image in Android Gallery

EXAMPLES:
  claude-media-bridge login
  claude-media-bridge providers
  claude-media-bridge status
  claude-media-bridge generate "A stunning glassmorphism abstract orb" --ratio 16:9
  claude-media-bridge generate "Cyberpunk cityscape" --provider pollinations --model flux
`);
}

function handleProviders() {
  const providers = listProviders();
  console.log("\n=================================================");
  console.log("   Claude Media Bridge - Supported Providers");
  console.log("=================================================\n");

  for (const p of providers) {
    const status = p.isConfigured
      ? "\x1b[32m✔ Configured\x1b[0m"
      : p.requiresApiKey
        ? "\x1b[33m○ Requires API Key\x1b[0m"
        : "\x1b[36m✔ Free / Ready\x1b[0m";
    console.log(`• \x1b[1m${p.name}\x1b[0m [id: ${p.id}] - ${status}`);
    console.log(`  Description: ${p.description}`);
    console.log(`  Models:      ${p.supportedModels.join(", ")} (Default: ${p.defaultModel})`);
    console.log();
  }
}

async function handleStatus() {
  const creds = loadStoredCredentials();
  const config = loadConfig();
  const hasEnvToken = Boolean(process.env.AGY_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN);

  console.log("\n=================================================");
  console.log("   Claude Media Bridge - Status & Capabilities");
  console.log("=================================================\n");

  console.log("1. Direct Google Account (AGY OAuth):");
  if (hasEnvToken) {
    console.log("   Status:     ✔ Authenticated via environment variable");
    console.log(`   Project ID: ${process.env.AGY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "(auto-discovery on demand)"}`);
  } else if (creds && creds.accessToken) {
    const expired = isTokenExpired(creds.expiryDate);
    console.log(`   Status:     ✔ Authenticated${expired ? " (Token will auto-refresh on next use)" : " (Active)"}`);
    console.log(`   Account:    ${creds.email || "(Google Account)"}`);
    console.log(`   Project ID: ${creds.projectId || "(auto-discovery on demand)"}`);
    console.log(`   Storage:    ${getCredentialsPath()}`);
  } else {
    console.log("   Status:     ✖ Not logged in");
    console.log("   Action:     Run 'claude-media-bridge login' to connect your Google account.");
  }

  console.log("\n2. OmniRoute Proxy Fallback:");
  let omniOnline = false;
  try {
    const res = await fetch(`${config.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    omniOnline = res.ok;
  } catch {
    omniOnline = false;
  }
  console.log(`   Status:     ${omniOnline ? "✔ Connected" : "○ Unreachable (Optional fallback)"}`);
  console.log(`   URL:        ${config.baseUrl}`);

  console.log("\n3. Supported Models:");
  console.log("   • Nano Banana 2 (gemini-3.1-flash-image)  [Image Generation - Supported]");
  console.log("   • Android Gallery Sync & Media Scanner     [Supported on Android/Termux]");
  console.log("   • Google Veo Video                        [Requires Paid Gemini API Key]");
  console.log("   • Google Lyria Music                      [Requires Vertex AI]");
  console.log();
}

async function handleGenerate() {
  const promptIndex = args.findIndex((arg) => !arg.startsWith("-") && arg !== "generate");
  if (promptIndex === -1) {
    console.error("Error: Please provide an image prompt. Example: claude-media-bridge generate \"A futuristic city\"");
    process.exit(1);
  }

  const prompt = args[promptIndex];
  let aspectRatio = "1:1";
  let provider;
  let model;
  let outputDir;
  let filename;
  let openInGallery = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ratio" && args[i + 1]) aspectRatio = args[i + 1];
    if (args[i] === "--provider" && args[i + 1]) provider = args[i + 1];
    if (args[i] === "--model" && args[i + 1]) model = args[i + 1];
    if (args[i] === "--out" && args[i + 1]) outputDir = args[i + 1];
    if (args[i] === "--filename" && args[i + 1]) filename = args[i + 1];
    if (args[i] === "--open") openInGallery = true;
  }

  console.log(`Generating image (provider: ${provider || "auto"}, ratio: ${aspectRatio})...`);
  console.log(`Prompt: "${prompt}"\n`);

  try {
    const result = await generateImage({
      prompt,
      provider,
      model,
      aspectRatio,
      outputDir,
      filename,
      openInGallery,
    });

    console.log("✔ Image successfully generated!");
    console.log(`  File:        ${result.filePath}`);
    console.log(`  Size:        ${(result.fileSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Provider:    ${result.provider}`);
    console.log(`  Model:       ${result.model}`);
    console.log(`  Aspect:      ${result.aspectRatio}`);
    if (result.galleryPath) {
      console.log(`  Gallery:     ${result.galleryPath}`);
    }
  } catch (err) {
    console.error(`✖ Generation failed: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  if (!command) {
    // Start MCP Server
    await import("../dist/index.js");
    return;
  }

  switch (command) {
    case "login":
      try {
        await loginInteractive();
      } catch (err) {
        console.error(`Login failed: ${err.message}`);
        process.exit(1);
      }
      break;

    case "status":
      await handleStatus();
      break;

    case "providers":
      handleProviders();
      break;

    case "logout":
      clearStoredCredentials();
      console.log("✔ Stored credentials removed successfully.");
      break;

    case "generate":
      await handleGenerate();
      break;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
