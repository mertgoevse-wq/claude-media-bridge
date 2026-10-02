#!/usr/bin/env bash
#
# Claude Media Bridge installer.
#
#   curl -fsSL https://raw.githubusercontent.com/mertgoevse-wq/claude-media-bridge/main/install.sh | bash
#
# Installs the CLI, links it onto your PATH and runs setup. Pass --no-setup to
# skip the interactive wizard.

set -euo pipefail

REPO="https://github.com/mertgoevse-wq/claude-media-bridge.git"
INSTALL_DIR="${CLAUDE_MEDIA_BRIDGE_DIR:-$HOME/.local/share/claude-media-bridge}"
BIN_DIR="${CLAUDE_MEDIA_BRIDGE_BIN:-$HOME/.local/bin}"
RUN_SETUP=1

for arg in "$@"; do
  case "$arg" in
    --no-setup) RUN_SETUP=0 ;;
    --dir=*) INSTALL_DIR="${arg#*=}" ;;
    --help|-h)
      cat <<'EOF'
Claude Media Bridge installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/mertgoevse-wq/claude-media-bridge/main/install.sh | bash

Options:
  --no-setup   Install only, do not run the setup wizard.
  --dir=PATH   Install location (default: ~/.local/share/claude-media-bridge).

Environment:
  CLAUDE_MEDIA_BRIDGE_DIR   Same as --dir
  CLAUDE_MEDIA_BRIDGE_BIN   Where to link the binary (default: ~/.local/bin)
EOF
      exit 0
      ;;
  esac
done

info() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!!\033[0m %s\n' "$1"; }
die()  { printf '\033[31mxx\033[0m %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required but not installed."
command -v node >/dev/null 2>&1 || die "Node.js 20+ is required but not installed."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20 or newer is required (found $(node -v))."
fi

info "Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing checkout"
  git -C "$INSTALL_DIR" pull --ff-only
else
  [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ] \
    && die "$INSTALL_DIR exists and is not a git checkout. Remove it or pass --dir."
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi

info "Installing dependencies"
cd "$INSTALL_DIR"

if command -v npm >/dev/null 2>&1; then
  npm install --omit=dev --no-audit --no-fund
  info "Building"
  # TypeScript is a dev dependency, so install it just for the build step.
  npm install --no-save typescript@latest --no-audit --no-fund
  npx tsc
else
  die "npm is required to build. Install Node.js from https://nodejs.org."
fi

[ -f "$INSTALL_DIR/dist/index.js" ] || die "Build did not produce dist/index.js"

info "Linking CLI into $BIN_DIR"
mkdir -p "$BIN_DIR"
chmod +x "$INSTALL_DIR/bin/cli.mjs"

# Replace an existing symlink, but never clobber a real file.
LINK="$BIN_DIR/claude-media-bridge"
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  warn "$LINK exists and is not a symlink; leaving it alone."
else
  ln -sf "$INSTALL_DIR/bin/cli.mjs" "$LINK"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH. Add this to your shell profile:"
     printf '    export PATH="$HOME/.local/bin:$PATH"\n' ;;
esac

info "Installed. Version: $(node -p "require('$INSTALL_DIR/package.json').version")"

if [ "$RUN_SETUP" -eq 1 ]; then
  if [ -t 0 ]; then
    info "Running setup"
    printf '\n'
    "$LINK" setup
  else
    printf '\n'
    info "Non-interactive shell detected, skipping the wizard."
    "$LINK" setup --yes --no-login
    printf '\n'
    printf '  Run \033[36mclaude-media-bridge setup\033[0m when you are ready to sign in.\n'
  fi
fi

printf '\n'
info "Done. In Claude Code run: /claude-media-bridge nano-banana a glass monolith at dusk"
printf '\n'