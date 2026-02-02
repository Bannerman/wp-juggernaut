'use client';

import { useState } from 'react';
import { Edit2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { cn, formatRelativeTime, STATUS_COLORS, TAXONOMY_LABELS, truncate } from '@/lib/utils';

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

interface ResourceTableProps {
  resources: Resource[];
  terms: Record<string, Term[]>;
  selectedIds: number[];
  onSelect: (ids: number[]) => void;
  onEdit: (resource: Resource) => void;
  onUpdate: (id: number, updates: Partial<Resource>) => void;
}

type SortField = 'title' | 'status' | 'modified_gmt';
type SortDirection = 'asc' | 'desc';

export function ResourceTable({
  resources,
  terms,
  selectedIds,
  onSelect,
  onEdit,
  onUpdate,
}: ResourceTableProps) {
  const [sortField, setSortField] = useState<SortField>('modified_gmt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
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
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const allSelected = resources.length > 0 && selectedIds.length === resources.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelect([]);
    } else {
      onSelect(resources.map((r) => r.id));
    }
  };

  const handleSelectOne = (id: number) => {
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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
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
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('title')}
              >
                <div className="flex items-center gap-1">
                  Title
                  <SortIcon field="title" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Topics
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('modified_gmt')}
              >
                <div className="flex items-center gap-1">
                  Modified
                  <SortIcon field="modified_gmt" />
                </div>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedResources.map((resource) => (
              <tr
                key={resource.id}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  resource.is_dirty && 'bg-yellow-50',
                  selectedIds.includes(resource.id) && 'bg-brand-50'
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
                    <span className="font-medium text-gray-900 truncate max-w-xs" title={resource.title}>
                      {truncate(resource.title, 50)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
                      STATUS_COLORS[resource.status] || 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {resource.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {getTermNames('resource-type', resource.taxonomies['resource-type'] || []).map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {getTermNames('topic', resource.taxonomies['topic'] || [])
                      .slice(0, 3)
                      .map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                        >
                          {name}
                        </span>
                      ))}
                    {(resource.taxonomies['topic']?.length || 0) > 3 && (
                      <p className="text-sm text-gray-500">No resources found. Sync from PLEXKITS to get started.</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatRelativeTime(resource.modified_gmt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(resource)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <a
                      href={`https://plexkits.com/resource/${resource.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      title="View on site"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Table Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
        {selectedIds.length > 0 ? (
          <span>{selectedIds.length} selected</span>
        ) : (
          <span>{resources.length} resources</span>
        )}
      </div>
    </div>
  );
}
