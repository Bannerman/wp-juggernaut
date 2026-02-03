'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [promptTemplate, setPromptTemplate] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [originalTemplate, setOriginalTemplate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');
        const data = await res.json();
        setPromptTemplate(data.settings.ai_prompt_template);
        setOriginalTemplate(data.settings.ai_prompt_template);
        setDefaultTemplate(data.defaultTemplate);
      } catch (err) {
        setMessage({ type: 'error', text: String(err) });
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const hasChanges = promptTemplate !== originalTemplate;

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_prompt_template: promptTemplate }),
      });

      if (!res.ok) throw new Error('Failed to save settings');

      setOriginalTemplate(promptTemplate);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset the AI prompt template to the default? This cannot be undone.')) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings?key=ai_prompt_template', {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to reset settings');

      const data = await res.json();
      setPromptTemplate(data.value);
      setOriginalTemplate(data.value);
      setMessage({ type: 'success', text: 'Template reset to default' });
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={isSaving}
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* AI Prompt Template */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">AI Prompt Template</h2>
            <p className="text-sm text-gray-500 mt-1">
              Customize the prompt used in the AI Fill tab. Use placeholders like{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{title}}'}</code> for dynamic values.
            </p>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Available Placeholders</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  '{{title}}',
                  '{{intro_text}}',
                  '{{text_content}}',
                  '{{features}}',
                  '{{available_taxonomies}}',
                  '{{taxonomy_selections}}',
                  '{{timer_enabled}}',
                  '{{timer_title}}',
                  '{{timer_datetime}}',
                  '{{changelog}}',
                ].map((placeholder) => (
                  <code
                    key={placeholder}
                    className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700 cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      navigator.clipboard.writeText(placeholder);
                      setMessage({ type: 'success', text: `Copied ${placeholder}` });
                      setTimeout(() => setMessage(null), 2000);
                    }}
                    title="Click to copy"
                  >
                    {placeholder}
                  </code>
                ))}
              </div>
            </div>

            <textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              rows={25}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="Enter your AI prompt template..."
            />

            {hasChanges && (
              <p className="text-sm text-yellow-600 mt-2 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                You have unsaved changes
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
