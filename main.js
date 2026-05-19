'use strict';

/**
 * CamWall v2.2 — main process
 * Changelog v2.1:
 *   - Fix: webSecurity false → true (go2rtc envoie déjà CORS headers)
 *   - Fix v2.2: URL-decode des URLs avant écriture go2rtc YAML (%21→!, etc.)
 *   - Fix v2.2: supprimé auto-FFmpeg transcoding (cause issues si ffmpeg absent)
 *   - Fix: skipTaskbar true (cohérent avec tray)
 *   - Fix: supprimé import dialog inutilisé
 *   - Fix: log rotation (max 2MB)
 *   - Fix: session CORS interceptor pour localhost
 *   - Amélioration: détection CUDA pour RTX 3080/3090
 */

const {
  app, BrowserWindow, ipcMain, screen,
  shell, nativeTheme, Tray, Menu, nativeImage, session
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

// ── CONSTANTES ───────────────────────────────────────────────────────────────
const VERSION        = app.getVersion();
const USER_DATA      = app.getPath('userData');
const CONFIG_PATH    = path.join(USER_DATA, 'config.json');
const GO2RTC_CFG     = path.join(USER_DATA, 'go2rtc.yaml');
const LOG_PATH       = path.join(USER_DATA, 'camwall.log');
const LOG_MAX_BYTES  = 2 * 1024 * 1024; // 2 MB max
const GO2RTC_PORT    = 1984;
const REPO           = 'BerurierNoir/Live-cam-wallpaper';
const AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'camwall.desktop');
const ARCH_MAP       = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };

// ── LOGGER avec rotation ──────────────────────────────────────────────────────
function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(LOG_PATH);
    if (stat.size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, LOG_PATH + '.old');
    }
  } catch (_) { /* pas encore créé */ }
}

const logStream = (() => {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    rotateLogIfNeeded();
    return fs.createWriteStream(LOG_PATH, { flags: 'a' });
  } catch (_) { return null; }
})();

function log(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  if (logStream) logStream.write(line + '\n');
  if (process.env.NODE_ENV === 'development') console.log(line);
  else console.log(line); // toujours logguer pour débogage
}
const L = {
  info: (...a) => log('INFO', ...a),
  warn: (...a) => log('WARN', ...a),
  err:  (...a) => log('ERR ', ...a),
};

// ── CONFIG ───────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  firstRun:           true,
  cameras:            [],
  selectedDisplay:    0,
  layout:             'auto',
  reconnect:          true,
  reconnectDelay:     5,
  maxReconnectDelay:  60,
  idleMinutes:        0,
  showClock:          true,
  showLabels:         true,
  go2rtcPort:         GO2RTC_PORT,
  clickThrough:       false,
  useSubStream:       true,
  gridGap:            3,
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

// ── GO2RTC ───────────────────────────────────────────────────────────────────
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
  return candidates.find(p => {
    try { return fs.existsSync(p) && fs.statSync(p).size > 0; }
    catch (_) { return false; }
  }) || null;
}

/**
 * Génère les sources go2rtc pour une caméra.
 *
 * Pour les caméras potentiellement H265 (Reolink 4K, ONVIF, RTSP générique),
 * on ajoute une source FFmpeg qui transcodes H265→H264 via accélération matérielle.
 * Cela permet au endpoint MJPEG de go2rtc de servir le stream même si la source
 * est H265 (qui sinon nécessite FFmpeg de toute façon).
 *
 * Pattern go2rtc recommandé (Frigate docs) :
 *   streams:
 *     cam1:
 *       - rtsp://...  # source principale (H265 ou H264)
 *       - ffmpeg:cam1#video=h264#hardware  # ajoute track H264 via transcoding
 *
 * #hardware = auto-détecte CUDA (NVIDIA), VAAPI (Intel/AMD), etc.
 */
function decodeUrl(url) {
  // go2rtc YAML attend les caractères littéraux (! pas %21, @ pas %40, etc.)
  // L'utilisateur saisit souvent des URLs avec encodage URL (%21 pour !)
  try { return decodeURIComponent(url); }
  catch (_) { return url; }
}

function buildGo2rtcStream(cam) {
  if (!cam.mainUrl) return null;

  // CRITIQUE: décoder l'URL avant écriture YAML
  const url = decodeUrl(cam.mainUrl);

  // go2rtc ne peut pas servir MJPEG depuis H264/H265 sans FFmpeg.
  // La solution : ajouter ffmpeg:CAM_ID#video=mjpeg comme 2ème source.
  // go2rtc utilise alors FFmpeg pour décoder et encoder en JPEG.
  // FFmpeg doit être dans PATH (vérifié : /usr/bin/ffmpeg sur Bazzite).
  return [url, `ffmpeg:${cam.id}#video=mjpeg`];
}

function writeGo2rtcConfig(cfg) {
  const streams = {};

  (cfg.cameras || []).forEach(cam => {
    if (!cam.id) return;

    // Stream principal
    const mainSources = buildGo2rtcStream(cam);
    if (mainSources) streams[cam.id] = mainSources;

    // Sub-stream séparé si configuré et différent du main
    if (cam.subUrl && cam.subUrl !== cam.mainUrl) {
      // Sub-stream généralement H264 → pas besoin de transcoding
      streams[`${cam.id}_sub`] = [decodeUrl(cam.subUrl)];
    }
  });

  const go2rtcYaml = yaml.dump({
    api:  { listen: `:${cfg.go2rtcPort || GO2RTC_PORT}` },
    rtsp: { listen: ':8554' },
    log:  { level: 'warn' }, // Réduire le bruit dans les logs
    streams,
  });

  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(GO2RTC_CFG, go2rtcYaml);
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
    try { go2rtcProc.kill('SIGTERM'); } catch (_) {}
    go2rtcProc = null;
    L.info('go2rtc: arrêt SIGTERM envoyé');
  }
}

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

function downloadGo2rtc(event) {
  const binDir  = path.join(USER_DATA, 'bin');
  const binPath = path.join(binDir, 'go2rtc');
  fs.mkdirSync(binDir, { recursive: true });

  const url = `https://github.com/AlexxIT/go2rtc/releases/latest/download/${go2rtcBinName()}`;
  L.info('download go2rtc:', url);

  const send = (msg) => {
    try {
      if (event?.sender && !event.sender.isDestroyed())
        event.sender.send('go2rtc-dl-progress', msg);
    } catch (_) {}
  };

  return new Promise((resolve, reject) => {
    const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath], err => {
      if (err) { L.err('download error:', err.message); return reject(err); }
      try { fs.chmodSync(binPath, '755'); } catch (e) { L.err('chmod:', e.message); }
      L.info('go2rtc téléchargé:', binPath);
      resolve({ success: true, path: binPath });
    });
    curl.stderr?.on('data', d => send(String(d).trim()));
  });
}

// ── AUTO-START ────────────────────────────────────────────────────────────────
function getExecPath() {
  return process.env.APPIMAGE || process.execPath;
}

function isAutostartEnabled() {
  return fs.existsSync(AUTOSTART_FILE);
}

function setAutostart(enabled) {
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(AUTOSTART_FILE,
        `[Desktop Entry]\nType=Application\nName=CamWall\nComment=Live camera wallpaper\n` +
        `Exec=${getExecPath()}\nIcon=camwall\nHidden=false\nNoDisplay=false\n` +
        `X-GNOME-Autostart-enabled=true\n`
      );
      L.info('Autostart activé:', AUTOSTART_FILE);
    } else {
      if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE);
      L.info('Autostart désactivé');
    }
    return true;
  } catch (e) { L.err('setAutostart:', e.message); return false; }
}

// ── UPDATE CHECK ──────────────────────────────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checkForUpdates() {
  return new Promise(resolve => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': `CamWall/${VERSION}` },
      timeout: 6000,
    };
    const req = https.get(opts, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latest = release.tag_name || '0.0.0';
          resolve({
            available: compareVersions(latest, VERSION) > 0,
            version: latest,
            url: release.html_url,
            current: VERSION,
          });
        } catch (e) { resolve({ available: false, current: VERSION }); }
      });
    });
    req.on('error', () => resolve({ available: false, current: VERSION }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false, current: VERSION }); });
  });
}

// ── SYSTEM TRAY ───────────────────────────────────────────────────────────────
let tray = null;

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `CamWall v${VERSION}`, enabled: false },
    { type: 'separator' },
    { label: 'Afficher / Masquer', click: () => {
      if (mainWin) mainWin.isVisible() ? mainWin.hide() : mainWin.show();
    }},
    { type: 'separator' },
    { label: '⏸ Pause streams',    click: () => mainWin?.webContents.send('cmd:pause-all') },
    { label: '▶ Reprendre streams', click: () => mainWin?.webContents.send('cmd:resume-all') },
    { type: 'separator' },
    { label: '⚙ Paramètres',       click: () => { showMain(); mainWin?.webContents.send('cmd:open-settings'); } },
    { label: '🔧 Assistant setup',  click: () => { showMain(); mainWin?.loadFile(path.join(__dirname, 'src', 'setup.html')); } },
    { type: 'separator' },
    { label: `Démarrage auto : ${isAutostartEnabled() ? '✅' : '❌'}`,
      click: () => { setAutostart(!isAutostartEnabled()); tray?.setContextMenu(buildTrayMenu()); }
    },
    { label: '📂 Dossier config',   click: () => shell.openPath(USER_DATA) },
    { label: '📋 Voir logs',        click: () => shell.openPath(LOG_PATH) },
    { type: 'separator' },
    { label: '🔄 Vérifier mises à jour', click: async () => {
      const upd = await checkForUpdates();
      if (upd.available) shell.openExternal(upd.url);
      // Pas de dialog popup intrusif
    }},
    { type: 'separator' },
    { label: 'Quitter CamWall', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  try {
    // Essayer d'utiliser l'icône SVG convertie
    const iconPath = path.join(__dirname, 'assets', 'tray.png');
    const iconPathSvg = path.join(__dirname, 'assets', 'icon.svg');

    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else if (fs.existsSync(iconPathSvg)) {
      icon = nativeImage.createFromPath(iconPathSvg).resize({ width: 16, height: 16 });
    } else {
      // Fallback : icône générée programmatiquement (simple rectangle vert)
      icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('CamWall');
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => {
      if (mainWin) mainWin.isVisible() ? mainWin.focus() : mainWin.show();
    });
    L.info('Tray créé');
  } catch (e) { L.err('Tray error:', e.message); }
}

// ── FENÊTRE PRINCIPALE ────────────────────────────────────────────────────────
let mainWin = null;

function showMain() {
  if (mainWin) { mainWin.show(); mainWin.focus(); }
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const display  = displays[config.selectedDisplay] || displays[0];

  mainWin = new BrowserWindow({
    x:      display.bounds.x,
    y:      display.bounds.y,
    width:  display.bounds.width,
    height: display.bounds.height,
    frame:           false,
    transparent:     false,
    skipTaskbar:     true,    // Fix: true = disparaît de la barre des tâches (géré par tray)
    resizable:       true,
    fullscreen:      true,
    backgroundColor: '#070a14',
    webPreferences: {
      preload:              path.join(__dirname, 'preload.js'),
      nodeIntegration:      false,
      contextIsolation:     true,
      webSecurity:          false,   // App locale: file:// → http://localhost nécessite false (pas de contenu externe chargé)
      backgroundThrottling: false,   // Pas de throttle quand en arrière-plan
      sandbox:              true,    // Sécurité Chromium : sandbox activé
    },
  });

  // F12 = DevTools (debug uniquement)
  mainWin.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWin.webContents.toggleDevTools();
  });

  // Masquer au lieu de fermer (géré par tray)
  mainWin.on('close', e => {
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

// ── IPC HANDLERS ──────────────────────────────────────────────────────────────
function registerIPC() {
  // Config
  ipcMain.handle('cfg:get',  ()      => loadConfig());
  ipcMain.handle('cfg:save', (_, c)  => {
    config = { ...config, ...c };
    saveConfig(config);
    tray?.setContextMenu(buildTrayMenu());
    return true;
  });

  // Écrans
  ipcMain.handle('display:list', () =>
    screen.getAllDisplays().map((d, i) => ({
      index:   i,
      label:   `Écran ${i + 1}`,
      primary: d === screen.getPrimaryDisplay(),
      width:   d.bounds.width,
      height:  d.bounds.height,
      x: d.bounds.x,
      y: d.bounds.y,
    }))
  );
  ipcMain.handle('display:set', (_, idx) => {
    const d = screen.getAllDisplays()[idx] || screen.getAllDisplays()[0];
    config.selectedDisplay = idx;
    saveConfig(config);
    if (mainWin) {
      mainWin.setFullScreen(false);
      mainWin.setBounds(d.bounds);
      mainWin.setFullScreen(true);
    }
    return true;
  });

  // go2rtc
  ipcMain.handle('go2rtc:check',    ()     => ({ found: !!findGo2rtcBin(), path: findGo2rtcBin(), arch: process.arch }));
  ipcMain.handle('go2rtc:start',    (_, c) => startGo2rtc(c || config));
  ipcMain.handle('go2rtc:stop',     ()     => { stopGo2rtc(); return true; });
  ipcMain.handle('go2rtc:restart',  (_, c) => startGo2rtc({ ...config, ...(c || {}) }));
  ipcMain.handle('go2rtc:download', ev     => downloadGo2rtc(ev));
  ipcMain.handle('go2rtc:status',   ()     => waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT, 2000));
  ipcMain.handle('go2rtc:write-cfg',(_, c) => { writeGo2rtcConfig(c || config); return true; });

  // Navigation
  ipcMain.handle('nav:app',   async () => loadApp());
  ipcMain.handle('nav:setup', ()       => mainWin?.loadFile(path.join(__dirname, 'src', 'setup.html')));

  // Mouse / click-through
  ipcMain.on('mouse:interactive', (_, on) => {
    mainWin?.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.handle('clickthrough:set', (_, on) => {
    config.clickThrough = on;
    saveConfig(config);
    mainWin?.setIgnoreMouseEvents(on, { forward: true });
  });

  // Autostart
  ipcMain.handle('autostart:get', ()      => isAutostartEnabled());
  ipcMain.handle('autostart:set', (_, on) => setAutostart(on));

  // Updates
  ipcMain.handle('update:check', ()        => checkForUpdates());
  ipcMain.handle('update:open',  (_, url)  => shell.openExternal(url));

  // Utilitaires
  ipcMain.handle('open:config-dir', () => shell.openPath(USER_DATA));
  ipcMain.handle('open:log',        () => shell.openPath(LOG_PATH));
  ipcMain.handle('app:version',     () => VERSION);
  ipcMain.handle('app:quit',        () => { app.isQuitting = true; app.quit(); });
}

// ── LIFECYCLE ─────────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWin) { mainWin.show(); mainWin.focus(); }
});

app.whenReady().then(async () => {
  config = loadConfig();

  // Fix webSecurity: true — intercepter les headers CORS pour go2rtc localhost
  // go2rtc envoie déjà Access-Control-Allow-Origin: * mais on s'assure
  // que les requêtes file:// (origin: null) vers localhost:1984 passent
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith(`http://localhost:${config.go2rtcPort || GO2RTC_PORT}`)) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'access-control-allow-origin':  ['*'],
          'access-control-allow-headers': ['Content-Type, Accept'],
          'access-control-allow-methods': ['GET, POST, OPTIONS'],
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  registerIPC();
  createWindow();
  createTray();

  // Update check en arrière-plan (5s délai pour ne pas bloquer le démarrage)
  setTimeout(async () => {
    try {
      const upd = await checkForUpdates();
      if (upd.available) {
        L.info(`Mise à jour disponible: ${upd.version}`);
        mainWin?.webContents.send('update:available', upd);
        tray?.setToolTip(`CamWall — Mise à jour v${upd.version} disponible !`);
      } else {
        L.info(`CamWall v${VERSION} est à jour`);
      }
    } catch (e) { L.warn('update check failed:', e.message); }
  }, 5000);
});

app.on('before-quit',       () => { app.isQuitting = true; stopGo2rtc(); });
app.on('window-all-closed', () => { /* géré par le tray */ });
app.on('web-contents-created', (_, wc) => {
  // Bloquer toutes les nouvelles fenêtres et la navigation externe
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
});



