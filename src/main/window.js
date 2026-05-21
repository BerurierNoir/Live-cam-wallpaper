'use strict';
/**
 * CamWall — Window management
 *
 * Wayland constraint: setBounds() ne peut PAS déplacer une fenêtre
 * entre deux écrans après création. La seule solution fiable est
 * de détruire la fenêtre et la recréer avec x/y du bon écran
 * directement dans le constructeur BrowserWindow.
 */
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const config = require('./config');

let _win     = null;
let _lastUrl = null; // URL courante pour la recréer après changement d'écran

/**
 * Crée la fenêtre principale en mode wallpaper.
 * fullscreen:true + x/y du display cible = seule méthode Wayland.
 */
function create() {
  const cfg      = config.get();
  const displays = screen.getAllDisplays();
  const display  = displays[cfg.selectedDisplay] || displays[0];
  const { x, y, width, height } = display.bounds;

  // Fermer l'ancienne fenêtre proprement
  if (_win && !_win.isDestroyed()) {
    // Sauvegarder l'URL avant de détruire
    try { _lastUrl = _win.webContents.getURL() || null; } catch (_) {}
    _win.destroy();
    _win = null;
  }

  _win = new BrowserWindow({
    x, y, width, height,
    fullscreen:      true,
    frame:           false,
    transparent:     false,
    skipTaskbar:     true,
    resizable:       false,
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

/**
 * Charge une URL/fichier dans la fenêtre courante.
 * Appelé par index.js après create().
 */
function load(fileOrUrl) {
  if (!_win || _win.isDestroyed()) return;
  if (fileOrUrl.startsWith('file://') || fileOrUrl.startsWith('http')) {
    _win.loadURL(fileOrUrl);
  } else {
    _win.loadFile(fileOrUrl);
  }
  _lastUrl = null; // reset après chargement explicite
}

/**
 * Changer d'écran — Wayland: détruire + recréer sur le bon display.
 * Recharge la même page qu'avant.
 */
function changeDisplay(idx) {
  const displays = screen.getAllDisplays();
  if (idx < 0 || idx >= displays.length) return false;

  // Sauvegarder l'URL avant destruction
  let urlToReload = _lastUrl;
  if (_win && !_win.isDestroyed()) {
    try { urlToReload = _win.webContents.getURL() || urlToReload; } catch (_) {}
  }

  config.save({ selectedDisplay: idx });
  create(); // recrée sur le bon display

  // Recharger la même page
  if (urlToReload && urlToReload !== 'about:blank') {
    _win.loadURL(urlToReload);
  } else {
    // Fallback: charger app.html
    _win.loadFile(path.join(__dirname, '..', 'renderer', 'app.html'));
  }

  return true;
}

function getWindow()  { return _win; }
function isReady()    { return !!(_win && !_win.isDestroyed()); }

// Ramener la fenêtre au premier plan (Wayland: trick setAlwaysOnTop)
function show() {
  if (!isReady()) return;
  _win.show();
  _win.focus();
  _win.setAlwaysOnTop(true);
  setTimeout(() => { if (isReady()) _win.setAlwaysOnTop(false); }, 200);
}

function hide()           { if (isReady()) _win.hide(); }
function setQuitting(v)   { if (isReady()) _win._quitting = v; }
function setLastUrl(url)  { _lastUrl = url; }
function getLastUrl()     { return _lastUrl; }

module.exports = { create, load, changeDisplay, getWindow, isReady, show, hide, setQuitting, setLastUrl, getLastUrl };
