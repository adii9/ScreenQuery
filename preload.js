const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('screenQuery', {
  // Region selector
  onScreenshot: (callback) => ipcRenderer.on('screenshot', (_, data) => callback(data)),
  
  // App controls
  sendRegionSelected: (rect) => ipcRenderer.send('region-selected', rect),
  sendRegionCancelled: () => ipcRenderer.send('region-cancelled'),
  
  // Panel controls
  copyAnswer: (text) => ipcRenderer.send('copy-answer', text),
  closePanel: () => ipcRenderer.send('close-panel'),
  
  // Utilities
  getScreenshot: () => ipcRenderer.invoke('get-screenshot'),
  
  // Platform info
  platform: process.platform
});
