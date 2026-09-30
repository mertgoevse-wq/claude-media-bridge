import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildCloudCodeImagePayload,
  parseCloudCodeImageResponse,
} from "../src/client/agyDirect.ts";

describe("Direct AGY Cloud Code Client", () => {
  test("buildCloudCodeImagePayload crafts valid Cloud Code envelope", () => {
    const payload = buildCloudCodeImagePayload({
      prompt: "A beautiful minimalist synthesizer in a dark studio",
      projectId: "my-cloudcode-project-123",
      aspectRatio: "16:9",
    });

    assert.strictEqual(payload.project, "my-cloudcode-project-123");
    assert.strictEqual(payload.model, "gemini-3.1-flash-image");
    assert.strictEqual(payload.requestType, "image_gen");
    assert.ok(payload.requestId.startsWith("image_gen/"));

    assert.strictEqual(payload.request.contents.length, 1);
    assert.strictEqual(payload.request.contents[0].role, "user");
    assert.strictEqual(
      payload.request.contents[0].parts[0].text,
      "A beautiful minimalist synthesizer in a dark studio"
    );
    assert.strictEqual(
      payload.request.generationConfig.imageConfig.aspectRatio,
      "16:9"
    );
    assert.strictEqual(payload.request.generationConfig.candidateCount, 1);
  });

  test("parseCloudCodeImageResponse extracts base64 image data", () => {
    const fakeRawBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "A revised descriptive prompt for synthesizer",
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: fakeRawBase64,
                },
              },
            ],
          },
        },
      ],
    };

    const parsed = parseCloudCodeImageResponse(mockApiResponse, "original prompt");
    assert.strictEqual(parsed.b64_json, fakeRawBase64);
    assert.strictEqual(parsed.revised_prompt, "A revised descriptive prompt for synthesizer");
  });

  test("parseCloudCodeImageResponse throws error on missing image parts", () => {
    const emptyResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Only text returned, no image" }],
          },
        },
      ],
    };

    assert.throws(
      () => {
        parseCloudCodeImageResponse(emptyResponse, "test prompt");
      },
      (err: Error) => {
        return err.message.includes("No image data found in Cloud Code response");
      }
    );
  });
});
