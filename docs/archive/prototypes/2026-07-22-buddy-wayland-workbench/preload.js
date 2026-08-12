const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probe', {
  onInit: (cb) => ipcRenderer.on('probe:init', (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('probe:error', (_e, msg) => cb(msg)),
  setIgnore: (ignore, forward) => ipcRenderer.send('probe:set-ignore', { ignore, forward }),
  setShape: (rects) => ipcRenderer.send('probe:set-shape', { rects }),
  cursor: () => ipcRenderer.invoke('probe:cursor'),
  quit: () => ipcRenderer.send('probe:quit'),
});
