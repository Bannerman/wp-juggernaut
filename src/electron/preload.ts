import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Secure credential storage (uses macOS Keychain)
  getCredentials: (targetId?: string) => ipcRenderer.invoke('get-credentials', targetId),
  setCredentials: (username: string, appPassword: string, targetId?: string) =>
    ipcRenderer.invoke('set-credentials', { username, appPassword, targetId }),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),

  // Update status listener
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const subscription = (_event: IpcRendererEvent, status: UpdateStatus) => {
      callback(status);
    };
    ipcRenderer.on('update-status', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('update-status', subscription);
    };
  },
});

// Type definitions for the exposed API
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string;
  percent?: number;
  message?: string;
}

export interface CredentialStatus {
  hasCredentials: boolean;
  username: string;
}

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ success: boolean; version?: string; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  getCredentials: (targetId?: string) => Promise<CredentialStatus>;
  setCredentials: (username: string, appPassword: string, targetId?: string) => Promise<{ success: boolean }>;
  deleteCredentials: () => Promise<{ success: boolean }>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
