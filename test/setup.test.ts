import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGeminiImageResponse, GEMINI_IMAGE_MODELS } from "../dist/providers/gemini.js";
import { PROVIDER_CATALOG, findCatalogEntry } from "../dist/setup/catalog.js";
import {
  registerMcpServer,
  unregisterMcpServer,
  isMcpRegistered,
  getCliPath,
  MCP_SERVER_NAME,
} from "../dist/setup/claudeCode.js";
import {
  saveProviderKey,
  loadProviderKeys,
  clearProviderKey,
  saveStoredCredentials,
  loadStoredCredentials,
  loadBridgeState,
  setCredentialsDirectoryForTesting,
} from "../dist/auth/tokenStorage.js";
import { buildOutputPath } from "../dist/util/saveImage.js";
import { slugify } from "../dist/config.js";

const TMP_ROOT = path.join(os.tmpdir(), `cmb-setup-${process.pid}`);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Gemini response parsing", () => {
  test("extracts the first inline image part", () => {
    const parsed = parseGeminiImageResponse({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
            ],
          },
        },
      ],
    });
    assert.strictEqual(parsed.base64, "aGVsbG8=");
    assert.strictEqual(parsed.mimeType, "image/png");
  });

  test("captures leading text as the revised prompt", () => {
    const parsed = parseGeminiImageResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: "A brass compass on a chart" },
              { inlineData: { mimeType: "image/jpeg", data: "aGk=" } },
            ],
          },
        },
      ],
    });
    assert.strictEqual(parsed.revisedPrompt, "A brass compass on a chart");
  });

  test("throws with the model message when no image comes back", () => {
    assert.throws(
      () =>
        parseGeminiImageResponse({
          candidates: [{ content: { parts: [{ text: "I cannot do that." }] } }],
        }),
      /I cannot do that/
    );
  });

  test("throws on an empty response", () => {
    assert.throws(() => parseGeminiImageResponse({}), /no image data/i);
  });

  test("nano banana models are catalogued with the free tier first", () => {
    const defaults = GEMINI_IMAGE_MODELS.filter((m) => m.cost === "free-tier");
    assert.ok(defaults.length >= 1);
    assert.strictEqual(GEMINI_IMAGE_MODELS[0].id, "gemini-3.1-flash-image");
  });
});

describe("Provider catalog", () => {
  test("every api-key entry names a key and a signup url", () => {
    for (const entry of PROVIDER_CATALOG.filter((p) => p.auth === "api-key")) {
      assert.ok(entry.keyName, `${entry.id} must declare a keyName`);
      assert.ok(entry.signupUrl, `${entry.id} must declare a signupUrl`);
    }
  });

  test("only google uses oauth and it needs no key", () => {
    const oauth = PROVIDER_CATALOG.filter((p) => p.auth === "oauth");
    assert.deepStrictEqual(
      oauth.map((p) => p.id),
      ["google"]
    );
    assert.strictEqual(oauth[0].keyName, undefined);
  });

  test("pollinations is the keyless provider", () => {
    assert.deepStrictEqual(
      PROVIDER_CATALOG.filter((p) => p.auth === "none").map((p) => p.id),
      ["pollinations"]
    );
  });

  test("paid providers never claim to be free", () => {
    for (const entry of PROVIDER_CATALOG.filter((p) => p.cost === "paid")) {
      const note = entry.costNote.toLowerCase();
      // "free" may appear only in a denial such as "no free tier".
      const claimsFree = /(?<!no )(?<!not )\bfree\b/.test(note);
      assert.ok(!claimsFree, `${entry.id} must not imply it is free: "${entry.costNote}"`);
    }
  });

  test("findCatalogEntry is case insensitive and rejects unknowns", () => {
    assert.strictEqual(findCatalogEntry("GEMINI")?.id, "gemini");
    assert.strictEqual(findCatalogEntry("nope"), undefined);
  });
});

describe("Claude Code registration", () => {
  const settingsPath = path.join(TMP_ROOT, "settings.json");

  beforeEach(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(TMP_ROOT, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  test("registers the server and enables project mcp servers", () => {
    const result = registerMcpServer(settingsPath);
    assert.strictEqual(result.changed, true);

    const written = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(written.mcpServers[MCP_SERVER_NAME]);
    assert.strictEqual(written.mcpServers[MCP_SERVER_NAME].command, process.execPath);
    assert.deepStrictEqual(written.mcpServers[MCP_SERVER_NAME].args, [getCliPath(), "mcp"]);
    assert.strictEqual(written.enableAllProjectMcpServers, true);
    assert.strictEqual(isMcpRegistered(settingsPath), true);
  });

  test("is idempotent", () => {
    registerMcpServer(settingsPath);
    const second = registerMcpServer(settingsPath);
    assert.strictEqual(second.changed, false);
    assert.strictEqual(second.reason, "already registered");
  });

  test("preserves unrelated settings", () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: "dark", mcpServers: { other: {} } }));
    registerMcpServer(settingsPath);
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(written.theme, "dark");
    assert.ok(written.mcpServers.other);
  });

  test("repairs a broken entry", () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: null } }));
    const result = registerMcpServer(settingsPath);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.reason, "repaired existing entry");
  });

  test("removes the registration", () => {
    registerMcpServer(settingsPath);
    assert.strictEqual(unregisterMcpServer(settingsPath).changed, true);
    assert.strictEqual(isMcpRegistered(settingsPath), false);
    assert.strictEqual(unregisterMcpServer(settingsPath).changed, false);
  });

  test("tolerates malformed settings json", () => {
    fs.writeFileSync(settingsPath, "{ not json");
    const result = registerMcpServer(settingsPath);
    assert.strictEqual(result.changed, true);
  });
});

describe("Plugin manifests", () => {
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

  test("the plugin name is not a reserved Anthropic name", () => {
    const manifest = JSON.parse(read(".claude-plugin/plugin.json")) as { name: string };
    assert.ok(
      !manifest.name.startsWith("claude-"),
      "plugin names starting with claude- are reserved"
    );
    assert.notStrictEqual(manifest.name, "claude-code");
  });

  test("the marketplace advertises the same plugin", () => {
    const marketplace = JSON.parse(read(".claude-plugin/marketplace.json")) as {
      plugins: Array<{ name: string; version: string }>;
      description?: string;
    };
    const manifest = JSON.parse(read(".claude-plugin/plugin.json")) as {
      name: string;
      version: string;
    };
    assert.strictEqual(marketplace.plugins[0].name, manifest.name);
    assert.strictEqual(marketplace.plugins[0].version, manifest.version);
    assert.ok(marketplace.description, "marketplace needs a description");
  });

  test("the mcp server entry points at the cli with the data dir on NODE_PATH", () => {
    const mcp = JSON.parse(read(".mcp.json")) as {
      mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
    };
    const server = mcp.mcpServers[MCP_SERVER_NAME];
    assert.ok(server, "mcp.json must declare the bridge server");
    assert.deepStrictEqual(server.args.slice(1), ["mcp"]);
    assert.match(server.args[0], /bin\/cli\.mjs$/);
    assert.strictEqual(server.env?.NODE_PATH, "${CLAUDE_PLUGIN_DATA}/node_modules");
  });

  test("the slash command and the skill agree on arguments", () => {
    const command = read("commands/claude-media-bridge.md");
    const skill = read("skills/claude-media-bridge/SKILL.md");
    for (const text of [command, skill]) {
      assert.match(text, /name: claude-media-bridge/);
      assert.match(text, /generate_image/);
      assert.match(text, /connect_account/);
    }
  });
});

describe("Credential store", () => {
  const credDir = path.join(TMP_ROOT, "creds");

  beforeEach(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(credDir, { recursive: true });
    setCredentialsDirectoryForTesting(credDir);
  });

  afterEach(() => {
    setCredentialsDirectoryForTesting(null);
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  test("stores and clears provider keys", () => {
    saveProviderKey("GEMINI_API_KEY", "secret-key");
    assert.deepStrictEqual(loadProviderKeys(), { GEMINI_API_KEY: "secret-key" });

    clearProviderKey("GEMINI_API_KEY");
    assert.deepStrictEqual(loadProviderKeys(), {});
  });

  test("saving google credentials keeps stored api keys", () => {
    saveProviderKey("FAL_KEY", "fal-secret");
    saveStoredCredentials({ accessToken: "token", email: "a@b.c" });

    assert.deepStrictEqual(loadProviderKeys(), { FAL_KEY: "fal-secret" });
    assert.strictEqual(loadStoredCredentials()?.accessToken, "token");
  });

  test("works with only api keys and no google token", () => {
    saveProviderKey("STABILITY_API_KEY", "sk-test");
    assert.strictEqual(loadStoredCredentials(), null);
    assert.strictEqual(loadBridgeState()?.providerKeys?.STABILITY_API_KEY, "sk-test");
  });

  test("keys are trimmed and the file is not world readable", () => {
    saveProviderKey("OPENAI_API_KEY", "  sk-trimmed  ");
    assert.strictEqual(loadProviderKeys().OPENAI_API_KEY, "sk-trimmed");

    const mode = fs.statSync(path.join(credDir, "credentials.json")).mode & 0o777;
    assert.strictEqual(mode, 0o600);
  });
});

describe("Version consistency", () => {
  test("the MCP server reports the package version", async () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")
    ) as { version: string };
    const { createMediaServer } = await import("../dist/server.js");
    const server = createMediaServer();
    // The SDK does not expose the manifest, so assert on the source constant.
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "server.ts"), "utf8");
    assert.match(source, new RegExp(`const VERSION = "${pkg.version.replace(/\./g, "\\.")}"`));
    assert.ok(server);
  });
});

describe("Output paths", () => {
  test("builds a timestamped name from the prompt", () => {
    const out = buildOutputPath({
      prompt: "A glass monolith at dusk!",
      outputDir: path.join(TMP_ROOT, "out"),
    });
    assert.ok(path.basename(out).startsWith("a-glass-monolith-at-dusk-"));
    assert.ok(out.endsWith(".jpg"));
  });

  test("honours an explicit filename and extension", () => {
    const out = buildOutputPath({
      prompt: "ignored",
      filename: "hero-shot.png",
      outputDir: path.join(TMP_ROOT, "out"),
      extension: "png",
    });
    assert.strictEqual(path.basename(out), "hero-shot.png");
  });

  test("creates the output directory", () => {
    const dir = path.join(TMP_ROOT, "nested", "images");
    buildOutputPath({ prompt: "x", outputDir: dir });
    assert.ok(fs.existsSync(dir));
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  test("slugify keeps names filesystem safe", () => {
    assert.strictEqual(slugify("Hello / World: *test*"), "hello-world-test");
    assert.strictEqual(slugify("///"), "image");
  });
});