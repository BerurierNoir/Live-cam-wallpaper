#!/usr/bin/env bash
# Télécharge go2rtc pour le bundler dans l'AppImage/deb
set -e

ARCH=${1:-amd64}
BIN_DIR="$(dirname "$0")/../bin"
BIN_PATH="$BIN_DIR/go2rtc"

mkdir -p "$BIN_DIR"

if [ -f "$BIN_PATH" ]; then
  echo "[go2rtc] Déjà présent : $BIN_PATH"
  exit 0
fi

echo "[go2rtc] Téléchargement de go2rtc_linux_${ARCH}..."
curl -L \
  "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${ARCH}" \
  -o "$BIN_PATH"

chmod +x "$BIN_PATH"
echo "[go2rtc] ✓ Installé dans $BIN_PATH"
