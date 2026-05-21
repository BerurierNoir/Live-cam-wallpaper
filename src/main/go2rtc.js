'use strict';
const fs   = require('fs');
const path = require('path');
const http = require('http');
const os   = require('os');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const config = require('./config');

let _proc = null;

function findBin() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'go2rtc'),
    path.join(config.getDataDir(), 'bin', 'go2rtc'),
    path.join(os.homedir(), '.local', 'bin', 'go2rtc'),
    '/usr/local/bin/go2rtc',
    '/usr/bin/go2rtc',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p) && fs.statSync(p).size > 0) return p; } catch (_) {}
  }
  return null;
}

function decodeUrl(url) {
  try { return decodeURIComponent(url); } catch (_) { return url; }
}

function writeYaml(cfg) {
  const streams = {};
  const fps = cfg.go2rtcFps || 15;
  for (const cam of (cfg.cameras || [])) {
    if (!cam.id || !cam.mainUrl) continue;
    const url = decodeUrl(cam.mainUrl);
    streams[cam.id] = [url, `ffmpeg:${cam.id}#video=mjpeg#fps=${fps}`];
    if (cam.subUrl && cam.subUrl !== cam.mainUrl) {
      streams[`${cam.id}_sub`] = [decodeUrl(cam.subUrl), `ffmpeg:${cam.id}_sub#video=mjpeg#fps=${fps}`];
    }
  }
  const cfgPath = path.join(config.getDataDir(), 'go2rtc.yaml');
  fs.mkdirSync(config.getDataDir(), { recursive: true });
  fs.writeFileSync(cfgPath, yaml.dump({
    api:  { listen: `:${cfg.go2rtcPort || 1984}` },
    rtsp: { listen: ':8554' },
    log:  { level: 'warn' },
    streams,
  }));
  return cfgPath;
}

function start(cfg) {
  stop();
  const bin = findBin();
  if (!bin) { console.warn('[go2rtc] binaire introuvable'); return false; }
  const cfgPath = writeYaml(cfg || config.get());
  _proc = spawn(bin, ['-config', cfgPath], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Protéger contre EIO (pipe cassée quand on kill le process)
  function safeListen(stream, label) {
    if (!stream) return;
    stream.on('error', () => {}); // ignorer les erreurs de pipe
    stream.on('data', d => {
      try { console.log(label, String(d).trim()); } catch (_) {}
    });
  }
  safeListen(_proc.stdout, '[go2rtc]');
  safeListen(_proc.stderr, '[go2rtc]');

  _proc.on('error', e  => { try { console.error('[go2rtc] error:', e.message); } catch (_) {} });
  _proc.on('exit',  (code) => {
    try { console.log('[go2rtc] exit code=' + code); } catch (_) {}
    _proc = null;
  });
  console.log('[go2rtc] démarré:', bin);
  return true;
}

function stop() {
  if (_proc) {
    // Détacher les listeners avant de kill pour éviter EIO
    try { if (_proc.stdout) _proc.stdout.destroy(); } catch (_) {}
    try { if (_proc.stderr) _proc.stderr.destroy(); } catch (_) {}
    try { _proc.kill('SIGTERM'); } catch (_) {}
    _proc = null;
  }
}

function restart(newCfg) {
  if (newCfg) config.save(newCfg);
  return start(config.get());
}

function waitReady(port, maxMs) {
  port  = port  || 1984;
  maxMs = maxMs || 10000;
  return new Promise(resolve => {
    const startTime = Date.now();
    function probe() {
      const req = http.get(`http://localhost:${port}/api/streams`, res => {
        res.resume(); resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startTime > maxMs) { resolve(false); return; }
        setTimeout(probe, 400);
      });
      req.setTimeout(600, () => req.destroy());
    }
    probe();
  });
}

function status(port) { return waitReady(port || 1984, 1500); }

module.exports = { findBin, start, stop, restart, writeYaml, waitReady, status };
