import { app, BrowserWindow, shell, ipcMain, dialog, utilityProcess, UtilityProcess, safeStorage } from 'electron';
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { isValidExternalUrl } from '../lib/url-validation';

// Lazy-load electron-updater to avoid crash if module is not bundled
let autoUpdater: import('electron-updater').AppUpdater | null = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  console.warn('electron-updater not available, auto-updates disabled');
}

// Secure credential storage using macOS Keychain via safeStorage
const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.enc');

// Map of targetId -> credentials
type StoredCredentialsMap = Record<string, { username: string; appPassword: string }>;

// Legacy format (single object)
interface LegacyStoredCredentials {
  username: string;
  appPassword: string;
}

function getSecureCredentials(): StoredCredentialsMap {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return {};
    }

    if (!safeStorage.isEncryptionAvailable()) {
      console.error('Encryption not available - cannot read credentials');
      return {};
    }

    const encryptedData = fs.readFileSync(CREDENTIALS_FILE);
    const decrypted = safeStorage.decryptString(encryptedData);
    const parsed = JSON.parse(decrypted);

    // Migration: if it's the legacy format (has username/appPassword at root), wrap it
    // We don't know the target ID for legacy credentials, but we can assume 'local' or verify against config
    // For now, if we encounter legacy format, we'll return it as 'default' or migrate it properly via migrateCredentials
    if (parsed.username && parsed.appPassword && !parsed.siteCredentials) {
        // It's legacy. We can't map it to a target ID easily here without reading config.
        // But since we are migrating in app.whenReady, we might just return it as a map with a placeholder?
        // Actually, migrateCredentials handles file-based config.
        // If secure storage has legacy format, we should probably support it or migrate it.
        // Let's assume for now that migrateCredentials will fix everything.
        // But here we need to return a map.
        // If it looks like legacy, wrap it in a map?
        // But wait, the previous implementation stored just the object.
        // If I change the storage format, I break existing users unless I handle migration of the *secure file* too.
        // Let's check if it's a map.
        if (typeof parsed.username === 'string') {
           // It's legacy single credential.
           // We'll treat it as 'local' or just return empty if we can't be sure?
           // Better to return it as a special key or just upgrade it on next write.
           // Let's map it to 'local' for now, or read site-config active target? Too complex here.
           return { 'local': { username: parsed.username, appPassword: parsed.appPassword } };
        }
    }

    return parsed as StoredCredentialsMap;
  } catch (error) {
    console.error('Failed to read secure credentials:', error);
    return {};
  }
}

function setSecureCredentials(credentials: StoredCredentialsMap): boolean {
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

function deleteSecureCredentials(targetId: string): boolean {
  try {
    const creds = getSecureCredentials();
    if (creds[targetId]) {
      delete creds[targetId];
      return setSecureCredentials(creds);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete credentials:', error);
    return false;
  }
}

// Migration: Move credentials from site-config.json to secure storage
function migrateCredentials() {
  try {
    const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.juggernaut');
    const CONFIG_DIR = process.env.JUGGERNAUT_CONFIG_DIR || DEFAULT_CONFIG_DIR;
    const CONFIG_PATH = path.join(CONFIG_DIR, 'site-config.json');

    if (!fs.existsSync(CONFIG_PATH)) return;

    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    let changed = false;

    // Load existing secure credentials
    const secureCreds = getSecureCredentials();

    // Migrate legacy 'credentials' field
    if (config.credentials?.username && config.credentials?.appPassword) {
      console.log('Migrating legacy credentials from site-config.json');
      const targetId = config.activeTarget || 'local';
      // Only overwrite if not already present in secure storage
      if (!secureCreds[targetId]) {
        secureCreds[targetId] = config.credentials;
        changed = true;
      }
      delete config.credentials;
    }

    // Migrate 'siteCredentials' map
    if (config.siteCredentials) {
      for (const [targetId, creds] of Object.entries(config.siteCredentials)) {
        // Type assertion for creds
        const c = creds as { username: string; appPassword: string };
        if (c?.username && c?.appPassword) {
            console.log(`Migrating credentials for ${targetId} from site-config.json`);
            if (!secureCreds[targetId]) {
                secureCreds[targetId] = c;
                changed = true;
            }
        }
      }
      delete config.siteCredentials;
      // We removed the whole map, so all credentials are gone from file
    }

    if (changed) {
      // Save secure credentials
      setSecureCredentials(secureCreds);

      // Save stripped config
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log('Migration complete: Credentials moved to secure storage');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

let mainWindow: BrowserWindow | null = null;
let nextServer: UtilityProcess | null = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = 4853; // Unique port to avoid conflicts with dev servers

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
  const credentialsMap = getSecureCredentials();
  const serverEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(PORT),
    NODE_ENV: 'production',
    HOSTNAME: 'localhost',
    JUGGERNAUT_ELECTRON: '1',
  };

  // Pass ALL decrypted credentials map to the server process as a JSON string
  if (Object.keys(credentialsMap).length > 0) {
    serverEnv.JUGGERNAUT_CREDENTIALS = JSON.stringify(credentialsMap);
    console.log(`Injected credentials for ${Object.keys(credentialsMap).length} sites into server env`);
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

    dialog.showMessageBox(mainWindow!, {
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

    dialog.showMessageBox(mainWindow!, {
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
ipcMain.handle('get-credentials', (_event, targetId?: string) => {
  const credsMap = getSecureCredentials();
  // If targetId is provided, return specific credentials
  // If not, we might be in a legacy call, but we can't guess.
  // We'll return empty if no targetId, OR we could assume 'local' if it exists?
  // But preload/client should always pass targetId now.

  if (targetId && credsMap[targetId]) {
    return { hasCredentials: true, username: credsMap[targetId].username };
  }
  return { hasCredentials: false, username: '' };
});

ipcMain.handle('set-credentials', async (_event, { targetId, username, appPassword }: { targetId: string; username: string; appPassword: string }) => {
  // Read existing map
  const credsMap = getSecureCredentials();

  // Update specific target
  credsMap[targetId] = { username, appPassword };

  const success = setSecureCredentials(credsMap);

  if (success && !isDev) {
    // Restart the Next.js server so it picks up new credentials env var
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

ipcMain.handle('delete-credentials', (_event, targetId: string) => {
  const success = deleteSecureCredentials(targetId);
  return { success };
});

// App lifecycle
app.whenReady().then(async () => {
  // Run migration before starting server
  migrateCredentials();

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
