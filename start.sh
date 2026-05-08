#!/usr/bin/env bash
# start.sh — one-command dev startup for SafeTracks
# Usage: ./start.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[safetracks]${RESET} $*"; }
success() { echo -e "${GREEN}[safetracks]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[safetracks] WARNING:${RESET} $*"; }
die()     { echo -e "${RED}[safetracks] ERROR:${RESET} $*" >&2; exit 1; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   SafeTracks — Verified Restore      ║"
echo "  ║   Insurance Restoration Platform     ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${RESET}"

# ─── 1. Node / npm version check ─────────────────────────────────────────────
info "Checking Node.js..."
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1) || die "Node.js not found. Install Node 20+ from https://nodejs.org"
[ "$NODE_VER" -ge 20 ] || die "Node.js 20+ required (found v${NODE_VER}). Install from https://nodejs.org"
success "Node.js $(node --version) ✓"

# ─── 2. Create .env from .env.example if missing ──────────────────────────────
if [ ! -f ".env" ]; then
  if [ ! -f ".env.example" ]; then
    die ".env.example not found. Cannot create .env template."
  fi
  info "No .env found — copying from .env.example..."
  cp .env.example .env
  warn ".env created from template. Fill in the required values below before the API will work:"
  echo ""
  echo -e "  ${YELLOW}Required:${RESET}"
  echo "    HEDERA_ACCOUNT_ID   — from https://portal.hedera.com (free testnet account)"
  echo "    HEDERA_PRIVATE_KEY  — DER-encoded key from Hedera portal"
  echo "    JWT_SECRET          — run: openssl rand -hex 32"
  echo "    PINATA_JWT          — from https://app.pinata.cloud/developers/api-keys (free)"
  echo "    ANTHROPIC_API_KEY   — from https://console.anthropic.com (AI vision features)"
  echo ""
  echo -e "  Edit ${BOLD}.env${RESET} and re-run ${BOLD}./start.sh${RESET} when ready."
  echo ""
  read -r -p "  Continue anyway with placeholder values? [y/N] " CONTINUE
  [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 0
else
  success ".env found ✓"
fi

# ─── 3. Warn about unfilled placeholder values ───────────────────────────────
check_placeholder() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [[ -z "$val" || "$val" == *"XXXXXXX"* || "$val" == *"change-me"* || "$val" == *"your-"* || "$val" == *"sk-ant-api03-..."* || "$val" == *"302e020100300506032b6570"* ]]; then
    warn "${key} looks like a placeholder — some features may not work"
  fi
}

check_placeholder "HEDERA_ACCOUNT_ID"
check_placeholder "HEDERA_PRIVATE_KEY"
check_placeholder "JWT_SECRET"
check_placeholder "PINATA_JWT"
check_placeholder "ANTHROPIC_API_KEY"

# ─── 4. npm install ───────────────────────────────────────────────────────────
info "Installing dependencies..."
npm install
success "Dependencies installed ✓"

# ─── 5. Prisma client generation ─────────────────────────────────────────────
info "Generating Prisma client..."
npx prisma generate
success "Prisma client ready ✓"

# ─── 6. Start ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Starting SafeTracks...${RESET}"
echo -e "  ${CYAN}API${RESET}  → http://localhost:4000"
echo -e "  ${CYAN}Web${RESET}  → http://localhost:3000"
echo -e "  ${CYAN}Health${RESET} → http://localhost:4000/health"
echo ""
echo -e "  To run DB migrations:  ${BOLD}npx prisma migrate deploy${RESET}"
echo -e "  To seed sample data:   ${BOLD}npm run db:seed${RESET}"
echo -e "  To open Prisma Studio: ${BOLD}npm run db:studio${RESET}"
echo ""

npm run dev
