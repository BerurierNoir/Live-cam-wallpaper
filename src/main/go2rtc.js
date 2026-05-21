'use strict';
const fs   = require('fs');
const path = require('path');
const http = require('http');
const os   = require('os');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const config = require('./config');

let _proc = null;

// Cherche le binaire go2rtc dans plusieurs endroits
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

// Décode l'URL (le ! dans les mots de passe peut être encodé %21)
function decodeUrl(url) {
  try { return decodeURIComponent(url); } catch (_) { return url; }
}

// Génère le yaml go2rtc à partir du config
function writeYaml(cfg) {
  const streams = {};
  const fps = cfg.go2rtcFps || 15;

  for (const cam of (cfg.cameras || [])) {
    if (!cam.id || !cam.mainUrl) continue;
    const url = decodeUrl(cam.mainUrl);
    // Deux sources pour chaque caméra:
    // 1. RTSP brut → go2rtc sert en MSE (WebSocket H264, moins de CPU)
    // 2. FFmpeg → go2rtc sert en MJPEG (fallback si MSE échoue)
    streams[cam.id] = [url, `ffmpeg:${cam.id}#video=mjpeg#fps=${fps}`];
    // Sub-stream optionnel
    if (cam.subUrl && cam.subUrl !== cam.mainUrl) {
      const subUrl = decodeUrl(cam.subUrl);
      streams[`${cam.id}_sub`] = [subUrl, `ffmpeg:${cam.id}_sub#video=mjpeg#fps=${fps}`];
    }
  }

  const cfgPath = path.join(config.getDataDir(), 'go2rtc.yaml');
  fs.mkdirSync(config.getDataDir(), { recursive: true });
  fs.writeFileSync(cfgPath, yaml.dump({
    api:     { listen: `:${cfg.go2rtcPort || 1984}` },
    rtsp:    { listen: ':8554' },
    log:     { level: 'warn' },
    streams,
  }));
  return cfgPath;
}

// Démarre go2rtc
function start(cfg) {
  stop();
  const bin = findBin();
  if (!bin) { console.warn('[go2rtc] binaire introuvable'); return false; }

  const cfgPath = writeYaml(cfg || config.get());
  _proc = spawn(bin, ['-config', cfgPath], { stdio: ['ignore', 'pipe', 'pipe'] });

  _proc.stdout.on('data', d => console.log('[go2rtc]', String(d).trim()));
  _proc.stderr.on('data', d => console.log('[go2rtc]', String(d).trim()));
  _proc.on('error', e  => console.error('[go2rtc] error:', e.message));
  _proc.on('exit',  (code) => { console.log('[go2rtc] exit code=' + code); _proc = null; });

  console.log('[go2rtc] démarré:', bin);
  return true;
}

function stop() {
  if (_proc) {
    try { _proc.kill('SIGTERM'); } catch (_) {}
    _proc = null;
  }
}

// Redémarre avec le nouveau config (régénère le YAML)
function restart(newCfg) {
  if (newCfg) {
    // Fusionner et sauvegarder
    config.save(newCfg);
  }
  return start(config.get());
}

// Attend que go2rtc soit prêt (HTTP /api/streams répond)
function waitReady(port, maxMs) {
  port  = port  || 1984;
  maxMs = maxMs || 10000;
  return new Promise(resolve => {
    const start = Date.now();
    function probe() {
      const req = http.get(`http://localhost:${port}/api/streams`, res => {
        res.resume(); resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) { resolve(false); return; }
        setTimeout(probe, 400);
      });
      req.setTimeout(600, () => req.destroy());
    }
    probe();
  });
}

function status(port) {
  return waitReady(port || 1984, 1500);
}

module.exports = { findBin, start, stop, restart, writeYaml, waitReady, status };
