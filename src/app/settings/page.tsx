'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Check, AlertCircle, History, FileText } from 'lucide-react';
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

type ViewMode = 'edit' | 'history';

export default function SettingsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [originalContent, setOriginalContent] = useState<Record<string, string>>({});

  // Version history state
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch('/api/prompt-templates');
        if (!res.ok) throw new Error('Failed to fetch templates');
        const data = await res.json();

        setTemplates(data.templates);
        setPlaceholders(data.placeholders);

        // Initialize content state
        const edited: Record<string, string> = {};
        const original: Record<string, string> = {};
        for (const t of data.templates) {
          edited[t.id] = t.content;
          original[t.id] = t.content;
        }
        setEditedContent(edited);
        setOriginalContent(original);

        // Set first template as active
        if (data.templates.length > 0) {
          setActiveTemplateId(data.templates[0].id);
        }
      } catch (err) {
        setMessage({ type: 'error', text: String(err) });
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const activeTemplate = templates.find(t => t.id === activeTemplateId);
  const hasChanges = activeTemplateId ? editedContent[activeTemplateId] !== originalContent[activeTemplateId] : false;

  const handleSave = async () => {
    if (!activeTemplateId || !hasChanges) return;

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

  const handleReset = async () => {
    if (!activeTemplateId) return;
    if (!confirm(`Reset "${activeTemplate?.name}" to its default template? This will save the current version as a backup.`)) return;

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
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions);
      setViewMode('history');
      setSelectedVersion(null);
      setVersionContent(null);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  const closeVersionHistory = () => {
    setViewMode('edit');
    setSelectedVersion(null);
    setVersionContent(null);
  };

  const selectVersion = async (filename: string) => {
    if (!activeTemplateId) return;

    if (filename === 'template.md') {
      // "Current" selected - go back to edit mode
      closeVersionHistory();
      return;
    }

    try {
      const res = await fetch(`/api/prompt-templates/${activeTemplateId}?version=${filename}`);
      if (!res.ok) return;
      const data = await res.json();
      setVersionContent(data.content);
      setSelectedVersion(filename);
    } catch (err) {
      console.error('Failed to fetch version:', err);
    }
  };

  const restoreVersion = async () => {
    if (!activeTemplateId || !selectedVersion) return;
    if (!confirm('Restore this version? The current template will be saved as a backup.')) return;

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
      closeVersionHistory();
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  // Version History View
  if (viewMode === 'history') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <button
                  onClick={closeVersionHistory}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Editor
                </button>
                <h1 className="text-xl font-bold text-gray-900">
                  {activeTemplate?.name} — Version History
                </h1>
              </div>
            </div>
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

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-4rem-1px)] flex flex-col">
          <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">
            {/* Sidebar - Version List */}
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
                        ? selectedVersion === null && viewMode === 'history'
                          ? 'bg-brand-50 border-brand-300 text-brand-900'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
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
                  <p className="text-sm text-gray-400 italic px-4 py-3">No previous versions yet</p>
                )}
              </div>
            </div>

            {/* Main Content - Version Preview */}
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
                      {isSaving ? 'Restoring...' : 'Restore This Version'}
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
                  <p className="text-gray-500">Select a version from the sidebar to preview it</p>
                  <p className="text-sm text-gray-400 mt-2">Or click "Current Version" to return to the editor</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Normal Edit View
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
              <h1 className="text-xl font-bold text-gray-900">Prompt Templates</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={isSaving || !activeTemplateId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to Default
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  hasChanges
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-4rem-1px)] flex flex-col">
        <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">
          {/* Sidebar - Template List & Placeholders */}
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

            {/* Placeholders Reference */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Available Placeholders</p>
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

          {/* Main Content - Template Editor */}
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
                    Version History
                  </button>
                </div>

                <div className="p-6 flex-1 flex flex-col min-h-0">
                  <textarea
                    value={editedContent[activeTemplateId!] || ''}
                    onChange={(e) => setEditedContent(prev => ({ ...prev, [activeTemplateId!]: e.target.value }))}
                    className="w-full flex-1 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                    placeholder="Enter your prompt template..."
                  />

                  {hasChanges && (
                    <p className="text-sm text-yellow-600 mt-3 flex items-center gap-1 flex-shrink-0">
                      <AlertCircle className="w-4 h-4" />
                      You have unsaved changes
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
