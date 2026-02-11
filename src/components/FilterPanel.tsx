'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

interface TaxonomyConfig {
  slug: string;
  name: string;
  rest_base: string;
  hierarchical?: boolean;
  show_in_filter?: boolean;
  filter_position?: number;
}

interface FilterPanelProps {
  terms: Record<string, Term[]>;
  filters: Record<string, number[]>;
  onChange: (filters: Record<string, number[]>) => void;
  taxonomyConfig?: TaxonomyConfig[];
  taxonomyLabels?: Record<string, string>;
}

export function FilterPanel({ terms, filters, onChange, taxonomyConfig, taxonomyLabels = {} }: FilterPanelProps) {
  // Get filterable taxonomies from profile config, sorted by filter_position
  const filterableTaxonomies = (taxonomyConfig || [])
    .filter(t => t.show_in_filter)
    .sort((a, b) => (a.filter_position || 99) - (b.filter_position || 99))
    .map(t => t.slug);
  const [expandedTaxonomy, setExpandedTaxonomy] = useState<string | null>(null);

  const toggleTaxonomy = (taxonomy: string) => {
    setExpandedTaxonomy(expandedTaxonomy === taxonomy ? null : taxonomy);
  };

  const toggleTerm = (taxonomy: string, termId: number) => {
    const currentFilters = filters[taxonomy] || [];
    const newFilters = currentFilters.includes(termId)
      ? currentFilters.filter((id) => id !== termId)
      : [...currentFilters, termId];
    
    onChange({
      ...filters,
      [taxonomy]: newFilters,
    });
  };

  const clearTaxonomyFilter = (taxonomy: string) => {
    onChange({
      ...filters,
      [taxonomy]: [],
    });
  };

  const clearAllFilters = () => {
    onChange({});
  };

  const hasActiveFilters = Object.values(filters).some((arr) => arr.length > 0);

  const getSelectedTermNames = (taxonomy: string): string[] => {
    const selectedIds = filters[taxonomy] || [];
    const taxonomyTerms = terms[taxonomy] || [];
    return selectedIds
      .map((id) => taxonomyTerms.find((t) => t.id === id)?.name)
      .filter((name): name is string => !!name);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Taxonomy</h3>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filterableTaxonomies.map((taxonomy) => {
          const taxonomyTerms = terms[taxonomy] || [];
          const selectedCount = (filters[taxonomy] || []).length;
          const isExpanded = expandedTaxonomy === taxonomy;
          const taxConfig = taxonomyConfig?.find(t => t.slug === taxonomy);
          const isHierarchical = taxConfig?.hierarchical ?? (taxonomy === 'topic');

          if (taxonomyTerms.length === 0) return null;

          return (
            <div key={taxonomy} className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleTaxonomy(taxonomy)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {taxonomyLabels[taxonomy] || taxConfig?.name || taxonomy}
                  </span>
                  {selectedCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-brand-100 text-brand-700">
                      {selectedCount}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-gray-400 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>

              {isExpanded && (
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  {/* Selected terms */}
                  {selectedCount > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                      {getSelectedTermNames(taxonomy).map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-brand-100 text-brand-700"
                        >
                          {name}
                          <button
                            onClick={() => {
                              const term = taxonomyTerms.find((t) => t.name === name);
                              if (term) toggleTerm(taxonomy, term.id);
                            }}
                            className="hover:text-brand-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => clearTaxonomyFilter(taxonomy)}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-1"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {/* Term list */}
                  <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1">
                    {taxonomyTerms
                      .filter((term) => term.parent_id === 0 || !isHierarchical)
                      .map((term) => {
                        const isSelected = (filters[taxonomy] || []).includes(term.id);
                        const children = isHierarchical
                          ? taxonomyTerms.filter((t) => t.parent_id === term.id)
                          : [];

                        return (
                          <div key={term.id}>
                            <label
                              className={cn(
                                'flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
                                isSelected && 'bg-brand-50 dark:bg-brand-900/30'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTerm(taxonomy, term.id)}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{term.name}</span>
                            </label>

                            {/* Child terms for hierarchical taxonomies */}
                            {children.length > 0 && (
                              <div className="ml-6 space-y-1">
                                {children.map((child) => {
                                  const isChildSelected = (filters[taxonomy] || []).includes(child.id);
                                  return (
                                    <label
                                      key={child.id}
                                      className={cn(
                                        'flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
                                        isChildSelected && 'bg-brand-50 dark:bg-brand-900/30'
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChildSelected}
                                        onChange={() => toggleTerm(taxonomy, child.id)}
                                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                      />
                                      <span className="text-sm text-gray-600 dark:text-gray-400">{child.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
