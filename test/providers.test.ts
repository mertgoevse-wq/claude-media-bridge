import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildPollinationsUrl,
  getPollinationsDimensions,
} from "../dist/providers/pollinations.js";
import { getOpenAISize } from "../dist/providers/openai.js";
import { getFalImageSize } from "../dist/providers/fal.js";
import {
  resolveProvider,
  listProviders,
  ALL_PROVIDERS,
} from "../dist/providers/router.js";
import { setCredentialsDirectoryForTesting } from "../dist/auth/tokenStorage.js";

describe("Multi-Provider Architecture", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AGY_ACCESS_TOKEN;
    delete process.env.GOOGLE_ACCESS_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STABILITY_API_KEY;
    delete process.env.FAL_KEY;
    setCredentialsDirectoryForTesting("/tmp/empty-cmb-dir-that-does-not-exist");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setCredentialsDirectoryForTesting(null);
  });

  test("getPollinationsDimensions maps aspect ratios correctly", () => {
    assert.deepStrictEqual(getPollinationsDimensions("1:1"), { width: 1024, height: 1024 });
    assert.deepStrictEqual(getPollinationsDimensions("16:9"), { width: 1280, height: 720 });
    assert.deepStrictEqual(getPollinationsDimensions("9:16"), { width: 720, height: 1280 });
    assert.deepStrictEqual(getPollinationsDimensions("4:3"), { width: 1024, height: 768 });
  });

  test("buildPollinationsUrl crafts valid URL with query parameters", () => {
    const urlStr = buildPollinationsUrl("A serene mountain view", {
      model: "turbo",
      aspectRatio: "16:9",
    });
    const parsed = new URL(urlStr);
    assert.strictEqual(parsed.origin, "https://image.pollinations.ai");
    assert.ok(parsed.pathname.includes("A%20serene%20mountain%20view"));
    assert.strictEqual(parsed.searchParams.get("width"), "1280");
    assert.strictEqual(parsed.searchParams.get("height"), "720");
    assert.strictEqual(parsed.searchParams.get("model"), "turbo");
    assert.strictEqual(parsed.searchParams.get("nologo"), "true");
  });

  test("getOpenAISize maps ratios to DALL-E sizes", () => {
    assert.strictEqual(getOpenAISize("1:1"), "1024x1024");
    assert.strictEqual(getOpenAISize("16:9"), "1792x1024");
    assert.strictEqual(getOpenAISize("9:16"), "1024x1792");
    assert.strictEqual(getOpenAISize("4:3"), "1024x1024");
  });

  test("getFalImageSize maps ratios to Fal preset keys", () => {
    assert.strictEqual(getFalImageSize("1:1"), "square_hd");
    assert.strictEqual(getFalImageSize("16:9"), "landscape_16_9");
    assert.strictEqual(getFalImageSize("9:16"), "portrait_16_9");
    assert.strictEqual(getFalImageSize("4:3"), "landscape_4_3");
  });

  test("resolveProvider resolves by explicit provider name", () => {
    const p1 = resolveProvider("openai");
    assert.strictEqual(p1.id, "openai");

    const p2 = resolveProvider("stability");
    assert.strictEqual(p2.id, "stability");

    const p3 = resolveProvider("fal");
    assert.strictEqual(p3.id, "fal");

    const p4 = resolveProvider("pollinations");
    assert.strictEqual(p4.id, "pollinations");
  });

  test("resolveProvider resolves by model name", () => {
    const p1 = resolveProvider(undefined, "dall-e-3");
    assert.strictEqual(p1.id, "openai");

    const p2 = resolveProvider(undefined, "sd3.5-large");
    assert.strictEqual(p2.id, "stability");

    const p3 = resolveProvider(undefined, "flux-schnell");
    assert.strictEqual(p3.id, "fal");

    const p4 = resolveProvider(undefined, "gemini-3.1-flash-image");
    assert.strictEqual(p4.id, "google");
  });

  test("resolveProvider falls back to Pollinations when no keys are configured", () => {
    const provider = resolveProvider();
    assert.strictEqual(provider.id, "pollinations");
  });

  test("listProviders returns metadata for all 5 providers", () => {
    const list = listProviders();
    assert.strictEqual(list.length, 5);
    const ids = list.map((p) => p.id);
    assert.ok(ids.includes("google"));
    assert.ok(ids.includes("openai"));
    assert.ok(ids.includes("stability"));
    assert.ok(ids.includes("fal"));
    assert.ok(ids.includes("pollinations"));
  });
});
