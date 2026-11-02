'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, Trash2, CheckCircle, AlertCircle, RefreshCw, Copy } from 'lucide-react';
import { SettingsNav } from '@/components/SettingsNav';
import { cn } from '@/lib/utils';

interface ProfileSummary {
  id: string;
  name: string;
  version: string;
  source: 'bundled' | 'user' | 'memory';
  filePath?: string;
  isActive: boolean;
  isDefault: boolean;
  siteCount: number;
  postTypes: string[];
}

const SOURCE_LABELS: Record<ProfileSummary['source'], string> = {
  bundled: 'Built-in',
  user: 'User file',
  memory: 'Session only',
};

export default function ProfilesPage(): React.ReactElement {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profilesDir, setProfilesDir] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/profile/import-export?list=1');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load profiles');
      setProfiles(data.profiles || []);
      setProfilesDir(data.profilesDir || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => { if (data.enabledPlugins) setEnabledPlugins(data.enabledPlugins); })
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!error && !success) return;
    const timer = setTimeout(() => { setError(null); setSuccess(null); }, 5000);
    return () => clearTimeout(timer);
  }, [error, success]);

  const handleActivate = async (profile: ProfileSummary) => {
    setBusyId(profile.id);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to switch profile');
      setSuccess(`Switched to "${profile.name}". Reloading...`);
      // Reload so every page picks up the new profile's tabs, views and sites
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch profile');
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async (file: File) => {
    setBusyId('__import__');
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON');
      }
      const res = await fetch('/api/profile/import-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setSuccess(`${data.message}. Saved to ${data.filePath}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusyId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (profile: ProfileSummary) => {
    try {
      const res = await fetch(`/api/profile/import-export?id=${encodeURIComponent(profile.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      const blob = new Blob([JSON.stringify(data.profile, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${profile.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleDelete = async (profile: ProfileSummary) => {
    if (!confirm(`Delete profile "${profile.name}"? This removes its file from your profiles folder.`)) return;
    setBusyId(profile.id);
    try {
      const res = await fetch(`/api/profile/import-export?id=${encodeURIComponent(profile.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setSuccess(`Deleted "${profile.name}"`);
      if (profile.isActive) {
        setTimeout(() => window.location.reload(), 600);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const onlyBundled = profiles.length > 0 && profiles.every((p) => p.source === 'bundled');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsNav
        activeTab="profiles"
        enabledPlugins={enabledPlugins}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Rescan profiles folder"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Rescan
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busyId === '__import__'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              Import profile
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
            />
          </div>
        }
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
          </div>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Profiles</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A profile describes a WordPress workspace: its sites, post types, taxonomies, plugins, tabs and views.
            Every <code>*.json</code> file in your profiles folder is loaded automatically; imported profiles are saved there too.
          </p>
          {profilesDir && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 break-all">{profilesDir}</code>
              <button
                onClick={() => navigator.clipboard.writeText(profilesDir).then(() => setSuccess('Path copied')).catch(() => {})}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Copy path"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          )}
          {onlyBundled && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Only the built-in default profile is loaded. Drop your profile JSON into the folder above (then Rescan),
              or use Import profile.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Synced data is stored per site id. Profiles whose sites share an id (for example &quot;production&quot;) share that
            local database, so resync after switching to a different workspace.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading && profiles.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">Loading profiles...</div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{profile.name}</span>
                    <span className="text-xs text-gray-400">v{profile.version}</span>
                    {profile.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Active</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {SOURCE_LABELS[profile.source]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <code>{profile.id}</code> · {profile.siteCount} site{profile.siteCount === 1 ? '' : 's'} · post types: {profile.postTypes.join(', ') || 'none'}
                  </div>
                  {profile.filePath && (
                    <div className="mt-1 text-xs text-gray-400 break-all">{profile.filePath}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!profile.isActive && (
                    <button
                      onClick={() => handleActivate(profile)}
                      disabled={busyId === profile.id}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-brand-500 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleExport(profile)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Export JSON"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {profile.source !== 'bundled' && (
                    <button
                      onClick={() => handleDelete(profile)}
                      disabled={busyId === profile.id}
                      className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="Delete profile file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
