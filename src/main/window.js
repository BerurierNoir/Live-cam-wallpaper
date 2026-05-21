'use strict';
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const config = require('./config');

let _win = null;

/**
 * Crée la fenêtre principale en mode wallpaper:
 * - Plein écran, sans bordure, sur le display choisi
 * - Sur Wayland: x/y dans le constructeur = seule méthode fiable
 *   pour cibler un écran précis. setBounds après création ne marche pas.
 */
function create() {
  const cfg      = config.get();
  const displays = screen.getAllDisplays();
  const display  = displays[cfg.selectedDisplay] || displays[0];
  const { x, y, width, height } = display.bounds;

  // Fermer l'ancienne fenêtre si elle existe
  if (_win && !_win.isDestroyed()) _win.destroy();

  _win = new BrowserWindow({
    x, y, width, height,          // Position initiale = display cible
    fullscreen:      true,          // + x/y → go sur le bon écran sur Wayland
    frame:           false,
    transparent:     false,
    skipTaskbar:     true,
    resizable:       false,
    backgroundColor: '#070a14',
    webPreferences: {
      preload:              path.join(__dirname, '..', '..', 'preload.js'),
      nodeIntegration:      false,
      contextIsolation:     true,
      webSecurity:          false,   // file:// → ws://localhost (MSE WebSocket)
      backgroundThrottling: false,   // ne pas throttler les streams
      sandbox:              false,
    },
  });

  // F12 → DevTools en dev
  _win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown')
      _win.webContents.toggleDevTools();
  });

  // Fermer = cacher dans le tray (pas quitter)
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
 * Changer d'écran: sur Wayland on doit détruire et recréer
 * (setBounds ne fonctionne pas entre displays sur Wayland)
 */
function changeDisplay(idx) {
  const displays = screen.getAllDisplays();
  if (idx < 0 || idx >= displays.length) return false;
  config.save({ selectedDisplay: idx });
  create(); // recrée sur le bon display
  return true;
}

function getWindow()  { return _win; }
function isReady()    { return _win && !_win.isDestroyed(); }

// Ramener la fenêtre au premier plan (Wayland: setAlwaysOnTop trick)
function show() {
  if (!isReady()) return;
  _win.show();
  _win.focus();
  _win.setAlwaysOnTop(true);
  setTimeout(() => { if (isReady()) _win.setAlwaysOnTop(false); }, 200);
}

function hide() {
  if (isReady()) _win.hide();
}

function setQuitting(v) {
  if (isReady()) _win._quitting = v;
}

module.exports = { create, changeDisplay, getWindow, isReady, show, hide, setQuitting };
