import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import {
  loadBridgeState,
  saveProviderKey,
  saveBridgeState,
  clearStoredCredentials,
  clearProviderKey,
  type ProviderKeyName,
} from "../auth/tokenStorage.js";
import { loginInteractive } from "../auth/googleOAuth.js";
import { listProviders, resolveProvider } from "../providers/router.js";
import { registerMcpServer, installSlashCommand, getCliPath, getUserSettingsPath } from "./claudeCode.js";
import { PROVIDER_CATALOG, findCatalogEntry, keyCatalogEntries } from "./catalog.js";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const supportsColor = Boolean(process.env.FORCE_COLOR) || (process.stdout.isTTY && !process.env.NO_COLOR);

function paint(code: string, text: string): string {
  return supportsColor ? `${code}${text}${RESET}` : text;
}

export interface SetupOptions {
  /** Skip every prompt and apply the free defaults. */
  nonInteractive?: boolean;
  /** Prompt for Google sign-in during setup. */
  loginGoogle?: boolean;
  /** Do not touch Claude Code settings. */
  skipClaudeCode?: boolean;
}

function line(char = "-", width = 62): string {
  return paint(DIM, char.repeat(width));
}

function heading(title: string): void {
  console.log();
  console.log(`  ${paint(BOLD, title)}`);
  console.log(`  ${line()}`);
}

function keyStatus(name: ProviderKeyName): string {
  const stored = loadBridgeState()?.providerKeys?.[name];
  const fromEnv = process.env[name];
  if (fromEnv?.trim()) return paint(YELLOW, "set via env");
  if (stored) return paint(GREEN, "configured");
  return paint(DIM, "not set");
}

async function askYesNo(rl: readline.Interface, question: string, fallback: boolean): Promise<boolean> {
  const suffix = fallback ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`  ${question} ${suffix} `)).trim().toLowerCase();
  if (!answer) return fallback;
  return answer === "y" || answer === "yes";
}

export interface SetupReport {
  actions: string[];
  warnings: string[];
}

/**
 * One-time setup. Safe to re-run: existing keys are kept unless overwritten and
 * nothing is ever printed in full.
 */
export async function runSetup(options: SetupOptions = {}): Promise<SetupReport> {
  const actions: string[] = [];
  const warnings: string[] = [];

  console.log();
  console.log(`  ${paint(BOLD, "Claude Media Bridge")} ${paint(DIM, "setup")}`);
  console.log(`  ${line("=")}`);

  // ---- 1. Claude Code registration -------------------------------------
  heading("1/4  Claude Code");

  if (options.skipClaudeCode) {
    console.log(`  ${paint(YELLOW, "skipped")} ${paint(DIM, "(--skip-claude-code)")}`);
  } else {
    try {
      const result = registerMcpServer();
      actions.push(
        result.changed
          ? `Registered MCP server '${"media-bridge"}' in ${result.settingsPath}`
          : `MCP server already registered in ${result.settingsPath}`
      );
      console.log(`  ${paint(GREEN, result.changed ? "+" : "=")} ${result.reason}`);
    } catch (err) {
      warnings.push(
        `Could not update ${getUserSettingsPath()}: ${err instanceof Error ? err.message : String(err)}`
      );
      console.log(`  ${paint(YELLOW, "!")} could not write settings, see warnings at the end`);
    }

    try {
      const command = installSlashCommand();
      actions.push(
        command.changed
          ? `Installed /claude-media-bridge in ${command.path}`
          : `/claude-media-bridge already installed at ${command.path}`
      );
      console.log(
        `  ${paint(GREEN, command.changed ? "+" : "=")} /claude-media-bridge ${paint(DIM, command.changed ? "installed" : "present")}`
      );
    } catch (err) {
      warnings.push(
        `Could not install the /claude-media-bridge command: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  console.log(`  ${paint(DIM, `tools run via: ${getCliPath()}`)}`);

  // ---- 2. Providers -----------------------------------------------------
  heading("2/4  Providers");

  const needsPrompt = !options.nonInteractive && Boolean(process.stdin.isTTY);
  const rl = needsPrompt ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

  for (const entry of PROVIDER_CATALOG) {
    const status =
      entry.auth === "api-key"
        ? keyStatus(entry.keyName!)
        : entry.auth === "oauth"
          ? loadBridgeState()?.accessToken
            ? paint(GREEN, "connected")
            : paint(YELLOW, "not connected")
          : paint(DIM, "no key needed");
    console.log(
      `  ${paint(CYAN, "*")} ${entry.name.padEnd(34)} ${paint(DIM, entry.cost.padEnd(10))} ${status}`
    );
  }

  if (rl) {
    const wantGoogle = await askYesNo(
      rl,
      `Sign in with Google now for Nano Banana 2? ${paint(DIM, "(free, no API key)")}`,
      true
    );

    if (wantGoogle) {
      try {
        const creds = await loginInteractive({ interactive: false, openBrowser: true });
        actions.push(`Signed in to Google${creds.email ? ` (${creds.email})` : ""}`);
        console.log(`  ${paint(GREEN, "+")} Google account connected`);
      } catch (err) {
        warnings.push(`Google sign-in did not complete: ${err instanceof Error ? err.message : String(err)}`);
        console.log(`  ${paint(YELLOW, "!")} sign-in did not complete, run '${paint(CYAN, "claude-media-bridge login")}' later`);
      }
    }

    console.log();
    console.log(`  ${paint(DIM, "Paste an API key for any paid or key-based provider.")}`);
    console.log(`  ${paint(DIM, "Press Enter to skip. Nano Banana 2 and free FLUX need no key.")}`);

    for (const entry of keyCatalogEntries()) {
      const alreadySet = Boolean(loadBridgeState()?.providerKeys?.[entry.keyName!]);
      const prompt = alreadySet
        ? `  ${entry.name} - keep current key?`
        : `  ${entry.name} (${entry.cost}) - paste key or Enter to skip`;
      const answer = (await rl.question(`${prompt}\n    > `)).trim();

      if (!answer) continue;

      if (alreadySet && !/^y(es)?$/i.test(answer)) {
        saveProviderKey(entry.keyName!, answer);
        actions.push(`Saved ${entry.keyName}`);
        console.log(`    ${paint(GREEN, "+")} saved`);
      }
    }

    rl.close();
  } else {
    console.log(`  ${paint(DIM, "non-interactive: skipping credential prompts")}`);
  }

  // ---- 3. Defaults ------------------------------------------------------
  heading("3/4  Defaults");

  const live = listProviders();
  const configured = live.filter((p) => p.isConfigured);
  const choice = configured.length > 0 ? configured[0] : resolveProvider();

  console.log(
    `  provider: ${paint(CYAN, choice.id)}  ${paint(DIM, `(${choice.name}, ${choice.defaultModel})`)}`
  );

  // Persist regardless of TTY: --yes must still leave a usable configuration.
  const existing = loadBridgeState();
  if (existing?.defaultProvider !== choice.id || existing?.defaultModel !== choice.defaultModel) {
    saveBridgeState({
      ...existing,
      defaultProvider: choice.id,
      defaultModel: choice.defaultModel,
    });
    actions.push(`Default provider set to ${choice.id} (${choice.defaultModel})`);
  } else {
    actions.push(`Default provider unchanged (${choice.id})`);
  }

  // ---- 4. Verify --------------------------------------------------------
  heading("4/4  Verify");

  const googleOk = Boolean(loadBridgeState()?.accessToken);
  console.log(`  Google account      ${googleOk ? paint(GREEN, "connected") : paint(YELLOW, "not connected")}`);
  console.log(`  Default provider    ${paint(CYAN, resolveProvider().id)}`);

  const outputDir = loadBridgeState()?.outputDir ?? path.join(os.homedir(), "media", "images");
  console.log(`  Output directory    ${paint(CYAN, outputDir)}`);

  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      actions.push(`Created output directory ${outputDir}`);
    } catch {
      warnings.push(`Could not create ${outputDir}`);
    }
  }

  return { actions, warnings };
}

/** Removes every stored credential. */
export function runUninstall(): void {
  clearStoredCredentials();

  const state = loadBridgeState();
  for (const key of Object.keys(state?.providerKeys ?? {}) as ProviderKeyName[]) {
    clearProviderKey(key);
  }

  console.log(`  ${paint(GREEN, "+")} removed stored credentials`);
  console.log(`  ${paint(DIM, "Run 'claude-media-bridge setup' again to reconnect.")}`);
}

export { findCatalogEntry };