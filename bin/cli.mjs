#!/usr/bin/env node
import readline from "node:readline";
import {
  loginInteractive,
} from "../dist/auth/googleOAuth.js";
import {
  loadStoredCredentials,
  clearStoredCredentials,
  getCredentialsPath,
  isTokenExpired,
  loadBridgeState,
  saveProviderKey,
  clearProviderKey,
} from "../dist/auth/tokenStorage.js";
import { generateImage, listProviders } from "../dist/client.js";
import { loadConfig } from "../dist/config.js";
import { runSetup, runUninstall } from "../dist/setup/wizard.js";
import { runWebSetup } from "../dist/setup/web.js";
import { PROVIDER_CATALOG, findCatalogEntry } from "../dist/setup/catalog.js";
import {
  registerMcpServer,
  unregisterMcpServer,
  getCliPath,
  getUserSettingsPath,
} from "../dist/setup/claudeCode.js";

const args = process.argv.slice(2);
const command = args[0];

const c = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
};

const useColor = () =>
  Boolean(process.env.FORCE_COLOR) || (process.stdout.isTTY && !process.env.NO_COLOR);

function paint(color, text) {
  return useColor() ? `${color}${text}${c.reset}` : text;
}

function printHelp() {
  console.log(`
${paint(c.bold, "Claude Media Bridge")} ${paint(c.dim, "- media generation for Claude Code and any MCP client")}

USAGE
  claude-media-bridge <command> [options]

COMMANDS
  setup                One-time setup: registers the MCP server and connects providers.
    --web              Open the setup page in a browser instead of prompting.
    --yes              Accept defaults, no prompts.
    --no-login         Skip the Google sign-in step.
  status               Show authentication, providers and the active default.
  providers            List every provider with its real cost and setup state.
  models               List every provider/model pair you can request.
  login                Sign in with Google (one click, opens a browser).
  auth <provider>      Save an API key for a provider.
  auth list            Show which API keys are stored.
  auth remove <provider>
  uninstall            Delete stored credentials.
  generate <prompt>    Generate an image.
  mcp                  Start the MCP server on stdio (used by Claude Code).
  help                 Show this message.

GENERATE OPTIONS
  --provider <name>    google, gemini, pollinations, fal, stability, openai, higgsfield
  --model <name>       e.g. gemini-3.1-flash-image, flux, soul-2
  --ratio <ratio>      1:1 (default), 16:9, 9:16, 4:3, 3:4
  --out <dir>          Output directory (default: ~/media/images)
  --filename <name>    Output filename without extension
  --open               Open the result on Android

EXAMPLES
  claude-media-bridge setup
  claude-media-bridge setup --web
  claude-media-bridge generate "a glass monolith at dusk" --ratio 16:9
  claude-media-bridge generate "nordic fjord" --provider pollinations
`);
}

function printProviders() {
  const state = loadBridgeState();
  const keys = state?.providerKeys ?? {};

  console.log();
  console.log(`  ${paint(c.bold, "Providers")}`);
  console.log(`  ${paint(c.dim, "-".repeat(72))}`);
  console.log(
    `  ${"PROVIDER".padEnd(12)} ${"COST".padEnd(11)} ${"SETUP".padEnd(13)} MODELS`
  );

  for (const entry of PROVIDER_CATALOG) {
    let setupState;
    if (entry.auth === "none") {
      setupState = "ready";
    } else if (entry.auth === "oauth") {
      setupState = state?.accessToken ? "signed in" : "not signed in";
    } else {
      const name = entry.keyName;
      setupState = process.env[name]?.trim()
        ? "env"
        : keys[name]?.trim()
          ? "key saved"
          : "no key";
    }

    const ok = ["ready", "signed in", "key saved", "env"].includes(setupState);
    // Pad before colouring so escape codes never inflate the column width.
    const marker = ok ? paint(c.green, "ok  ") : paint(c.dim, "--  ");
    const costLabel = entry.cost.padEnd(10);
    const cost = entry.cost === "paid" ? paint(c.yellow, costLabel) : paint(c.green, costLabel);

    console.log(`  ${entry.id.padEnd(12)} ${cost} ${marker} ${setupState}`);
    console.log(`  ${" ".repeat(12)} ${" ".repeat(10)}    ${paint(c.dim, entry.models.join(", "))}`);
  }

  console.log();
  console.log(`  ${paint(c.dim, "Free means no key and no billing. Free tier means a vendor quota.")}`);
  console.log(`  ${paint(c.dim, "Paid providers need a key: claude-media-bridge auth <provider>")}`);
  console.log();
}

function printModels() {
  console.log();
  for (const p of listProviders()) {
    const tag = p.isConfigured ? paint(c.green, "ready") : paint(c.dim, p.requiresApiKey ? "needs key" : "ready");
    console.log(`  ${paint(c.bold, p.id)} ${paint(c.dim, `(${p.name})`)} ${tag}`);
    for (const model of p.supportedModels) {
      const isDefault = model === p.defaultModel;
      console.log(`    ${isDefault ? paint(c.cyan, "*") : " "} ${model}${isDefault ? paint(c.dim, " (default)") : ""}`);
    }
  }
  console.log();
}

async function handleStatus() {
  const state = loadBridgeState();
  const creds = loadStoredCredentials();
  const config = loadConfig();

  console.log();
  console.log(`  ${paint(c.bold, "Status")}`);
  console.log(`  ${paint(c.dim, "-".repeat(50))}`);

  const googleOk = Boolean(creds?.accessToken);
  console.log(
    `  Google account    ${googleOk ? paint(c.green, "signed in") : paint(c.dim, "not signed in")}${
      googleOk ? paint(c.dim, `  ${creds.email ?? ""}${creds.projectId ? `  project ${creds.projectId}` : ""}`) : ""
    }`
  );

  const keyNames = Object.keys(state?.providerKeys ?? {});
  console.log(
    `  API keys          ${keyNames.length > 0 ? paint(c.cyan, keyNames.join(", ")) : paint(c.dim, "none stored")}`
  );
  console.log(`  Credentials file  ${paint(c.dim, getCredentialsPath())}`);

  const live = listProviders();
  const configured = live.filter((p) => p.isConfigured);
  console.log(
    `  Ready to generate ${configured.length > 0 ? paint(c.green, configured.map((p) => p.id).join(", ")) : paint(c.yellow, "free FLUX fallback")}`
  );
  console.log(`  Output directory  ${paint(c.dim, config.defaultOutputDir)}`);

  let omni = "unreachable";
  try {
    const res = await fetch(`${config.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(2500),
    });
    omni = res.ok ? paint(c.green, "connected") : paint(c.dim, `http ${res.status}`);
  } catch {
    omni = paint(c.dim, "unreachable");
  }
  console.log(`  OmniRoute         ${omni} ${paint(c.dim, config.baseUrl)}`);

  console.log();
  console.log(`  ${paint(c.dim, "In chat: /claude-media-bridge <prompt>")}`);
  console.log();
}

function parseGenerateOptions(argv) {
  const opts = {
    aspectRatio: "1:1",
    provider: undefined,
    model: undefined,
    outputDir: undefined,
    filename: undefined,
    openInGallery: false,
    prompt: argv.filter((a) => !a.startsWith("--")).join(" ").trim(),
  };

  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "--ratio" && next) opts.aspectRatio = next;
    if (argv[i] === "--provider" && next) opts.provider = next;
    if (argv[i] === "--model" && next) opts.model = next;
    if (argv[i] === "--out" && next) opts.outputDir = next;
    if (argv[i] === "--filename" && next) opts.filename = next;
    if (argv[i] === "--open") opts.openInGallery = true;
  }

  return opts;
}

async function handleGenerate() {
  const opts = parseGenerateOptions(args.slice(1));

  if (!opts.prompt) {
    console.error(`Error: provide a prompt. Example: claude-media-bridge generate "a glass monolith"`);
    process.exit(1);
  }

  const label = opts.provider ?? opts.model ?? "auto";
  process.stderr.write(`  ${paint(c.dim, `generating via ${label} ...`)}\n`);

  try {
    const result = await generateImage(opts);

    console.log();
    console.log(`  ${paint(c.green, "done")}`);
    console.log(`  file      ${result.filePath}`);
    console.log(`  size      ${(result.fileSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  provider  ${result.provider} (${result.model})`);
    console.log(`  ratio     ${result.aspectRatio}`);
    if (result.galleryPath) console.log(`  gallery   ${result.galleryPath}`);
    console.log();
  } catch (err) {
    console.error(`\n  ${paint(c.red, "failed")} ${err.message}\n`);
    process.exit(1);
  }
}

function handleAuth(argv) {
  const sub = argv[0];

  if (!sub || sub === "list") {
    const keys = loadBridgeState()?.providerKeys ?? {};
    console.log();
    if (Object.keys(keys).length === 0) {
      console.log(`  ${paint(c.dim, "No API keys stored. Add one with: claude-media-bridge auth <provider>")}`);
    }
    for (const [name, value] of Object.entries(keys)) {
      const masked = `${value.slice(0, 4)}${"*".repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
      console.log(`  ${name.padEnd(22)} ${paint(c.dim, masked)}`);
    }
    console.log();
    return;
  }

  if (sub === "remove") {
    const entry = findCatalogEntry(argv[1] ?? "");
    if (!entry?.keyName) {
      console.error(`Unknown provider. Try: ${keyCatalogIds().join(", ")}`);
      process.exit(1);
    }
    clearProviderKey(entry.keyName);
    console.log(`  ${paint(c.green, "removed")} ${entry.keyName}`);
    return;
  }

  const entry = findCatalogEntry(sub);
  if (!entry) {
    console.error(`Unknown provider '${sub}'. Available: ${keyCatalogIds().join(", ")}`);
    process.exit(1);
  }
  if (entry.auth !== "api-key") {
    console.error(`${entry.name} does not use an API key. Run: claude-media-bridge login`);
    process.exit(1);
  }

  console.log();
  console.log(`  ${paint(c.bold, entry.name)}`);
  console.log(`  ${paint(c.dim, entry.costNote)}`);
  if (entry.signupUrl) console.log(`  ${paint(c.dim, `key: ${entry.signupUrl}`)}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`\n  Paste key (Enter to cancel): `, (value) => {
    rl.close();
    const key = value.trim();
    if (!key) {
      console.log(`  ${paint(c.dim, "cancelled")}`);
      return;
    }
    saveProviderKey(entry.keyName, key);
    console.log(`  ${paint(c.green, "saved")} ${entry.keyName} to ${getCredentialsPath()}`);
  });
}

function keyCatalogIds() {
  return PROVIDER_CATALOG.filter((p) => p.auth === "api-key").map((p) => p.id);
}

async function main() {
  switch (command) {
    case undefined:
      await import("../dist/index.js");
      return;

    case "mcp":
      await import("../dist/index.js");
      return;

    case "setup": {
      const web = args.includes("--web");
      const yes = args.includes("--yes") || args.includes("-y");

      if (web) {
        await runWebSetup({});
        return;
      }

      const report = await runSetup({
        nonInteractive: yes,
        loginGoogle: !args.includes("--no-login"),
        skipClaudeCode: args.includes("--skip-claude-code"),
      });

      console.log();
      for (const action of report.actions) console.log(`  ${paint(c.green, "+")} ${action}`);
      for (const warning of report.warnings) console.log(`  ${paint(c.yellow, "!")} ${warning}`);

      console.log();
      console.log(`  ${paint(c.bold, "Setup complete.")}`);
      console.log(`  ${paint(c.dim, "In Claude Code run:")} ${paint(c.cyan, "/claude-media-bridge nano-banana a glass monolith at dusk")}`);
      console.log(`  ${paint(c.dim, "Not ready? Run: claude-media-bridge setup --web")}`);
      console.log();
      break;
    }

    case "status":
      await handleStatus();
      break;

    case "providers":
      printProviders();
      break;

    case "models":
      printModels();
      break;

    case "login": {
      try {
        const creds = await loginInteractive({});
        console.log();
        console.log(`  ${paint(c.green, "signed in")}${creds.email ? paint(c.dim, `  ${creds.email}`) : ""}`);
        console.log(`  ${paint(c.dim, "Nano Banana 2 is ready.")}`);
        console.log();
      } catch (err) {
        console.error(`\n  ${paint(c.red, "login failed")} ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case "auth":
      handleAuth(args.slice(1));
      break;

    case "logout":
      clearStoredCredentials();
      console.log(`  ${paint(c.green, "removed")} Google credentials`);
      break;

    case "uninstall":
      runUninstall();
      unregisterMcpServer();
      console.log(`  ${paint(c.green, "removed")} MCP registration from ${getUserSettingsPath()}`);
      console.log(`  ${paint(c.dim, `binary stays at ${getCliPath()}`)}`);
      break;

    case "register":
      registerMcpServer();
      console.log(`  ${paint(c.green, "registered")} media-bridge in ${getUserSettingsPath()}`);
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
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err?.message ?? err}`);
  process.exit(1);
});