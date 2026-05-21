#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  CamWall — Installateur v4
#  Compatible KDE Plasma 6 / Wayland / Bazzite
# ═══════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_BIN="$SCRIPT_DIR/node_modules/electron/dist/electron"
ICON="$SCRIPT_DIR/assets/icon.png"
[ ! -f "$ICON" ] && ICON="$SCRIPT_DIR/assets/icon.svg"
DESKTOP_FILE="$HOME/.local/share/applications/camwall.desktop"
AUTOSTART_FILE="$HOME/.config/autostart/camwall.desktop"
WRAPPER="$HOME/.local/bin/camwall"

echo ""
echo "  ██████╗ █████╗ ███╗   ███╗██╗    ██╗ █████╗ ██╗     ██╗"
echo "  ██╔════╝██╔══██╗████╗ ████║██║    ██║██╔══██╗██║     ██║"
echo "  ██║     ███████║██╔████╔██║██║ █╗ ██║███████║██║     ██║"
echo "  ╚██████╗██║  ██║██║ ╚═╝ ██║╚███╔███╔╝██║  ██║███████╗███████╗"
echo ""
echo "  Installation v4 — KDE Plasma / Bazzite / Wayland"
echo ""

# ── 1. Dépendances npm ───────────────────────────────────
if [ ! -f "$ELECTRON_BIN" ]; then
    echo "→ Installation npm..."
    cd "$SCRIPT_DIR" && npm install --silent
    echo "✓ npm install OK"
else
    echo "✓ Electron déjà installé"
fi

# ── 2. Wrapper shell ─────────────────────────────────────
# CLEF: le wrapper tue l'ancienne instance avant de lancer la nouvelle
# C'est exactement ce que fait "pkill electron && npm start"
mkdir -p "$HOME/.local/bin"
cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
# CamWall launcher — tue l'ancienne instance, repart proprement
# X11 forcé dans le code Electron (ozone-platform=x11)

# Tuer toute instance existante (tray inclus)
pkill -f "electron.*$(basename $SCRIPT_DIR)" 2>/dev/null || true
pkill -f "go2rtc" 2>/dev/null || true
sleep 0.8

# Lancer CamWall
exec "$ELECTRON_BIN" "$SCRIPT_DIR" "\$@"
WRAPEOF
chmod +x "$WRAPPER"
echo "✓ Lanceur: $WRAPPER"
echo "  (tue l'ancienne instance, relance proprement)"

# ── 3. .desktop KDE ──────────────────────────────────────
mkdir -p "$HOME/.local/share/applications"
cat > "$DESKTOP_FILE" << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=CamWall
GenericName=Live Camera Wallpaper
Comment=Wallpaper live avec caméras et widgets
Exec=$WRAPPER
Icon=$ICON
Categories=Utility;Video;Monitor;
StartupNotify=false
StartupWMClass=camwall
Terminal=false
Keywords=camera;surveillance;rtsp;wallpaper;
DESKTOPEOF

chmod +x "$DESKTOP_FILE"
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true
echo "✓ Entrée KDE créée"

# ── 4. Autostart ─────────────────────────────────────────
mkdir -p "$HOME/.config/autostart"
cp "$DESKTOP_FILE" "$AUTOSTART_FILE"
chmod +x "$AUTOSTART_FILE"
gio set "$AUTOSTART_FILE" metadata::trusted true 2>/dev/null || true
echo "✓ Démarrage automatique activé"

# ── 5. Résumé ────────────────────────────────────────────
echo ""
echo "  ✅ Installation terminée !"
echo ""
echo "  → Cherche 'CamWall' dans le menu KDE"
echo "  → Chaque ouverture depuis l'icône redémarre proprement"
echo ""
read -p "  Lancer CamWall maintenant ? [o/N] " -n 1 -r REPLY
echo ""
if [[ $REPLY =~ ^[OoYy]$ ]]; then
    "$WRAPPER" &
    sleep 2
    pgrep -f "electron.*$(basename $SCRIPT_DIR)" > /dev/null && echo "  ✓ CamWall lancé !" || echo "  ✗ Erreur de lancement"
fi
