const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

// Disable autoplay restrictions for incoming WebRTC audio/video call feeds
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 820,
    minHeight: 580,
    title: 'Shongjog - Sovereign Messenger',
    icon: path.join(__dirname, '../public/favicon.svg'),
    backgroundColor: '#090e17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
    autoHideMenuBar: true,
  });

  // Grant camera, microphone, screen capture, and audio permissions automatically for calls
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return true;
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || Boolean(process.env.VITE_DEV_SERVER_URL));

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Press F12 to toggle DevTools if ever needed
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Handle external link clicks in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

