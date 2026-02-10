'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, RotateCcw, Check, AlertCircle, History, FileText, Globe, Loader2, RefreshCw, Puzzle, Activity, ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsNav } from '@/components/SettingsNav';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  updatedAt: string;
}

interface TemplateVersion {
  filename: string;
  timestamp: string;
  displayDate: string;
}

interface Placeholder {
  tag: string;
  description: string;
}

interface SiteTarget {
  id: string;
  name: string;
  url: string;
  description: string;
}

interface DiagnosticResult {
  success: boolean;
  baseUrl: string;
  apiReachable: boolean;
  authValid: boolean;
  resourceCount?: number;
  error?: string;
}

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  tier: 'bundled' | 'community' | 'premium';
  enabled: boolean;
  wordpress_plugin?: {
    name: string;
    slug: string;
    url?: string;
  };
  provides?: {
    tabs?: string[];
    field_types?: string[];
    api_extensions?: string[];
  };
}

interface PluginStats {
  total: number;
  enabled: number;
  bundled: number;
  community: number;
}

type SettingsTab = 'target' | 'prompts' | 'plugins' | 'diagnostics';
type PromptsView = 'edit' | 'history';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('target');

  // Target state
  const [targets, setTargets] = useState<SiteTarget[]>([]);
  const [activeTarget, setActiveTarget] = useState<SiteTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetSwitching, setTargetSwitching] = useState(false);

  // Credentials state
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Prompts state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [originalContent, setOriginalContent] = useState<Record<string, string>>({});
  const [promptsView, setPromptsView] = useState<PromptsView>('edit');
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Plugins state
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginStats, setPluginStats] = useState<PluginStats | null>(null);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);

  // Common state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch site config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Fetch site targets
        const res = await fetch('/api/site-config');
        const data = await res.json();
        setTargets(data.targets || []);
        setActiveTarget(data.activeTarget || null);

        // Check for credentials via Electron secure storage (macOS Keychain)
        if (window.electronAPI) {
          const credStatus = await window.electronAPI.getCredentials();
          setHasCredentials(credStatus.hasCredentials);
          setUsername(credStatus.username);
        } else {
          // Fallback for browser dev mode
          setHasCredentials(data.hasCredentials || false);
          setUsername(data.username || '');
        }
      } catch (err) {
        console.error('Failed to fetch site config:', err);
      } finally {
        setTargetLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Fetch plugins
  useEffect(() => {
    fetch('/api/plugins')
      .then(res => res.json())
      .then(data => {
        setPlugins(data.plugins || []);
        setPluginStats(data.stats || null);
      })
      .catch(err => console.error('Failed to fetch plugins:', err))
      .finally(() => setPluginsLoading(false));
  }, []);

  // Fetch templates
  useEffect(() => {
    fetch('/api/prompt-templates')
      .then(res => res.json())
      .then(data => {
        setTemplates(data.templates);
        setPlaceholders(data.placeholders);

        const edited: Record<string, string> = {};
        const original: Record<string, string> = {};
        for (const t of data.templates) {
          edited[t.id] = t.content;
          original[t.id] = t.content;
        }
        setEditedContent(edited);
        setOriginalContent(original);

        if (data.templates.length > 0) {
          setActiveTemplateId(data.templates[0].id);
        }
      })
      .catch(err => setMessage({ type: 'error', text: String(err) }))
      .finally(() => setIsLoading(false));
  }, []);

  // Switch target
  const switchTarget = async (targetId: string) => {
    setTargetSwitching(true);
    setMessage(null);

    try {
      const res = await fetch('/api/site-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      });

      if (!res.ok) throw new Error('Failed to switch target');

      const data = await res.json();
      setActiveTarget(data.activeTarget);
      setMessage({ type: 'success', text: data.message });

      // Update credential status for the new target
      setHasCredentials(data.hasCredentials || false);
      setUsername(data.username || '');
      setAppPassword('');

      // Clear diagnostics when switching
      setDiagnostics(null);
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setTargetSwitching(false);
    }
  };

  // Save credentials securely via macOS Keychain
  const saveCredentials = async () => {
    if (!username || !appPassword) {
      setMessage({ type: 'error', text: 'Both username and application password are required' });
      return;
    }

    setSavingCredentials(true);
    setMessage(null);

    try {
      if (window.electronAPI) {
        // Use secure storage (macOS Keychain) in Electron
        const result = await window.electronAPI.setCredentials(username, appPassword);
        if (!result.success) {
          throw new Error('Failed to save credentials to secure storage');
        }
        setMessage({ type: 'success', text: 'Credentials saved securely to macOS Keychain' });
      } else {
        // Fallback for browser dev mode (less secure)
        const res = await fetch('/api/site-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: { username, appPassword } }),
        });
        if (!res.ok) throw new Error('Failed to save credentials');
        const savedData = await res.json();
        setMessage({ type: 'success', text: savedData.message || 'Credentials saved' });
      }

      setHasCredentials(true);
      setAppPassword(''); // Clear password from state for security
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setSavingCredentials(false);
    }
  };

  // Run diagnostics
  const runDiagnostics = async () => {
    setDiagLoading(true);
    setDiagnostics(null);

    try {
      const res = await fetch('/api/test-connection');
      const data = await res.json();
      setDiagnostics(data);
    } catch (err) {
      setDiagnostics({
        success: false,
        baseUrl: activeTarget?.url || '',
        apiReachable: false,
        authValid: false,
        error: String(err),
      });
    } finally {
      setDiagLoading(false);
    }
  };

  // Toggle plugin enabled/disabled
  const togglePlugin = async (pluginId: string, currentEnabled: boolean) => {
    setTogglingPlugin(pluginId);
    setMessage(null);

    try {
      const res = await fetch('/api/plugins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, enabled: !currentEnabled }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to toggle plugin');
      }

      const data = await res.json();

      // Update local state
      setPlugins(prev => prev.map(p =>
        p.id === pluginId ? { ...p, enabled: data.enabled } : p
      ));

      // Update stats
      setPluginStats(prev => prev ? {
        ...prev,
        enabled: prev.enabled + (data.enabled ? 1 : -1),
      } : null);

      setMessage({ type: 'success', text: data.message });
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setTogglingPlugin(null);
    }
  };

  // Prompts handlers
  const activeTemplate = templates.find(t => t.id === activeTemplateId);
  const hasPromptChanges = activeTemplateId ? editedContent[activeTemplateId] !== originalContent[activeTemplateId] : false;

  const handleSavePrompt = async () => {
    if (!activeTemplateId || !hasPromptChanges) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent[activeTemplateId] }),
      });

      if (!res.ok) throw new Error('Failed to save template');

      const data = await res.json();
      setOriginalContent(prev => ({ ...prev, [activeTemplateId]: data.template.content }));
      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? data.template : t));
      setMessage({ type: 'success', text: `${activeTemplate?.name} template saved` });
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPrompt = async () => {
    if (!activeTemplateId) return;
    if (!confirm(`Reset "${activeTemplate?.name}" to its default template?`)) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });

      if (!res.ok) throw new Error('Failed to reset template');

      const data = await res.json();
      setEditedContent(prev => ({ ...prev, [activeTemplateId]: data.template.content }));
      setOriginalContent(prev => ({ ...prev, [activeTemplateId]: data.template.content }));
      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? data.template : t));
      setMessage({ type: 'success', text: 'Template reset to default' });
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const openVersionHistory = async () => {
    if (!activeTemplateId) return;

    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}?versions=true`);
      const data = await res.json();
      setVersions(data.versions);
      setPromptsView('history');
      setSelectedVersion(null);
      setVersionContent(null);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  const selectVersion = async (filename: string) => {
    if (!activeTemplateId) return;

    if (filename === 'template.md') {
      setPromptsView('edit');
      return;
    }

    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}?version=${filename}`);
      const data = await res.json();
      setVersionContent(data.content);
      setSelectedVersion(filename);
    } catch (err) {
      console.error('Failed to fetch version:', err);
    }
  };

  const restoreVersion = async () => {
    if (!activeTemplateId || !selectedVersion) return;
    if (!confirm('Restore this version?')) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', version: selectedVersion }),
      });

      if (!res.ok) throw new Error('Failed to restore version');

      const data = await res.json();
      setEditedContent(prev => ({ ...prev, [activeTemplateId]: data.template.content }));
      setOriginalContent(prev => ({ ...prev, [activeTemplateId]: data.template.content }));
      setTemplates(prev => prev.map(t => t.id === activeTemplateId ? data.template : t));
      setMessage({ type: 'success', text: 'Version restored' });
      setPromptsView('edit');
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const copyPlaceholder = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setMessage({ type: 'success', text: `Copied ${tag}` });
    setTimeout(() => setMessage(null), 2000);
  };

  if (isLoading || targetLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SettingsNav
        activeTab={activeTab}
        onTabClick={(tabId) => {
          if (tabId === 'prompts') { setActiveTab('prompts'); setPromptsView('edit'); }
          else setActiveTab(tabId);
        }}
        actions={
          activeTab === 'prompts' && promptsView === 'edit' ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleResetPrompt}
                disabled={isSaving || !activeTemplateId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={handleSavePrompt}
                disabled={!hasPromptChanges || isSaving}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  hasPromptChanges
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Message */}
      {message && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg',
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}
          >
            {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {message.text}
          </div>
        </div>
      )}

      {/* Target Tab */}
      {activeTab === 'target' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Target Site</h2>
              <p className="text-sm text-gray-500">Select which WordPress site to connect to</p>
            </div>

            <div className="grid gap-4">
              {targets.map((target) => (
                <button
                  key={target.id}
                  onClick={() => switchTarget(target.id)}
                  disabled={targetSwitching || activeTarget?.id === target.id}
                  className={cn(
                    'w-full text-left p-4 rounded-lg border-2 transition-all',
                    activeTarget?.id === target.id
                      ? 'bg-brand-50 border-brand-500'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-3 h-3 rounded-full',
                        activeTarget?.id === target.id ? 'bg-brand-500' : 'bg-gray-300'
                      )} />
                      <div>
                        <h3 className="font-medium text-gray-900">{target.name}</h3>
                        <p className="text-sm text-gray-500">{target.url}</p>
                      </div>
                    </div>
                    {activeTarget?.id === target.id && (
                      <span className="text-xs font-medium text-brand-600 bg-brand-100 px-2 py-1 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-2 ml-6">{target.description}</p>
                </button>
              ))}
            </div>

            {targetSwitching && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Switching target...
              </div>
            )}

            {/* Credentials Section */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  WordPress Credentials{activeTarget ? ` — ${activeTarget.name}` : ''}
                </h2>
                <p className="text-sm text-gray-500">
                  Enter your WordPress username and application password for {activeTarget?.name || 'the active site'}.
                  {hasCredentials && (
                    <span className="ml-2 text-green-600 font-medium">✓ Credentials saved</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  🔒 Credentials are encrypted using macOS Keychain for secure storage
                </p>
              </div>

              <div className="space-y-4 max-w-md">
                <div>
                  <label htmlFor="wp-username" className="block text-sm font-medium text-gray-700 mb-1">
                    WordPress Username
                  </label>
                  <input
                    id="wp-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>

                <div>
                  <label htmlFor="wp-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Application Password
                  </label>
                  <input
                    id="wp-password"
                    type="password"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder={hasCredentials ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Generate an application password in WordPress: Users → Profile → Application Passwords
                  </p>
                </div>

                <button
                  onClick={saveCredentials}
                  disabled={savingCredentials || (!username && !appPassword)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    'bg-brand-600 text-white hover:bg-brand-700',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {savingCredentials ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Credentials
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> Credentials are saved per site. After switching targets, you should re-sync your data to load resources from the new site.
                {activeTarget && !hasCredentials && (
                  <span className="block mt-1 font-medium text-amber-700">
                    No credentials saved for {activeTarget.name} — enter them above.
                  </span>
                )}
              </p>
            </div>
          </div>
        </main>
      )}

      {/* Plugins Tab */}
      {activeTab === 'plugins' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Plugins</h2>
              <p className="text-sm text-gray-500">
                Manage Juggernaut plugins to extend functionality for different WordPress plugins
              </p>
            </div>

            {/* Stats Cards */}
            {pluginStats && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Total Plugins</p>
                  <p className="text-2xl font-semibold text-gray-900">{pluginStats.total}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Enabled</p>
                  <p className="text-2xl font-semibold text-green-600">{pluginStats.enabled}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Bundled</p>
                  <p className="text-2xl font-semibold text-brand-600">{pluginStats.bundled}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Community</p>
                  <p className="text-2xl font-semibold text-purple-600">{pluginStats.community}</p>
                </div>
              </div>
            )}

            {/* Plugin List */}
            {pluginsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Loading plugins...</span>
              </div>
            ) : plugins.length === 0 ? (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <Puzzle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No plugins available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {plugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className={cn(
                      'bg-white rounded-lg border-2 p-5 transition-all',
                      plugin.enabled ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">{plugin.name}</h3>
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            v{plugin.version}
                          </span>
                          <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded',
                            plugin.tier === 'bundled'
                              ? 'bg-brand-100 text-brand-700'
                              : plugin.tier === 'premium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-purple-100 text-purple-700'
                          )}>
                            {plugin.tier}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{plugin.description}</p>

                        {/* WordPress Plugin Info */}
                        {plugin.wordpress_plugin && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                            <Globe className="w-4 h-4" />
                            <span>Supports: </span>
                            {plugin.wordpress_plugin.url ? (
                              <a
                                href={plugin.wordpress_plugin.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:underline"
                              >
                                {plugin.wordpress_plugin.name}
                              </a>
                            ) : (
                              <span className="font-medium">{plugin.wordpress_plugin.name}</span>
                            )}
                          </div>
                        )}

                        {/* Provides Info */}
                        {plugin.provides && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {plugin.provides.tabs?.map((tab) => (
                              <span key={tab} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                Tab: {tab}
                              </span>
                            ))}
                            {plugin.provides.api_extensions?.map((ext) => (
                              <span key={ext} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                                API: {ext}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Toggle Button */}
                      <button
                        onClick={() => togglePlugin(plugin.id, plugin.enabled)}
                        disabled={togglingPlugin === plugin.id}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                          togglingPlugin === plugin.id
                            ? 'bg-gray-100 text-gray-400 cursor-wait'
                            : plugin.enabled
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {togglingPlugin === plugin.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : plugin.enabled ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                        {plugin.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> Bundled plugins ship with Juggernaut and provide support for popular WordPress plugins like Meta Box and SEOPress.
                Enable the plugins that match the WordPress plugins installed on your site.
              </p>
            </div>
          </div>
        </main>
      )}

      {/* Prompts Tab - Edit View */}
      {activeTab === 'prompts' && promptsView === 'edit' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-8rem)] flex flex-col">
          <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">
            {/* Sidebar */}
            <div className="col-span-1 space-y-2 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Templates</p>
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setActiveTemplateId(template.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                    activeTemplateId === template.id
                      ? 'bg-brand-50 border-brand-300 text-brand-900'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">{template.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                </button>
              ))}

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Placeholders</p>
                <div className="space-y-1">
                  {placeholders.map((p) => (
                    <button
                      key={p.tag}
                      onClick={() => copyPlaceholder(p.tag)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 group"
                      title={`Click to copy: ${p.tag}`}
                    >
                      <code className="text-xs font-mono text-brand-600 group-hover:text-brand-800">{p.tag}</code>
                      <p className="text-xs text-gray-500 truncate">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="col-span-3 flex flex-col min-h-0">
              {activeTemplate && (
                <div className="bg-white rounded-lg border border-gray-200 flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{activeTemplate.name}</h2>
                      <p className="text-sm text-gray-500">{activeTemplate.description}</p>
                    </div>
                    <button
                      onClick={openVersionHistory}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <History className="w-4 h-4" />
                      History
                    </button>
                  </div>

                  <div className="p-6 flex-1 flex flex-col min-h-0">
                    <textarea
                      value={editedContent[activeTemplateId!] || ''}
                      onChange={(e) => setEditedContent(prev => ({ ...prev, [activeTemplateId!]: e.target.value }))}
                      className="w-full flex-1 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                      placeholder="Enter your prompt template..."
                    />

                    {hasPromptChanges && (
                      <p className="text-sm text-yellow-600 mt-3 flex items-center gap-1 flex-shrink-0">
                        <AlertCircle className="w-4 h-4" />
                        Unsaved changes
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Prompts Tab - History View */}
      {activeTab === 'prompts' && promptsView === 'history' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-8rem)] flex flex-col">
          <div className="mb-4">
            <button
              onClick={() => setPromptsView('edit')}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Editor
            </button>
          </div>

          <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">
            <div className="col-span-1 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Versions</p>
              <div className="space-y-1">
                {versions.map((v) => (
                  <button
                    key={v.filename}
                    onClick={() => selectVersion(v.filename)}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                      v.filename === 'template.md'
                        ? 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        : selectedVersion === v.filename
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <span className="font-medium">
                      {v.filename === 'template.md' ? 'Current Version' : v.displayDate}
                    </span>
                    {v.filename === 'template.md' && (
                      <p className="text-xs text-gray-500 mt-0.5">Click to return to editor</p>
                    )}
                  </button>
                ))}
                {versions.length <= 1 && (
                  <p className="text-sm text-gray-400 italic px-4 py-3">No previous versions</p>
                )}
              </div>
            </div>

            <div className="col-span-3 flex flex-col min-h-0">
              {selectedVersion && versionContent !== null ? (
                <div className="bg-white rounded-lg border border-gray-200 flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Previous Version</h2>
                      <p className="text-sm text-gray-500">
                        {versions.find(v => v.filename === selectedVersion)?.displayDate}
                      </p>
                    </div>
                    <button
                      onClick={restoreVersion}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore
                    </button>
                  </div>
                  <div className="p-6 flex-1 min-h-0 overflow-y-auto">
                    <pre className="font-mono text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">
                      {versionContent}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center flex-1 flex flex-col items-center justify-center">
                  <History className="w-12 h-12 text-gray-300 mb-4" />
                  <p className="text-gray-500">Select a version to preview</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Diagnostics Tab */}
      {activeTab === 'diagnostics' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Connection Diagnostics</h2>
                <p className="text-sm text-gray-500">
                  Test the connection to {activeTarget?.name || 'WordPress'}
                </p>
              </div>
              <button
                onClick={runDiagnostics}
                disabled={diagLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {diagLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {diagLoading ? 'Testing...' : 'Run Test'}
              </button>
            </div>

            {/* Current Target Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Target</h3>
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{activeTarget?.name}</p>
                  <p className="text-sm text-gray-500">{activeTarget?.url}</p>
                </div>
              </div>
            </div>

            {/* Diagnostic Results */}
            {diagnostics && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Test Results</h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">API Reachable</span>
                    <span className={cn(
                      'text-sm font-medium',
                      diagnostics.apiReachable ? 'text-green-600' : 'text-red-600'
                    )}>
                      {diagnostics.apiReachable ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Authentication Valid</span>
                    <span className={cn(
                      'text-sm font-medium',
                      diagnostics.authValid ? 'text-green-600' : 'text-red-600'
                    )}>
                      {diagnostics.authValid ? 'Yes' : 'No'}
                    </span>
                  </div>

                  {diagnostics.resourceCount !== undefined && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Resources Found</span>
                      <span className="text-sm font-medium text-gray-900">
                        {diagnostics.resourceCount}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Overall Status</span>
                    <span className={cn(
                      'text-sm font-medium px-2 py-1 rounded',
                      diagnostics.success
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    )}>
                      {diagnostics.success ? 'Connected' : 'Failed'}
                    </span>
                  </div>
                </div>

                {diagnostics.error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{diagnostics.error}</p>
                  </div>
                )}
              </div>
            )}

            {!diagnostics && !diagLoading && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Click &quot;Run Test&quot; to check the connection</p>
              </div>
            )}

            {/* Field Audit Link */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Field Mapping Audit</h3>
              <p className="text-sm text-gray-500 mb-3">
                Compare local field mappings against WordPress meta_box fields to identify mismatches.
              </p>
              <Link
                href="/diagnostics"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Open Field Audit
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
