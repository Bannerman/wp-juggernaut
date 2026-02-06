import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';


let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = 3000;

// Configure auto-updater for GitHub releases
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#f9fafb',
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' as const };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        http.get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        }).on('error', reject);
      });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

async function startNextServer(): Promise<void> {
  if (isDev) {
    // In development, assume Next.js dev server is running separately
    console.log('Development mode: Connect to existing Next.js server');
    return;
  }

  // In production, start the Next.js server
  // process.resourcesPath is available in packaged Electron apps
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || __dirname;
  const serverPath = path.join(resourcesPath, 'app');

  nextServer = spawn('node', [path.join(serverPath, 'server.js')], {
    cwd: serverPath,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });

  nextServer.stdout?.on('data', (data: Buffer) => {
    console.log(`[Next.js] ${data}`);
  });

  nextServer.stderr?.on('data', (data: Buffer) => {
    console.error(`[Next.js Error] ${data}`);
  });

  nextServer.on('error', (error: Error) => {
    console.error('Failed to start Next.js server:', error);
    dialog.showErrorBox('Server Error', 'Failed to start the application server.');
    app.quit();
  });

  nextServer.on('exit', (code: number | null) => {
    if (code !== 0 && code !== null) {
      console.error(`Next.js server exited with code ${code}`);
    }
  });
}

function stopNextServer(): void {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
  mainWindow?.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info: UpdateInfo) => {
  console.log('Update available:', info.version);
  mainWindow?.webContents.send('update-status', {
    status: 'available',
    version: info.version,
    releaseNotes: info.releaseNotes,
  });

  // Show dialog to user
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available. Would you like to download it now?`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
  }).then((result: Electron.MessageBoxReturnValue) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('No update available');
  mainWindow?.webContents.send('update-status', { status: 'not-available' });
});

autoUpdater.on('download-progress', (progress: ProgressInfo) => {
  console.log(`Download progress: ${progress.percent.toFixed(1)}%`);
  mainWindow?.webContents.send('update-status', {
    status: 'downloading',
    percent: progress.percent,
  });
});

autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
  console.log('Update downloaded:', info.version);
  mainWindow?.webContents.send('update-status', {
    status: 'downloaded',
    version: info.version,
  });

  // Prompt user to restart
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'Update Ready',
    message: `Version ${info.version} has been downloaded. Restart now to install the update?`,
    buttons: ['Restart', 'Later'],
    defaultId: 0,
  }).then((result: Electron.MessageBoxReturnValue) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (error: Error) => {
  console.error('Auto-updater error:', error);
  mainWindow?.webContents.send('update-status', {
    status: 'error',
    message: error.message,
  });
});

// IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// App lifecycle
app.whenReady().then(async () => {
  await startNextServer();

  const serverReady = await waitForServer(`http://localhost:${PORT}`);

  if (!serverReady) {
    dialog.showErrorBox('Connection Error', 'Unable to connect to the application server.');
    app.quit();
    return;
  }

  const win = createWindow();
  win.loadURL(`http://localhost:${PORT}`);

  // Check for updates after window loads (only in production)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(console.error);
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()?.loadURL(`http://localhost:${PORT}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopNextServer();
});
