# Direct AGY (Google Account) Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove OmniRoute dependency by adding direct Google Account OAuth authentication and direct Google Cloud Code API execution for Nano Banana 2 (`gemini-3.1-flash-image`) to `claude-media-bridge`.

**Architecture:** A standalone auth layer (`src/auth/`) handles Google OAuth2 authorization code flow (with loopback server and headless code-paste), project discovery via `v1internal:loadCodeAssist`, secure token storage in `~/.config/claude-media-bridge/credentials.json`, and transparent token refresh. The client layer (`src/client/`) crafts the Cloud Code request envelope and sends direct HTTPS calls to `daily-cloudcode-pa.googleapis.com` / `cloudcode-pa.googleapis.com`, saving generated images and broadcasting to Android Gallery.

**Tech Stack:** Node.js (v24), TypeScript, Bun, `@modelcontextprotocol/sdk`, Zod.

**Spec:** `docs/superpowers/specs/2026-09-30-agy-direct-auth-design.md`

## Global Constraints

- Must run natively under both Node.js (v24) and Bun on Linux/ARM64 (Termux/PRoot).
- No external proxy daemon (OmniRoute) required for image generation.
- Keep backward compatibility if `OMNIROUTE_BASE_URL` or `GEMINI_API_KEY` is explicitly supplied.
- Never log or output secret credentials to terminal stdout/stderr.
- Avoid AI-slop in README, code comments, and image prompts.

## Review Focus

1. **Token Expired at Request Time:** The client must refresh the access token automatically before sending the generation request.
2. **Missing Google Cloud Code Project ID:** The client must automatically call `loadCodeAssist` or `onboardUser` to discover the user's project ID if absent from the stored credentials.
3. **Headless / Termux Environment:** When local browser opening fails or port 51128 is not directly browser-accessible, the CLI must display the auth URL and prompt for the code / callback URL cleanly.
4. **Network Flakiness to Daily Endpoint:** If `daily-cloudcode-pa.googleapis.com` returns 5xx or fails, the client must fail over to `cloudcode-pa.googleapis.com`.
5. **Corrupted / Empty Credentials File:** The storage module must handle invalid JSON gracefully and trigger a re-login notice rather than crashing the process.

---

### Task 1: Auth Configuration & Token Storage

**Files:**
- Create: `src/auth/constants.ts`
- Create: `src/auth/tokenStorage.ts`
- Test: `test/tokenStorage.test.ts`

**Interfaces:**
- Produces: `loadStoredCredentials(): StoredCredentials | null`, `saveStoredCredentials(creds: StoredCredentials): void`, `clearStoredCredentials(): void`, `getCredentialsPath(): string`

- [ ] **Step 1: Write test for token storage**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/auth/constants.ts` and `src/auth/tokenStorage.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 2: Google OAuth2 & Project Discovery

**Files:**
- Create: `src/auth/googleOAuth.ts`
- Test: `test/googleOAuth.test.ts`

**Interfaces:**
- Consumes: `loadStoredCredentials`, `saveStoredCredentials` from Task 1
- Produces: `loginInteractive(options?: { port?: number; manual?: boolean }): Promise<StoredCredentials>`, `getValidAccessToken(): Promise<{ token: string; projectId: string }>`

- [ ] **Step 1: Write unit tests for Google OAuth URL generation & refresh logic**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/auth/googleOAuth.ts` with loopback server and headless paste fallback**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: Direct Cloud Code Media Client

**Files:**
- Create: `src/client/agyDirect.ts`
- Modify: `src/client.ts`
- Test: `test/agyDirect.test.ts`

**Interfaces:**
- Consumes: `getValidAccessToken` from Task 2
- Produces: `generateImageDirect(options: GenerateImageOptions): Promise<GeneratedImageResult>`

- [ ] **Step 1: Write unit tests for envelope construction and response parsing**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/client/agyDirect.ts` and integrate into `src/client.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 4: CLI Commands & MCP Server Integration

**Files:**
- Modify: `bin/cli.mjs`
- Modify: `src/server.ts`
- Modify: `src/config.ts`

**Interfaces:**
- CLI commands: `claude-media-bridge login`, `claude-media-bridge status`, default stdio MCP server
- MCP tools: `generate_image`, `generate_video`, `generate_music`, `check_media_capabilities`

- [ ] **Step 1: Update `src/server.ts` to reflect native AGY connection status**
- [ ] **Step 2: Update `bin/cli.mjs` to handle `login` and `status` subcommands**
- [ ] **Step 3: Build distribution artifacts (`dist/`)**
- [ ] **Step 4: Verify CLI commands via test execution**
- [ ] **Step 5: Commit changes**

---

### Task 5: Sample Images & Branding Assets Generation

**Files:**
- Create: `assets/sample-studio.jpg` (Hardware / synthesizer design)
- Create: `assets/sample-nature.jpg` (Cinematic aerial landscape)
- Create: `assets/sample-glass.jpg` (Architectural glassmorphism)
- Create: `assets/sample-portrait.jpg` (Studio artisan portrait)
- Create: `assets/logo.png`
- Create: `assets/banner.png`

- [ ] **Step 1: Formulate high-taste, anti-slop prompts for the 4 sample images**
- [ ] **Step 2: Generate the 4 sample images and verify resolution and file sizes**
- [ ] **Step 3: Generate the repository logo and banner**
- [ ] **Step 4: Save assets to `assets/` and verify integrity**
- [ ] **Step 5: Commit assets**

---

### Task 6: Modern README.md & Global Installation Update

**Files:**
- Modify: `README.md`
- Update: Global binary in `~/.local/bin/claude-media-bridge` and `~/.local/share/claude-media-mcp`

- [ ] **Step 1: Write beautiful, comprehensive, anti-slop `README.md` with visual gallery, architecture diagram, quick start, and technical specs**
- [ ] **Step 2: Sync build to `~/.local/share/claude-media-mcp` and ensure global command works**
- [ ] **Step 3: Test MCP capabilities end-to-end**
- [ ] **Step 4: Commit changes**
- [ ] **Step 5: Push commits to GitHub repository**
