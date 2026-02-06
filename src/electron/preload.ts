import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

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

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ success: boolean; version?: string; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
