// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getPorts: () => ipcRenderer.invoke('get-serial-ports'),
  connectPort: (path, isConnect) => ipcRenderer.invoke('connect-serial', path, isConnect),
  sendData: (buffer) => ipcRenderer.send('send-serial', buffer),
  onData: (callback) => ipcRenderer.on('serial-data', (_event, value) => callback(value))
})