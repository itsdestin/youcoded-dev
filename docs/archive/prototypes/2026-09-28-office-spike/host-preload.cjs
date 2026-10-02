// The host page's only door to main: the stand-in for window.claude.office.invoke.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('host', {
  invoke: (token, cmd, args) => ipcRenderer.invoke('office-invoke', token, cmd, args),
  log: (m) => ipcRenderer.send('host-log', m),
});
