'use strict';
/**
 * CamWall — Main Process Entry Point
 * Une app Linux qui transforme un écran en wallpaper live avec widgets.
 *
 * Principes:
 * - Pas de terminal nécessaire (autostart, tray)
 * - Wallpaper mode: plein écran frameless sur l'écran choisi
 * - Wayland: display sélectionné via x/y dans le constructeur BrowserWindow
 */
const {
  app, Tray, Menu, nativeImage, session,
  globalShortcut, Notification, shell
} = require('electron');
const path = require('path');
const fs   = require('fs');

// Charger les modules internes
const config  = require('./config');
const go2rtc  = require('./go2rtc');
const metrics = require('./metrics');
const win     = require('./window');
const ipc     = require('./ipc');
const webhook = require('./webhook');

// Mode Wayland
// Wayland: utiliser ozone-platform-hint (pas ozone-platform qui est invalide)
app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

// ── SINGLE INSTANCE ────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  // Recréer la fenêtre sur le bon display au lieu de juste show()
  const w = win.create();
  const cfg = config.get();
  const appHtml = path.join(__dirname, '..', 'renderer', 'app.html');
  w.loadFile(appHtml);
  win.setLastUrl('file://' + appHtml);
});

// ── CERTIFICATS SELF-SIGNED (Proxmox, services locaux HTTPS) ──
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const isLocal = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1)/.test(url);
  if (isLocal) { event.preventDefault(); callback(true); }
  else callback(false);
});

// ── TRAY ──────────────────────────────────────────────────
let tray = null;

function buildTrayMenu() {
  const cfg = config.get();
  const autostartFile = require('./ipc'); // pour isAutostartEnabled
  return Menu.buildFromTemplate([
    { label: `CamWall v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Afficher / Masquer', click: () => {
      const w = win.getWindow();
      if (!w) return;
      if (w.isVisible()) win.hide(); else win.show();
    }},
    { type: 'separator' },
    { label: '⏸ Pause caméras',   click: () => win.getWindow()?.webContents.send('cmd:pause-all') },
    { label: '▶ Reprendre',        click: () => win.getWindow()?.webContents.send('cmd:resume-all') },
    { type: 'separator' },
    { label: '⚙ Paramètres',       click: () => {
      win.show();
      win.getWindow()?.webContents.send('cmd:open-settings');
    }},
    { type: 'separator' },
    { label: `Démarrage auto: ${fs.existsSync(require('path').join(require('os').homedir(), '.config/autostart/camwall.desktop')) ? '✅' : '❌'}`,
      click: () => {
        const file = require('path').join(require('os').homedir(), '.config/autostart/camwall.desktop');
        if (fs.existsSync(file)) fs.unlinkSync(file);
        else {
          const execPath = process.env.APPIMAGE || process.execPath;
          fs.mkdirSync(require('path').dirname(file), { recursive: true });
          fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=CamWall\nExec=${execPath}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`);
        }
        tray?.setContextMenu(buildTrayMenu());
      }
    },
    { label: '📂 Config',          click: () => shell.openPath(config.getDataDir()) },
    { type: 'separator' },
    { label: 'Quitter', click: () => { win.setQuitting(true); app.isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray.png');
    const iconSvg  = path.join(__dirname, '..', '..', 'assets', 'icon.svg');
    let icon = nativeImage.createEmpty();
    if (fs.existsSync(iconPath)) icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    else if (fs.existsSync(iconSvg)) icon = nativeImage.createFromPath(iconSvg).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('CamWall');
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => win.show());
    console.log('[tray] créé');
  } catch (e) { console.error('[tray]', e.message); }
}

// ── DÉMARRAGE ─────────────────────────────────────────────
app.setAppUserModelId('io.github.camwall');

app.whenReady().then(async () => {
  const cfg = config.load();

  // CORS pour les WebSockets go2rtc (file:// → ws://localhost)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const port = cfg.go2rtcPort || 1984;
    if (details.url.includes(`localhost:${port}`) || details.url.includes(`127.0.0.1:${port}`)) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'access-control-allow-origin':  ['*'],
          'access-control-allow-headers': ['*'],
        },
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // Enregistrer tous les IPC handlers
  ipc.register();

  // Créer la fenêtre wallpaper
  const w = win.create();

  // Charger loading, démarrer go2rtc, charger app
  w.loadFile(path.join(__dirname, '..', 'renderer', 'loading.html'));
  win.setLastUrl(null); // reset pendant loading
  go2rtc.start(cfg);
  const ready = await go2rtc.waitReady(cfg.go2rtcPort || 1984);
  if (ready) console.log('[go2rtc] prêt');

  if (cfg.firstRun || !cfg.cameras || !cfg.cameras.length) {
    w.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  } else {
    const appHtml = path.join(__dirname, '..', 'renderer', 'app.html');
  win.setLastUrl('file://' + appHtml);
  w.loadFile(appHtml);
  }

  // Tray
  createTray();

  // Métriques → renderer
  metrics.startPolling(data => {
    const mw = win.getWindow();
    if (mw && !mw.isDestroyed()) mw.webContents.send('metrics:update', data);
  });

  // Raccourci global Super+C → ramener CamWall
  try {
    globalShortcut.register('Super+C', () => win.show());
    console.log('[shortcut] Super+C enregistré');
  } catch (e) { console.warn('[shortcut]', e.message); }

  // Mode nuit: timer toutes les minutes
  setInterval(() => {
    const h = new Date().getHours();
    const mw = win.getWindow();
    if (mw && !mw.isDestroyed()) mw.webContents.send('time:nightmode', h >= 22 || h < 7);
  }, 60000);

  // Webhook HA (port 1985)
  webhook.start(data => {
    const mw = win.getWindow();
    if (mw && !mw.isDestroyed()) mw.webContents.send('webhook:event', data);
    if (data.action === 'alert' && Notification.isSupported())
      new Notification({ title: 'CamWall', body: data.msg || 'Alerte HA' }).show();
  });

  // Vérifier les mises à jour en arrière-plan
  setTimeout(async () => {
    try {
      const https = require('https');
      const req = https.get({
        hostname: 'api.github.com',
        path: '/repos/BerurierNoir/Live-cam-wallpaper/releases/latest',
        headers: { 'User-Agent': `CamWall/${app.getVersion()}` }, timeout: 6000,
      }, res => {
        let d = ''; res.on('data', x => d += x);
        res.on('end', () => {
          try {
            const r = JSON.parse(d);
            // Comparer versions — ne notifier QUE si vraiment plus récent
            const latest  = (r.tag_name || '').replace(/^v/, '').split('.').map(Number);
            const current = app.getVersion().replace(/^v/, '').split('.').map(Number);
            let isNewer = false;
            for (let i = 0; i < 3; i++) {
              if ((latest[i]||0) > (current[i]||0)) { isNewer = true; break; }
              if ((latest[i]||0) < (current[i]||0)) break;
            }
            if (isNewer) {
              const mw = win.getWindow();
              if (mw && !mw.isDestroyed()) mw.webContents.send('update:available', { version: r.tag_name, url: r.html_url });
            }
          } catch (_) {}
        });
      });
      req.on('error', () => {});
    } catch (_) {}
  }, 8000);
});

// ── NETTOYAGE ─────────────────────────────────────────────
app.on('before-quit', () => {
  app.isQuitting = true;
  try { go2rtc.stop(); }         catch (_) {}
  try { metrics.stopPolling(); } catch (_) {}
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { webhook.stop(); }        catch (_) {}
});

app.on('window-all-closed', () => {
  // Ne pas quitter — l'app continue dans le tray
});

app.on('web-contents-created', (_, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
});
