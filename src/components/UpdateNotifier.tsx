'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { UpdateStatus } from '@/types/electron';

/**
 * Update notifier component that shows when running in Electron
 * Displays update status and provides controls for checking/installing updates
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

  // Don't render if not in Electron
  if (!isElectron) {
    return null;
  }

  const getStatusIcon = () => {
    switch (updateStatus?.status) {
      case 'checking':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'available':
        return <Download className="w-4 h-4 text-green-500" />;
      case 'downloading':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'downloaded':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (updateStatus?.status) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return `Update available: v${updateStatus.version}`;
      case 'not-available':
        return 'App is up to date';
      case 'downloading':
        return `Downloading... ${updateStatus.percent?.toFixed(0)}%`;
      case 'downloaded':
        return `v${updateStatus.version} ready to install`;
      case 'error':
        return `Update error: ${updateStatus.message}`;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      {/* Version badge */}
      <span className="text-gray-500 dark:text-gray-400">v{appVersion}</span>

      {/* Status indicator */}
      {updateStatus && (
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-gray-600 dark:text-gray-400">{getStatusText()}</span>
        </div>
      )}

      {/* Action buttons */}
      {!updateStatus && !isChecking && (
        <button
          onClick={checkForUpdates}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Check for updates"
        >
          <RefreshCw className="w-3 h-3" />
          Check for updates
        </button>
      )}

      {updateStatus?.status === 'available' && (
        <button
          onClick={downloadUpdate}
          className="flex items-center gap-1 px-3 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
        >
          <Download className="w-3 h-3" />
          Download
        </button>
      )}

      {updateStatus?.status === 'downloaded' && (
        <button
          onClick={installUpdate}
          className="flex items-center gap-1 px-3 py-1 text-xs text-white bg-brand-600 hover:bg-brand-700 rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Restart to update
        </button>
      )}
    </div>
  );
}
