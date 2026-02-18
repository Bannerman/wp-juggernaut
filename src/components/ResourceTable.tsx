'use client';

import { useState } from 'react';
import { Edit2, ExternalLink, Eye, ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { cn, formatRelativeTime, STATUS_COLORS, truncate } from '@/lib/utils';

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

interface ViewColumn {
  key: string;
  label: string;
  source: 'core' | 'taxonomy' | 'meta';
  type?: 'text' | 'count' | 'download_stats';
  taxonomy_slug?: string;
  max_display?: number;
  sortable?: boolean;
}

interface ResourceTableProps {
  resources: Resource[];
  terms: Record<string, Term[]>;
  selectedIds: number[];
  columns: ViewColumn[];
  onSelect: (ids: number[]) => void;
  onEdit: (resource: Resource) => void;
  onUpdate: (id: number, updates: Partial<Resource>) => void;
  /** Site URL from profile (e.g., "https://example.com") */
  siteUrl?: string;
  /** Post type slug for URL building (e.g., "resource") */
  postTypeSlug?: string;
  /** Post type label for display (e.g., "resources") */
  postTypeLabelPlural?: string;
}

type SortField = 'title' | 'status' | 'modified_gmt' | 'date_gmt';
type SortDirection = 'asc' | 'desc';

const SORTABLE_CORE_KEYS = new Set<string>(['title', 'status', 'modified_gmt', 'date_gmt']);

function getDownloadStats(resource: Resource): { activeCount: number; archivedCount: number } {
  const sections = (resource.meta_box?.download_sections as Record<string, unknown>[]) || [];
  let activeCount = 0;
  let archivedCount = 0;

  for (const section of sections) {
    const linkCount = Array.isArray(section.download_links) ? section.download_links.length : 0;
    if (section.download_archive) {
      archivedCount += linkCount;
    } else {
      activeCount += linkCount;
    }
  }

  return { activeCount, archivedCount };
}

export function ResourceTable({
  resources,
  terms,
  selectedIds,
  columns,
  onSelect,
  onEdit,
  onUpdate,
  siteUrl = '',
  postTypeSlug = 'resource',
  postTypeLabelPlural = 'resources',
}: ResourceTableProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>('modified_gmt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedResources = [...resources].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'modified_gmt':
        comparison = new Date(a.modified_gmt).getTime() - new Date(b.modified_gmt).getTime();
        break;
      case 'date_gmt':
        comparison = new Date(a.date_gmt).getTime() - new Date(b.date_gmt).getTime();
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const allSelected = resources.length > 0 && selectedIds.length === resources.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = (): void => {
    if (allSelected) {
      onSelect([]);
    } else {
      onSelect(resources.map((r) => r.id));
    }
  };

  const handleSelectOne = (id: number): void => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((i) => i !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  const getTermNames = (taxonomy: string, termIds: number[]): string[] => {
    const taxonomyTerms = terms[taxonomy] || [];
    return termIds
      .map((id) => taxonomyTerms.find((t) => t.id === id)?.name)
      .filter((name): name is string => !!name);
  };

  const SortIcon = ({ field }: { field: SortField }): React.ReactElement | null => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  // Check if the "modified_gmt" column is already in the columns array
  // (to avoid rendering it twice — once as a view column and once as the implicit Modified column)
  const hasModifiedColumn = columns.some((c) => c.key === 'modified_gmt');

  const renderColumnHeader = (col: ViewColumn): React.ReactElement => {
    const isSortable = col.sortable && SORTABLE_CORE_KEYS.has(col.key);
    const field = col.key as SortField;

    if (isSortable) {
      return (
        <th
          key={col.key}
          scope="col"
          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          onClick={() => handleSort(field)}
          tabIndex={0}
          aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSort(field);
            }
          }}
        >
          <div className="flex items-center gap-1">
            {col.label}
            <SortIcon field={field} />
          </div>
        </th>
      );
    }

    return (
      <th key={col.key} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {col.label}
      </th>
    );
  };

  const renderCoreCell = (col: ViewColumn, resource: Resource): React.ReactElement => {
    switch (col.key) {
      case 'status':
        return (
          <td key={col.key} className="px-4 py-3">
            <span
              className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
                STATUS_COLORS[resource.status] || 'bg-gray-100 text-gray-800'
              )}
            >
              {resource.status}
            </span>
          </td>
        );
      case 'date_gmt':
        return (
          <td key={col.key} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
            {formatRelativeTime(resource.date_gmt)}
          </td>
        );
      case 'modified_gmt':
        return (
          <td key={col.key} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
            {formatRelativeTime(resource.modified_gmt)}
          </td>
        );
      default:
        return (
          <td key={col.key} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
            {String((resource as unknown as Record<string, unknown>)[col.key] ?? '')}
          </td>
        );
    }
  };

  const renderTaxonomyCell = (col: ViewColumn, resource: Resource): React.ReactElement => {
    const slug = col.taxonomy_slug || col.key;
    const names = getTermNames(slug, resource.taxonomies[slug] || []);
    const maxDisplay = col.max_display ?? names.length;
    const totalCount = resource.taxonomies[slug]?.length || 0;

    return (
      <td key={col.key} className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-xs">
          {names.slice(0, maxDisplay).map((name) => (
            <span
              key={name}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              {name}
            </span>
          ))}
          {totalCount > maxDisplay && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              +{totalCount - maxDisplay} more
            </span>
          )}
        </div>
      </td>
    );
  };

  const renderMetaCell = (col: ViewColumn, resource: Resource): React.ReactElement => {
    if (col.type === 'download_stats') {
      const ds = getDownloadStats(resource);
      return (
        <td key={col.key} className="px-4 py-3">
          <div className="flex flex-col text-xs">
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {ds.activeCount} Active
            </span>
            {ds.archivedCount > 0 && (
              <span className="text-gray-500">
                {ds.archivedCount} Archived
              </span>
            )}
          </div>
        </td>
      );
    }

    if (col.type === 'count') {
      return (
        <td key={col.key} className="px-4 py-3">
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {Array.isArray(resource.meta_box?.[col.key]) ? (resource.meta_box[col.key] as unknown[]).length : 0}
          </span>
        </td>
      );
    }

    // Default: text
    return (
      <td key={col.key} className="px-4 py-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
          {String(resource.meta_box?.[col.key] ?? '')}
        </span>
      </td>
    );
  };

  const renderCell = (col: ViewColumn, resource: Resource): React.ReactElement => {
    switch (col.source) {
      case 'core':
        return renderCoreCell(col, resource);
      case 'taxonomy':
        return renderTaxonomyCell(col, resource);
      case 'meta':
        return renderMetaCell(col, resource);
      default:
        return <td key={col.key} className="px-4 py-3" />;
    }
  };

  if (resources.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center text-center">
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-full mb-4">
          <Inbox className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No {postTypeLabelPlural} found
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Try adjusting your filters, searching for a different term, or sync new content from WordPress.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                onClick={() => handleSort('title')}
                tabIndex={0}
                aria-sort={sortField === 'title' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('title');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  Title
                  <SortIcon field="title" />
                </div>
              </th>

              {columns.map((col) => renderColumnHeader(col))}

              {/* Implicit Modified column (always shown unless already in columns) */}
              {!hasModifiedColumn && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  onClick={() => handleSort('modified_gmt')}
                  tabIndex={0}
                  aria-sort={sortField === 'modified_gmt' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSort('modified_gmt');
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    Modified
                    <SortIcon field="modified_gmt" />
                  </div>
                </th>
              )}

              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedResources.map((resource) => (
              <tr
                key={resource.id}
                className={cn(
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
                  resource.is_dirty && 'bg-yellow-50 dark:bg-yellow-900/20',
                  selectedIds.includes(resource.id) && 'bg-brand-50 dark:bg-brand-900/20'
                )}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(resource.id)}
                    onChange={() => handleSelectOne(resource.id)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {resource.is_dirty && (
                      <span className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" title="Unsaved changes" />
                    )}
                    <span
                      className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs cursor-pointer hover:text-brand-600 dark:hover:text-brand-400"
                      title={resource.title}
                      onClick={() => onEdit(resource)}
                    >
                      {truncate(resource.title, 50)}
                    </span>
                  </div>
                </td>

                {columns.map((col) => renderCell(col, resource))}

                {/* Implicit Modified column */}
                {!hasModifiedColumn && (
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatRelativeTime(resource.modified_gmt)}
                  </td>
                )}

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(resource)}
                      className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                      title="Edit"
                      aria-label={`Edit ${resource.title}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {siteUrl && (
                      <a
                        href={`${siteUrl}/wp-admin/post.php?post=${resource.id}&action=edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                        title="Edit in WordPress"
                        aria-label={`Edit ${resource.title} in WordPress`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {siteUrl && resource.slug && (
                      <a
                        href={`${siteUrl}/${postTypeSlug}/${resource.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                        title="View on site"
                        aria-label={`View ${resource.title} on site`}
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-sm text-gray-500 dark:text-gray-400">
        {selectedIds.length > 0 ? (
          <span>{selectedIds.length} selected</span>
        ) : (
          <span>{resources.length} {postTypeLabelPlural}</span>
        )}
      </div>
    </div>
  );
}
