# CamWall

> **Live camera wallpaper for Linux** — Affiche tes caméras IP directement sur n'importe quel écran, avec un HUD minimaliste et zéro configuration réseau.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-blue)
![Version](https://img.shields.io/github/v/release/BerurierNoir/Live-cam-wallpaper)

---

## ✨ Fonctionnalités

| | |
|---|---|
| 📷 **Multi-caméras** | Grille auto (1, 1×2, 2×2, 3×2, 3×3) ou manuelle |
| 🖥 **Plein écran dédié** | Fenêtre sans bord sur l'écran de ton choix |
| 🎯 **HUD hover** | Barre de contrôle qui apparaît en passant la souris en bas |
| 📡 **Multi-protocoles** | RTSP, Reolink natif, Tapo, ONVIF, MJPEG HTTP, HLS |
| ⚡ **Sub-stream intelligent** | Grille = sub stream (SD), zoom = main stream (HD/4K) |
| 🔄 **Reconnexion auto** | Exponential backoff (5s → 60s max) |
| 📸 **Snapshot** | Capture JPEG par caméra en un clic |
| 🔔 **System Tray** | Toujours accessible, jamais vraiment fermé |
| 🚀 **Démarrage auto** | Option intégrée (fichier `.desktop` autostart) |
| 🔄 **Mise à jour** | Vérification et notification automatique |
| 📂 **Logs** | Accès direct aux logs depuis l'interface |

---

## 📦 Installation

### Méthode recommandée — Script automatique

```bash
curl -fsSL https://raw.githubusercontent.com/BerurierNoir/Live-cam-wallpaper/main/install.sh | bash
```

### Méthode manuelle — AppImage

```bash
# 1. Télécharger depuis la page Releases
wget https://github.com/BerurierNoir/Live-cam-wallpaper/releases/latest/download/CamWall-x86_64.AppImage

# 2. Rendre exécutable et lancer
chmod +x CamWall-x86_64.AppImage
./CamWall-x86_64.AppImage
```

> L'assistant de configuration s'ouvre automatiquement au premier lancement.

### Build depuis les sources

```bash
git clone https://github.com/BerurierNoir/Live-cam-wallpaper.git
cd Live-cam-wallpaper
npm install
npm run fetch-go2rtc   # télécharge go2rtc (~6 Mo)
npm start              # mode dev
npm run build          # produit AppImage + deb dans dist/
```

---

## 🔄 Mise à jour

```bash
# Via le script (recommandé)
bash install.sh --update

# Ou depuis l'interface : ⚙ Config → ℹ Système → Vérifier
```

CamWall vérifie aussi les mises à jour automatiquement au démarrage.

---

## 🚀 Démarrage rapide

1. **Lancer CamWall** → l'assistant s'ouvre
2. **go2rtc** → l'app détecte ou télécharge automatiquement
3. **Ajouter une caméra** → choisir le type, entrer l'URL
4. **Choisir l'écran** → l'écran dédié à la surveillance
5. **Lancer** → CamWall démarre en plein écran

Passer la souris en **bas de l'écran** pour afficher le HUD.

---

## 📡 Types de caméras supportés

| Type | URL exemple | Notes |
|------|-------------|-------|
| **RTSP** | `rtsp://admin:pass@192.168.1.x:554/stream` | Standard, universel |
| **Reolink** | `reolink://admin:pass@192.168.1.x` | Natif, évite les problèmes HEVC |
| **Tapo / TP-Link** | `tapo://admin:pass@192.168.1.x` | |
| **ONVIF** | `onvif://admin:pass@192.168.1.x` | |
| **HTTP MJPEG** | `http://192.168.1.x/mjpeg` | Caméras IP simples |
| **HLS** | `http://192.168.1.x/stream.m3u8` | Streams HTTP |

### URLs Reolink spécifiques (RTSP)

```
# H.264 — main stream (HD)
rtsp://admin:pass@IP:554/h264Preview_01_main

# H.264 — sub stream (SD, recommandé pour la grille)
rtsp://admin:pass@IP:554/h264Preview_01_sub

# H.265 / 4K
rtsp://admin:pass@IP:554/h265Preview_01_main
```

> ⚠️ Caractères spéciaux dans les mots de passe : encoder en URL (`!` → `%21`, `@` → `%40`)

---

## ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| `Clic` sur une caméra | Zoom plein écran (main stream) |
| `ESC` | Retour à la grille / fermer le panneau |
| `P` | Pause / reprendre tous les streams |
| `S` | Ouvrir les paramètres |
| `F12` | DevTools (debug) |

---

## 🖥️ Multi-écrans

CamWall tourne en **plein écran** sur l'écran sélectionné. Pour changer :

⚙ CONFIG → 🖥 Écran → Sélectionner l'écran voulu

### Autostart (démarrage au login)

Dans ⚙ CONFIG → ⚙ Options → **Démarrage automatique** ✅

Ou manuellement :
```bash
# Créer l'entrée autostart
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/camwall.desktop << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=CamWall
Exec=/home/USER/.local/bin/camwall
DESKTOP
```

---

## 🏗️ Architecture

```
CamWall (Electron)
├── main.js         — fenêtre, go2rtc, tray, IPC, update, autostart
├── preload.js      — bridge IPC sécurisé (contextBridge)
├── src/
│   ├── app.html    — interface wallpaper (MJPEG + sub-stream)
│   ├── setup.html  — assistant première utilisation
│   └── loading.html
└── bin/go2rtc      — proxy RTSP→MJPEG bundlé (AlexxIT/go2rtc)
```

**Flux de données :**
```
Caméra IP (RTSP/...) → go2rtc (localhost:1984) → MJPEG → Electron
                                                 ↗ sub stream (grille)
                                                 ↗ main stream (focus)
```

---

## 🤝 Contribuer

Les PR sont les bienvenues ! Priorités :

- ARM64 build (Raspberry Pi)
- Flatpak manifest
- PTZ controls via ONVIF
- Mode nuit / filtres couleur
- Détection de mouvement (go2rtc webhooks)

---

## 📄 Licence

MIT — [LICENSE](LICENSE)

go2rtc est distribué sous sa propre licence ([AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc)).
