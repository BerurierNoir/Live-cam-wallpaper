'use strict';

const { app, BrowserWindow, ipcMain, screen, shell, nativeTheme } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const http   = require('http');
const { spawn, execFile } = require('child_process');
const yaml   = require('js-yaml');

nativeTheme.themeSource = 'dark';

const USER_DATA   = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA, 'config.json');
const GO2RTC_CFG  = path.join(USER_DATA, 'go2rtc.yaml');
const GO2RTC_PORT = 1984;

const DEFAULT_CONFIG = {
  firstRun: true, cameras: [], selectedDisplay: 0,
  layout: 'auto', reconnect: true, reconnectDelay: 5,
  idleMinutes: 0, showClock: true, showLabels: true,
  go2rtcPort: GO2RTC_PORT, clickThrough: false,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();

// ── GO2RTC ──────────────────────────────────────────────────────
function findGo2rtcBin() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'go2rtc'),
    path.join(USER_DATA, 'bin', 'go2rtc'),
    path.join(os.homedir(), '.local', 'bin', 'go2rtc'),
    '/usr/local/bin/go2rtc', '/usr/bin/go2rtc',
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } }) || null;
}

let go2rtcProc = null;

function writeGo2rtcConfig(cfg) {
  const streams = {};
  (cfg.cameras || []).forEach(cam => { if (cam.id && cam.rtspUrl) streams[cam.id] = [cam.rtspUrl]; });
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(GO2RTC_CFG, yaml.dump({
    api: { listen: `:${cfg.go2rtcPort || GO2RTC_PORT}` },
    rtsp: { listen: ':8554' },
    streams,
  }));
}

function startGo2rtc(cfg) {
  stopGo2rtc();
  const bin = findGo2rtcBin();
  if (!bin) return false;
  writeGo2rtcConfig(cfg);
  go2rtcProc = spawn(bin, ['-config', GO2RTC_CFG], { stdio: ['ignore', 'pipe', 'pipe'] });
  go2rtcProc.stdout.on('data', d => process.stdout.write(`[go2rtc] ${d}`));
  go2rtcProc.stderr.on('data', d => process.stderr.write(`[go2rtc] ${d}`));
  go2rtcProc.on('error', err => console.error('[go2rtc]', err.message));
  go2rtcProc.on('exit', code => { go2rtcProc = null; });
  return true;
}

function stopGo2rtc() {
  if (go2rtcProc) { go2rtcProc.kill('SIGTERM'); go2rtcProc = null; }
}

function waitForGo2rtc(port, maxMs = 10000) {
  return new Promise(resolve => {
    const start = Date.now();
    function probe() {
      const req = http.get(`http://localhost:${port}/api/streams`, res => { res.resume(); resolve(true); });
      req.on('error', () => {
        if (Date.now() - start > maxMs) { resolve(false); return; }
        setTimeout(probe, 400);
      });
      req.setTimeout(600, () => req.destroy());
    }
    probe();
  });
}

function downloadGo2rtc(event) {
  const binDir  = path.join(USER_DATA, 'bin');
  const binPath = path.join(binDir, 'go2rtc');
  fs.mkdirSync(binDir, { recursive: true });
  const url = 'https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64';
  return new Promise((resolve, reject) => {
    const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath], err => {
      if (err) return reject(err);
      try { fs.chmodSync(binPath, '755'); } catch (_) {}
      resolve({ success: true, path: binPath });
    });
    curl.stderr && curl.stderr.on('data', d => {
      try { event && event.sender && event.sender.send('go2rtc-download-progress', String(d)); } catch (_) {}
    });
  });
}

// ── FENÊTRE ─────────────────────────────────────────────────────
let mainWin = null;

function createWindow() {
  const displays = screen.getAllDisplays();
  const display  = displays[config.selectedDisplay] || displays[0];

  mainWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: false, skipTaskbar: false,
    resizable: true, fullscreen: true, backgroundColor: '#030508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, webSecurity: false,
    },
  });

  // F12 pour DevTools si besoin de débugger
  mainWin.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12') mainWin.webContents.toggleDevTools();
  });

  mainWin.on('closed', () => { mainWin = null; });

  if (config.firstRun || config.cameras.length === 0) {
    mainWin.loadFile(path.join(__dirname, 'src', 'setup.html'));
  } else {
    loadAppWithGo2rtc();
  }
}

async function loadAppWithGo2rtc() {
  mainWin.loadFile(path.join(__dirname, 'src', 'loading.html'));
  startGo2rtc(config);
  await waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT);
  mainWin.loadFile(path.join(__dirname, 'src', 'app.html'));
}

// ── IPC ─────────────────────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('cfg:get',    ()       => loadConfig());
  ipcMain.handle('cfg:save',   (_, c)   => { config = { ...config, ...c }; saveConfig(config); return true; });

  ipcMain.handle('display:list', () =>
    screen.getAllDisplays().map((d, i) => ({
      index: i, label: `Écran ${i+1}`,
      primary: d === screen.getPrimaryDisplay(),
      width: d.bounds.width, height: d.bounds.height,
      x: d.bounds.x, y: d.bounds.y,
    }))
  );

  ipcMain.handle('display:set', (_, idx) => {
    const d = (screen.getAllDisplays()[idx]) || screen.getAllDisplays()[0];
    config.selectedDisplay = idx; saveConfig(config);
    if (mainWin) { mainWin.setFullScreen(false); mainWin.setBounds(d.bounds); mainWin.setFullScreen(true); }
    return true;
  });

  ipcMain.handle('go2rtc:check',    ()       => ({ found: !!findGo2rtcBin(), path: findGo2rtcBin() }));
  ipcMain.handle('go2rtc:start',    (_, c)   => startGo2rtc(c || config));
  ipcMain.handle('go2rtc:stop',     ()       => { stopGo2rtc(); return true; });
  ipcMain.handle('go2rtc:restart',  (_, c)   => startGo2rtc({ ...config, ...(c || {}) }));
  ipcMain.handle('go2rtc:download', ev       => downloadGo2rtc(ev));
  ipcMain.handle('go2rtc:status',   ()       => waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT, 2000));

  ipcMain.handle('nav:app',   async () => { await loadAppWithGo2rtc(); });
  ipcMain.handle('nav:setup', ()       => mainWin && mainWin.loadFile(path.join(__dirname, 'src', 'setup.html')));

  ipcMain.on('mouse:interactive', (_, on) => {
    if (mainWin) mainWin.setIgnoreMouseEvents(!on, { forward: true });
  });

  ipcMain.handle('clickthrough:set', (_, on) => {
    config.clickThrough = on; saveConfig(config);
    if (mainWin) mainWin.setIgnoreMouseEvents(on, { forward: true });
  });

  ipcMain.handle('open:config-dir', () => shell.openPath(USER_DATA));
  ipcMain.handle('app:quit',        () => app.quit());
}

// ── LIFECYCLE ───────────────────────────────────────────────────
app.whenReady().then(() => { config = loadConfig(); registerIPC(); createWindow(); });
app.on('window-all-closed', () => { stopGo2rtc(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', stopGo2rtc);
app.on('web-contents-created', (_, wc) => wc.setWindowOpenHandler(() => ({ action: 'deny' })));
