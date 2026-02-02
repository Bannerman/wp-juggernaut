'use client';

import { useState, useEffect, useCallback } from 'react';
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
  ChevronDown
} from 'lucide-react';
import { ResourceTable } from '@/components/ResourceTable';
import { FilterPanel } from '@/components/FilterPanel';
import { EditModal } from '@/components/EditModal';
import { CreateModal } from '@/components/CreateModal';
import { cn, formatRelativeTime } from '@/lib/utils';

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

  const fetchData = useCallback(async () => {
    try {
      const [resourcesRes, termsRes, statsRes] = await Promise.all([
        fetch('/api/resources'),
        fetch('/api/terms'),
        fetch('/api/stats'),
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async (incremental: boolean = false) => {
    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incremental }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      setSuccess(
        `Synced ${result.resourcesUpdated} resources, ${result.taxonomiesUpdated} terms`
      );
      await fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSyncing(false);
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
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Push failed');
      }

      const successCount = result.results.filter((r: { success: boolean }) => r.success).length;
      const failCount = result.results.length - successCount;

      if (result.conflicts?.length > 0) {
        setError(`${result.conflicts.length} conflict(s) detected`);
      }

      setSuccess(
        `Pushed ${successCount} resources${failCount > 0 ? `, ${failCount} failed` : ''}`
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

      await fetchData();
      setEditingResource(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateResource = async (data: { title: string; status: string; taxonomies: Record<string, number[]>; meta_box: Record<string, unknown> }) => {
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/resources/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Create failed');
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-brand-600" />
              <h1 className="text-xl font-bold text-gray-900">PlexKits Resource Manager</h1>
            </div>

            <div className="flex items-center gap-4">
              {stats?.lastSync && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  <span>Last sync: {formatRelativeTime(stats.lastSync)}</span>
                </div>
              )}

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Resource
              </button>

              <button
                onClick={() => handleSync(true)}
                disabled={isSyncing}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>

              <button
                onClick={handlePush}
                disabled={isPushing || (stats?.dirtyResources === 0)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-brand-600 text-white hover:bg-brand-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Upload className={cn('w-4 h-4', isPushing && 'animate-pulse')} />
                {isPushing ? 'Pushing...' : `Push Changes${stats?.dirtyResources ? ` (${stats.dirtyResources})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Alerts */}
      {(error || success) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 text-red-700 mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
                ×
              </button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 text-green-700 mb-4">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-green-500 hover:text-green-700">
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Total:</span>
                <span className="font-medium text-gray-900">{stats.totalResources} resources</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Terms:</span>
                <span className="font-medium text-gray-900">{stats.totalTerms}</span>
              </div>
              {stats.dirtyResources > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                  <span className="font-medium text-yellow-700">{stats.dirtyResources} unsaved changes</span>
                </div>
              )}
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
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
              <span className="text-sm text-gray-700">Unsaved only</span>
            </label>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                showFilters
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
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
            />
          )}
        </div>

        {/* Resource Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No resources found</h3>
            <p className="text-gray-500 mb-4">
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
        ) : (
          <ResourceTable
            resources={filteredResources}
            terms={terms}
            selectedIds={selectedResources}
            onSelect={setSelectedResources}
            onEdit={setEditingResource}
            onUpdate={handleUpdateResource}
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
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateModal
          terms={terms}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateResource}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}
