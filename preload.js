'use strict';
/**
 * CamWall v5.0.0 — preload.js
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CamWall', {
  getConfig:  ()    => ipcRenderer.invoke('cfg:get'),
  saveConfig: (c)   => ipcRenderer.invoke('cfg:save', c),
  getDisplays: ()   => ipcRenderer.invoke('display:list'),
  setDisplay:  (i)  => ipcRenderer.invoke('display:set', i),
  go2rtcCheck:    ()   => ipcRenderer.invoke('go2rtc:check'),
  go2rtcStart:    (c)  => ipcRenderer.invoke('go2rtc:start', c),
  go2rtcStop:     ()   => ipcRenderer.invoke('go2rtc:stop'),
  go2rtcRestart:  (c)  => ipcRenderer.invoke('go2rtc:restart', c),
  go2rtcDownload: ()   => ipcRenderer.invoke('go2rtc:download'),
  go2rtcStatus:   ()   => ipcRenderer.invoke('go2rtc:status'),
  onDownloadProgress: (cb) => ipcRenderer.on('go2rtc-dl-progress', (_, d) => cb(d)),
  goToApp:   () => ipcRenderer.invoke('nav:app'),
  goToSetup: () => ipcRenderer.invoke('nav:setup'),
  getMetrics:   ()   => ipcRenderer.invoke('metrics:get'),
  onMetrics:    (cb) => ipcRenderer.on('metrics:update', (_, d) => cb(d)),
  startMetrics: ()   => ipcRenderer.send('metrics:start'),
  stopMetrics:  ()   => ipcRenderer.send('metrics:stop'),
  getProxmox: (c) => ipcRenderer.invoke('proxmox:get', c),
  getAutostart: ()    => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on)  => ipcRenderer.invoke('autostart:set', on),
  checkUpdate: ()    => ipcRenderer.invoke('update:check'),
  openUpdate:  (u)   => ipcRenderer.invoke('update:open', u),
  onUpdate:    (cb)  => ipcRenderer.on('update:available', (_, d) => cb(d)),
  onCmd: (cb) => {
    ipcRenderer.on('cmd:pause-all',     () => cb('pause-all'));
    ipcRenderer.on('cmd:resume-all',    () => cb('resume-all'));
    ipcRenderer.on('cmd:open-settings', () => cb('open-settings'));
  },
  openConfigDir:   () => ipcRenderer.invoke('open:config-dir'),
  openLog:         () => ipcRenderer.invoke('open:log'),
  getVersion:      () => ipcRenderer.invoke('app:version'),
  quit:            () => ipcRenderer.invoke('app:quit'),
  setClickThrough: (on) => ipcRenderer.invoke('clickthrough:set', on),
  pickImage:       ()   => ipcRenderer.invoke('image:pick'),
  imageToDataUrl:  (p)  => ipcRenderer.invoke('image:toDataUrl', p),
  // Nouvelles APIs v5
  runSpeedtest:    ()   => ipcRenderer.invoke('speedtest:run'),
  notifyDesktop:   (d)  => ipcRenderer.send('notify:desktop', d),
  getConfigPath:   ()   => ipcRenderer.invoke('config:export-path'),
  webhookStatus:   ()   => ipcRenderer.invoke('webhook:status'),
  webhookStart:    ()   => ipcRenderer.invoke('webhook:start'),
  onWebhook:       (cb) => ipcRenderer.on('webhook:event', (_, d) => cb(d)),
  onNightMode:     (cb) => ipcRenderer.on('time:nightmode', (_, v) => cb(v)),
});
