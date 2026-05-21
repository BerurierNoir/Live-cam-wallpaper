'use strict';

const {
  app, BrowserWindow, ipcMain, screen,
  shell, nativeTheme, Tray, Menu, nativeImage, session, dialog,
  globalShortcut, Notification
} = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const http   = require('http');
const https  = require('https');
const { spawn, execFile, exec } = require('child_process');
const yaml   = require('js-yaml');

nativeTheme.themeSource = 'dark';
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

// ── CONSTANTES ────────────────────────────────────────────────
const VERSION        = app.getVersion();
const USER_DATA      = app.getPath('userData');
const CONFIG_PATH    = path.join(USER_DATA, 'config.json');
const GO2RTC_CFG     = path.join(USER_DATA, 'go2rtc.yaml');
const LOG_PATH       = path.join(USER_DATA, 'camwall.log');
const LOG_MAX        = 2 * 1024 * 1024;
const GO2RTC_PORT    = 1984;
const REPO           = 'BerurierNoir/Live-cam-wallpaper';
const AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'camwall.desktop');
const ARCH_MAP       = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };

// ── LOGGER ────────────────────────────────────────────────────
function rotateLog() {
  try { if (fs.statSync(LOG_PATH).size > LOG_MAX) fs.renameSync(LOG_PATH, LOG_PATH + '.old'); } catch (_) {}
}
const logStream = (() => {
  try { fs.mkdirSync(USER_DATA, { recursive: true }); rotateLog(); return fs.createWriteStream(LOG_PATH, { flags: 'a' }); } catch (_) { return null; }
})();
function log(lvl, ...a) {
  const line = `[${new Date().toISOString()}] [${lvl}] ${a.join(' ')}`;
  logStream?.write(line + '\n');
  console.log(line);
}
const L = { info: (...a) => log('INFO', ...a), warn: (...a) => log('WARN', ...a), err: (...a) => log('ERR ', ...a) };

// ── CONFIG ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  firstRun:        true,
  // Grille flexible : chaque cellule a un type et une config
  grid: {
    cols: 2,
    rows: 2,
    cells: [
      { id: 'cell-0', type: 'camera', cameraId: '' },
      { id: 'cell-1', type: 'empty',  image: '' },
      { id: 'cell-2', type: 'empty',  image: '' },
      { id: 'cell-3', type: 'empty',  image: '' },
    ]
  },
  cameras:         [],
  proxmox:         { url: '', tokenId: '', tokenSecret: '', node: 'pve', enabled: false },
  selectedDisplay: 0,
  reconnect:       true,
  reconnectDelay:  5,
  maxReconnectDelay: 60,
  idleMinutes:     0,
  showClock:       true,
  go2rtcPort:      GO2RTC_PORT,
  clickThrough:    false,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (e) { L.err('loadConfig:', e.message); }
  return { ...DEFAULT_CONFIG };
}
function saveConfig(cfg) {
  try { fs.mkdirSync(USER_DATA, { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }
  catch (e) { L.err('saveConfig:', e.message); }
}
let config = loadConfig();

// ── GO2RTC ────────────────────────────────────────────────────
function findGo2rtcBin() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'go2rtc'),
    path.join(USER_DATA, 'bin', 'go2rtc'),
    path.join(os.homedir(), '.local', 'bin', 'go2rtc'),
    '/usr/local/bin/go2rtc', '/usr/bin/go2rtc',
  ];
  return candidates.find(p => { try { return fs.existsSync(p) && fs.statSync(p).size > 0; } catch (_) { return false; } }) || null;
}

function decodeUrl(url) {
  try { return decodeURIComponent(url); } catch (_) { return url; }
}

function buildGo2rtcStream(cam, cfg) {
  if (!cam.mainUrl) return null;
  const url = decodeUrl(cam.mainUrl);
  // go2rtc expose la même source en MSE ET MJPEG:
  // - MSE WebSocket ws://localhost:1984/api/ws?src=ID → H264 natif, faible CPU
  // - MJPEG http://localhost:1984/api/stream.mjpeg?src=ID → fallback si MSE échoue
  const fps = (cfg && cfg.go2rtcFps) || 15;
  return [url, 'ffmpeg:' + cam.id + '#video=mjpeg#fps=' + fps];
}

function writeGo2rtcConfig(cfg) {
  const streams = {};
  (cfg.cameras || []).forEach(cam => {
    if (!cam.id) return;
    const src = buildGo2rtcStream(cam, cfg);
    if (src) streams[cam.id] = src;
    if (cam.subUrl && cam.subUrl !== cam.mainUrl)
      streams[`${cam.id}_sub`] = [decodeUrl(cam.subUrl), `ffmpeg:${cam.id}_sub#video=mjpeg`];
  });
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(GO2RTC_CFG, yaml.dump({
      api:  { listen: `:${cfg.go2rtcPort || GO2RTC_PORT}` },
      rtsp: { listen: ':8554' },
      log:  { level: 'warn' },
      streams,
    }));
    L.info('go2rtc config écrite');
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
  go2rtcProc.on('error', err => L.err('[go2rtc]', err.message));
  go2rtcProc.on('exit', (code, sig) => { L.info(`[go2rtc] exit code=${code} sig=${sig}`); go2rtcProc = null; });
  L.info('go2rtc démarré:', bin);
  return true;
}
function stopGo2rtc() {
  if (go2rtcProc) { try { go2rtcProc.kill('SIGTERM'); } catch (_) {} go2rtcProc = null; }
}
function waitForGo2rtc(port, maxMs = 12000) {
  return new Promise(resolve => {
    const start = Date.now();
    function probe() {
      const req = http.get(`http://localhost:${port}/api/streams`, res => { res.resume(); resolve(true); });
      req.on('error', () => { if (Date.now() - start > maxMs) { resolve(false); return; } setTimeout(probe, 500); });
      req.setTimeout(800, () => req.destroy());
    }
    probe();
  });
}

// ── MÉTRIQUES SYSTÈME ─────────────────────────────────────────
async function getSysMetrics() {
  const metrics = {};

  // CPU usage
  try {
    const cpus = os.cpus();
    const total = cpus.reduce((acc, cpu) => {
      const t = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return { total: acc.total + t, idle: acc.idle + cpu.times.idle };
    }, { total: 0, idle: 0 });
    metrics.cpuCount = cpus.length;
    metrics.cpuModel = cpus[0]?.model?.trim() || 'Unknown';
    // Snapshot pour usage relatif
    if (!getSysMetrics._prev) {
      getSysMetrics._prev = total;
      metrics.cpuPercent = 0;
    } else {
      const prev = getSysMetrics._prev;
      const totalDiff = total.total - prev.total;
      const idleDiff  = total.idle  - prev.idle;
      metrics.cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
      getSysMetrics._prev = total;
    }
  } catch (_) {}

  // RAM
  try {
    const total = os.totalmem();
    const free  = os.freemem();
    metrics.ramTotal  = total;
    metrics.ramUsed   = total - free;
    metrics.ramPercent = Math.round((1 - free / total) * 100);
  } catch (_) {}

  // Uptime
  metrics.uptime = os.uptime();
  metrics.hostname = os.hostname();
  metrics.platform = os.platform();
  metrics.arch = os.arch();

  // Disques (df)
  try {
    const dfOut = await execPromise('df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x overlay 2>/dev/null | tail -n +2');
    metrics.disks = dfOut.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      return { source: parts[0], size: parts[1], used: parts[2], avail: parts[3], percent: parts[4], mount: parts[5] };
    }).filter(d => d.mount && !d.mount.startsWith('/boot'));
  } catch (_) { metrics.disks = []; }

  // Réseau (dernières stats)
  try {
    const netIfaces = os.networkInterfaces();
    metrics.network = Object.entries(netIfaces)
      .filter(([name]) => !name.startsWith('lo') && !name.startsWith('veth'))
      .map(([name, ifaces]) => {
        const ipv4 = ifaces.find(i => i.family === 'IPv4');
        return { name, address: ipv4?.address || 'N/A', mac: ipv4?.mac || '' };
      });
  } catch (_) { metrics.network = []; }

  // Température CPU (si disponible)
  try {
    const temps = await execPromise('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1');
    const tempVal = parseInt(temps.trim());
    if (!isNaN(tempVal)) metrics.cpuTemp = Math.round(tempVal / 1000);
  } catch (_) {}

  // GPU NVIDIA (nvidia-smi)
  try {
    const nv = await execPromise('nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null');
    if (nv.trim()) {
      const parts = nv.trim().split(',').map(s => s.trim());
      metrics.gpu = {
        name:    parts[0],
        temp:    parseInt(parts[1]),
        utilPercent: parseInt(parts[2]),
        memUsed: parseInt(parts[3]),
        memTotal: parseInt(parts[4]),
      };
    }
  } catch (_) {}

  return metrics;
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 3000 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

// ── PROXMOX API ───────────────────────────────────────────────
async function getProxmoxData(cfg) {
  const px = cfg.proxmox;
  if (!px?.enabled || !px.url || !px.tokenId || !px.tokenSecret) return null;

  function pxFetch(endpoint) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, px.url);
      const opts = {
        hostname: url.hostname,
        port:     url.port || 8006,
        path:     url.pathname + url.search,
        method:   'GET',
        headers:  { Authorization: `PVEAPIToken=${px.tokenId}=${px.tokenSecret}` },
        rejectUnauthorized: false,
        timeout: 5000,
      };
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', d => { data += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(data).data); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  try {
    const node = px.node || 'pve';
    const [nodeStatus, vms, lxcs] = await Promise.all([
      pxFetch(`/api2/json/nodes/${node}/status`),
      pxFetch(`/api2/json/nodes/${node}/qemu`),
      pxFetch(`/api2/json/nodes/${node}/lxc`),
    ]);

    return {
      node: nodeStatus,
      vms: (vms || []).map(v => ({
        id: v.vmid, name: v.name, status: v.status,
        cpu: Math.round((v.cpu || 0) * 100),
        mem: v.mem, maxmem: v.maxmem,
        type: 'vm',
      })),
      lxcs: (lxcs || []).map(c => ({
        id: c.vmid, name: c.name, status: c.status,
        cpu: Math.round((c.cpu || 0) * 100),
        mem: c.mem, maxmem: c.maxmem,
        type: 'lxc',
      })),
    };
  } catch (e) { L.warn('Proxmox error:', e.message); return null; }
}

// ── AUTOSTART ─────────────────────────────────────────────────
function isAutostartEnabled() { return fs.existsSync(AUTOSTART_FILE); }
function setAutostart(enabled) {
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(AUTOSTART_FILE,
        `[Desktop Entry]\nType=Application\nName=CamWall\nComment=Live camera wallpaper\n` +
        `Exec=${process.env.APPIMAGE || process.execPath}\nIcon=camwall\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n`
      );
    } else {
      if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE);
    }
    return true;
  } catch (e) { L.err('setAutostart:', e.message); return false; }
}

// ── UPDATE CHECK ──────────────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
}
function checkForUpdates() {
  return new Promise(resolve => {
    const req = https.get({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': `CamWall/${VERSION}` },
      timeout: 6000,
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          const latest = r.tag_name || '0.0.0';
          resolve({ available: compareVersions(latest, VERSION) > 0, version: latest, url: r.html_url, current: VERSION });
        } catch (_) { resolve({ available: false, current: VERSION }); }
      });
    });
    req.on('error', () => resolve({ available: false, current: VERSION }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false, current: VERSION }); });
  });
}

// ── TRAY ──────────────────────────────────────────────────────
let tray = null;
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `CamWall v${VERSION}`, enabled: false },
    { type: 'separator' },
    { label: 'Afficher / Masquer', click: () => {
      if (mainWin) {
        if (mainWin.isVisible()) {
          mainWin.hide();
        } else {
          mainWin.show();
          mainWin.focus();
          mainWin.setAlwaysOnTop(true);
          setTimeout(() => mainWin?.setAlwaysOnTop(false), 200);
        }
      }
    } },
    { type: 'separator' },
    { label: '⏸ Pause streams',     click: () => mainWin?.webContents.send('cmd:pause-all') },
    { label: '▶ Reprendre streams',  click: () => mainWin?.webContents.send('cmd:resume-all') },
    { type: 'separator' },
    { label: '⚙ Paramètres',        click: () => { showMain(); mainWin?.webContents.send('cmd:open-settings'); } },
    { type: 'separator' },
    { label: `Démarrage auto : ${isAutostartEnabled() ? '✅' : '❌'}`,
      click: () => { setAutostart(!isAutostartEnabled()); tray?.setContextMenu(buildTrayMenu()); }
    },
    { label: '📂 Dossier config',    click: () => shell.openPath(USER_DATA) },
    { label: '📋 Logs',              click: () => shell.openPath(LOG_PATH) },
    { type: 'separator' },
    { label: '🔄 Vérifier mises à jour', click: async () => {
      const upd = await checkForUpdates();
      if (upd.available) shell.openExternal(upd.url);
    }},
    { type: 'separator' },
    { label: 'Quitter CamWall', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}
function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'tray.png');
    const iconSvg  = path.join(__dirname, 'assets', 'icon.svg');
    let icon = nativeImage.createEmpty();
    if (fs.existsSync(iconPath)) icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    else if (fs.existsSync(iconSvg)) icon = nativeImage.createFromPath(iconSvg).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('CamWall');
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => {
      if (mainWin) {
        mainWin.show();
        mainWin.focus();
        mainWin.setAlwaysOnTop(true);
        setTimeout(() => mainWin?.setAlwaysOnTop(false), 200);
      }
    });
    L.info('Tray créé');
  } catch (e) { L.err('Tray:', e.message); }
}

// ── FENÊTRE ───────────────────────────────────────────────────
let mainWin = null;
let currentUrl = null; // URL courante pour recréer la fenêtre après changement d'écran
function showMain() { if (mainWin) { mainWin.show(); mainWin.focus(); } }

function createWindow() {
  const displays = screen.getAllDisplays();
  const display  = displays[config.selectedDisplay] || displays[0];
  mainWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: false, skipTaskbar: true,
    resizable: true, fullscreen: true, backgroundColor: '#070a14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false, backgroundThrottling: false, sandbox: false,
    },
  });
  mainWin.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWin.webContents.toggleDevTools();
  });
  mainWin.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWin.hide();
      // Notifier l'utilisateur la première fois
      if (!global.hiddenNotified) {
        global.hiddenNotified = true;
        tray?.setToolTip('CamWall — Réduit dans le tray. Clic droit → Afficher');
        setTimeout(() => tray?.setToolTip('CamWall'), 4000);
      }
    }
  });
  mainWin.on('closed', () => { mainWin = null; });

  if (config.firstRun || !config.cameras?.length) {
    mainWin.loadFile(path.join(__dirname, 'src', 'setup.html'));
  } else {
    loadApp();
  }
}


// ── WEBHOOK ENTRANT (port 1985) ─────────────────────────────
// HA peut envoyer des commandes à CamWall via POST http://IP:1985/webhook
// Exemples: {"action":"flash","color":"red"} / {"action":"alert","msg":"Intrusion!"}
let webhookServer = null;
function startWebhook() {
  if (webhookServer) return;
  webhookServer = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        L.info('[webhook]', JSON.stringify(data));
        mainWin?.webContents.send('webhook:event', data);
        // Notification desktop si "alert"
        if (data.action === 'alert' && Notification.isSupported()) {
          new Notification({ title: 'CamWall Alerte', body: data.msg || 'Événement HA' }).show();
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:e.message})); }
    });
  });
  webhookServer.listen(1985, '0.0.0.0', () => L.info('Webhook server: http://0.0.0.0:1985/webhook'));
  webhookServer.on('error', e => L.err('Webhook:', e.message));
}

async function loadApp() {
  if (!mainWin) return;
  mainWin.loadFile(path.join(__dirname, 'src', 'loading.html'));
  startGo2rtc(config);
  await waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.loadFile(path.join(__dirname, 'src', 'app.html'));
    currentUrl = `file://${path.join(__dirname, 'src', 'app.html')}`;
  }
}

// ── IPC ───────────────────────────────────────────────────────
// Polling métriques
let metricsInterval = null;
function startMetricsPolling() {
  if (metricsInterval) clearInterval(metricsInterval);
  metricsInterval = setInterval(async () => {
    if (!mainWin || !mainWin.webContents) return;
    try {
      const metrics = await getSysMetrics();
      mainWin.webContents.send('metrics:update', metrics);
    } catch (_) {}
  }, 2000);
}

function stopMetricsPolling() {
  if (typeof metricsInterval !== 'undefined' && metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

function registerIPC() {
  ipcMain.handle('cfg:get',   ()      => loadConfig());
  ipcMain.handle('cfg:save',  (_, c)  => { config = { ...config, ...c }; saveConfig(config); tray?.setContextMenu(buildTrayMenu()); return true; });

  ipcMain.handle('display:list', () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, i) => ({
      index:   i,
      label:   `Écran ${i+1}${d.id === primary.id ? ' (Principal)' : ''}`,
      primary: d.id === primary.id,
      width:   d.bounds.width,
      height:  d.bounds.height,
      x: d.bounds.x, y: d.bounds.y,
      scaleFactor: d.scaleFactor,
      selected: i === (config.selectedDisplay || 0),
    }));
  });
  ipcMain.handle('display:set', async (_, idx) => {
    const displays = screen.getAllDisplays();
    if (idx < 0 || idx >= displays.length) return false;
    config.selectedDisplay = idx;
    saveConfig(config);
    L.info(`Changement écran → ${idx} (Wayland: destroy+recreate)`);
    createWindow();
    return true;
  });

  ipcMain.handle('go2rtc:check',    ()     => ({ found: !!findGo2rtcBin(), path: findGo2rtcBin(), arch: process.arch }));
  ipcMain.handle('go2rtc:start',    (_, c) => startGo2rtc(c || config));
  ipcMain.handle('go2rtc:stop',     ()     => { stopGo2rtc(); return true; });
  ipcMain.handle('go2rtc:restart', async (_, c) => {
    // Fusionner le config reçu (peut contenir les nouvelles caméras)
    if (c) config = { ...config, ...c };
    saveConfig(config);
    // Toujours réécrire le YAML avec le config complet à jour
    writeGo2rtcConfig(config);
    return startGo2rtc(config);
  });
  ipcMain.handle('go2rtc:download', ev     => downloadGo2rtc(ev));
  ipcMain.handle('go2rtc:status',   ()     => waitForGo2rtc(config.go2rtcPort || GO2RTC_PORT, 2000));

  ipcMain.handle('nav:app',   async () => loadApp());
  ipcMain.handle('nav:setup', ()       => mainWin?.loadFile(path.join(__dirname, 'src', 'setup.html')));

  ipcMain.handle('metrics:get',     ()     => getSysMetrics());
  ipcMain.handle('proxmox:get',     (_, c) => getProxmoxData(c || config));

  ipcMain.handle('autostart:get',   ()      => isAutostartEnabled());
  ipcMain.handle('autostart:set',   (_, on) => setAutostart(on));
  ipcMain.handle('update:check',    ()      => checkForUpdates());
  ipcMain.handle('update:open',     (_, u)  => shell.openExternal(u));
  ipcMain.handle('open:config-dir', ()      => shell.openPath(USER_DATA));
  ipcMain.handle('open:log',        ()      => shell.openPath(LOG_PATH));
  // ── NOUVEAUX IPC v5 ─────────────────────────────────────
  ipcMain.on('metrics:start', () => startMetricsPolling());
  ipcMain.on('metrics:stop',  () => stopMetricsPolling());

  ipcMain.handle('speedtest:run', () => new Promise(resolve => {
    exec('speedtest-cli --json --timeout 30 2>/dev/null', {timeout:35000}, (err, out) => {
      if (err || !out?.trim()) return resolve(null);
      try { resolve(JSON.parse(out)); } catch (_) { resolve(null); }
    });
  }));

  ipcMain.on('notify:desktop', (_, d) => {
    try {
      if (Notification.isSupported()) new Notification({title:d?.title||'CamWall',body:d?.body||''}).show();
      else exec(`notify-send '${(d?.title||'CamWall').replace(/'/g,'')}' '${(d?.body||'').replace(/'/g,'')}' 2>/dev/null`);
    } catch (_) {}
  });

  ipcMain.handle('config:export-path', () => CONFIG_PATH);
  ipcMain.handle('webhook:status', () => ({running: !!webhookServer, port: 1985}));
  ipcMain.handle('webhook:start',  () => { startWebhook(); return true; });

  ipcMain.handle('app:version',     ()      => VERSION);
  ipcMain.handle('app:quit',        ()      => { app.isQuitting = true; app.quit(); });

  ipcMain.handle('clickthrough:set', (_, on) => {
    config.clickThrough = on; saveConfig(config);
    mainWin?.setIgnoreMouseEvents(on, { forward: true });
  });

  // Image custom pour cases vides
  ipcMain.handle('image:pick', async () => {
    // dialog importé globalement
    const result = await dialog.showOpenDialog(mainWin, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('image:toDataUrl', (_, filePath) => {
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (_) { return null; }
  });
}

// ── DOWNLOAD go2rtc ───────────────────────────────────────────
function downloadGo2rtc(event) {
  const binDir  = path.join(USER_DATA, 'bin');
  const binPath = path.join(binDir, 'go2rtc');
  fs.mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${ARCH_MAP[process.arch]||'amd64'}`;
  const send = msg => { try { if (event?.sender && !event.sender.isDestroyed()) event.sender.send('go2rtc-dl-progress', msg); } catch (_) {} };
  return new Promise((resolve, reject) => {
    const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath], err => {
      if (err) return reject(err);
      try { fs.chmodSync(binPath, '755'); } catch (_) {}
      resolve({ success: true, path: binPath });
    });
    curl.stderr?.on('data', d => send(String(d).trim()));
  });
}

// ── LIFECYCLE ─────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    // Wayland: forcer la fenêtre au premier plan
    mainWin.setAlwaysOnTop(true);
    setTimeout(() => mainWin?.setAlwaysOnTop(false), 200);
  }
});

app.whenReady().then(async () => {
  // KDE Plasma: identifier l'app pour le tray et le launcher
  app.setAppUserModelId('io.github.camwall');
  config = loadConfig();

  // CORS: file:// → ws://localhost (MSE WebSocket go2rtc)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const port = config.go2rtcPort || GO2RTC_PORT;
    if (details.url.includes(`localhost:${port}`) || details.url.includes(`127.0.0.1:${port}`)) {
      callback({responseHeaders:{...details.responseHeaders,'access-control-allow-origin':['*'],'access-control-allow-headers':['*']}});
    } else callback({responseHeaders: details.responseHeaders});
  });

  registerIPC();
  createWindow();
  createTray();
  startMetricsPolling();
  startWebhook(); // Port 1985 pour HA/domotique
  // Raccourci global Super+C → ramener CamWall au premier plan
  try {
    globalShortcut.register('Super+C', () => showWindow());
    L.info('globalShortcut Super+C enregistré');
  } catch (e) { L.warn('globalShortcut:', e.message); }

  // Mode nuit automatique (22h-7h)
  setInterval(() => {
    const h = new Date().getHours();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('time:nightmode', h >= 22 || h < 7);
  }, 60000);

  setTimeout(async () => {
    try {
      const upd = await checkForUpdates();
      if (upd.available) {
        mainWin?.webContents.send('update:available', upd);
        tray?.setToolTip(`CamWall — v${upd.version} disponible !`);
      }
    } catch (_) {}
  }, 5000);
});

// Accepter les certificats self-signed (Proxmox, services locaux HTTPS)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Uniquement pour les IPs locales / réseau privé
  const isLocal = url.match(/https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost)/);
  if (isLocal) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  try { stopGo2rtc(); } catch (_) {}
  try { if (typeof stopMetricsPolling === 'function') stopMetricsPolling(); } catch (_) {}
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { if (webhookServer) webhookServer.close(); } catch (_) {}
});
app.on('window-all-closed', () => { /* tray */ });
app.on('web-contents-created', (_, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
});
