#!/usr/bin/env bash
# Quick runner — pass a URL and optional instruction
# Usage: ./scripts/run.sh "https://tiktok.com/..." "do this with cats"

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example and fill in keys"
  exit 1
fi

set -a; source .env; set +a
exec bun run src/index.ts "$@"
