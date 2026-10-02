---
name: claude-media-bridge
description: Generate an image from chat, or set up and connect a media provider.
argument-hint: "[model or provider] [prompt] | setup | login | connect | models | status"
---

Generate an image using the media-bridge MCP tools.

User input: $ARGUMENTS

Treat `$ARGUMENTS` as one of:

- **Empty** — call `check_media_capabilities` and report which providers are ready,
  the active default, and the single most useful next command.
- **`setup`** — call `run_setup`, then tell the user what remains.
- **`models` / `list`** — call `list_media_models` and show the table.
- **`login` / `connect`** — call `connect_account`. For Google no key is needed and
  the browser opens by itself. For other providers, state the real cost and where
  to get the key, ask the user to paste it, then pass it as `api_key`.
- **`<model> <prompt>`** — call `generate_image` with `model` set to the named
  model and the rest as `prompt`.
- **`<prompt>`** — call `generate_image` with just the `prompt`.

When expanding a short prompt, describe the subject, setting, light, medium and
mood. Keep the user's own wording, and do not add stock quality keywords such as
"8k", "masterpiece" or "award winning".

After generating, report the absolute file path, the provider and model actually
used, and the aspect ratio.

State costs truthfully: free means no key and no billing, free tier means a quota
that can run out, paid means the user pays per generation.

Never write image files directly, never print stored credentials, and never
retry a failing provider in a loop.