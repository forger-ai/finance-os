#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="finance-os-lite"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${1:-$ROOT_DIR/tmp/dist}"
OUT_FILE="${2:-$APP_NAME-$STAMP.zip}"

mkdir -p "$OUT_DIR"

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}.stage.XXXXXX")"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

rsync -a \
  --exclude '.git/' \
  --exclude '.gitignore' \
  --exclude '.DS_Store' \
  --exclude '.idea/' \
  --exclude '.vscode/' \
  --exclude 'tmp/' \
  --exclude 'backend/.venv/' \
  --exclude 'backend/.ruff_cache/' \
  --exclude 'backend/.pytest_cache/' \
  --exclude 'backend/**/__pycache__/' \
  --exclude 'backend/**/*.pyc' \
  --exclude 'backend/data/*.sqlite' \
  --exclude 'backend/data/*.sqlite-*' \
  --exclude 'frontend/node_modules/' \
  --exclude 'frontend/dist/' \
  --exclude 'frontend/.vite/' \
  "$ROOT_DIR/" "$STAGE_DIR/$APP_NAME/"

# Asegura que data exista pero sin bases locales ni backups.
mkdir -p "$STAGE_DIR/$APP_NAME/backend/data"
find "$STAGE_DIR/$APP_NAME/backend" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$STAGE_DIR/$APP_NAME/backend" -type f -name '*.pyc' -delete
find "$STAGE_DIR/$APP_NAME/backend/data" -type f \( -name '*.sqlite' -o -name '*.sqlite-*' -o -name '*.db' -o -name '*.backup*' \) -delete
find "$STAGE_DIR/$APP_NAME/frontend" -type d -name 'node_modules' -prune -exec rm -rf {} +
find "$STAGE_DIR/$APP_NAME/frontend" -type d -name 'dist' -prune -exec rm -rf {} +
find "$STAGE_DIR/$APP_NAME/frontend" -type d -name '.vite' -prune -exec rm -rf {} +

ZIP_PATH="$OUT_DIR/$OUT_FILE"
rm -f "$ZIP_PATH"
(
  cd "$STAGE_DIR"
  zip -qr "$ZIP_PATH" "$APP_NAME"
)

echo "ZIP creado: $ZIP_PATH"
