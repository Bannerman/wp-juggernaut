'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Check, AlertCircle, History, FileText, Globe, Server, Sparkles, Activity, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

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

type SettingsTab = 'target' | 'prompts' | 'diagnostics';
type PromptsView = 'edit' | 'history';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('target');

  // Target state
  const [targets, setTargets] = useState<SiteTarget[]>([]);
  const [activeTarget, setActiveTarget] = useState<SiteTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetSwitching, setTargetSwitching] = useState(false);

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

  // Common state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch site config
  useEffect(() => {
    fetch('/api/site-config')
      .then(res => res.json())
      .then(data => {
        setTargets(data.targets || []);
        setActiveTarget(data.activeTarget || null);
      })
      .catch(err => console.error('Failed to fetch site config:', err))
      .finally(() => setTargetLoading(false));
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

      // Clear diagnostics when switching
      setDiagnostics(null);
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setTargetSwitching(false);
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>
              <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            </div>

            {/* Tab-specific actions */}
            {activeTab === 'prompts' && promptsView === 'edit' && (
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
            )}
          </div>

          {/* Tabs */}
          <nav className="flex gap-6 -mb-px">
            <button
              onClick={() => setActiveTab('target')}
              className={cn(
                'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                activeTab === 'target'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Server className="w-4 h-4" />
              Target Site
            </button>
            <button
              onClick={() => { setActiveTab('prompts'); setPromptsView('edit'); }}
              className={cn(
                'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                activeTab === 'prompts'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Sparkles className="w-4 h-4" />
              Prompts
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={cn(
                'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                activeTab === 'diagnostics'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Activity className="w-4 h-4" />
              Diagnostics
            </button>
          </nav>
        </div>
      </header>

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

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Note:</strong> After switching targets, you should re-sync your data to load resources from the new site.
                The same WordPress credentials (username and application password) are used for all sites.
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
                <p className="text-gray-500">Click "Run Test" to check the connection</p>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
