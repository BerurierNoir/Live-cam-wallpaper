'use strict';

/**
 * CamWall v2.0 — main process
 * Gère : fenêtre, go2rtc, tray, auto-start, update check, IPC
 */

const {
  app, BrowserWindow, ipcMain, screen,
  shell, nativeTheme, Tray, Menu, nativeImage, dialog
} = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const http   = require('http');
const https  = require('https');
const { spawn, execFile } = require('child_process');
const yaml   = require('js-yaml');

nativeTheme.themeSource = 'dark';
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const VERSION     = app.getVersion();
const USER_DATA   = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA, 'config.json');
const GO2RTC_CFG  = path.join(USER_DATA, 'go2rtc.yaml');
const LOG_PATH    = path.join(USER_DATA, 'camwall.log');
const GO2RTC_PORT = 1984;
const REPO        = 'BerurierNoir/Live-cam-wallpaper';
const AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'camwall.desktop');

// ─── LOGGER ──────────────────────────────────────────────────────────────────
const logStream = (() => {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    return fs.createWriteStream(LOG_PATH, { flags: 'a' });
  } catch (_) { return null; }
})();

function log(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  if (logStream) logStream.write(line + '\n');
  console.log(line);
}
const L = { info: (...a) => log('INFO', ...a), warn: (...a) => log('WARN', ...a), err: (...a) => log('ERR ', ...a) };

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  firstRun:        true,
  cameras:         [],        // { id, label, type, mainUrl, subUrl }
  selectedDisplay: 0,
  layout:          'auto',
  reconnect:       true,
  reconnectDelay:  5,
  maxReconnectDelay: 60,
  idleMinutes:     0,
  showClock:       true,
  showLabels:      true,
  showBitrate:     false,
  go2rtcPort:      GO2RTC_PORT,
  clickThrough:    false,
  useSubStream:    true,      // grille = sub stream si dispo
  hudTimeout:      4,         // secondes avant HUD auto-hide (0 = toujours visible)
  theme:           'dark',    // dark | darker | night
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (e) { L.err('loadConfig:', e.message); }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) { L.err('saveConfig:', e.message); }
}

let config = loadConfig();

// ─── GO2RTC ──────────────────────────────────────────────────────────────────
const ARCH_MAP = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };

function go2rtcBinName() {
  return `go2rtc_linux_${ARCH_MAP[process.arch] || 'amd64'}`;
}

function findGo2rtcBin() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'go2rtc'),
    path.join(USER_DATA, 'bin', 'go2rtc'),
    path.join(os.homedir(), '.local', 'bin', 'go2rtc'),
    '/usr/local/bin/go2rtc',
    '/usr/bin/go2rtc',
  ];
  return candidates.find(p => { try { return fs.existsSync(p) && fs.statSync(p).size > 0; } catch (_) { return false; } }) || null;
}

/**
 * Génère la config go2rtc selon le type de caméra
 * Types supportés : rtsp, reolink, tapo, onvif, mjpeg, hls, generic
 */
function buildGo2rtcStream(cam) {
  const { type = 'rtsp', mainUrl, subUrl } = cam;
  // go2rtc accepte une liste de sources par stream
  const sources = [];
  if (mainUrl) sources.push(mainUrl);
  return sources.length ? sources : null;
}

function writeGo2rtcConfig(cfg) {
  const streams = {};
  (cfg.cameras || []).forEach(cam => {
    if (!cam.id) return;
    const main = buildGo2rtcStream(cam);
    if (main) streams[cam.id] = main;
    // Sub-stream séparé si différent
    if (cam.subUrl && cam.subUrl !== cam.mainUrl) {
      streams[`${cam.id}_sub`] = [cam.subUrl];
    }
  });

  const go2rtcConfig = {
    api:  { listen: `:${cfg.go2rtcPort || GO2RTC_PORT}` },
    rtsp: { listen: ':8554' },
    streams,
  };

  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(GO2RTC_CFG, yaml.dump(go2rtcConfig));
    L.info('go2rtc config écrite:', GO2RTC_CFG);
  } catch (e) { L.err('writeGo2rtcConfig:', e.message); }
}

let go2rtcProc = null;

function startGo2rtc(cfg) {
  stopGo2rtc();
  const bin = findGo2rtcBin();
  if (!bin) { L.warn('go2rtc: binaire introuvable'); return false; }

  writeGo2rtcConfig(cfg);

  go2rtcProc = spawn(bin, ['-config', GO2RTC_CFG], { stdio: ['ignore', 'pipe', 'pipe'] });
  go2rtcProc.stdout.on('data', d => L.info('[go2rtc]', String(d).trim()));
  go2rtcProc.stderr.on('data', d => L.info('[go2rtc]', String(d).trim()));
  go2rtcProc.on('error', err => L.err('[go2rtc] spawn error:', err.message));
  go2rtcProc.on('exit', (code, sig) => {
    L.info(`[go2rtc] exit code=${code} signal=${sig}`);
    go2rtcProc = null;
  });

  L.info('go2rtc démarré:', bin);
  return true;
}

function stopGo2rtc() {
  if (go2rtcProc) {
    L.info('go2rtc: arrêt...');
    go2rtcProc.kill('SIGTERM');
    go2rtcProc = null;
  }
}

/** Attend que l'API go2rtc réponde */
function waitForGo2rtc(port, maxMs = 12000) {
  return new Promise(resolve => {
    const start = Date.now();
    function probe() {
      const req = http.get(`http://localhost:${port}/api/streams`, res => {
        res.resume();
        L.info('go2rtc: API prête');
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) { L.warn('go2rtc: timeout'); resolve(false); return; }
        setTimeout(probe, 500);
      });
      req.setTimeout(800, () => req.destroy());
    }
    probe();
  });
}

/** Téléchargement go2rtc avec progression */
function downloadGo2rtc(event) {
  const binDir  = path.join(USER_DATA, 'bin');
  const binPath = path.join(binDir, 'go2rtc');
  fs.mkdirSync(binDir, { recursive: true });

  const fname = go2rtcBinName();
  const url = `https://github.com/AlexxIT/go2rtc/releases/latest/download/${fname}`;
  L.info('download go2rtc:', url);

  const send = (msg) => {
    try { event && event.sender && !event.sender.isDestroyed() && event.sender.send('go2rtc-dl-progress', msg); } catch (_) {}
  };

  return new Promise((resolve, reject) => {
    const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath],
      (err) => {
        if (err) { L.err('download error:', err.message); return reject(err); }
        try { fs.chmodSync(binPath, '755'); } catch (e) { L.err('chmod:', e.message); }
        L.info('go2rtc téléchargé:', binPath);
        resolve({ success: true, path: binPath });
      }
    );
    curl.stderr && curl.stderr.on('data', d => send(String(d).trim()));
  });
}

// ─── AUTO-START ──────────────────────────────────────────────────────────────
function getExecPath() {
  // AppImage ou electron en dev
  return process.env.APPIMAGE || process.execPath;
}

function isAutostartEnabled() {
  return fs.existsSync(AUTOSTART_FILE);
}

function setAutostart(enabled) {
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(AUTOSTART_FILE, `[Desktop Entry]
Type=Application
Name=CamWall
Comment=Live camera wallpaper
Exec=${getExecPath()}
Icon=camwall
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`);
      L.info('Autostart activé:', AUTOSTART_FILE);
    } else {
      if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE);
      L.info('Autostart désactivé');
    }
    return true;
  } catch (e) { L.err('setAutostart:', e.message); return false; }
}

// ─── UPDATE CHECK ────────────────────────────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.replace(/^v/,'').split('.').map(Number);
  const pb = b.replace(/^v/,'').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
}

function checkForUpdates() {
  return new Promise(resolve => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': `CamWall/${VERSION}` },
      timeout: 5000,
    };
    const req = https.get(opts, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latest = release.tag_name || '0.0.0';
          const newer = compareVersions(latest, VERSION) > 0;
          resolve({ available: newer, version: latest, url: release.html_url, current: VERSION });
        } catch (e) { resolve({ available: false, current: VERSION }); }
      });
    });
    req.on('error', () => resolve({ available: false, current: VERSION }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false, current: VERSION }); });
  });
}

// ─── SYSTEM TRAY ────────────────────────────────────────────────────────────
let tray = null;

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `CamWall v${VERSION}`, enabled: false },
    { type: 'separator' },
    { label: 'Afficher / Masquer', click: () => { if (mainWin) { mainWin.isVisible() ? mainWin.hide() : mainWin.show(); } } },
    { type: 'separator' },
    { label: '⏸ Pause streams',    click: () => mainWin && mainWin.webContents.send('cmd:pause-all') },
    { label: '▶ Reprendre streams', click: () => mainWin && mainWin.webContents.send('cmd:resume-all') },
    { type: 'separator' },
    { label: '⚙ Paramètres',       click: () => { showMain(); mainWin && mainWin.webContents.send('cmd:open-settings'); } },
    { label: '🔧 Assistant setup',  click: () => { showMain(); mainWin && mainWin.loadFile(path.join(__dirname, 'src', 'setup.html')); } },
    { type: 'separator' },
    { label: `Démarrage auto : ${isAutostartEnabled() ? '✅' : '❌'}`,
      click: () => { setAutostart(!isAutostartEnabled()); tray.setContextMenu(buildTrayMenu()); } },
    { label: '📂 Dossier config',  click: () => shell.openPath(USER_DATA) },
    { label: '📋 Voir logs',       click: () => shell.openPath(LOG_PATH) },
    { type: 'separator' },
    { label: '🔄 Vérifier mises à jour', click: async () => {
      const upd = await checkForUpdates();
      if (upd.available) shell.openExternal(upd.url);
      else dialog.showMessageBox(mainWin, { message: `CamWall v${VERSION} est à jour.`, buttons: ['OK'] });
    }},
    { type: 'separator' },
    { label: 'Quitter CamWall', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'tray.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createFromDataURL(TRAY_ICON_B64);

    tray = new Tray(icon);
    tray.setToolTip('CamWall');
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => { if (mainWin) { mainWin.isVisible() ? mainWin.focus() : mainWin.show(); } });
    L.info('Tray créé');
  } catch (e) { L.err('Tray error:', e.message); }
}

// Icône tray 16x16 inline (vert/noir, cam)
const TRAY_ICON_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAoklEQVQ4jWNgGAWjgB6AkYGB4T8DA8N/KjCjqgEDAwMDIwMDw38qMKOqAQMDAwMjAwPDfyowo6oBAy5NDNQZAACQS39/f3ZGBob/DAwM/6nAjKoGDLg0MVBnAADIDEkIDY2NjY2MjIy3NzczM7MwMDIwMDY2NjIy0tjIuP/bWxkZGT8b/39/RoZGRm5GRkZ3//jIyMjY2NjYxEBACZNECzR3AIEAAAAAElFTkSuQmCC';

// ─── FENÊTRE PRINCIPALE ──────────────────────────────────────────────────────
let mainWin = null;

function showMain() {
  if (mainWin) { mainWin.show(); mainWin.focus(); }
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const display  = displays[config.selectedDisplay] || displays[0];

  mainWin = new BrowserWindow({
    x:           display.bounds.x,
    y:           display.bounds.y,
    width:       display.bounds.width,
    height:      display.bounds.height,
    frame:       false,
    transparent: false,
    skipTaskbar: false,
    resizable:   true,
    fullscreen:  true,
    backgroundColor: '#030508',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,
      backgroundThrottling: false,  // pas de throttling en arrière-plan
    },
  });

  // F12 = DevTools (debug seulement)
  mainWin.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWin.webContents.toggleDevTools();
  });

  // Masquer au lieu de fermer (tray)
  mainWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.on('closed', () => { mainWin = null; });

  if (config.firstRun || config.cameras.length === 0) {
    mainWin.loadFile(path.join(__dirname, 'src', 'setup.html'));
  } else {
    loadApp();
  }
}

async function loadApp() {
  if (!mainWin) return;
  mainWin.loadFile(path.join(__dirname, 'src', 'loading.html'));
  startGo2rtc(config);
  await waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT);
  if (mainWin) mainWin.loadFile(path.join(__dirname, 'src', 'app.html'));
}

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────
function registerIPC() {
  // — Config —
  ipcMain.handle('cfg:get',   ()       => loadConfig());
  ipcMain.handle('cfg:save',  (_, c)   => { config = { ...config, ...c }; saveConfig(config); tray && tray.setContextMenu(buildTrayMenu()); return true; });

  // — Écrans —
  ipcMain.handle('display:list', () =>
    screen.getAllDisplays().map((d, i) => ({
      index: i, label: `Écran ${i + 1}`,
      primary: d === screen.getPrimaryDisplay(),
      width: d.bounds.width, height: d.bounds.height,
      x: d.bounds.x, y: d.bounds.y,
    }))
  );
  ipcMain.handle('display:set', (_, idx) => {
    const d = screen.getAllDisplays()[idx] || screen.getAllDisplays()[0];
    config.selectedDisplay = idx; saveConfig(config);
    if (mainWin) { mainWin.setFullScreen(false); mainWin.setBounds(d.bounds); mainWin.setFullScreen(true); }
    return true;
  });

  // — go2rtc —
  ipcMain.handle('go2rtc:check',    ()      => ({ found: !!findGo2rtcBin(), path: findGo2rtcBin(), arch: process.arch }));
  ipcMain.handle('go2rtc:start',    (_, c)  => startGo2rtc(c || config));
  ipcMain.handle('go2rtc:stop',     ()      => { stopGo2rtc(); return true; });
  ipcMain.handle('go2rtc:restart',  (_, c)  => startGo2rtc({ ...config, ...(c || {}) }));
  ipcMain.handle('go2rtc:download', ev      => downloadGo2rtc(ev));
  ipcMain.handle('go2rtc:status',   ()      => waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT, 2000));
  ipcMain.handle('go2rtc:write-cfg',(_, c)  => { writeGo2rtcConfig(c || config); return true; });

  // — Navigation —
  ipcMain.handle('nav:app',   async () => loadApp());
  ipcMain.handle('nav:setup', ()       => mainWin && mainWin.loadFile(path.join(__dirname, 'src', 'setup.html')));

  // — Mouse / click-through —
  ipcMain.on('mouse:interactive', (_, on) => {
    if (mainWin) mainWin.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.handle('clickthrough:set', (_, on) => {
    config.clickThrough = on; saveConfig(config);
    if (mainWin) mainWin.setIgnoreMouseEvents(on, { forward: true });
  });

  // — Autostart —
  ipcMain.handle('autostart:get', ()       => isAutostartEnabled());
  ipcMain.handle('autostart:set', (_, on)  => setAutostart(on));

  // — Update —
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:open',  (_, url) => shell.openExternal(url));

  // — Utilitaires —
  ipcMain.handle('open:config-dir', () => shell.openPath(USER_DATA));
  ipcMain.handle('open:log',        () => shell.openPath(LOG_PATH));
  ipcMain.handle('app:version',     () => VERSION);
  ipcMain.handle('app:quit',        () => { app.isQuitting = true; app.quit(); });
}

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => { if (mainWin) { mainWin.show(); mainWin.focus(); } });

app.whenReady().then(async () => {
  config = loadConfig();
  registerIPC();
  createWindow();
  createTray();

  // Vérif update en arrière-plan (sans bloquer)
  setTimeout(async () => {
    try {
      const upd = await checkForUpdates();
      if (upd.available) {
        L.info(`Mise à jour disponible: ${upd.version}`);
        if (mainWin) mainWin.webContents.send('update:available', upd);
        if (tray) tray.setToolTip(`CamWall — Mise à jour ${upd.version} disponible !`);
      }
    } catch (_) {}
  }, 5000);
});

app.on('before-quit',       () => { app.isQuitting = true; stopGo2rtc(); });
app.on('window-all-closed', () => { /* géré par tray */ });
app.on('web-contents-created', (_, wc) => wc.setWindowOpenHandler(() => ({ action: 'deny' })));
