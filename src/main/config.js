'use strict';
const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const USER_DATA   = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA, 'config.json');

const DEFAULTS = {
  firstRun:        true,
  selectedDisplay: 0,
  go2rtcPort:      1984,
  go2rtcFps:       15,
  reconnect:       true,
  reconnectDelay:  5,
  maxReconnectDelay: 30,
  clickThrough:    false,
  gridGap:         3,
  theme:           'dark',
  showClock:       true,
  alertCpuThreshold: 85,
  alertRamThreshold: 90,
  grid: {
    cols: 2, rows: 2,
    cells: [
      { id: 'cell-0', type: 'camera',  cameraId: '', label: '' },
      { id: 'cell-1', type: 'empty',   label: '' },
      { id: 'cell-2', type: 'empty',   label: '' },
      { id: 'cell-3', type: 'empty',   label: '' },
    ],
  },
  cameras:  [],
  proxmox:  { url: '', tokenId: '', tokenSecret: '', node: 'pve', enabled: false },
};

let _config = null;

function load() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw  = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      _config = Object.assign({}, DEFAULTS, raw);
      return _config;
    }
  } catch (e) {
    console.error('[config] load error:', e.message);
  }
  _config = Object.assign({}, DEFAULTS);
  return _config;
}

function save(cfg) {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true });
    _config = Object.assign({}, _config, cfg);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2));
    return true;
  } catch (e) {
    console.error('[config] save error:', e.message);
    return false;
  }
}

function get() {
  return _config || load();
}

function getPath()  { return CONFIG_PATH; }
function getDataDir() { return USER_DATA; }

module.exports = { load, save, get, getPath, getDataDir, DEFAULTS };
