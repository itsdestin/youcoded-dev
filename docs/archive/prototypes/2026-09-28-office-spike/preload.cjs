// The spike's stand-in for Tauri's JS API: bridge.js calls window.__TAURI__.core.invoke,
// .event.listen, .dialog.confirm/message and .window.getCurrentWindow. Each is forwarded
// to the Electron main process. In YouCoded this hop becomes postMessage → renderer → IPC.
const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();
ipcRenderer.on('tauri-event', (_e, name, payload) => {
  for (const cb of listeners.get(name) ?? []) cb({ event: name, payload });
});

contextBridge.exposeInMainWorld('__TAURI__', {
  core: { invoke: (cmd, args) => ipcRenderer.invoke('tauri-invoke', cmd, args) },
  event: {
    listen: (name, cb) => { const l = listeners.get(name) ?? []; l.push(cb); listeners.set(name, l); return Promise.resolve(() => {}); },
  },
  dialog: { confirm: async () => true, message: async () => undefined },
  window: { getCurrentWindow: () => ({ setTitle: async () => {}, close: async () => {}, onCloseRequested: async () => () => {} }) },
});
