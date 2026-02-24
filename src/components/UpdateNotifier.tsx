'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { UpdateStatus } from '@/types/electron';

/**
 * Update notifier component that shows when running in Electron.
 * Designed for the Settings > Updates tab — full-width card layout.
 */
export function UpdateNotifier() {
  const [isElectron, setIsElectron] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true);

      // Get app version
      window.electronAPI.getAppVersion().then(setAppVersion);

      // Subscribe to update status
      const unsubscribe = window.electronAPI.onUpdateStatus((status) => {
        setUpdateStatus(status);
        if (status.status !== 'checking') {
          setIsChecking(false);
        }
      });

      return () => unsubscribe();
    }
  }, []);

  const checkForUpdates = async () => {
    if (!window.electronAPI) return;
    setIsChecking(true);
    await window.electronAPI.checkForUpdates();
  };

  const downloadUpdate = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.downloadUpdate();
  };

  const installUpdate = () => {
    if (!window.electronAPI) return;
    window.electronAPI.installUpdate();
  };

  if (!isElectron) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Updates are only available when running the desktop app.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current version */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Current Version</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">v{appVersion}</p>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={isChecking}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {isChecking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isChecking ? 'Checking...' : 'Check for Updates'}
        </button>
      </div>

      {/* Status */}
      {updateStatus && (
        <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-3">
            {updateStatus.status === 'checking' && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
            {updateStatus.status === 'available' && <Download className="w-5 h-5 text-green-500" />}
            {updateStatus.status === 'downloading' && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
            {updateStatus.status === 'downloaded' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {updateStatus.status === 'not-available' && <CheckCircle className="w-5 h-5 text-gray-400" />}
            {updateStatus.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
            <div>
              {updateStatus.status === 'checking' && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Checking for updates...</p>
              )}
              {updateStatus.status === 'available' && (
                <p className="text-sm text-gray-900 dark:text-white">Version {updateStatus.version} is available</p>
              )}
              {updateStatus.status === 'not-available' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">You&apos;re on the latest version</p>
              )}
              {updateStatus.status === 'downloading' && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Downloading... {updateStatus.percent?.toFixed(0)}%</p>
              )}
              {updateStatus.status === 'downloaded' && (
                <p className="text-sm text-gray-900 dark:text-white">Version {updateStatus.version} ready to install</p>
              )}
              {updateStatus.status === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400">{updateStatus.message}</p>
              )}
            </div>
          </div>

          {updateStatus.status === 'available' && (
            <button
              onClick={downloadUpdate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}

          {updateStatus.status === 'downloaded' && (
            <button
              onClick={installUpdate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Restart to Update
            </button>
          )}
        </div>
      )}
    </div>
  );
}
