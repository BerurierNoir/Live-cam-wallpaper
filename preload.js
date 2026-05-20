'use strict';
/**
 * CamWall v4.0.0 — preload.js
 * Bridge IPC sécurisé: contextIsolation=true, nodeIntegration=false
 * Expose UNIQUEMENT les APIs nécessaires au renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CamWall', {
  // Config
  getConfig:  ()    => ipcRenderer.invoke('cfg:get'),
  saveConfig: (c)   => ipcRenderer.invoke('cfg:save', c),

  // Écrans
  getDisplays: ()   => ipcRenderer.invoke('display:list'),
  setDisplay:  (i)  => ipcRenderer.invoke('display:set', i),

  // go2rtc
  go2rtcCheck:    ()   => ipcRenderer.invoke('go2rtc:check'),
  go2rtcStart:    (c)  => ipcRenderer.invoke('go2rtc:start', c),
  go2rtcStop:     ()   => ipcRenderer.invoke('go2rtc:stop'),
  go2rtcRestart:  (c)  => ipcRenderer.invoke('go2rtc:restart', c),
  go2rtcDownload: ()   => ipcRenderer.invoke('go2rtc:download'),
  go2rtcStatus:   ()   => ipcRenderer.invoke('go2rtc:status'),
  onDownloadProgress: (cb) => ipcRenderer.on('go2rtc-dl-progress', (_, d) => cb(d)),

  // Navigation
  goToApp:   () => ipcRenderer.invoke('nav:app'),
  goToSetup: () => ipcRenderer.invoke('nav:setup'),

  // Métriques système (polling géré côté main pour économiser CPU)
  getMetrics:     ()    => ipcRenderer.invoke('metrics:get'),
  onMetrics:      (cb)  => ipcRenderer.on('metrics:update', (_, d) => cb(d)),
  startMetrics:   ()    => ipcRenderer.send('metrics:start'),
  stopMetrics:    ()    => ipcRenderer.send('metrics:stop'),

  // Proxmox
  getProxmox: (c) => ipcRenderer.invoke('proxmox:get', c),

  // Autostart
  getAutostart: ()    => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on)  => ipcRenderer.invoke('autostart:set', on),

  // Updates
  checkUpdate: ()    => ipcRenderer.invoke('update:check'),
  openUpdate:  (u)   => ipcRenderer.invoke('update:open', u),
  onUpdate:    (cb)  => ipcRenderer.on('update:available', (_, d) => cb(d)),

  // Commandes tray → renderer (3 listeners séparés, PAS ||)
  onCmd: (cb) => {
    ipcRenderer.on('cmd:pause-all',     () => cb('pause-all'));
    ipcRenderer.on('cmd:resume-all',    () => cb('resume-all'));
    ipcRenderer.on('cmd:open-settings', () => cb('open-settings'));
  },

  // Utils
  openConfigDir:   () => ipcRenderer.invoke('open:config-dir'),
  openLog:         () => ipcRenderer.invoke('open:log'),
  getVersion:      () => ipcRenderer.invoke('app:version'),
  quit:            () => ipcRenderer.invoke('app:quit'),
  setClickThrough: (on) => ipcRenderer.invoke('clickthrough:set', on),
  pickImage:       ()   => ipcRenderer.invoke('image:pick'),
  imageToDataUrl:  (p)  => ipcRenderer.invoke('image:toDataUrl', p),
});
