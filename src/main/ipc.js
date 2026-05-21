'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { ipcMain, screen, shell, dialog, app, Notification } = require('electron');
const { exec } = require('child_process');

const config  = require('./config');
const go2rtc  = require('./go2rtc');
const metrics = require('./metrics');
const win     = require('./window');

const AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'camwall.desktop');

function isAutostartEnabled() { return fs.existsSync(AUTOSTART_FILE); }

function setAutostart(enabled) {
  try {
    if (enabled) {
      const execPath = process.env.APPIMAGE || process.execPath;
      const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
      fs.mkdirSync(path.dirname(AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(AUTOSTART_FILE,
        '[Desktop Entry]\nType=Application\nName=CamWall\n' +
        `Exec=${execPath}\nIcon=${iconPath}\n` +
        'Hidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nTerminal=false\n'
      );
    } else {
      if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE);
    }
    return true;
  } catch (e) { console.error('[autostart]', e.message); return false; }
}

function compareVersions(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checkUpdate() {
  return new Promise(resolve => {
    const https = require('https');
    const req = https.get({
      hostname: 'api.github.com',
      path: '/repos/BerurierNoir/Live-cam-wallpaper/releases/latest',
      headers: { 'User-Agent': `CamWall/${app.getVersion()}` },
      timeout: 6000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve({ available: compareVersions(r.tag_name || '0', app.getVersion()) > 0, version: r.tag_name, url: r.html_url, current: app.getVersion() });
        } catch (_) { resolve({ available: false }); }
      });
    });
    req.on('error', () => resolve({ available: false }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false }); });
  });
}

function register() {
  // ── CONFIG ────────────────────────────────────────────
  ipcMain.handle('cfg:get',  ()    => config.get());
  ipcMain.handle('cfg:save', (_, c) => {
    config.save(c);
    // Si les caméras ont changé → regénérer go2rtc.yaml immédiatement
    if (c && c.cameras !== undefined) {
      go2rtc.writeYaml(config.get());
      console.log('[ipc] go2rtc.yaml regénéré');
    }
    return true;
  });

  // ── DISPLAYS ──────────────────────────────────────────
  ipcMain.handle('display:list', () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, i) => ({
      index:       i,
      label:       `Écran ${i + 1}${d.id === primary.id ? ' (Principal)' : ''}`,
      primary:     d.id === primary.id,
      width:       d.bounds.width,
      height:      d.bounds.height,
      scaleFactor: d.scaleFactor,
      x: d.bounds.x, y: d.bounds.y,
      selected: i === (config.get().selectedDisplay || 0),
    }));
  });
  ipcMain.handle('display:set', (_, idx) => win.changeDisplay(idx));

  // ── GO2RTC ────────────────────────────────────────────
  ipcMain.handle('go2rtc:check',   ()     => ({ found: !!go2rtc.findBin(), path: go2rtc.findBin() }));
  ipcMain.handle('go2rtc:start',   (_, c) => go2rtc.start(c || config.get()));
  ipcMain.handle('go2rtc:stop',    ()     => { go2rtc.stop(); return true; });
  ipcMain.handle('go2rtc:restart', (_, c) => go2rtc.restart(c));
  ipcMain.handle('go2rtc:status',  ()     => go2rtc.status(config.get().go2rtcPort));
  ipcMain.handle('go2rtc:download',ev     => {
    const { execFile } = require('child_process');
    const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };
    const binDir  = path.join(config.getDataDir(), 'bin');
    const binPath = path.join(binDir, 'go2rtc');
    fs.mkdirSync(binDir, { recursive: true });
    const url = `https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${archMap[process.arch] || 'amd64'}`;
    return new Promise((resolve, reject) => {
      const curl = execFile('curl', ['-L', '--progress-bar', url, '-o', binPath], err => {
        if (err) return reject(err);
        try { fs.chmodSync(binPath, '755'); } catch (_) {}
        resolve({ success: true, path: binPath });
      });
      curl.stderr && curl.stderr.on('data', d => {
        try { if (ev.sender && !ev.sender.isDestroyed()) ev.sender.send('go2rtc-dl-progress', String(d).trim()); } catch (_) {}
      });
    });
  });

  // ── NAVIGATION ────────────────────────────────────────
  ipcMain.handle('nav:app', async () => {
    const w = win.getWindow();
    if (!w) return;
    w.loadFile(path.join(__dirname, '..', 'renderer', 'loading.html'));
    go2rtc.start(config.get());
    await go2rtc.waitReady(config.get().go2rtcPort || 1984);
    w.loadFile(path.join(__dirname, '..', 'renderer', 'app.html'));
  });
  ipcMain.handle('nav:setup', () => {
    win.getWindow()?.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  });

  // ── MÉTRIQUES ─────────────────────────────────────────
  ipcMain.handle('metrics:get',  ()   => metrics.collect());
  ipcMain.on   ('metrics:start', ()   => {
    metrics.startPolling(data => {
      const w = win.getWindow();
      if (w && !w.isDestroyed()) w.webContents.send('metrics:update', data);
    });
  });
  ipcMain.on('metrics:stop', () => metrics.stopPolling());

  // ── PROXMOX ───────────────────────────────────────────
  ipcMain.handle('proxmox:get', async (_, cfg) => {
    const px = (cfg || config.get()).proxmox;
    if (!px || !px.enabled || !px.url) return null;
    const https = require('https');
    function pxFetch(ep) {
      return new Promise((res, rej) => {
        const u = new URL(ep, px.url);
        const opts = {
          hostname: u.hostname, port: u.port || 8006,
          path: u.pathname + u.search, method: 'GET',
          headers: { Authorization: `PVEAPIToken=${px.tokenId}=${px.tokenSecret}` },
          rejectUnauthorized: false, timeout: 5000,
        };
        const req = https.request(opts, r => {
          let d = ''; r.on('data', x => d += x);
          r.on('end', () => { try { res(JSON.parse(d).data); } catch (e) { rej(e); } });
        });
        req.on('error', rej);
        req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
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
        vms:  (vms  || []).map(v => ({ id: v.vmid, name: v.name, status: v.status, cpu: Math.round((v.cpu || 0) * 100), mem: v.mem, maxmem: v.maxmem, type: 'vm' })),
        lxcs: (lxcs || []).map(c => ({ id: c.vmid, name: c.name, status: c.status, cpu: Math.round((c.cpu || 0) * 100), mem: c.mem, maxmem: c.maxmem, type: 'lxc' })),
      };
    } catch (e) { console.warn('[proxmox]', e.message); return null; }
  });

  // ── AUTOSTART ─────────────────────────────────────────
  ipcMain.handle('autostart:get', ()      => isAutostartEnabled());
  ipcMain.handle('autostart:set', (_, on) => setAutostart(on));

  // ── UPDATES ───────────────────────────────────────────
  ipcMain.handle('update:check', ()     => checkUpdate());
  ipcMain.handle('update:open',  (_, u) => shell.openExternal(u));

  // ── UTILS ─────────────────────────────────────────────
  ipcMain.handle('open:config-dir', () => shell.openPath(config.getDataDir()));
  ipcMain.handle('open:log',        () => shell.openPath(path.join(config.getDataDir(), 'camwall.log')));
  ipcMain.handle('app:version',     () => app.getVersion());
  ipcMain.handle('app:quit',        () => { app.isQuitting = true; app.quit(); });
  ipcMain.handle('config:path',     () => config.getPath());

  ipcMain.handle('clickthrough:set', (_, on) => {
    config.save({ clickThrough: on });
    const w = win.getWindow();
    if (w) w.setIgnoreMouseEvents(on, { forward: true });
  });

  ipcMain.handle('image:pick', async () => {
    const w = win.getWindow();
    const result = await dialog.showOpenDialog(w, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','webp','svg'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('image:to-data-url', (_, filePath) => {
    try {
      const buf  = fs.readFileSync(filePath);
      const ext  = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (_) { return null; }
  });

  // ── SPEEDTEST ─────────────────────────────────────────
  ipcMain.handle('speedtest:run', () => new Promise(resolve => {
    exec('speedtest-cli --json --timeout 30 2>/dev/null', { timeout: 35000 }, (err, out) => {
      if (err || !out?.trim()) return resolve(null);
      try { resolve(JSON.parse(out)); } catch (_) { resolve(null); }
    });
  }));

  // ── NOTIFICATIONS ─────────────────────────────────────
  ipcMain.on('notify:desktop', (_, d) => {
    try {
      if (Notification.isSupported())
        new Notification({ title: d?.title || 'CamWall', body: d?.body || '' }).show();
      else
        exec(`notify-send '${(d?.title||'CamWall').replace(/'/g,'')}' '${(d?.body||'').replace(/'/g,'')}' 2>/dev/null`);
    } catch (_) {}
  });

  // ── WEBHOOK STATUS ────────────────────────────────────
  ipcMain.handle('webhook:status', () => {
    const wh = require('./webhook');
    return { running: wh.isRunning(), port: wh.getPort() };
  });
}

module.exports = { register };
