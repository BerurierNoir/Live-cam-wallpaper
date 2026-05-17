'use strict';

const { app, BrowserWindow, ipcMain, screen, shell, nativeTheme } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawn, execFile } = require('child_process');
const yaml   = require('js-yaml');

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const IS_DEV       = process.env.NODE_ENV === 'development' || !app.isPackaged;
const USER_DATA    = app.getPath('userData');
const CONFIG_PATH  = path.join(USER_DATA, 'config.json');
const GO2RTC_CFG   = path.join(USER_DATA, 'go2rtc.yaml');
const GO2RTC_PORT  = 1984;

nativeTheme.themeSource = 'dark';

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  firstRun:      true,
  cameras:       [],              // [{ id, label, rtspUrl }]
  selectedDisplay: 0,
  layout:        'auto',          // auto | 1 | 2 | 4 | 6 | 9
  reconnect:     true,
  reconnectDelay: 5,
  idleMinutes:   0,
  showClock:     true,
  showLabels:    true,
  go2rtcPort:    GO2RTC_PORT,
  clickThrough:  false,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();

// ─── GO2RTC ──────────────────────────────────────────────────────────────────
function findGo2rtcBin() {
  const candidates = [
    // AppImage / packaged: bundlé dans resources/bin/
    path.join(process.resourcesPath || '', 'bin', 'go2rtc'),
    // Téléchargé par l'app dans userData
    path.join(USER_DATA, 'bin', 'go2rtc'),
    // Installé par l'utilisateur
    path.join(os.homedir(), '.local', 'bin', 'go2rtc'),
    '/usr/local/bin/go2rtc',
    '/usr/bin/go2rtc',
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } }) || null;
}

let go2rtcProc = null;

function writeGo2rtcConfig(cfg) {
  const streams = {};
  (cfg.cameras || []).forEach(cam => {
    if (cam.id && cam.rtspUrl) streams[cam.id] = [cam.rtspUrl];
  });
  const go2rtcYaml = yaml.dump({
    api:  { listen: `:${cfg.go2rtcPort || GO2RTC_PORT}` },
    rtsp: { listen: ':8554' },
    streams,
  });
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(GO2RTC_CFG, go2rtcYaml);
}

function startGo2rtc(cfg) {
  stopGo2rtc();
  const bin = findGo2rtcBin();
  if (!bin) return false;
  writeGo2rtcConfig(cfg);
  go2rtcProc = spawn(bin, ['-config', GO2RTC_CFG], { stdio: ['ignore', 'pipe', 'pipe'] });
  go2rtcProc.stdout.on('data', d => IS_DEV && process.stdout.write(`[go2rtc] ${d}`));
  go2rtcProc.stderr.on('data', d => IS_DEV && process.stderr.write(`[go2rtc] ${d}`));
  go2rtcProc.on('error', err => console.error('[go2rtc] spawn error:', err));
  go2rtcProc.on('exit',  code => { go2rtcProc = null; console.log('[go2rtc] exit code:', code); });
  return true;
}

function stopGo2rtc() {
  if (go2rtcProc) { go2rtcProc.kill('SIGTERM'); go2rtcProc = null; }
}

// ─── TÉLÉCHARGEMENT GO2RTC ───────────────────────────────────────────────────
function downloadGo2rtc(event) {
  const binDir  = path.join(USER_DATA, 'bin');
  const binPath = path.join(binDir, 'go2rtc');
  fs.mkdirSync(binDir, { recursive: true });

  const url = 'https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64';

  return new Promise((resolve, reject) => {
    const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath],
      (err) => {
        if (err) return reject(err);
        try { fs.chmodSync(binPath, '755'); } catch (_) {}
        resolve({ success: true, path: binPath });
      }
    );
    if (curl.stderr) {
      curl.stderr.on('data', data => {
        // forward progress to renderer
        if (event && event.sender) {
          try { event.sender.send('go2rtc-download-progress', String(data)); } catch(_) {}
        }
      });
    }
  });
}

// ─── FENÊTRE PRINCIPALE ──────────────────────────────────────────────────────
let mainWin = null;

function getTargetDisplay() {
  const displays = screen.getAllDisplays();
  return displays[config.selectedDisplay] || displays[0];
}

function createMainWindow() {
  const display = getTargetDisplay();

  mainWin = new BrowserWindow({
    x:      display.bounds.x,
    y:      display.bounds.y,
    width:  display.bounds.width,
    height: display.bounds.height,
    frame:           false,
    transparent:     false,
    skipTaskbar:     true,
    resizable:       false,
    movable:         false,
    minimizable:     false,
    maximizable:     false,
    fullscreen:      true,
    alwaysOnTop:     false,
    focusable:       true,
    hasShadow:       false,
    backgroundColor: '#030508',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,   // nécessaire pour fetch() vers localhost depuis file://
    },
  });

  // Mode click-through si activé
  if (config.clickThrough) {
    mainWin.setIgnoreMouseEvents(true, { forward: true });
  }

  // Charger la bonne page
  if (config.firstRun || config.cameras.length === 0) {
    mainWin.loadFile(path.join(__dirname, 'src', 'setup.html'));
  } else {
    mainWin.loadFile(path.join(__dirname, 'src', 'app.html'));
    startGo2rtc(config);
  }

  if (IS_DEV) mainWin.webContents.openDevTools({ mode: 'detach' });

  mainWin.on('closed', () => { mainWin = null; });
}

// ─── IPC HANDLERS ─────────────────────────────────────────────────────────────
function registerIPC() {

  // Config
  ipcMain.handle('cfg:get', () => loadConfig());
  ipcMain.handle('cfg:save', (_, newCfg) => {
    config = { ...config, ...newCfg };
    saveConfig(config);
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
      x:       d.bounds.x,
      y:       d.bounds.y,
    }))
  );

  ipcMain.handle('display:set', (_, idx) => {
    if (!mainWin) return;
    const displays = screen.getAllDisplays();
    const d = displays[idx] || displays[0];
    config.selectedDisplay = idx;
    saveConfig(config);
    mainWin.setFullScreen(false);
    mainWin.setBounds(d.bounds);
    mainWin.setFullScreen(true);
    return true;
  });

  // go2rtc
  ipcMain.handle('go2rtc:check',   () => ({ found: !!findGo2rtcBin(), path: findGo2rtcBin() }));
  ipcMain.handle('go2rtc:start',   (_, cfg) => startGo2rtc(cfg || config));
  ipcMain.handle('go2rtc:stop',    () => { stopGo2rtc(); return true; });
  ipcMain.handle('go2rtc:restart', (_, cfg) => {
    const merged = cfg ? { ...config, ...cfg } : config;
    return startGo2rtc(merged);
  });
  ipcMain.handle('go2rtc:download', (event) => downloadGo2rtc(event));

  // Navigation
  ipcMain.handle('nav:app',   () => {
    if (mainWin) mainWin.loadFile(path.join(__dirname, 'src', 'app.html'));
  });
  ipcMain.handle('nav:setup', () => {
    if (mainWin) mainWin.loadFile(path.join(__dirname, 'src', 'setup.html'));
  });

  // Mouse click-through (HUD hover)
  ipcMain.on('mouse:interactive', (_, on) => {
    if (mainWin) mainWin.setIgnoreMouseEvents(!on, { forward: true });
  });

  // Click-through toggle global
  ipcMain.handle('clickthrough:set', (_, enabled) => {
    config.clickThrough = enabled;
    saveConfig(config);
    if (mainWin) {
      if (enabled) mainWin.setIgnoreMouseEvents(true, { forward: true });
      else         mainWin.setIgnoreMouseEvents(false);
    }
  });

  // Ouvrir dossier config
  ipcMain.handle('open:config-dir', () => shell.openPath(USER_DATA));

  // Quitter
  ipcMain.handle('app:quit', () => app.quit());
}

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  config = loadConfig();
  registerIPC();
  createMainWindow();
});

app.on('window-all-closed', () => {
  stopGo2rtc();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopGo2rtc);

// Empêcher les nouvelles fenêtres
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
