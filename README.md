# CamWall

> **Live camera wallpaper for Linux** — stream RTSP cameras directly on any screen, with a minimal hover-triggered HUD.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-blue)
![Built with Electron](https://img.shields.io/badge/built%20with-Electron-9FEAF9)

---

## ✨ Features

- **Multi-camera grid** — auto layout (1, 1×2, 2×2, 3×2, 3×3) or manual
- **Hover HUD** — minimal control bar slides up from the bottom edge on hover
- **Borderless fullscreen** — no window decorations, fills any chosen screen
- **go2rtc bundled** — RTSP → WebRTC proxy embedded, managed automatically
- **Click any camera** to expand fullscreen, ESC to return to grid
- **Per-camera pause** and global pause
- **Auto-reconnect** with configurable delay
- **Idle pause** — stops streams after N minutes of inactivity
- **Persistent config** — cameras, layout, display choice all saved
- **Setup wizard** — guided first-run configuration
- **Works on Wayland & X11** (KDE, GNOME, and more)

---

## 📦 Installation

### Option A — AppImage (recommended)

```bash
# 1. Download the latest AppImage from Releases
wget https://github.com/YOUR_USERNAME/camwall/releases/latest/download/CamWall-x86_64.AppImage

# 2. Make executable and run
chmod +x CamWall-x86_64.AppImage
./CamWall-x86_64.AppImage
```

The first run opens a **setup wizard** that guides you through go2rtc and camera configuration.

### Option B — .deb package

```bash
wget https://github.com/YOUR_USERNAME/camwall/releases/latest/download/camwall_amd64.deb
sudo dpkg -i camwall_amd64.deb
camwall
```

### Option C — Build from source

```bash
git clone https://github.com/YOUR_USERNAME/camwall.git
cd camwall
npm install
npm run fetch-go2rtc   # downloads go2rtc binary
npm start              # development mode
npm run build          # produces AppImage + deb in dist/
```

---

## 🚀 Quick Start

1. **Launch CamWall** — the setup wizard opens automatically on first run
2. **go2rtc check** — the app detects or downloads go2rtc automatically
3. **Add cameras** — enter the RTSP URL, an ID, and a display label for each camera
4. **Choose a screen** — pick which monitor CamWall should use
5. **Launch** — CamWall starts in fullscreen on the chosen screen

After setup, hover near the **bottom edge** to reveal the HUD controls.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Click` on camera | Expand to fullscreen |
| `ESC` | Return to grid / close panel |
| `P` | Pause / resume all streams |
| `S` | Open settings panel |

---

## ⚙️ Configuration

Config is stored in `~/.config/CamWall/config.json`.

### Adding a camera manually

Edit `~/.config/CamWall/go2rtc.yaml`:

```yaml
streams:
  entree:
    - rtsp://admin:password@192.168.1.12:554/h264Preview_01_main
  jardin:
    - rtsp://admin:password@192.168.1.13:554/h264Preview_01_main
```

Then add the camera in CamWall settings (⚙ button in the HUD) using the same ID.

### RTSP URL formats (Reolink example)

```
# Main stream (HD / 4K)
rtsp://admin:password@IP:554/h264Preview_01_main

# Sub stream (SD, lighter)
rtsp://admin:password@IP:554/h264Preview_01_sub

# H.265 cameras
rtsp://admin:password@IP:554/h265Preview_01_main
```

> ⚠️ Avoid special characters (`@`, `:`, `/`) in passwords. Use `%40`, `%3A`, `%2F` if needed.

---

## 🖥️ Multi-monitor Setup

CamWall runs **fullscreen** on the selected screen. To change the target screen:

1. Hover near the bottom edge → HUD appears
2. Click **⚙ CONFIG**
3. Under **Écran dédié**, click the desired screen

KDE Plasma remembers the window position between sessions.

### Auto-start on login (KDE)

Add to **System Settings → Autostart**:
```
/path/to/CamWall-x86_64.AppImage
```

Or create a systemd user service:
```ini
# ~/.config/systemd/user/camwall.service
[Unit]
Description=CamWall — live camera wallpaper
After=graphical-session.target

[Service]
Type=simple
ExecStart=/path/to/CamWall-x86_64.AppImage
Restart=on-failure

[Install]
WantedBy=graphical-session.target
```

```bash
systemctl --user enable --now camwall
```

---

## 🏗️ Architecture

```
CamWall (Electron)
├── main.js          — main process: window management, go2rtc lifecycle, IPC
├── preload.js       — secure IPC bridge (contextBridge)
├── src/
│   ├── app.html     — camera wall UI (WebRTC via go2rtc)
│   └── setup.html   — first-run setup wizard
└── bin/
    └── go2rtc       — bundled RTSP→WebRTC proxy (AlexxIT/go2rtc)
```

**Data flow:**
```
RTSP Camera → go2rtc (localhost:1984) → WebRTC → Electron renderer
```

---

## 🔧 go2rtc

CamWall bundles [go2rtc](https://github.com/AlexxIT/go2rtc) by AlexxIT.  
go2rtc config is auto-generated from CamWall's camera list and stored at:
```
~/.config/CamWall/go2rtc.yaml
```

You can also edit this file manually and restart go2rtc from the settings panel.

---

## 🤝 Contributing

Pull requests welcome! Areas where help is appreciated:

- **ARM64 support** — go2rtc ARM64 bundling
- **Flatpak manifest** — proper Flatpak packaging
- **wl-layer-shell** — native Wayland wallpaper protocol support
- **ONVIF / PTZ** — camera pan/tilt control overlay

---

## 📄 License

MIT — see [LICENSE](LICENSE)

go2rtc is distributed separately under its own license.
