'use strict';
/**
 * CamWall — Window management
 *
 * Stratégie Wayland/KDE Plasma 6:
 * - PAS de fullscreen:true → KDE l'ignore et met sur l'écran principal
 * - Fenêtre frameless aux DIMENSIONS EXACTES du display cible
 * - Positionné via x/y dans le constructeur
 * - Résultat identique au fullscreen visuellement, sans les bugs de placement
 */
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const config = require('./config');

let _win     = null;
let _lastUrl = null;

function create() {
  const cfg      = config.get();
  const displays = screen.getAllDisplays();
  const idx      = cfg.selectedDisplay || 0;
  const display  = displays[idx] || displays[0];
  const { x, y, width, height } = display.bounds;

  console.log(`[window] display ${idx}: ${width}x${height} @ ${x},${y}`);

  // Fermer proprement l'ancienne fenêtre
  if (_win && !_win.isDestroyed()) {
    try { _lastUrl = _win.webContents.getURL() || null; } catch (_) {}
    _win.destroy();
    _win = null;
  }

  _win = new BrowserWindow({
    // Position sur le display cible — Wayland respecte x/y pour les fenêtres normales
    x, y,
    width,
    height,
    frame:           false,   // Sans cadre → look fullscreen
    transparent:     false,
    skipTaskbar:     true,
    resizable:       false,
    movable:         false,
    fullscreen:      false,   // PAS fullscreen → KDE respecte x/y
    fullscreenable:  false,
    backgroundColor: '#070a14',
    webPreferences: {
      preload:              path.join(__dirname, '..', '..', 'preload.js'),
      nodeIntegration:      false,
      contextIsolation:     true,
      webSecurity:          false,
      backgroundThrottling: false,
      sandbox:              false,
    },
  });

  // Forcer la position après show (Wayland peut décaler légèrement)
  _win.once('ready-to-show', () => {
    _win.setBounds({ x, y, width, height });
    _win.show();
    _win.focus();
  });

  _win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown')
      _win.webContents.toggleDevTools();
    // Échap ferme dans le tray
    if (input.key === 'Escape' && input.type === 'keyDown')
      _win.hide();
  });

  _win.on('close', e => {
    if (!_win._quitting) {
      e.preventDefault();
      _win.hide();
    }
  });

  _win.on('closed', () => { _win = null; });

  return _win;
}

function load(fileOrUrl) {
  if (!_win || _win.isDestroyed()) return;
  if (fileOrUrl && (fileOrUrl.startsWith('file://') || fileOrUrl.startsWith('http'))) {
    _win.loadURL(fileOrUrl);
  } else if (fileOrUrl) {
    _win.loadFile(fileOrUrl);
  }
}

function changeDisplay(idx) {
  const displays = screen.getAllDisplays();
  if (idx < 0 || idx >= displays.length) return false;

  let urlToReload = _lastUrl;
  if (_win && !_win.isDestroyed()) {
    try { urlToReload = _win.webContents.getURL() || urlToReload; } catch (_) {}
  }

  config.save({ selectedDisplay: idx });
  create();

  const target = urlToReload && !urlToReload.includes('loading.html') && urlToReload !== 'about:blank'
    ? urlToReload
    : `file://${path.join(__dirname, '..', 'renderer', 'app.html')}`;

  setTimeout(() => {
    if (_win && !_win.isDestroyed()) _win.loadURL(target);
  }, 150);

  return true;
}

function getWindow()      { return _win; }
function isReady()        { return !!(_win && !_win.isDestroyed()); }
function setLastUrl(url)  { _lastUrl = url; }
function getLastUrl()     { return _lastUrl; }

function show() {
  if (!isReady()) return;
  _win.setBounds(getTargetBounds()); // re-positionner si drifté
  _win.show();
  _win.focus();
  _win.setAlwaysOnTop(true);
  setTimeout(() => { if (isReady()) _win.setAlwaysOnTop(false); }, 200);
}

function getTargetBounds() {
  const cfg      = config.get();
  const displays = screen.getAllDisplays();
  const display  = displays[cfg.selectedDisplay || 0] || displays[0];
  return display.bounds;
}

function hide()         { if (isReady()) _win.hide(); }
function setQuitting(v) { if (isReady()) _win._quitting = v; }

module.exports = { create, load, changeDisplay, getWindow, isReady, show, hide, setQuitting, setLastUrl, getLastUrl };
