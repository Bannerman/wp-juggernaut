/**
 * TypeScript declarations for Electron API exposed via preload script
 */

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
  getCredentials: () => Promise<CredentialStatus>;
  setCredentials: (username: string, appPassword: string) => Promise<{ success: boolean }>;
  deleteCredentials: () => Promise<{ success: boolean }>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
