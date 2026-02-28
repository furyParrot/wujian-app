// src/main.js (这是后端入口，负责创建窗口和控制串口)
const { app, BrowserWindow, ipcMain } = require('electron')
const { SerialPort } = require('serialport')
const path = require('node:path');
// ... 后面的 createWindow 等代码保持不变 ...
// 注意：如果你之前的模板里用的是 require('electron-squirrel-startup')，请保持一致
const started = require('electron-squirrel-startup');

// 1. 全局声明 mainWindow，去掉之前的 const 覆盖
let mainWindow = null;
let port = null;

if (started) {
  app.quit();
}

const createWindow = () => {
  // 2. 这里千万不要加 const！直接给全局变量赋值
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 1300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 允许在渲染进程使用 node api (根据你的模板配置而定)
      nodeIntegration: false, 
      contextIsolation: true
    },
  });

  // 加载页面
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    // 注意这里的反引号 `
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // 打开开发者工具 (界面调好后可以注释掉)
  //mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.


// 获取所有串口列表
ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map(p => p.path)
  } catch (err) {
    return []
  }
})

// 连接/断开串口
ipcMain.handle('connect-serial', async (event, path, connect) => {
  return new Promise((resolve) => {
    if (connect) {
      port = new SerialPort({ path, baudRate: 115200 }, (err) => { // 波特率根据你的下位机修改
        if (err) resolve(false)
        else resolve(true)
      })
      // 监听数据，发送给前端
      port.on('data', (data) => {
        if(mainWindow) mainWindow.webContents.send('serial-data', data)
      })
    } else {
      if (port && port.isOpen) {
        port.close(() => resolve(true))
      } else {
        resolve(true)
      }
    }
  })
})

// 向串口发送数据
ipcMain.on('send-serial', (event, buffer) => {
  if (port && port.isOpen) {
    port.write(Buffer.from(buffer))
  }
})