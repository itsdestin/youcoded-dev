const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('probe', {
  onInit: (cb) => ipcRenderer.on('probe:init', (_e, d) => cb(d)),
  move: (x, y) => ipcRenderer.send('probe:move', { x, y }),
  size: () => ipcRenderer.invoke('probe:size'),
  log: (m) => ipcRenderer.send('probe:log', m),
  quit: () => ipcRenderer.send('probe:quit'),
});
