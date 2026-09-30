# Architecture Spec: Direct AGY (Google Account) Authentication for Claude Media Bridge

**Date:** 2026-09-30  
**Status:** Approved  
**Author:** Mert Gövse  

---

## 1. Overview & Context

`claude-media-bridge` was originally designed as an MCP bridge connecting Claude Code to a local OmniRoute proxy for image generation with Google's Nano Banana 2 (`gemini-3.1-flash-image`). While functional, requiring an active OmniRoute daemon introduces an unnecessary external dependency, setup friction, and potential point of failure.

This specification defines the direct integration of Antigravity (AGY) Google Account OAuth authentication and direct Cloud Code API communication into `claude-media-bridge`, making it fully standalone and zero-config for any developer with a standard Google account.

---

## 2. Key Objectives

1. **Zero External Proxy Dependency:** Remove the requirement for OmniRoute or any secondary gateway.
2. **Native Google Account Authentication:** Enable any user to run `claude-media-bridge login` to authenticate with their personal Google Account via standard OAuth 2.0.
3. **Direct Cloud Code Execution:** Make direct HTTPS requests to Google's Cloud Code internal API endpoints for Nano Banana 2 (`gemini-3.1-flash-image`).
4. **Resilient Token Management:** Securely persist tokens in `~/.config/claude-media-bridge/credentials.json` (chmod 0600) with automatic silent background token refresh.
5. **Headless & Termux Support:** Support both local loopback browser authentication and manual code-paste authentication for headless/remote/Termux setups.
6. **Graceful Backward Compatibility:** Preserve optional fallbacks (OmniRoute base URL and direct Gemini API keys) if present.
7. **Asset Generation & Repository Polish:** Generate 4 high-taste test images, project logo, and banner using the bridge; integrate into `assets/`, update `README.md`, and push to GitHub.

---

## 3. Architecture & Components

```
┌────────────────────────────────────────────────────────┐
│               Claude Code / Agent CLI                  │
└───────────────────────────┬────────────────────────────┘
                            │ (MCP Stdio Server)
┌───────────────────────────▼────────────────────────────┐
│                  claude-media-bridge                   │
│                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │     src/auth/google     │  │   src/client/agy    │  │
│  │  • PKCE OAuth Flow      │  │  • Envelope Builder │  │
│  │  • Loopback / Paste CLI │  │  • Direct HTTPS API │  │
│  │  • Auto Token Refresh   │  │  • Base64 Image Ext │  │
│  │  • Project Bootstrap    │  │  • Android Scanner  │  │
│  └─────────────────────────┘  └─────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │ Direct HTTPS
┌───────────────────────────▼────────────────────────────┐
│      Google Cloud Code API (daily-cloudcode-pa / pa)   │
│                 gemini-3.1-flash-image                 │
└────────────────────────────────────────────────────────┘
```

### 3.1 Authentication Module (`src/auth/`)

- **OAuth 2.0 Endpoint:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Token Exchange:** `https://oauth2.googleapis.com/token`
- **Scopes:**
  - `https://www.googleapis.com/auth/cloud-platform`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/cclog`
  - `https://www.googleapis.com/auth/experimentsandconfigs`
- **Public Client ID / Secret:** Embedded unmasked client constants matching Antigravity / Cloud Code desktop clients, with environment overrides (`AGY_CLIENT_ID`, `AGY_CLIENT_SECRET`).
- **Post-Exchange Project Discovery:**
  - Calls `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` with metadata (`ideType: 9`, `platform`, `pluginType: 2`) to obtain `cloudaicompanionProject.id`.
  - If no project exists, calls `v1internal:onboardUser` to auto-provision standard tier access.
- **Token Storage:**
  - Saved in `~/.config/claude-media-bridge/credentials.json`.
  - Properties: `access_token`, `refresh_token`, `expiry_date`, `project_id`, `email`.
  - Restricted permissions (`0600`).
- **Auto-Refresh:**
  - Validates `expiry_date` prior to every API call. If expired or expiring within 60s, executes refresh against `oauth2.googleapis.com/token`.

### 3.2 Direct Media Client (`src/client/`)

- **Primary Endpoint:** `https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent`
- **Fallback Endpoint:** `https://cloudcode-pa.googleapis.com/v1internal:generateContent`
- **Request Format:**
  ```json
  {
    "project": "<projectId>",
    "requestId": "image_gen/<timestamp>/<uuid>/0",
    "request": {
      "contents": [
        {
          "role": "user",
          "parts": [{ "text": "<prompt>" }]
        }
      ],
      "generationConfig": {
        "candidateCount": 1,
        "imageConfig": {
          "aspectRatio": "1:1"
        }
      }
    },
    "model": "gemini-3.1-flash-image",
    "userAgent": "antigravity/2.0.1 linux/arm64 google-api-nodejs-client/10.3.0",
    "requestType": "image_gen"
  }
  ```
- **Image Saving & Gallery Integration:**
  - Saves decoded Base64 JPEG to target directory (`~/media/images` by default).
  - On Android/Termux: copies to `/sdcard/Pictures` and issues `android.intent.action.MEDIA_SCANNER_SCAN_FILE` broadcast.

### 3.3 CLI Interface (`bin/cli.mjs`)

- `claude-media-bridge login`: Starts interactive Google OAuth login.
- `claude-media-bridge status`: Displays connection and authentication status.
- `claude-media-bridge` (no args): Starts MCP stdio server.

---

## 4. Verification & Testing Strategy

1. **CLI Test:** Verify `claude-media-bridge status` and `login` handling.
2. **Image Generation Test:** Run 4 distinct prompts with varying aspect ratios (`1:1`, `16:9`, `9:16`, `4:3`) to generate high-fidelity sample images without AI slop.
3. **Branding Assets:** Generate official `logo.png` and `banner.png` for the project.
4. **MCP Verification:** Verify `generate_image`, `generate_video`, `generate_music`, and `check_media_capabilities` tools return correct responses and capabilities.
5. **Git & GitHub Release:** Commit all changes cleanly and push to GitHub repository.
