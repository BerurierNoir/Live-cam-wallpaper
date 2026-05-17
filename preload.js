'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CamWall', {
  // Config
  getConfig:    ()    => ipcRenderer.invoke('cfg:get'),
  saveConfig:   (cfg) => ipcRenderer.invoke('cfg:save', cfg),

  // Écrans
  getDisplays:  ()    => ipcRenderer.invoke('display:list'),
  setDisplay:   (idx) => ipcRenderer.invoke('display:set', idx),

  // go2rtc
  go2rtcCheck:    ()    => ipcRenderer.invoke('go2rtc:check'),
  go2rtcStart:    (cfg) => ipcRenderer.invoke('go2rtc:start', cfg),
  go2rtcStop:     ()    => ipcRenderer.invoke('go2rtc:stop'),
  go2rtcRestart:  (cfg) => ipcRenderer.invoke('go2rtc:restart', cfg),
  go2rtcDownload: ()    => ipcRenderer.invoke('go2rtc:download'),
  onDownloadProgress: (cb) => ipcRenderer.on('go2rtc-download-progress', (_, d) => cb(d)),

  // Navigation
  goToApp:   () => ipcRenderer.invoke('nav:app'),
  goToSetup: () => ipcRenderer.invoke('nav:setup'),

  // Mouse
  setMouseInteractive: (on) => ipcRenderer.send('mouse:interactive', on),

  // Click-through
  setClickThrough: (on) => ipcRenderer.invoke('clickthrough:set', on),

  // Utilitaires
  openConfigDir: () => ipcRenderer.invoke('open:config-dir'),
  quit:          () => ipcRenderer.invoke('app:quit'),
});
