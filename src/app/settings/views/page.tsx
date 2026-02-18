'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle, Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { SettingsNav } from '@/components/SettingsNav';
import { cn } from '@/lib/utils';

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
  is_primary?: boolean;
}

interface ViewColumn {
  key: string;
  label: string;
  source: 'core' | 'taxonomy' | 'meta';
  type?: 'text' | 'count' | 'download_stats';
  taxonomy_slug?: string;
  max_display?: number;
  sortable?: boolean;
}

interface ViewConfig {
  id: string;
  name: string;
  post_types?: string[];
  columns: ViewColumn[];
  is_default?: boolean;
  built_in?: 'downloads';
}

function generateId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ViewsPage(): React.ReactElement {
  const [postTypes, setPostTypes] = useState<PostTypeConfig[]>([]);
  const [selectedPostType, setSelectedPostType] = useState<string>('');
  const [views, setViews] = useState<ViewConfig[]>([]);
  const [availableColumns, setAvailableColumns] = useState<ViewColumn[]>([]);
  const [expandedViewId, setExpandedViewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);

  const localViewsRef = useRef<ViewConfig[]>([]);
  const initialViewIdsRef = useRef<string[]>([]);

  // Fetch enabled plugins for SettingsNav
  useEffect(() => {
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data.enabledPlugins) setEnabledPlugins(data.enabledPlugins);
      })
      .catch(() => {});
  }, []);

  // Fetch post types on mount
  useEffect(() => {
    fetch('/api/views')
      .then((res) => res.json())
      .then((data) => {
        const pts = data.postTypes || [];
        setPostTypes(pts);
        const primary = pts.find((pt: PostTypeConfig) => pt.is_primary);
        if (primary) setSelectedPostType(primary.slug);
        else if (pts.length) setSelectedPostType(pts[0].slug);
        if (pts.length === 0) setIsLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setIsLoading(false);
      });
  }, []);

  // Fetch views when post type changes
  const fetchViewData = useCallback(async () => {
    if (!selectedPostType) return;
    setIsLoading(true);
    setError(null);
    setHasChanges(false);

    try {
      const res = await fetch(`/api/views?postType=${selectedPostType}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch views');

      const loadedViews = data.views || [];
      setViews(loadedViews);
      setAvailableColumns(data.availableColumns || []);
      localViewsRef.current = loadedViews;
      initialViewIdsRef.current = loadedViews.map((v: ViewConfig) => v.id);
      if (loadedViews.length > 0) setExpandedViewId(loadedViews[0].id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedPostType]);

  useEffect(() => {
    fetchViewData();
  }, [fetchViewData]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const updateViews = useCallback((nextViews: ViewConfig[]) => {
    setViews(nextViews);
    localViewsRef.current = nextViews;
    setHasChanges(true);
  }, []);

  const handleAddView = useCallback(() => {
    const newView: ViewConfig = {
      id: generateId(),
      name: 'New View',
      post_types: [selectedPostType],
      columns: [
        { key: 'status', label: 'Status', source: 'core', sortable: true },
      ],
    };
    const next = [...localViewsRef.current, newView];
    updateViews(next);
    setExpandedViewId(newView.id);
  }, [selectedPostType, updateViews]);

  const handleRemoveView = useCallback((viewId: string) => {
    const next = localViewsRef.current.filter((v) => v.id !== viewId);
    updateViews(next);
    if (expandedViewId === viewId) {
      setExpandedViewId(next.length > 0 ? next[0].id : null);
    }
  }, [expandedViewId, updateViews]);

  const handleUpdateView = useCallback((viewId: string, updates: Partial<ViewConfig>) => {
    const next = localViewsRef.current.map((v) =>
      v.id === viewId ? { ...v, ...updates } : v
    );
    updateViews(next);
  }, [updateViews]);

  const handleSetDefault = useCallback((viewId: string) => {
    const next = localViewsRef.current.map((v) => ({
      ...v,
      is_default: v.id === viewId,
    }));
    updateViews(next);
  }, [updateViews]);

  const handleAddColumn = useCallback((viewId: string, column: ViewColumn) => {
    const view = localViewsRef.current.find((v) => v.id === viewId);
    if (!view) return;
    handleUpdateView(viewId, { columns: [...view.columns, column] });
  }, [handleUpdateView]);

  const handleRemoveColumn = useCallback((viewId: string, columnIndex: number) => {
    const view = localViewsRef.current.find((v) => v.id === viewId);
    if (!view) return;
    const cols = [...view.columns];
    cols.splice(columnIndex, 1);
    handleUpdateView(viewId, { columns: cols });
  }, [handleUpdateView]);

  const handleMoveColumn = useCallback((viewId: string, fromIndex: number, direction: 'up' | 'down') => {
    const view = localViewsRef.current.find((v) => v.id === viewId);
    if (!view) return;
    const cols = [...view.columns];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= cols.length) return;
    [cols[fromIndex], cols[toIndex]] = [cols[toIndex], cols[fromIndex]];
    handleUpdateView(viewId, { columns: cols });
  }, [handleUpdateView]);

  const handleUpdateColumn = useCallback((viewId: string, columnIndex: number, updates: Partial<ViewColumn>) => {
    const view = localViewsRef.current.find((v) => v.id === viewId);
    if (!view) return;
    const cols = view.columns.map((c, i) =>
      i === columnIndex ? { ...c, ...updates } : c
    );
    handleUpdateView(viewId, { columns: cols });
  }, [handleUpdateView]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/views', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType: selectedPostType,
          views: localViewsRef.current,
          initialViewIds: initialViewIdsRef.current,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save views');

      setSuccess(`Saved ${data.viewCount} view${data.viewCount !== 1 ? 's' : ''}`);
      setHasChanges(false);
      initialViewIdsRef.current = localViewsRef.current.map((v) => v.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [selectedPostType]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsNav
        activeTab="views"
        enabledPlugins={enabledPlugins}
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Configure named views with custom column layouts for the resource table. Each view defines which columns appear and in what order.
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

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* View list */}
            {views.map((view) => {
              const isExpanded = expandedViewId === view.id;
              const usedKeys = new Set(view.columns.map((c) => c.key));
              const unusedColumns = availableColumns.filter((c) => !usedKeys.has(c.key));

              return (
                <div
                  key={view.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* View header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    onClick={() => setExpandedViewId(isExpanded ? null : view.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {view.name}
                      </span>
                      {view.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">
                          Default
                        </span>
                      )}
                      {view.built_in && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          Built-in: {view.built_in}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {view.built_in ? '' : `${view.columns.length} column${view.columns.length !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!view.is_default && (
                        <button
                          onClick={() => handleSetDefault(view.id)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          Set default
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveView(view.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove view"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                      {/* Name */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                            View Name
                          </label>
                          <input
                            type="text"
                            value={view.name}
                            onChange={(e) => handleUpdateView(view.id, { name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                            Built-in renderer
                          </label>
                          <select
                            value={view.built_in || ''}
                            onChange={(e) => handleUpdateView(view.id, {
                              built_in: e.target.value === 'downloads' ? 'downloads' : undefined,
                            })}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          >
                            <option value="">None (column-based)</option>
                            <option value="downloads">Downloads Table</option>
                          </select>
                        </div>
                      </div>

                      {/* Post types */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          Applies to post types
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {postTypes.map((pt) => {
                            const checked = !view.post_types || view.post_types.length === 0 || view.post_types.includes(pt.slug);
                            return (
                              <label key={pt.slug} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    let next: string[];
                                    if (e.target.checked) {
                                      next = [...(view.post_types || []), pt.slug];
                                    } else {
                                      next = (view.post_types || postTypes.map(p => p.slug)).filter(s => s !== pt.slug);
                                    }
                                    // If all are selected, store as empty array (= all)
                                    if (next.length === postTypes.length) next = [];
                                    handleUpdateView(view.id, { post_types: next.length > 0 ? next : undefined });
                                  }}
                                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                                {pt.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Columns (skip for built-in views) */}
                      {!view.built_in && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Columns
                          </label>
                          <div className="space-y-2">
                            {view.columns.map((col, idx) => (
                              <div
                                key={`${col.key}-${idx}`}
                                className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                              >
                                <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[100px]">
                                  {col.label}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                                  {col.source}
                                </span>

                                {/* Meta type selector */}
                                {col.source === 'meta' && (
                                  <select
                                    value={col.type || 'text'}
                                    onChange={(e) => handleUpdateColumn(view.id, idx, { type: e.target.value as ViewColumn['type'] })}
                                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                                  >
                                    <option value="text">Text</option>
                                    <option value="count">Count</option>
                                    <option value="download_stats">Download Stats</option>
                                  </select>
                                )}

                                {/* Taxonomy max_display */}
                                {col.source === 'taxonomy' && (
                                  <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={col.max_display ?? ''}
                                    placeholder="Max"
                                    onChange={(e) => handleUpdateColumn(view.id, idx, {
                                      max_display: e.target.value ? parseInt(e.target.value, 10) : undefined,
                                    })}
                                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 w-16"
                                    title="Max terms to display"
                                  />
                                )}

                                {/* Sortable toggle */}
                                {col.source === 'core' && (
                                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                    <input
                                      type="checkbox"
                                      checked={col.sortable ?? false}
                                      onChange={(e) => handleUpdateColumn(view.id, idx, { sortable: e.target.checked })}
                                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-3 h-3"
                                    />
                                    Sort
                                  </label>
                                )}

                                <div className="flex items-center gap-1 ml-auto">
                                  <button
                                    onClick={() => handleMoveColumn(view.id, idx, 'up')}
                                    disabled={idx === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30"
                                    title="Move up"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveColumn(view.id, idx, 'down')}
                                    disabled={idx === view.columns.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30"
                                    title="Move down"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveColumn(view.id, idx)}
                                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Remove column"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Add column dropdown */}
                            {unusedColumns.length > 0 && (
                              <div className="pt-1">
                                <select
                                  value=""
                                  onChange={(e) => {
                                    const col = availableColumns.find((c) => c.key === e.target.value);
                                    if (col) handleAddColumn(view.id, { ...col });
                                  }}
                                  className="w-full px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                >
                                  <option value="">+ Add column...</option>
                                  {unusedColumns.map((col) => (
                                    <option key={col.key} value={col.key}>
                                      {col.label} ({col.source})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add view button */}
            <button
              onClick={handleAddView}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add View
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
