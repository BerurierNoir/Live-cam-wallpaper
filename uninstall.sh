#!/bin/bash
echo "Désinstallation de CamWall..."
rm -f "$HOME/.local/bin/camwall"
rm -f "$HOME/.local/share/applications/camwall.desktop"
rm -f "$HOME/.config/autostart/camwall.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "✓ CamWall désinstallé"
echo "  (Les fichiers du projet ~/Live-cam-wallpaper sont conservés)"
