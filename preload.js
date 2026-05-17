'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CamWall', {
  // Config
  getConfig:    ()    => ipcRenderer.invoke('cfg:get'),
  saveConfig:   (c)   => ipcRenderer.invoke('cfg:save', c),

  // Écrans
  getDisplays:  ()    => ipcRenderer.invoke('display:list'),
  setDisplay:   (i)   => ipcRenderer.invoke('display:set', i),

  // go2rtc
  go2rtcCheck:    ()   => ipcRenderer.invoke('go2rtc:check'),
  go2rtcStart:    (c)  => ipcRenderer.invoke('go2rtc:start', c),
  go2rtcStop:     ()   => ipcRenderer.invoke('go2rtc:stop'),
  go2rtcRestart:  (c)  => ipcRenderer.invoke('go2rtc:restart', c),
  go2rtcDownload: ()   => ipcRenderer.invoke('go2rtc:download'),
  go2rtcStatus:   ()   => ipcRenderer.invoke('go2rtc:status'),
  go2rtcWriteCfg: (c)  => ipcRenderer.invoke('go2rtc:write-cfg', c),
  onDownloadProgress: (cb) => ipcRenderer.on('go2rtc-dl-progress', (_, d) => cb(d)),

  // Navigation
  goToApp:   () => ipcRenderer.invoke('nav:app'),
  goToSetup: () => ipcRenderer.invoke('nav:setup'),

  // Mouse
  setMouseInteractive: (on) => ipcRenderer.send('mouse:interactive', on),

  // Click-through
  setClickThrough: (on) => ipcRenderer.invoke('clickthrough:set', on),

  // Autostart
  getAutostart: ()   => ipcRenderer.invoke('autostart:get'),
  setAutostart: (on) => ipcRenderer.invoke('autostart:set', on),

  // Updates
  checkUpdate: ()    => ipcRenderer.invoke('update:check'),
  openUpdate:  (url) => ipcRenderer.invoke('update:open', url),
  onUpdate:    (cb)  => ipcRenderer.on('update:available', (_, d) => cb(d)),

  // Commandes tray → renderer
  onCmd: (cb) => ipcRenderer.on('cmd:pause-all',     (_, d) => cb('pause-all', d))
              || ipcRenderer.on('cmd:resume-all',    (_, d) => cb('resume-all', d))
              || ipcRenderer.on('cmd:open-settings', (_, d) => cb('open-settings', d)),

  // Utilitaires
  openConfigDir: () => ipcRenderer.invoke('open:config-dir'),
  openLog:       () => ipcRenderer.invoke('open:log'),
  getVersion:    () => ipcRenderer.invoke('app:version'),
  quit:          () => ipcRenderer.invoke('app:quit'),
});
