#!/usr/bin/env bash
# Full testnet setup script
# Run this after copying .env.example to .env and filling in your keys.

set -euo pipefail

echo "==> SafeTracks Insurance Restoration — Testnet Setup"
echo ""

# 1. Install dependencies
echo "[1/5] Installing npm dependencies..."
npm install

# 2. Generate Prisma client
echo "[2/5] Generating Prisma client..."
npx prisma generate

# 3. Run database migrations
echo "[3/5] Running database migrations..."
npx prisma migrate deploy

# 4. Build all packages
echo "[4/5] Building packages..."
npm run build

# 5. Verify Hedera connectivity
echo "[5/5] Verifying Hedera testnet connectivity..."
node -e "
const { getHederaClient } = require('./packages/blockchain/dist/hedera/client');
try {
  const client = getHederaClient();
  console.log('  Hedera client initialized successfully');
  process.exit(0);
} catch (e) {
  console.error('  Hedera init failed:', e.message);
  console.error('  Check HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env');
  process.exit(1);
}
"

echo ""
echo "==> Setup complete!"
echo "    Start API:  npm run dev --workspace=@safetracks/api"
echo "    Start Web:  npm run dev --workspace=@safetracks/web"
echo "    Start Both: npm run dev"
