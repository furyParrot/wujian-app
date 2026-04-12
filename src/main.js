const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { SerialPort } = require('serialport')
const path = require('node:path');
const fs = require('fs');

const started = require('electron-squirrel-startup');
let mainWindow = null;
let port = null;

if (started) {
  app.quit();
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1300, // 限制最小尺寸
    minHeight: 850,
    autoHideMenuBar: true, // 隐藏丑陋的菜单栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, 
      contextIsolation: true
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 串口相关
ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map(p => p.path)
  } catch (err) { return[] }
})

ipcMain.handle('connect-serial', async (event, path, connect) => {
  return new Promise((resolve) => {
    if (connect) {
      port = new SerialPort({ path, baudRate: 115200 }, (err) => { 
        if (err) resolve(false); else resolve(true);
      })
      port.on('data', (data) => {
        if(mainWindow) mainWindow.webContents.send('serial-data', data)
      })
    } else {
      if (port && port.isOpen) port.close(() => resolve(true));
      else resolve(true);
    }
  })
})

ipcMain.on('send-serial', (event, buffer) => {
  if (port && port.isOpen) port.write(Buffer.from(buffer))
})

// === 新增：保存日志文件到本地 ===
ipcMain.handle('save-log', async (event, content) => {
  const now = new Date();
  const timeStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存操作日志',
    defaultPath: `电源关键操作日志_${timeStr}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  
  if (!canceled && filePath) {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
});