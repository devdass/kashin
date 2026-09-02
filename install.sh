#!/usr/bin/env bash
# Kashin — one-command installer + launcher (macOS / Linux)
# Usage:  bash install.sh   (or double-click Kashin.command)
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
PORT="${PORT:-3000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cecho() { printf "\033[1;33m%s\033[0m\n" "$*"; }
echo ""

cecho "┌─────────────────────────────────────────────┐"
cecho "│                Kashin                       │"
cecho "│  Local-first personal finance for Akahu     │"
cecho "└─────────────────────────────────────────────┘"

# ── Node check / install ─────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  cecho "⚠ Node.js is not installed."
  cecho "  Install the LTS version from https://nodejs.org,"
  cecho "  then run this again. (Or we can install it for you:)"
  read -rp "  Auto-install Node LTS now? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    if command -v curl >/dev/null 2>&1; then
      cecho "  Installing via fnm (Node version manager)…"
      curl -fsSL https://fnm.vercel.app/install | bash >/dev/null 2>&1 || true
      export PATH="$HOME/.local/share/fnm:$PATH"
      source "$HOME/.local/share/fnm/aliases/default/bin" 2>/dev/null || true
      "$HOME/.local/share/fnm/fnm" install --lts >/dev/null 2>&1 || true
      "$HOME/.local/share/fnm/fnm" default lts-latest >/dev/null 2>&1 || true
      export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
    fi
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  cecho "✗ Node.js still not available. Install it from https://nodejs.org and re-run."
  exit 1
fi
cecho "✓ Node $(node -v) found."

# ── Dependencies ──────────────────────────────────────────────────────────
cd "$DIR"
if [ ! -d node_modules ]; then
  cecho "Installing dependencies (first run only)…"
  npm install --no-audit --no-fund >/dev/null 2>&1 || npm install
  cecho "✓ Dependencies installed."
fi

# ── Encryption key / .env.local ───────────────────────────────────────────
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  KEY="$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  sed -i.bak "s|^AKAHU_ENCRYPTION_KEY=.*|AKAHU_ENCRYPTION_KEY=${KEY}|" .env.local && rm -f .env.local.bak
  cecho "✓ Generated a local encryption key."
fi

# ── Launch ────────────────────────────────────────────────────────────────
cecho "✓ Starting Kashin on http://localhost:${PORT}"
cecho "  Press Ctrl+C to stop."
echo ""
exec npm run dev -- -p "$PORT"