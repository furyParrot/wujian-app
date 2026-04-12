const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getPorts: () => ipcRenderer.invoke('get-serial-ports'),
  connectPort: (path, isConnect) => ipcRenderer.invoke('connect-serial', path, isConnect),
  sendData: (buffer) => ipcRenderer.send('send-serial', buffer),
  onData: (callback) => ipcRenderer.on('serial-data', (_event, value) => callback(value)),
  saveLogFile: (content) => ipcRenderer.invoke('save-log', content) // 新增保存接口
})