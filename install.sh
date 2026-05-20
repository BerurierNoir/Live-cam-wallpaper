#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  CamWall — Installateur v2
#  Compatible KDE Plasma 6 / Wayland / Bazzite
# ─────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_BIN="$SCRIPT_DIR/node_modules/electron/dist/electron"
ELECTRON_WRAPPER="$SCRIPT_DIR/node_modules/.bin/electron"
ICON="$SCRIPT_DIR/assets/icon.png"
[ ! -f "$ICON" ] && ICON="$SCRIPT_DIR/assets/icon.svg"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/camwall.desktop"
AUTOSTART_FILE="$HOME/.config/autostart/camwall.desktop"
WRAPPER="$HOME/.local/bin/camwall"

echo ""
echo "  ██████╗ █████╗ ███╗   ███╗██╗    ██╗ █████╗ ██╗     ██╗"
echo "  ██╔════╝██╔══██╗████╗ ████║██║    ██║██╔══██╗██║     ██║"
echo "  ██║     ███████║██╔████╔██║██║ █╗ ██║███████║██║     ██║"
echo "  ██║     ██╔══██║██║╚██╔╝██║██║███╗██║██╔══██║██║     ██║"
echo "  ╚██████╗██║  ██║██║ ╚═╝ ██║╚███╔███╔╝██║  ██║███████╗███████╗"
echo "   ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝"
echo ""
echo "  Installation KDE Plasma / Bazzite"
echo ""

# ── 1. npm install ────────────────────────────────────────────
if [ ! -f "$ELECTRON_BIN" ]; then
    echo "→ Installation des dépendances npm..."
    cd "$SCRIPT_DIR" && npm install --silent
fi
echo "✓ Electron: $ELECTRON_BIN"

# ── 2. Wrapper shell (pour lancement en ligne de commande) ────
mkdir -p "$HOME/.local/bin"
cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
export ELECTRON_OZONE_PLATFORM_HINT=auto
cd "$SCRIPT_DIR"
exec "$ELECTRON_BIN" "$SCRIPT_DIR" "\$@"
WRAPEOF
chmod +x "$WRAPPER"
echo "✓ Wrapper: $WRAPPER"

# ── 3. .desktop pour KDE Plasma 6 ────────────────────────────
# IMPORTANT: Exec pointe DIRECTEMENT vers le binaire electron
# (pas vers un script shell — KDE 6 gère mal les wrappers shell)
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_FILE" << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=CamWall
GenericName=Live Camera Wallpaper
Comment=Mur de caméras live — RTSP, Reolink, Proxmox, Kuma
Exec=env ELECTRON_OZONE_PLATFORM_HINT=auto "$ELECTRON_BIN" "$SCRIPT_DIR"
Icon=$ICON
Categories=Utility;Video;Monitor;
StartupNotify=true
StartupWMClass=camwall
Terminal=false
Keywords=camera;surveillance;rtsp;reolink;wallpaper;proxmox;
X-KDE-SubstituteUID=false
DESKTOPEOF

# Indispensable sur KDE Plasma 6 : marquer comme exécutable ET de confiance
chmod +x "$DESKTOP_FILE"
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || \
  xattr -w com.apple.quarantine "" "$DESKTOP_FILE" 2>/dev/null || true

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
kbuildsycoca6 --noincremental 2>/dev/null || \
  kbuildsycoca5 --noincremental 2>/dev/null || true

echo "✓ .desktop KDE: $DESKTOP_FILE (marqué de confiance)"

# ── 4. Autostart au login ─────────────────────────────────────
mkdir -p "$HOME/.config/autostart"
cp "$DESKTOP_FILE" "$AUTOSTART_FILE"
chmod +x "$AUTOSTART_FILE"
gio set "$AUTOSTART_FILE" metadata::trusted true 2>/dev/null || true
echo "✓ Autostart: $AUTOSTART_FILE"

# ── 5. Résumé ─────────────────────────────────────────────────
echo ""
echo "  ✅ Installation terminée !"
echo ""
echo "  → Recherche 'CamWall' dans le menu des applications KDE"
echo "  → Commande: camwall"
echo "  → Démarre automatiquement au login"
echo ""
echo "  Si l'icône ne s'affiche pas encore dans le menu :"
echo "  Déconnectez-vous et reconnectez-vous (KDE recharge les apps)"
echo ""

read -p "  Lancer CamWall maintenant ? [o/N] " -n 1 -r REPLY
echo ""
if [[ $REPLY =~ ^[OoYy]$ ]]; then
    nohup "$WRAPPER" >/tmp/camwall-launch.log 2>&1 &
    sleep 2
    if pgrep -f "electron.*$SCRIPT_DIR" > /dev/null; then
        echo "  ✓ CamWall lancé (PID: $(pgrep -f "electron.*$SCRIPT_DIR" | head -1))"
    else
        echo "  ✗ Erreur de lancement. Log: /tmp/camwall-launch.log"
        cat /tmp/camwall-launch.log
    fi
fi
