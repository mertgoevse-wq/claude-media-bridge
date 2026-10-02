---
name: claude-media-bridge
description: Generate images from chat using Nano Banana 2 (Google), FLUX, Stable Diffusion, DALL-E, Recraft or Higgsfield. Use when the user runs /claude-media-bridge, asks to generate or create an image, picture, illustration, logo, mockup or wallpaper, asks to connect or sign in to a media provider, or asks which image models are available. Triggers on "generate an image", "make me a picture", "nano banana", "flux", "image model".
argument-hint: "[model or provider] [prompt] | setup | login | connect | models | status"
---

# Claude Media Bridge

Generate real image files from this chat and save them to disk. Images land in
`~/media/images/` unless the user says otherwise, and on Android they are copied
into the gallery.

## Parse the arguments

Everything after `/claude-media-bridge` is `$ARGUMENTS`. Read it and pick one
branch. Arguments are optional.

| Input | Do this |
| :--- | :--- |
| empty | Show status and what to do next (see **No arguments**) |
| `setup` | Call `run_setup`, then tell the user how to finish |
| `status` | Call `check_media_capabilities` and summarise it |
| `models` or `list` | Call `list_media_models` and print the table |
| `login` or `connect` | Call `connect_account` (see **Connect**) |
| `<model> <prompt>` | Generate with that model (see **Generate**) |
| `<prompt>` only | Generate with the default provider |

If the first word is a known provider or model name and more text follows, it is
the model selector and the rest is the prompt. Known names include
`nano-banana`, `gemini`, `aistudio`, `flux`, `sd`, `stability`, `dall-e`,
`openai`, `soul`, `higgsfield`, `pollinations`, and raw model ids such as
`gemini-3.1-flash-image` or `flux-schnell`.

If the first word is a single token that is not a known name, treat the whole
string as the prompt rather than guessing.

## No arguments

Call `check_media_capabilities`, then reply with a short status block:

- Which providers are ready right now.
- The default provider and model.
- One concrete next step. If nothing is configured, say so plainly and give the
  exact command: `claude-media-bridge setup`.

Keep it under ten lines. Do not generate an image unless the user asked.

## Connect

For Google, call:

```
connect_account(provider: "google")
```

This opens the user's browser and completes the sign-in over loopback. Tell the
user to approve the request in the browser, and do not block on anything else
while waiting.

For a key-based provider, first tell the user where to get the key and what it
costs, then ask them to paste it, then call:

```
connect_account(provider: "<id>", api_key: "<the key they pasted>")
```

Never invent a key and never ask the user to paste a key into chat if they would
rather not. The terminal alternative is `claude-media-bridge auth <provider>`,
which stores it in a `0600` file instead.

## Generate

Call `generate_image` with the prompt, plus `model` and/or `provider` when the
user named one, and `aspect_ratio` when the user implies a shape.

Prompt handling:

- Expand short prompts into a specific visual description before generating.
  Name the subject, the setting, the light, the camera or medium, and the mood.
  Do not add style keywords the user did not ask for.
- Keep the user's own wording intact. Do not append marketing language such as
  "8k", "masterpiece" or "trending on artstation".
- Pass the prompt through verbatim when the user has clearly written a full
  description already.

After a successful call, report the absolute file path, the provider and model
actually used, and the aspect ratio. If the user is on Android, mention the
gallery copy when the result reports one.

If generation fails, read the error and act on it:

- "No Google account" or a missing-credential error: offer `connect_account`.
- HTTP 429: tell the user the free tier rate limit was hit and to retry shortly.
- HTTP 402: the provider balance is empty. Say so; do not retry automatically.
- Any other error: report it verbatim rather than paraphrasing away the detail.

## Cost honesty

When listing models, state the real cost. Free means no key and no billing.
Free tier means a vendor quota that can be exhausted. Paid means the user pays
per generation. Do not describe a paid provider as free, and do not imply a free
tier is unlimited.

## Never

- Do not write an image file yourself. Always go through `generate_image` so the
  provider routing and gallery sync run.
- Do not print stored credentials or API keys back to the user.
- Do not loop retrying a failing provider. Report the error once.