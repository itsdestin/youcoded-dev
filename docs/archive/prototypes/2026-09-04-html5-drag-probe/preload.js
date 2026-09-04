const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('probe', { report: (m) => ipcRenderer.send('report', m) });
