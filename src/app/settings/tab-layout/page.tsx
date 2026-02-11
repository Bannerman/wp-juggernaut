'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { TabLayoutEditor } from '@/components/TabLayoutEditor';
import { SettingsNav } from '@/components/SettingsNav';
import { cn } from '@/lib/utils';

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
  is_primary?: boolean;
}

interface TabConfig {
  id: string;
  label: string;
  source: string;
  icon?: string;
  position?: number;
  dynamic?: boolean;
  post_types?: string[];
}

interface FieldDefinition {
  key: string;
  type: string;
  label: string;
  width?: 'full' | 'half' | 'quarter';
  [key: string]: unknown;
}

interface MappableField {
  key: string;
  label: string;
  category: 'core' | 'meta' | 'taxonomy';
  type?: string;
}

export default function TabLayoutPage(): React.ReactElement {
  const [postTypes, setPostTypes] = useState<PostTypeConfig[]>([]);
  const [selectedPostType, setSelectedPostType] = useState<string>('');
  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [fieldLayout, setFieldLayout] = useState<Record<string, FieldDefinition[]>>({});
  const [availableFields, setAvailableFields] = useState<MappableField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const localTabsRef = useRef<TabConfig[]>([]);
  const localFieldLayoutRef = useRef<Record<string, FieldDefinition[]>>({});
  const initialTabIdsRef = useRef<string[]>([]);

  // Fetch post types on mount
  useEffect(() => {
    fetch('/api/tab-layout')
      .then((res) => res.json())
      .then((data) => {
        const pts = data.postTypes || [];
        setPostTypes(pts);
        const primary = pts.find((pt: PostTypeConfig) => pt.is_primary);
        if (primary) setSelectedPostType(primary.slug);
        else if (pts.length) setSelectedPostType(pts[0].slug);
        // Don't set isLoading=false here — fetchLayoutData will handle it
        // Only stop loading if there are no post types to fetch data for
        if (pts.length === 0) setIsLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setIsLoading(false);
      });
  }, []);

  // Fetch layout data when post type changes
  const fetchLayoutData = useCallback(async () => {
    if (!selectedPostType) return;
    setIsLoading(true);
    setError(null);
    setHasChanges(false);

    try {
      const res = await fetch(`/api/tab-layout?postType=${selectedPostType}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch tab layout');

      const loadedTabs = data.tabs || [];
      setTabs(loadedTabs);
      setFieldLayout(data.fieldLayout || {});
      setAvailableFields(data.availableFields || []);
      localTabsRef.current = loadedTabs;
      localFieldLayoutRef.current = data.fieldLayout || {};
      initialTabIdsRef.current = loadedTabs.map((t: TabConfig) => t.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedPostType]);

  useEffect(() => {
    fetchLayoutData();
  }, [fetchLayoutData]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleEditorChange = useCallback(
    (nextTabs: TabConfig[], nextFieldLayout: Record<string, FieldDefinition[]>) => {
      localTabsRef.current = nextTabs;
      localFieldLayoutRef.current = nextFieldLayout;
      setHasChanges(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/tab-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType: selectedPostType,
          tabs: localTabsRef.current,
          fieldLayout: localFieldLayoutRef.current,
          initialTabIds: initialTabIdsRef.current,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save tab layout');

      setSuccess(`Saved ${data.tabCount} tab${data.tabCount !== 1 ? 's' : ''} with ${data.fieldCount} field${data.fieldCount !== 1 ? 's' : ''}`);
      setHasChanges(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [selectedPostType]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsNav
        activeTab="tab-layout"
        actions={
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              hasChanges
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        }
      />

      {/* Toast */}
      {(error || success) && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 shadow-lg border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 shadow-lg border border-green-200 dark:border-green-800">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{success}</span>
            </div>
          )}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Description */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Configure custom tabs and their fields for the edit modal. Core tabs (Basic, Classification, AI Fill) and plugin tabs (SEO) cannot be modified here.
        </p>

        {/* Post type selector */}
        <div className="mb-8 max-w-xs">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
            Post type
          </label>
          <select
            value={selectedPostType}
            onChange={(e) => setSelectedPostType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            {postTypes.map((pt) => (
              <option key={pt.slug} value={pt.slug}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Editor */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <TabLayoutEditor
              key={selectedPostType}
              tabs={tabs}
              fieldLayout={fieldLayout}
              availableFields={availableFields}
              postType={selectedPostType}
              onChange={handleEditorChange}
            />
          </div>
        )}
      </main>
    </div>
  );
}
