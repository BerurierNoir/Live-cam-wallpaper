'use strict';
/**
 * CamWall — Window management (Wayland compatible)
 *
 * Wayland + KDE Plasma 6: fullscreen:true dans le constructeur
 * force toujours la fenêtre sur l'écran principal, même avec x/y corrects.
 *
 * Solution: créer la fenêtre en mode normal (pas fullscreen),
 * positionner avec x/y, puis maximize() pour couvrir tout l'écran.
 * KDE respecte alors le display cible.
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

  console.log(`[window] Écran ${idx}: ${width}x${height} @ ${x},${y}`);

  // Détruire l'ancienne fenêtre
  if (_win && !_win.isDestroyed()) {
    try { _lastUrl = _win.webContents.getURL() || null; } catch (_) {}
    _win.destroy();
    _win = null;
  }

  // IMPORTANT: Ne PAS utiliser fullscreen:true sur Wayland/KDE
  // KDE ignore x/y pour les fenêtres fullscreen et les met sur l'écran principal
  // On crée une fenêtre normale avec les dimensions exactes du display cible
  _win = new BrowserWindow({
    x, y,
    width,
    height,
    frame:           false,
    transparent:     false,
    skipTaskbar:     true,
    resizable:       false,
    movable:         false,
    fullscreen:      false,   // PAS fullscreen dans le constructeur
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

  // Une fois affichée: maximiser pour couvrir tout l'écran du bon display
  _win.once('ready-to-show', () => {
    _win.show();
    // Forcer la position et taille (Wayland peut ignorer le constructeur)
    _win.setBounds({ x, y, width, height }, false);
    // Petite temporisation puis setFullScreen pour le mode wallpaper final
    setTimeout(() => {
      if (_win && !_win.isDestroyed()) {
        _win.setBounds({ x, y, width, height }, false);
        _win.setFullScreen(true);
      }
    }, 300);
  });

  _win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown')
      _win.webContents.toggleDevTools();
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

  // Sauvegarder l'URL courante avant destruction
  let urlToReload = _lastUrl;
  if (_win && !_win.isDestroyed()) {
    try { urlToReload = _win.webContents.getURL() || urlToReload; } catch (_) {}
  }

  config.save({ selectedDisplay: idx });

  create(); // recrée sur le bon display

  // Recharger la même page
  if (urlToReload && urlToReload !== 'about:blank' && !urlToReload.includes('loading.html')) {
    setTimeout(() => {
      if (_win && !_win.isDestroyed()) _win.loadURL(urlToReload);
    }, 100);
  } else {
    setTimeout(() => {
      if (_win && !_win.isDestroyed())
        _win.loadFile(path.join(__dirname, '..', 'renderer', 'app.html'));
    }, 100);
  }

  return true;
}

function getWindow()      { return _win; }
function isReady()        { return !!(_win && !_win.isDestroyed()); }
function setLastUrl(url)  { _lastUrl = url; }
function getLastUrl()     { return _lastUrl; }

function show() {
  if (!isReady()) return;
  _win.show();
  _win.focus();
  _win.setAlwaysOnTop(true);
  setTimeout(() => { if (isReady()) _win.setAlwaysOnTop(false); }, 200);
}

function hide()         { if (isReady()) _win.hide(); }
function setQuitting(v) { if (isReady()) _win._quitting = v; }

module.exports = { create, load, changeDisplay, getWindow, isReady, show, hide, setQuitting, setLastUrl, getLastUrl };
