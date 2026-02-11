'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Eye, EyeOff, Code, Save } from 'lucide-react';
import { FieldMappingEditor } from '@/components/FieldMappingEditor';
import { SettingsNav } from '@/components/SettingsNav';
import { cn } from '@/lib/utils';

interface MappableField {
  key: string;
  label: string;
  category: 'core' | 'meta' | 'taxonomy';
  type?: string;
}

interface FieldMappingEntry {
  source: { key: string; category: 'core' | 'meta' | 'taxonomy' };
  target: { key: string; category: 'core' | 'meta' | 'taxonomy' };
}

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
}

export default function FieldMappingsPage(): React.ReactElement {
  const [postTypes, setPostTypes] = useState<PostTypeConfig[]>([]);
  const [sourceType, setSourceType] = useState<string>('');
  const [targetType, setTargetType] = useState<string>('');
  const [sourceFields, setSourceFields] = useState<MappableField[]>([]);
  const [targetFields, setTargetFields] = useState<MappableField[]>([]);
  const [mappings, setMappings] = useState<FieldMappingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [showFieldKeys, setShowFieldKeys] = useState(true);
  const [sourcePosts, setSourcePosts] = useState<{ id: number; title: string }[]>([]);
  const [targetPosts, setTargetPosts] = useState<{ id: number; title: string }[]>([]);
  const [selectedSourcePost, setSelectedSourcePost] = useState<number | null>(null);
  const [selectedTargetPost, setSelectedTargetPost] = useState<number | null>(null);
  const [sourcePreviewValues, setSourcePreviewValues] = useState<Record<string, string>>({});
  const [targetPreviewValues, setTargetPreviewValues] = useState<Record<string, string>>({});
  const [sourceFullValues, setSourceFullValues] = useState<Record<string, string>>({});
  const [targetFullValues, setTargetFullValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);

  // Fetch post types on mount
  useEffect(() => {
    fetch('/api/field-mappings')
      .then((res) => res.json())
      .then((data) => {
        setPostTypes(data.postTypes || []);
        if (data.postTypes?.length >= 2) {
          setSourceType(data.postTypes[0].slug);
          setTargetType(data.postTypes[1].slug);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setIsLoading(false);
      });
  }, []);

  // Fetch fields and mappings when source/target changes
  const fetchFieldData = useCallback(async () => {
    if (!sourceType || !targetType || sourceType === targetType) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/field-mappings?source=${sourceType}&target=${targetType}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch fields');
      }

      setSourceFields(data.sourceFields || []);
      setTargetFields(data.targetFields || []);
      setMappings(data.mappings || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [sourceType, targetType]);

  useEffect(() => {
    fetchFieldData();
  }, [fetchFieldData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Fetch post lists when preview is enabled or post types change
  useEffect(() => {
    if (!previewEnabled || !sourceType || !targetType) return;

    setSelectedSourcePost(null);
    setSelectedTargetPost(null);
    setSourcePreviewValues({});
    setTargetPreviewValues({});
    setSourceFullValues({});
    setTargetFullValues({});

    fetch(`/api/field-mappings/preview?postType=${sourceType}`)
      .then((res) => res.json())
      .then((data) => setSourcePosts(data.posts || []))
      .catch(() => setSourcePosts([]));

    fetch(`/api/field-mappings/preview?postType=${targetType}`)
      .then((res) => res.json())
      .then((data) => setTargetPosts(data.posts || []))
      .catch(() => setTargetPosts([]));
  }, [previewEnabled, sourceType, targetType]);

  // Fetch source post field values
  useEffect(() => {
    if (!selectedSourcePost) {
      setSourcePreviewValues({});
      setSourceFullValues({});
      return;
    }
    fetch(`/api/field-mappings/preview?postId=${selectedSourcePost}`)
      .then((res) => res.json())
      .then((data) => {
        setSourcePreviewValues(data.values || {});
        setSourceFullValues(data.fullValues || {});
      })
      .catch(() => {
        setSourcePreviewValues({});
        setSourceFullValues({});
      });
  }, [selectedSourcePost]);

  // Fetch target post field values
  useEffect(() => {
    if (!selectedTargetPost) {
      setTargetPreviewValues({});
      setTargetFullValues({});
      return;
    }
    fetch(`/api/field-mappings/preview?postId=${selectedTargetPost}`)
      .then((res) => res.json())
      .then((data) => {
        setTargetPreviewValues(data.values || {});
        setTargetFullValues(data.fullValues || {});
      })
      .catch(() => {
        setTargetPreviewValues({});
        setTargetFullValues({});
      });
  }, [selectedTargetPost]);

  const handleSave = useCallback(
    async (newMappings: FieldMappingEntry[]) => {
      const res = await fetch('/api/field-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceType,
          target: targetType,
          mappings: newMappings,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save mappings');
      }

      setSuccess(`Saved ${data.count} field mapping${data.count !== 1 ? 's' : ''}`);
    },
    [sourceType, targetType]
  );

  const handleHeaderSave = useCallback(async () => {
    if (!saveRef.current) return;
    setIsSaving(true);
    try {
      await saveRef.current();
    } finally {
      setIsSaving(false);
    }
  }, []);

  const sourcePostType = postTypes.find((pt) => pt.slug === sourceType);
  const targetPostType = postTypes.find((pt) => pt.slug === targetType);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsNav
        activeTab="field-mappings"
        actions={
          <button
            onClick={handleHeaderSave}
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
          Map fields between post types for conversion. When you convert a post from one
          type to another, these mappings determine which fields carry over and where
          they land in the target post type.
        </p>

        {/* Post type selectors + preview post selectors */}
        <div className="flex items-start gap-4 mb-8">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              Source post type
            </label>
            <select
              value={sourceType}
              onChange={(e) => {
                const newSource = e.target.value;
                if (newSource === targetType) {
                  setTargetType(sourceType);
                }
                setSourceType(newSource);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              {postTypes.map((pt) => (
                <option key={pt.slug} value={pt.slug}>
                  {pt.name}
                </option>
              ))}
            </select>
            {previewEnabled && sourceType && targetType && sourceType !== targetType && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                  Preview source post
                </label>
                <select
                  value={selectedSourcePost ?? ''}
                  onChange={(e) => setSelectedSourcePost(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">Select a post...</option>
                  {sourcePosts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (#{p.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setSourceType(targetType);
              setTargetType(sourceType);
            }}
            className="pt-5 text-gray-400 hover:text-brand-600 transition-colors"
            title="Swap source and target"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>

          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              Target post type
            </label>
            <select
              value={targetType}
              onChange={(e) => {
                const newTarget = e.target.value;
                if (newTarget === sourceType) {
                  setSourceType(targetType);
                }
                setTargetType(newTarget);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              {postTypes.map((pt) => (
                <option key={pt.slug} value={pt.slug}>
                  {pt.name}
                </option>
              ))}
            </select>
            {previewEnabled && sourceType && targetType && sourceType !== targetType && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                  Preview target post
                </label>
                <select
                  value={selectedTargetPost ?? ''}
                  onChange={(e) => setSelectedTargetPost(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">Select a post...</option>
                  {targetPosts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (#{p.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : sourceType === targetType ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            Select two different post types to map fields between them.
          </div>
        ) : sourcePostType && targetPostType ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <FieldMappingEditor
              sourcePostType={sourcePostType}
              targetPostType={targetPostType}
              sourceFields={sourceFields}
              targetFields={targetFields}
              initialMappings={mappings}
              onSave={handleSave}
              sourcePreviewValues={previewEnabled ? sourcePreviewValues : undefined}
              targetPreviewValues={previewEnabled ? targetPreviewValues : undefined}
              sourceFullValues={previewEnabled ? sourceFullValues : undefined}
              targetFullValues={previewEnabled ? targetFullValues : undefined}
              showFieldKeys={showFieldKeys}
              onDirtyChange={setHasChanges}
              saveRef={saveRef}
              headerActions={
                <>
                  <button
                    onClick={() => {
                      setPreviewEnabled((v) => !v);
                      if (previewEnabled) {
                        setSelectedSourcePost(null);
                        setSelectedTargetPost(null);
                        setSourcePreviewValues({});
                        setTargetPreviewValues({});
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      previewEnabled
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                    )}
                  >
                    {previewEnabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    Preview values
                  </button>
                  <button
                    onClick={() => setShowFieldKeys((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      showFieldKeys
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                    )}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Field keys
                  </button>
                </>
              }
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
