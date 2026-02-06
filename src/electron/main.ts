import { app, BrowserWindow, shell, ipcMain, dialog, utilityProcess, UtilityProcess, safeStorage } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import http from 'http';

// Secure credential storage using macOS Keychain via safeStorage
const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.enc');

interface StoredCredentials {
  username: string;
  appPassword: string;
}

function getSecureCredentials(): StoredCredentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      console.error('Encryption not available - cannot read credentials');
      return null;
    }

    const encryptedData = fs.readFileSync(CREDENTIALS_FILE);
    const decrypted = safeStorage.decryptString(encryptedData);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to read secure credentials:', error);
    return null;
  }
}

function setSecureCredentials(credentials: StoredCredentials): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.error('Encryption not available - cannot store credentials');
      return false;
    }

    const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
    fs.writeFileSync(CREDENTIALS_FILE, encrypted);
    console.log('Credentials stored securely in:', CREDENTIALS_FILE);
    return true;
  } catch (error) {
    console.error('Failed to store secure credentials:', error);
    return false;
  }
}

function deleteSecureCredentials(): boolean {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete credentials:', error);
    return false;
  }
}


let mainWindow: BrowserWindow | null = null;
let nextServer: UtilityProcess | null = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = 4853; // Unique port to avoid conflicts with dev servers

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

  // In production, start the Next.js standalone server
  // The standalone folder is in extraResources (outside asar)
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'standalone', 'server.js')
    : path.join(__dirname, '..', '..', '.next', 'standalone', 'server.js');

  console.log('Starting Next.js server from:', serverPath);
  console.log('Server path exists:', require('fs').existsSync(serverPath));

  // Get credentials from secure storage to pass to the server
  const credentials = getSecureCredentials();
  const serverEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(PORT),
    NODE_ENV: 'production',
    HOSTNAME: 'localhost',
  };

  // Pass decrypted credentials to the server process
  if (credentials) {
    serverEnv.WP_USERNAME = credentials.username;
    serverEnv.WP_APP_PASSWORD = credentials.appPassword;
    console.log('Credentials loaded from secure storage for user:', credentials.username);
  }

  // Use Electron's utilityProcess to fork the server
  // This uses Electron's built-in Node.js runtime
  nextServer = utilityProcess.fork(serverPath, [], {
    env: serverEnv,
    cwd: path.dirname(serverPath),
  });

  nextServer.stdout?.on('data', (data: Buffer) => {
    console.log(`[Next.js] ${data.toString()}`);
  });

  nextServer.stderr?.on('data', (data: Buffer) => {
    console.error(`[Next.js Error] ${data.toString()}`);
  });

  nextServer.on('exit', (code: number) => {
    if (code !== 0) {
      console.error(`Next.js server exited with code ${code}`);
      dialog.showErrorBox('Server Error', 'The application server stopped unexpectedly.');
    }
  });
}

function stopNextServer(): void {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
}

// Helper to get the app base path
function getAppPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar')
    : path.join(__dirname, '..');
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

// Secure credential handlers
ipcMain.handle('get-credentials', () => {
  const creds = getSecureCredentials();
  if (creds) {
    // Return username but not the password for security
    return { hasCredentials: true, username: creds.username };
  }
  return { hasCredentials: false, username: '' };
});

ipcMain.handle('set-credentials', async (_event, { username, appPassword }: { username: string; appPassword: string }) => {
  const success = setSecureCredentials({ username, appPassword });
  if (success && !isDev) {
    // Restart the Next.js server so it picks up new credentials
    console.log('Credentials updated - restarting Next.js server...');
    try {
      stopNextServer();
      // Small delay to ensure port is released
      await new Promise(resolve => setTimeout(resolve, 1000));
      await startNextServer();
      const serverReady = await waitForServer(`http://localhost:${PORT}`);
      if (serverReady) {
        console.log('Server restarted with new credentials');
        // Reload the window to reflect new state
        mainWindow?.webContents.reload();
      } else {
        console.error('Server restart failed - server not ready');
        dialog.showErrorBox('Restart Required', 'Credentials saved. Please restart the app for changes to take effect.');
      }
    } catch (error) {
      console.error('Error restarting server:', error);
      dialog.showErrorBox('Restart Required', 'Credentials saved. Please restart the app for changes to take effect.');
    }
  }
  return { success };
});

ipcMain.handle('delete-credentials', () => {
  const success = deleteSecureCredentials();
  if (success) {
    delete process.env.WP_USERNAME;
    delete process.env.WP_APP_PASSWORD;
  }
  return { success };
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
