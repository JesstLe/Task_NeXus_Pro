const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getCpuInfo: () => ipcRenderer.invoke('get-cpu-info'),
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  setAffinity: (pid, coreMask, mode, primaryCore) => ipcRenderer.invoke('set-affinity', pid, coreMask, mode, primaryCore),
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  // 关闭窗口（由主进程决定是隐藏到托盘还是退出）
  close: () => ipcRenderer.send('window-close'),
  // 完全退出应用
  quit: () => ipcRenderer.send('app-quit'),
  onMaximizedStateChange: (callback) => ipcRenderer.on('window-maximized-state', (_, state) => callback(state)),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  addProfile: (profile) => ipcRenderer.invoke('add-profile', profile),
  removeProfile: (name) => ipcRenderer.invoke('remove-profile', name),
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  setProcessPriority: (pid, priority) => ipcRenderer.invoke('set-process-priority', { pid, priority }),
  getMemoryInfo: () => ipcRenderer.invoke('get-memory-info'),
  clearMemory: () => ipcRenderer.invoke('clear-memory'),
  getPowerPlan: () => ipcRenderer.invoke('get-power-plan'),
  setPowerPlan: (plan) => ipcRenderer.invoke('set-power-plan', plan),
  importPowerPlan: (path) => ipcRenderer.invoke('import-power-plan', path),
  openPowerSettings: () => ipcRenderer.invoke('open-power-settings'),
  listPowerPlans: () => ipcRenderer.invoke('list-power-plans'),
  setTimerResolution: (periodMs) => ipcRenderer.invoke('set-timer-resolution', periodMs),
  getTimerResolution: () => ipcRenderer.invoke('get-timer-resolution'),

  // CoreGrid 2.0
  startCpuMonitor: () => ipcRenderer.invoke('start-cpu-monitor'),
  stopCpuMonitor: () => ipcRenderer.invoke('stop-cpu-monitor'),
  onCpuLoadUpdate: (callback) => ipcRenderer.on('cpu-load-update', (event, data) => callback(data)),
  offCpuLoadUpdate: () => ipcRenderer.removeAllListeners('cpu-load-update'),

  // System Optimizer
  getTweaks: () => ipcRenderer.invoke('get-tweaks'),
  applyTweaks: (ids) => ipcRenderer.invoke('apply-tweaks', ids),

  // Config Sharing
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // License System
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
});
