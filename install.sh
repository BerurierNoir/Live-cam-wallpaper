#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  CamWall — Installateur v3
#  Compatible KDE Plasma 6 / Wayland / Bazzite
#  Usage: bash install.sh
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
echo "  Installation v6 — KDE Plasma / Bazzite / Wayland"
echo ""

# ── 1. Dépendances npm ────────────────────────────────────
if [ ! -f "$ELECTRON_BIN" ]; then
    echo "→ Installation des dépendances npm..."
    cd "$SCRIPT_DIR" && npm install --silent
    echo "✓ npm install OK"
else
    echo "✓ Electron déjà installé"
fi

# ── 2. Wrapper shell ──────────────────────────────────────
mkdir -p "$HOME/.local/bin"
cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
# CamWall launcher
export ELECTRON_OZONE_PLATFORM_HINT=auto
cd "$SCRIPT_DIR"
exec "$ELECTRON_BIN" "$SCRIPT_DIR" "\$@"
WRAPEOF
chmod +x "$WRAPPER"
echo "✓ Lanceur: $WRAPPER"

# ── 3. .desktop KDE ──────────────────────────────────────
# Important: Exec pointe directement vers le binaire electron
# (KDE Plasma 6 gère mieux les binaires directs que les scripts shell)
mkdir -p "$HOME/.local/share/applications"
cat > "$DESKTOP_FILE" << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=CamWall
GenericName=Live Camera Wallpaper
Comment=Transforme un écran en mur de caméras live
Exec=env ELECTRON_OZONE_PLATFORM_HINT=auto "$ELECTRON_BIN" "$SCRIPT_DIR"
Icon=$ICON
Categories=Utility;Video;Monitor;
StartupNotify=true
StartupWMClass=camwall
Terminal=false
Keywords=camera;surveillance;rtsp;reolink;wallpaper;
X-KDE-SubstituteUID=false
DESKTOPEOF

# Indispensable sur KDE Plasma 6
chmod +x "$DESKTOP_FILE"
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true
echo "✓ Entrée KDE créée (visible dans le menu des applications)"

# ── 4. Autostart au login ─────────────────────────────────
mkdir -p "$HOME/.config/autostart"
cp "$DESKTOP_FILE" "$AUTOSTART_FILE"
chmod +x "$AUTOSTART_FILE"
gio set "$AUTOSTART_FILE" metadata::trusted true 2>/dev/null || true
echo "✓ Démarrage automatique activé"

# ── 5. Résumé ─────────────────────────────────────────────
echo ""
echo "  ✅ Installation terminée !"
echo ""
echo "  → Cherche 'CamWall' dans le menu des applications KDE"
echo "  → Ou lance avec: camwall"
echo "  → Démarre automatiquement à chaque connexion"
echo ""
read -p "  Lancer CamWall maintenant ? [o/N] " -n 1 -r REPLY
echo ""
if [[ $REPLY =~ ^[OoYy]$ ]]; then
    nohup "$WRAPPER" >/tmp/camwall-launch.log 2>&1 &
    sleep 2
    if pgrep -f "electron.*$SCRIPT_DIR" > /dev/null; then
        echo "  ✓ CamWall lancé !"
    else
        echo "  ✗ Erreur — voir /tmp/camwall-launch.log"
        cat /tmp/camwall-launch.log | tail -5
    fi
fi
