#!/usr/bin/env bash
# Levanta Reloj CR en local con datos de demostración y la marca del cliente.
#   LOGO_FILE=~/Downloads/Burger_King_2020.svg ./scripts/demo.sh
# Ctrl+C la detiene. Los datos viven en ./.demo-data (se borran con: rm -rf .demo-data).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3200}"
export DATA_DIR="$PWD/.demo-data"
export NODE_ENV=production
# Secretos desechables solo para esta demo; la base de demo no se usa con datos reales.
export JWT_SECRET="$(openssl rand -hex 32)"
export TEMPLATE_KEY="$(openssl rand -hex 32)"
export ADMIN_PASSWORD="Demo-$(openssl rand -hex 6)"
export SUPERVISOR_PIN="$(openssl rand -hex 4)"

rm -rf "$DATA_DIR"
[ -d node_modules ] || npm ci
[ -f .next/BUILD_ID ] || npm run build

npx next start -H 127.0.0.1 -p "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT INT TERM

until curl -s -m 2 "http://localhost:$PORT/api/health" >/dev/null; do sleep 1; done
BASE="http://localhost:$PORT" node scripts/demo-seed.mjs

echo
echo "Reloj CR (demo) en http://localhost:$PORT/login"
echo "Usuario: admin@reloj.cr   Contraseña: $ADMIN_PASSWORD"
echo "Ctrl+C para detener."
wait $SERVER
