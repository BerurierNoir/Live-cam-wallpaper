#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  CamWall — Script d'installation / mise à jour
#  Usage : bash install.sh [--update]
# ═══════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; AMBER='\033[0;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
say()  { echo -e "${GREEN}●${NC} $*"; }
warn() { echo -e "${AMBER}⚠${NC} $*"; }
die()  { echo -e "${RED}✗${NC} $*"; exit 1; }

REPO="BerurierNoir/Live-cam-wallpaper"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
APP_NAME="CamWall"
BIN_NAME="camwall"
CURRENT_BIN="$INSTALL_DIR/$BIN_NAME"
UPDATE_MODE=${1:-""}

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        CamWall Installer v2.0        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Dépendances ────────────────────────────────────────────
check_dep() { command -v "$1" &>/dev/null || die "Dépendance manquante : $1. Installe-la et relance."; }
check_dep curl
check_dep jq

mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR"

# ── Version installée ──────────────────────────────────────
current_version=""
if [ -f "$CURRENT_BIN" ]; then
  current_version=$("$CURRENT_BIN" --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "")
  say "Version actuelle : ${current_version:-inconnue}"
fi

# ── Dernière release GitHub ────────────────────────────────
say "Récupération de la dernière release..."
release=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
latest_version=$(echo "$release" | jq -r '.tag_name' | tr -d 'v')
appimage_url=$(echo "$release" | jq -r '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url' | head -1)

if [ -z "$appimage_url" ]; then
  die "Aucun AppImage trouvé dans la dernière release. Build local nécessaire."
fi

say "Dernière version : $latest_version"

# ── Déjà à jour ? ─────────────────────────────────────────
if [ "$current_version" = "$latest_version" ] && [ "$UPDATE_MODE" != "--force" ]; then
  say "CamWall est déjà à jour !"
  echo ""
  echo -e "  Lance avec : ${BOLD}$BIN_NAME${NC}"
  exit 0
fi

# ── Téléchargement ─────────────────────────────────────────
TMP=$(mktemp)
say "Téléchargement de CamWall v$latest_version..."
curl -L --progress-bar "$appimage_url" -o "$TMP"
chmod +x "$TMP"

# ── Installation ───────────────────────────────────────────
mv "$TMP" "$CURRENT_BIN"
say "Installé dans $CURRENT_BIN"

# ── Entrée .desktop ────────────────────────────────────────
cat > "$DESKTOP_DIR/$BIN_NAME.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Live camera wallpaper — RTSP, Reolink, Tapo, ONVIF
Exec=$CURRENT_BIN
Icon=camwall
Categories=Utility;Video;
StartupNotify=false
DESKTOP
chmod +x "$DESKTOP_DIR/$BIN_NAME.desktop"

# Refresh du menu des apps
command -v update-desktop-database &>/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
say "Entrée .desktop créée"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ CamWall v$latest_version installé !${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo -e "  Lancer : ${BOLD}$BIN_NAME${NC}"
echo -e "  Ou depuis le menu des applications : ${BOLD}$APP_NAME${NC}"
echo ""
echo -e "  Mise à jour future : ${BOLD}bash install.sh --update${NC}"
echo -e "  Forcer réinstall  : ${BOLD}bash install.sh --force${NC}"
echo ""
