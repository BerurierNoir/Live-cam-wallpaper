'use strict';
/**
 * CamWall — preload.js
 * Bridge IPC sécurisé: contextIsolation=true, nodeIntegration=false
 * Expose uniquement les APIs nécessaires au renderer via window.CamWall
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CamWall', {
  // Config
  getConfig:  ()    => ipcRenderer.invoke('cfg:get'),
  saveConfig: (c)   => ipcRenderer.invoke('cfg:save', c),

  // Displays
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

  // Métriques
  getMetrics:   ()    => ipcRenderer.invoke('metrics:get'),
  startMetrics: ()    => ipcRenderer.send('metrics:start'),
  stopMetrics:  ()    => ipcRenderer.send('metrics:stop'),
  onMetrics:    (cb)  => ipcRenderer.on('metrics:update', (_, d) => cb(d)),

  // Proxmox
  getProxmox: (c) => ipcRenderer.invoke('proxmox:get', c),

  // Autostart
  getAutostart: ()    => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on)  => ipcRenderer.invoke('autostart:set', on),

  // Mises à jour
  checkUpdate: ()    => ipcRenderer.invoke('update:check'),
  openUpdate:  (u)   => ipcRenderer.invoke('update:open', u),
  onUpdate:    (cb)  => ipcRenderer.on('update:available', (_, d) => cb(d)),

  // Commandes depuis le tray (3 listeners séparés — pas de || ni de switch)
  onPauseAll:     (cb) => ipcRenderer.on('cmd:pause-all',     () => cb()),
  onResumeAll:    (cb) => ipcRenderer.on('cmd:resume-all',    () => cb()),
  onOpenSettings: (cb) => ipcRenderer.on('cmd:open-settings', () => cb()),

  // Modes
  onNightMode:  (cb) => ipcRenderer.on('time:nightmode',  (_, v) => cb(v)),
  onWebhook:    (cb) => ipcRenderer.on('webhook:event',   (_, d) => cb(d)),

  // Utils
  openConfigDir:    () => ipcRenderer.invoke('open:config-dir'),
  openLog:          () => ipcRenderer.invoke('open:log'),
  getVersion:       () => ipcRenderer.invoke('app:version'),
  quit:             () => ipcRenderer.invoke('app:quit'),
  setClickThrough:  (on) => ipcRenderer.invoke('clickthrough:set', on),
  pickImage:        ()   => ipcRenderer.invoke('image:pick'),
  imageToDataUrl:   (p)  => ipcRenderer.invoke('image:to-data-url', p),
  getConfigPath:    ()   => ipcRenderer.invoke('config:path'),

  // Speedtest + notifications
  runSpeedtest:     ()  => ipcRenderer.invoke('speedtest:run'),
  notifyDesktop:    (d) => ipcRenderer.send('notify:desktop', d),

  // Webhook info
  webhookStatus:    ()  => ipcRenderer.invoke('webhook:status'),
});
