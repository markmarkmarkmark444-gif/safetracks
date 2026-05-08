#!/usr/bin/env bash
# Deploy the Aleo Leo program to testnet
# Usage: ./scripts/deploy-aleo.sh [testnet|mainnet]

set -euo pipefail

NETWORK="${1:-testnet}"
PROGRAM_DIR="aleo/restoration_proof"

echo "==> Deploying restoration_proof_v1.aleo to Aleo $NETWORK..."

# Requires: leo CLI installed (https://developer.aleo.org/leo/installation)
if ! command -v leo &>/dev/null; then
  echo "Error: 'leo' CLI not found. Install from https://developer.aleo.org/leo/installation"
  exit 1
fi

cd "$PROGRAM_DIR"

echo "==> Building program..."
leo build

echo "==> Running tests..."
leo test

echo "==> Deploying to $NETWORK..."
leo deploy --network "$NETWORK" --private-key "${ALEO_PRIVATE_KEY:-}" --query "https://api.explorer.aleo.org/v1/$NETWORK"

echo "==> Deployment complete. Save the program address and set ALEO_PROGRAM_ID in .env"
