'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Upload,
  Download,
  Search,
  Filter,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Plus,
  ChevronDown,
  Settings
} from 'lucide-react';
import { ResourceTable } from '@/components/ResourceTable';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FilterPanel } from '@/components/FilterPanel';
import { EditModal } from '@/components/EditModal';
import { UpdateNotifier } from '@/components/UpdateNotifier';
import { PostTypeSwitcher } from '@/components/PostTypeSwitcher';
import { ConvertPostTypeModal } from '@/components/ConvertPostTypeModal';
import { EnvironmentIndicator } from '@/components/EnvironmentIndicator';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/plugins/types';
import type { EnvironmentType } from '@/lib/site-config';

interface SyncStats {
  totalResources: number;
  dirtyResources: number;
  lastSync: string | null;
  totalTerms: number;
}

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

interface Resource {
  id: number;
  title: string;
  slug: string;
  status: string;
  date_gmt: string;
  modified_gmt: string;
  is_dirty: boolean;
  taxonomies: Record<string, number[]>;
  meta_box: Record<string, unknown>;
}

export default function Home() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [terms, setTerms] = useState<Record<string, Term[]>>({});
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showDirtyOnly, setShowDirtyOnly] = useState(false);
  const [taxonomyFilters, setTaxonomyFilters] = useState<Record<string, number[]>>({});
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedResources, setSelectedResources] = useState<number[]>([]);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showSyncDropdown, setShowSyncDropdown] = useState(false);
  const [convertingResource, setConvertingResource] = useState<Resource | null>(null);
  
  const [viewMode, setViewMode] = useState<'general' | 'power'>('general');

  // Plugin-enabled features and profile config
  const [enabledTabs, setEnabledTabs] = useState<string[]>(['basic', 'classification']);
  const [fieldLayout, setFieldLayout] = useState<Record<string, FieldDefinition[]> | undefined>(undefined);
  const [tabConfig, setTabConfig] = useState<Array<{ id: string; label: string; source: string; icon?: string; position?: number; dynamic?: boolean }>>([]);
  const [taxonomyConfig, setTaxonomyConfig] = useState<Array<{
    slug: string;
    name: string;
    rest_base: string;
    post_types?: string[];
    hierarchical?: boolean;
    show_in_filter?: boolean;
    filter_position?: number;
    show_in_table?: boolean;
    table_position?: number;
    table_max_display?: number;
    editable?: boolean;
    conditional?: { show_when?: { taxonomy: string; has_term_id: number } };
  }>>([]);
  const [taxonomyLabels, setTaxonomyLabels] = useState<Record<string, string>>({});
  const [siteUrl, setSiteUrl] = useState<string>('');
  const [postTypeSlug, setPostTypeSlug] = useState<string>('resource');
  const [postTypeLabel, setPostTypeLabel] = useState<string>('Resource');
  const [postTypeRestBase, setPostTypeRestBase] = useState<string>('resource');
  const [postTypes, setPostTypes] = useState<Array<{ slug: string; name: string; rest_base: string; icon?: string; is_primary?: boolean }>>([]);
  const [allTaxonomyConfig, setAllTaxonomyConfig] = useState<typeof taxonomyConfig>([]);
  const [editableTaxonomies, setEditableTaxonomies] = useState<string[]>([]);
  const [powerColumns, setPowerColumns] = useState<Array<{ key: string; label: string; type: 'download_stats' | 'count' | 'text' }>>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [activeEnvironment, setActiveEnvironment] = useState<EnvironmentType>('development');
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);

  // Fetch profile config (includes enabled plugins and taxonomy config)
  useEffect(() => {
    fetch('/api/profile')
      .then(res => res.json())
      .then(data => {
        if (data.enabledTabs) {
          setEnabledTabs(data.enabledTabs);
        }
        if (data.ui?.field_layout) {
          setFieldLayout(data.ui.field_layout);
        }
        if (data.ui?.tabs) {
          setTabConfig(data.ui.tabs);
        }
        if (data.taxonomies) {
          setAllTaxonomyConfig(data.taxonomies);
          // Filter taxonomies for the active post type
          const primarySlug = data.postType?.slug || 'resource';
          const filtered = data.taxonomies.filter(
            (t: { post_types?: string[] }) => !t.post_types || t.post_types.includes(primarySlug)
          );
          setTaxonomyConfig(filtered);
          // Extract editable taxonomies from filtered config
          const editable = filtered
            .filter((t: { editable?: boolean }) => t.editable)
            .map((t: { slug: string }) => t.slug);
          setEditableTaxonomies(editable);
          // Build labels for filtered taxonomies
          const labels: Record<string, string> = {};
          for (const t of filtered) {
            labels[t.slug] = t.name;
          }
          setTaxonomyLabels(labels);
        }
        if (data.siteUrl) {
          setSiteUrl(data.siteUrl);
        }
        if (data.postTypes) {
          setPostTypes(data.postTypes);
        }
        if (data.postType) {
          setPostTypeSlug(data.postType.slug || 'resource');
          setPostTypeLabel(data.postType.name || 'Resource');
          setPostTypeRestBase(data.postType.rest_base || 'resource');
        }
        if (data.enabledPlugins) {
          setEnabledPlugins(data.enabledPlugins);
        }
        if (data.ui?.power_columns) {
          setPowerColumns(data.ui.power_columns);
        }
      })
      .catch(err => console.error('Failed to fetch profile:', err));
  }, []);

  // Fetch workspace name and environment from site config
  useEffect(() => {
    fetch('/api/site-config')
      .then(res => res.json())
      .then(data => {
        if (data.profileName) setWorkspaceName(data.profileName);
        if (data.activeTarget?.environment) setActiveEnvironment(data.activeTarget.environment);
      })
      .catch(err => console.error('Failed to fetch site config:', err));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const params = postTypeSlug ? `?postType=${postTypeSlug}` : '';
      const [resourcesRes, termsRes, statsRes] = await Promise.all([
        fetch(`/api/resources${params}`),
        fetch('/api/terms'),
        fetch(`/api/stats${params}`),
      ]);

      if (!resourcesRes.ok || !termsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [resourcesData, termsData, statsData] = await Promise.all([
        resourcesRes.json(),
        termsRes.json(),
        statsRes.json(),
      ]);

      setResources(resourcesData);
      setTerms(termsData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [postTypeSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close sync dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.sync-dropdown')) {
        setShowSyncDropdown(false);
      }
    };

    if (showSyncDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSyncDropdown]);

  // Auto-dismiss toast notifications after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleSync = async (incremental: boolean = false) => {
    setIsSyncing(true);
    setSyncProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incremental, stream: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Sync failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: { resourcesUpdated?: number; taxonomiesUpdated?: number; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              setSyncProgress(data.progress);
            } else if (currentEvent === 'complete') {
              finalResult = data;
              setSyncProgress(1);
            } else if (currentEvent === 'error') {
              throw new Error(data.error || 'Sync failed');
            }
          }
        }
      }

      if (finalResult) {
        setSuccess(
          `Synced ${finalResult.resourcesUpdated} resources, ${finalResult.taxonomiesUpdated} terms`
        );
      }
      await fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  const handlePush = async () => {
    if (stats?.dirtyResources === 0) {
      setError('No changes to push');
      return;
    }

    setIsPushing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType: postTypeSlug }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Push failed');
      }

      const successCount = result.results.filter((r: { success: boolean }) => r.success).length;
      const failedResults = result.results.filter((r: { success: boolean }) => !r.success);

      if (failedResults.length > 0) {
        const errors = failedResults.map((r: { resourceId: number; error?: string }) =>
          `Resource ${r.resourceId}: ${r.error || 'unknown error'}`
        );
        setError(errors.join('; '));
      } else if (result.conflicts?.length > 0) {
        setError(`${result.conflicts.length} conflict(s) detected (pushed anyway)`);
      }

      setSuccess(
        `Pushed ${successCount} resources${failedResults.length > 0 ? `, ${failedResults.length} failed` : ''}`
      );
      await fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPushing(false);
    }
  };

  const handleUpdateResource = async (id: number, updates: Partial<Resource>) => {
    try {
      const res = await fetch(`/api/resources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Update failed');
      }

      const updated = await res.json();
      await fetchData();
      
      // Update editingResource with the fresh data so hasChanges recalculates correctly
      if (editingResource && editingResource.id === id) {
        setEditingResource(updated);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateResource = async (data: {
    title: string;
    slug?: string;
    status: string;
    taxonomies: Record<string, number[]>;
    meta_box: Record<string, unknown>;
    seoData?: {
      title: string;
      description: string;
      canonical: string;
      targetKeywords: string;
      og: { title: string; description: string; image: string };
      twitter: { title: string; description: string; image: string };
      robots: { noindex: boolean; nofollow: boolean; nosnippet: boolean; noimageindex: boolean };
    };
  }) => {
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/resources/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, postType: postTypeRestBase }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Create failed');
      }

      const createdResource = await res.json();

      // Save SEO data if provided (after resource is created)
      if (data.seoData && createdResource.id) {
        try {
          await fetch(`/api/seo/${createdResource.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.seoData),
          });
        } catch (seoErr) {
          console.error('Failed to save SEO data:', seoErr);
          // Don't fail the whole operation, just log it
        }
      }

      setSuccess('Resource created successfully');
      setShowCreateModal(false);
      await fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handlePostTypeSwitch = useCallback((pt: { slug: string; name: string; rest_base: string }) => {
    if (pt.slug === postTypeSlug) return;

    setPostTypeSlug(pt.slug);
    setPostTypeLabel(pt.name);
    setPostTypeRestBase(pt.rest_base);
    setIsLoading(true);

    // Reset filters when switching post types
    setSearchQuery('');
    setStatusFilter('');
    setShowDirtyOnly(false);
    setTaxonomyFilters({});
    setSelectedResources([]);

    // Filter taxonomies for the new post type
    const filtered = allTaxonomyConfig.filter(
      (t) => !t.post_types || t.post_types.includes(pt.slug)
    );
    setTaxonomyConfig(filtered);
    const editable = filtered
      .filter((t) => t.editable)
      .map((t) => t.slug);
    setEditableTaxonomies(editable);
    const labels: Record<string, string> = {};
    for (const t of filtered) {
      labels[t.slug] = t.name;
    }
    setTaxonomyLabels(labels);
  }, [postTypeSlug, allTaxonomyConfig]);

  const filteredResources = resources.filter((resource) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!resource.title.toLowerCase().includes(query) && 
          !resource.slug.toLowerCase().includes(query)) {
        return false;
      }
    }

    if (statusFilter && resource.status !== statusFilter) {
      return false;
    }

    if (showDirtyOnly && !resource.is_dirty) {
      return false;
    }

    for (const [taxonomy, termIds] of Object.entries(taxonomyFilters)) {
      if (termIds.length > 0) {
        const resourceTerms = resource.taxonomies[taxonomy] || [];
        if (!termIds.some((id) => resourceTerms.includes(id))) {
          return false;
        }
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen">
      {/* Header - electron-drag allows window to be moved by dragging header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 electron-drag relative">
        {/* Sync progress bar — overlays the bottom border */}
        {isSyncing && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-200 dark:bg-gray-700 z-10">
            <div
              className="h-full bg-brand-500 transition-all duration-300 ease-out"
              style={{ width: `${Math.max(syncProgress * 100, 1)}%` }}
            />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pl-20">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icon.png" alt="Juggernaut" className="w-8 h-8" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Juggernaut</h1>
              <Link
                href="/settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors electron-no-drag"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <EnvironmentIndicator workspaceName={workspaceName} environment={activeEnvironment} />
            </div>

            <div className="flex items-center gap-4 electron-no-drag">
              <ThemeToggle />
              <UpdateNotifier />
              {stats?.lastSync && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>Last sync: {formatRelativeTime(stats.lastSync)}</span>
                </div>
              )}

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors min-w-[120px]"
              >
                <Plus className="w-4 h-4" />
                New {postTypeLabel}
              </button>

              <div className="relative flex items-center sync-dropdown">
                <button
                  onClick={() => handleSync(true)}
                  disabled={isSyncing}
                  className={cn(
                    'flex items-center justify-center gap-2 px-4 py-2 rounded-l-lg text-sm font-medium transition-colors min-w-[100px]',
                    'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                  Sync
                </button>
                <button
                  onClick={() => setShowSyncDropdown(!showSyncDropdown)}
                  disabled={isSyncing}
                  className={cn(
                    'flex items-center px-2 py-2 rounded-r-lg text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600',
                    'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                {showSyncDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <button
                      onClick={() => {
                        setShowSyncDropdown(false);
                        handleSync(false);
                      }}
                      disabled={isSyncing}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Force Full Sync
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handlePush}
                disabled={isPushing || (stats?.dirtyResources === 0)}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-w-[140px]',
                  'bg-brand-600 text-white hover:bg-brand-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Upload className={cn('w-4 h-4', isPushing && 'animate-pulse')} />
                {isPushing ? 'Pushing...' : `Push${stats?.dirtyResources ? ` (${stats.dirtyResources})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notifications */}
      {(error || success) && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 shadow-lg border border-red-200 dark:border-red-800 animate-in slide-in-from-right fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200">
                ×
              </button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 shadow-lg border border-green-200 dark:border-green-800 animate-in slide-in-from-right fade-in">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200">
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                {postTypes.length > 1 && (
                  <PostTypeSwitcher
                    postTypes={postTypes}
                    activePostType={postTypeSlug}
                    onSwitch={handlePostTypeSwitch}
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Total:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{stats.totalResources} {postTypeLabel.toLowerCase()}s</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Terms:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{stats.totalTerms}</span>
                </div>
                {stats.dirtyResources > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                    <span className="font-medium text-yellow-700 dark:text-yellow-400">{stats.dirtyResources} unsaved changes</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('general')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'general'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  General
                </button>
                <button
                  onClick={() => setViewMode('power')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'power'
                      ? 'bg-white dark:bg-gray-600 text-brand-700 dark:text-brand-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  Power
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={`Search ${postTypeLabel.toLowerCase()}s...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">All Statuses</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="private">Private</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDirtyOnly}
                onChange={(e) => setShowDirtyOnly(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Unsaved only</span>
            </label>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                showFilters
                  ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', showFilters && 'rotate-180')} />
            </button>
          </div>

          {showFilters && (
            <FilterPanel
              terms={terms}
              filters={taxonomyFilters}
              onChange={setTaxonomyFilters}
              taxonomyConfig={taxonomyConfig}
              taxonomyLabels={taxonomyLabels}
            />
          )}
        </div>

        {/* Resource Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : filteredResources.length === 0 ? (
          resources.length === 0 && !stats?.lastSync ? (
            /* First-launch welcome screen */
            <div className="text-center py-16 max-w-lg mx-auto">
              <Database className="w-16 h-16 text-brand-400 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Welcome to Juggernaut</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Get started by connecting to your WordPress site, then sync your content.
              </p>
              <div className="space-y-4 text-left bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-sm font-bold shrink-0">1</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Configure your WordPress credentials</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Set your site URL, username, and application password.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">2</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Run your first sync</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Pull posts, taxonomies, and media from WordPress.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">3</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Edit and push changes</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Bulk edit content locally, then push back to WordPress.</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-8">
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Open Settings
                </Link>
                <button
                  onClick={() => handleSync(false)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>
          ) : (
            /* Normal empty state (filters active or synced but empty) */
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No resources found</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {resources.length === 0
                  ? 'Sync with WordPress to load resources.'
                  : 'Try adjusting your filters.'}
              </p>
              {resources.length === 0 && (
                <button
                  onClick={() => handleSync(false)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
                >
                  <Download className="w-4 h-4" />
                  Full Sync
                </button>
              )}
            </div>
          )
        ) : (
          <ResourceTable
            resources={filteredResources}
            terms={terms}
            selectedIds={selectedResources}
            viewMode={viewMode}
            onSelect={setSelectedResources}
            onEdit={setEditingResource}
            onUpdate={handleUpdateResource}
            siteUrl={siteUrl}
            postTypeSlug={postTypeSlug}
            taxonomyColumns={
              taxonomyConfig
                .filter((t) => t.show_in_table)
                .sort((a, b) => (a.table_position ?? 99) - (b.table_position ?? 99))
                .map((t) => ({ slug: t.slug, label: t.name, maxDisplay: t.table_max_display }))
            }
            postTypeLabelPlural={`${postTypeLabel.toLowerCase()}s`}
            powerColumns={powerColumns}
          />
        )}
      </main>

      {/* Edit Modal */}
      {editingResource && (
        <EditModal
          resource={editingResource}
          terms={terms}
          onClose={() => setEditingResource(null)}
          onSave={(updates) => handleUpdateResource(editingResource.id, updates)}
          enabledTabs={enabledTabs}
          taxonomyConfig={taxonomyConfig}
          taxonomyLabels={taxonomyLabels}
          siteUrl={siteUrl}
          postTypeSlug={postTypeSlug}
          postTypeLabel={postTypeLabel}
          fieldLayout={fieldLayout}
          tabConfig={tabConfig}
          onConvertPostType={postTypes.length > 1 && enabledPlugins.includes('convert-post-type') ? () => {
            setConvertingResource(editingResource);
            setEditingResource(null);
          } : undefined}
        />
      )}

      {/* Create Modal (uses EditModal in create mode) */}
      {showCreateModal && (
        <EditModal
          resource={null}
          terms={terms}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {}}
          onCreate={handleCreateResource}
          isCreating={isCreating}
          enabledTabs={enabledTabs}
          taxonomyConfig={taxonomyConfig}
          taxonomyLabels={taxonomyLabels}
          siteUrl={siteUrl}
          postTypeSlug={postTypeSlug}
          postTypeLabel={postTypeLabel}
          fieldLayout={fieldLayout}
          tabConfig={tabConfig}
        />
      )}

      {/* Convert Post Type Modal */}
      {convertingResource && (
        <ConvertPostTypeModal
          resource={convertingResource}
          currentPostType={postTypes.find(pt => pt.slug === postTypeSlug) || { slug: postTypeSlug, name: postTypeLabel, rest_base: postTypeRestBase }}
          postTypes={postTypes}
          taxonomyConfig={allTaxonomyConfig}
          onClose={() => setConvertingResource(null)}
          onConvert={({ warnings }) => {
            setConvertingResource(null);
            if (warnings?.length) {
              setSuccess(`Post type converted (as draft). Warnings: ${warnings.join('; ')}`);
            } else {
              setSuccess('Post type converted as draft. Review and push when ready.');
            }
            fetchData();
          }}
        />
      )}
    </div>
  );
}
