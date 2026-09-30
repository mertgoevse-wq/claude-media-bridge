<div align="center">

<img src="./assets/banner.jpg" alt="Claude Media Bridge Banner" width="100%" style="border-radius: 12px; margin-bottom: 24px;" />

<img src="./assets/logo.jpg" alt="Claude Media Bridge Logo" width="160" style="border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);" />

# Claude Media Bridge

**Zero-config Media Generation MCP Bridge for Claude Code & Antigravity (AGY)**  
*Authenticate directly with your Google Account. Generate photorealistic images via Google's Nano Banana 2 (`gemini-3.1-flash-image`) — no paid API keys and no external proxy daemons required.*

[![Version: 2.0.0](https://img.shields.io/badge/version-2.0.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-MCP%20Stdio-D96570.svg)](https://modelcontextprotocol.io)
[![Backend: Google Cloud Code Direct](https://img.shields.io/badge/Backend-Google%20Cloud%20Code%20Direct-4285F4.svg)](#architecture)
[![Platform: Linux / Android Termux](https://img.shields.io/badge/Platform-Linux%20%7C%20Android%20Termux-4E86F5.svg)](#requirements)

</div>

---

## ⚡ What is Claude Media Bridge?

`claude-media-bridge` is a standalone Model Context Protocol (MCP) server that connects **Claude Code** (and any MCP-compliant client) directly to Google's internal **Nano Banana 2 (`gemini-3.1-flash-image`)** engine.

### Highlights:
- **No OmniRoute or Proxy Required:** Functions as a 100% independent, self-contained bridge.
- **Direct Google Account OAuth:** Run `claude-media-bridge login` to authenticate with your personal Google account. No paid Google AI Studio API key or billing required.
- **Direct Cloud Code Pipeline:** Communicates straight with Google's Cloud Code APIs (`daily-cloudcode-pa.googleapis.com` / `cloudcode-pa.googleapis.com`).
- **Real Files on Disk:** Writes full-resolution JPEG/PNG files to `~/media/images/` and returns absolute file paths to Claude Code for immediate inspection, editing, and pair programming.
- **Android & Termux Ready:** Automatically synchronizes images to Android `/sdcard/Pictures/` and triggers native Android media scanner broadcasts.
- **Transparent Fallback:** Gracefully supports existing OmniRoute instances or environment tokens if provided.

---

## 🎨 Visual Showcase (Generated with Nano Banana 2)

All images below were generated live with `claude-media-bridge` using personal Google account authentication:

<div align="center">

| **1. Industrial Audio Synthesizer** (16:9) | **2. Arctic Volcanic Coastline** (16:9) |
| :---: | :---: |
| <img src="./assets/sample-studio.jpg" width="460" alt="Hardware Studio Synthesizer" /> | <img src="./assets/sample-nature.jpg" width="460" alt="Volcanic Beach Coastline" /> |
| *Brushed aluminum, knurled knobs, OLED waveform display* | *Top-down aerial surf, basalt sand, atmospheric mist* |

| **3. Architectural Glass & Titanium** (1:1) | **4. Artisan Ceramicist Portrait** (4:3) |
| :---: | :---: |
| <img src="./assets/sample-glass.jpg" width="460" alt="Fluted Glass & Titanium" /> | <img src="./assets/sample-portrait.jpg" width="460" alt="Ceramicist Portrait" /> |
| *Macro fluted glass, brushed titanium, natural daylight* | *Natural window light, clay splatters, Kodachrome film tone* |

</div>

> **Anti-AI-Slop Guarantee:** Nano Banana 2 renders authentic physical textures, realistic lighting falloff, and crisp typography without generic neon mush or plastic skin artifacts.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│               Claude Code / Agent CLI                  │
└───────────────────────────┬────────────────────────────┘
                            │ Stdio Transport (MCP)
┌───────────────────────────▼────────────────────────────┐
│                  claude-media-bridge                   │
│                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │     auth/googleOAuth    │  │   client/agyDirect  │  │
│  │  • PKCE OAuth Flow      │  │  • Envelope Builder │  │
│  │  • Loopback / Headless  │  │  • Direct HTTPS API │  │
│  │  • Token Auto-Refresh   │  │  • Base64 Extractor │  │
│  │  • Project Bootstrap    │  │  • Gallery Scanner  │  │
│  └─────────────────────────┘  └─────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │ Direct HTTPS Bearer Auth
┌───────────────────────────▼────────────────────────────┐
│      Google Cloud Code API (daily-cloudcode-pa / pa)   │
│                 gemini-3.1-flash-image                 │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/mertgoevse-wq/claude-media-bridge.git ~/.local/share/claude-media-mcp
cd ~/.local/share/claude-media-mcp
npm install
npm run build
ln -sf ~/.local/share/claude-media-mcp/bin/cli.mjs ~/.local/bin/claude-media-bridge
```

### 2. Authenticate with your Google Account

Run the interactive login command:

```bash
claude-media-bridge login
```

- A browser window will open automatically asking you to log into your Google Account.
- If you are on a remote/headless server or Termux, simply open the URL shown in your terminal and paste the redirected URL or code back into the prompt.

Verify authentication status:

```bash
claude-media-bridge status
```

### 3. Add to Claude Code

Add `claude-media-bridge` to your Claude Code global configuration (`~/.claude.json`):

```json
{
  "mcpServers": {
    "media-bridge": {
      "command": "claude-media-bridge"
    }
  }
}
```

Now launch Claude Code. The media tools are automatically available:

```
> "Generate a photorealistic image of a minimalist mechanical keyboard with warm studio lighting"
```

---

## 🛠️ CLI Reference

`claude-media-bridge` includes a rich CLI for standalone testing and account management:

| Command | Description |
| :--- | :--- |
| `claude-media-bridge` | Default: starts MCP server over Stdio (for Claude Code). |
| `claude-media-bridge login` | Start interactive Google OAuth flow. |
| `claude-media-bridge status` | Check authentication state, Google project ID, and model capabilities. |
| `claude-media-bridge logout` | Delete stored credentials from `~/.config/claude-media-bridge/`. |
| `claude-media-bridge generate "<prompt>"` | Generate an image directly from the command line. |
| `claude-media-bridge help` | Print usage help. |

### CLI Image Generation Options:

```bash
claude-media-bridge generate "A dramatic Nordic fjord at dusk" \
  --ratio 16:9 \
  --filename "fjord" \
  --out "~/media/images" \
  --open
```

- `--ratio`: `1:1` (default), `16:9`, `9:16`, `4:3`, `3:4`
- `--filename`: Desired output filename (without extension)
- `--out`: Target directory (defaults to `~/media/images`)
- `--open`: Open generated image in Android Gallery viewer

---

## 🧩 MCP Tools Reference

When connected to Claude Code, `claude-media-bridge` exposes the following tools:

### `generate_image`
Generates high-fidelity images via Google's Nano Banana 2 (`gemini-3.1-flash-image`).
- `prompt` *(string, required)*: Detailed visual description of the image to generate.
- `filename` *(string, optional)*: Custom filename.
- `output_dir` *(string, optional)*: Directory where the image will be saved (default: `~/media/images`).
- `aspect_ratio` *(enum, optional)*: `"1:1"` | `"16:9"` | `"9:16"` | `"4:3"` | `"3:4"`.
- `sync_to_gallery` *(boolean, optional)*: Auto-sync image to Android `/sdcard/Pictures/` and trigger media scanner (default: `true`).
- `open_in_gallery` *(boolean, optional)*: Open image in device viewer (default: `false`).

### `check_media_capabilities`
Returns a structured JSON summary of current authentication, Google account email, discovered project ID, and model status.

### `generate_video` & `generate_music`
Diagnostic capability probes for Google Veo and Google Lyria, with explicit instructions on requirements (Vertex AI / Paid Gemini Studio API).

---

## 🔒 Security & Privacy

- **Safe Credential Storage:** Credentials are saved in `~/.config/claude-media-bridge/credentials.json` with restricted `0600` POSIX file permissions.
- **Zero Logging of Secrets:** Tokens and client secrets are never printed to terminal transcripts or execution logs.
- **Local Execution:** Media generation requests go directly from your local machine to Google's Cloud Code API endpoints over TLS.

---

## 📄 License

MIT License © 2026 Mert Gövse. See [LICENSE](LICENSE) for details.
