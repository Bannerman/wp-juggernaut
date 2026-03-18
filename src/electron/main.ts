import { app, BrowserWindow, shell, ipcMain, dialog, utilityProcess, UtilityProcess, safeStorage } from 'electron';
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import http from 'http';
import net from 'net';
/** Validates that a URL uses http: or https: protocol (safe to open externally) */
function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Lazy-load electron-updater to avoid crash if module is not bundled
let autoUpdater: import('electron-updater').AppUpdater | null = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  console.warn('electron-updater not available, auto-updates disabled');
}

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
    const parsed = JSON.parse(decrypted);

    // Validate that decryption produced sensible data (not garbage from a
    // changed code-signing identity after an app rebuild)
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.appPassword !== 'string'
        || parsed.username.length === 0 || parsed.appPassword.length === 0) {
      console.warn('Credentials file decrypted but contains invalid data — deleting stale file');
      try { fs.unlinkSync(CREDENTIALS_FILE); } catch { /* ignore */ }
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Failed to read secure credentials — deleting stale file:', error);
    // Remove the corrupted/stale credentials file so the app doesn't keep failing
    try { fs.unlinkSync(CREDENTIALS_FILE); } catch { /* ignore */ }
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
let isQuitting = false; // Tracks intentional shutdown to suppress spurious error dialogs
const isDev = process.env.NODE_ENV === 'development';
const PORT = 4853; // Unique port to avoid conflicts with dev servers

// Enforce single instance to prevent SQLite database corruption (WAL mode)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the existing window when a second instance is attempted
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Global crash handlers to prevent silent crashes
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception in main process:', error);
  dialog.showErrorBox(
    'Unexpected Error',
    `Juggernaut encountered an unexpected error:\n\n${error.message}\n\nThe app will now quit.`
  );
  app.quit();
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled rejection in main process:', reason);
  // Log but don't crash — unhandled rejections are often non-fatal
});

// Configure auto-updater for GitHub releases
if (autoUpdater) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

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
    if (isValidExternalUrl(url)) {
      shell.openExternal(url);
    } else {
      console.warn(`Blocked attempt to open invalid external URL: ${url}`);
    }
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

/** Returns true if the given port is already in use */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
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
  // Store database in userData so it persists across app updates
  // (the standalone server cwd is inside the app bundle, which gets replaced on each install)
  const dbPath = path.join(app.getPath('userData'), 'data', 'juggernaut.db');
  const serverEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(PORT),
    NODE_ENV: 'production',
    HOSTNAME: 'localhost',
    JUGGERNAUT_ELECTRON: '1',
    DATABASE_PATH: dbPath,
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
    if (code !== 0 && !isQuitting) {
      console.error(`Next.js server exited with code ${code}`);
      dialog.showErrorBox('Server Error', 'The application server stopped unexpectedly. The app will now quit.');
      app.quit();
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
if (autoUpdater) {
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

    const win = mainWindow;
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result: Electron.MessageBoxReturnValue) => {
      if (result.response === 0) {
        autoUpdater!.downloadUpdate();
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

    const updateWin = mainWindow;
    if (!updateWin) return;
    dialog.showMessageBox(updateWin, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install the update?`,
      buttons: ['Restart', 'Later'],
      defaultId: 0,
    }).then((result: Electron.MessageBoxReturnValue) => {
      if (result.response === 0) {
        autoUpdater!.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-updater error:', error);
    const isNetworkError = /ERR_NAME_NOT_RESOLVED|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(error.message);
    if (!isNetworkError) {
      mainWindow?.webContents.send('update-status', {
        status: 'error',
        message: error.message,
      });
    }
  });
}

// IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-updater not available' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater?.quitAndInstall(false, true);
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
  // Check for port conflict before starting the server
  if (!isDev && await isPortInUse(PORT)) {
    dialog.showErrorBox(
      'Port Conflict',
      `Port ${PORT} is already in use. Another instance of Juggernaut or another application may be using it.\n\nPlease close the other application and try again.`
    );
    app.quit();
    return;
  }

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
      autoUpdater?.checkForUpdates().catch(console.error);
    }, 3000);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const serverAlive = await waitForServer(`http://localhost:${PORT}`, 5);
      if (serverAlive) {
        createWindow()?.loadURL(`http://localhost:${PORT}`);
      } else {
        dialog.showErrorBox('Server Unavailable', 'The application server is not running. Please restart Juggernaut.');
        app.quit();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopNextServer();
});
