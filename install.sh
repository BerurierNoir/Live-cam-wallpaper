#!/bin/bash
# ─────────────────────────────────────────────────────────
#  CamWall — Script d'installation
#  Crée un vrai lanceur KDE/GNOME sans fenêtre terminal
# ─────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="$SCRIPT_DIR/node_modules/.bin/electron"
ICON="$SCRIPT_DIR/assets/icon.svg"
LAUNCHER="$HOME/.local/bin/camwall"
DESKTOP="$HOME/.local/share/applications/camwall.desktop"
AUTOSTART="$HOME/.config/autostart/camwall.desktop"

echo ""
echo "  ██████╗ █████╗ ███╗   ███╗██╗    ██╗ █████╗ ██╗     ██╗"
echo "  ██╔════╝██╔══██╗████╗ ████║██║    ██║██╔══██╗██║     ██║"
echo "  ██║     ███████║██╔████╔██║██║ █╗ ██║███████║██║     ██║"
echo "  ██║     ██╔══██║██║╚██╔╝██║██║███╗██║██╔══██║██║     ██║"
echo "  ╚██████╗██║  ██║██║ ╚═╝ ██║╚███╔███╔╝██║  ██║███████╗███████╗"
echo "   ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝"
echo ""
echo "  Installation v$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo '?')"
echo ""

# ── 1. Dépendances npm ────────────────────────────────────
if [ ! -f "$ELECTRON" ]; then
  echo "→ Installation des dépendances npm..."
  cd "$SCRIPT_DIR" && npm install --silent
  echo "✓ npm install OK"
else
  echo "✓ Dépendances npm déjà installées"
fi

# ── 2. Lanceur shell (sans terminal) ─────────────────────
mkdir -p "$HOME/.local/bin"
cat > "$LAUNCHER" << LAUNCHEREOF
#!/bin/bash
# Lanceur CamWall — généré par install.sh
cd "$SCRIPT_DIR"
exec "$ELECTRON" . "\$@" 2>/dev/null
LAUNCHEREOF
chmod +x "$LAUNCHER"
echo "✓ Lanceur créé : $LAUNCHER"

# ── 3. Entrée .desktop (menu applications) ───────────────
mkdir -p "$HOME/.local/share/applications"
cat > "$DESKTOP" << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=CamWall
GenericName=Live Camera Wallpaper
Comment=Transforme un écran en mur de caméras live
Exec=$LAUNCHER
Icon=$ICON
Categories=Utility;Video;Monitor;
StartupNotify=false
Terminal=false
Keywords=camera;surveillance;rtsp;reolink;wallpaper;
DESKTOPEOF
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "✓ Entrée .desktop créée (visible dans le lanceur KDE/GNOME)"

# ── 4. Démarrage automatique au login ────────────────────
mkdir -p "$HOME/.config/autostart"
cat > "$AUTOSTART" << AUTOSTARTEOF
[Desktop Entry]
Type=Application
Name=CamWall
Comment=Live camera wallpaper — démarrage automatique
Exec=$LAUNCHER
Icon=$ICON
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Terminal=false
AUTOSTARTEOF
echo "✓ Démarrage automatique activé au login"

# ── 5. Résumé ─────────────────────────────────────────────
echo ""
echo "  ✅ Installation terminée !"
echo ""
echo "  Lancer CamWall :"
echo "    • Menu des applications KDE → CamWall"
echo "    • Ou en ligne de commande : camwall"
echo ""
echo "  Pour désinstaller :"
echo "    bash $SCRIPT_DIR/uninstall.sh"
echo ""

# Proposer de lancer maintenant
read -p "  Lancer CamWall maintenant ? [o/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[OoYy]$ ]]; then
  echo "  Démarrage..."
  nohup "$LAUNCHER" >/dev/null 2>&1 &
  echo "  ✓ CamWall lancé en arrière-plan"
fi
