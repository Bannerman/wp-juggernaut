'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ArrowRight, AlertTriangle, Check, Loader2, Settings, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
  is_primary?: boolean;
}

interface TaxonomyConfig {
  slug: string;
  name: string;
  rest_base: string;
  post_types?: string[];
  editable?: boolean;
}

interface Resource {
  id: number;
  title: string;
  slug: string;
  status: string;
  taxonomies: Record<string, number[]>;
  meta_box: Record<string, unknown>;
}

interface FieldMappingEntry {
  source: { key: string; category: 'core' | 'meta' | 'taxonomy' };
  target: { key: string; category: 'core' | 'meta' | 'taxonomy' };
}

interface MappableField {
  key: string;
  label: string;
  category: 'core' | 'meta' | 'taxonomy';
  type: string;
}

interface ConvertPostTypeModalProps {
  resource: Resource;
  currentPostType: PostTypeConfig;
  postTypes: PostTypeConfig[];
  taxonomyConfig: TaxonomyConfig[];
  onClose: () => void;
  onConvert: (result: { newPostId: number; warnings?: string[] }) => void;
}

/** Category badge component used in mapping rows */
function CategoryBadge({ category }: { category: string }): React.ReactElement {
  const styles = {
    core: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    meta: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    taxonomy: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium uppercase', styles[category as keyof typeof styles] || styles.meta)}>
      {category}
    </span>
  );
}

/** Truncated value with tooltip on hover */
function FieldValue({ value, fullValue }: { value: string; fullValue?: string }): React.ReactElement {
  if (!value) {
    return <span className="text-xs text-gray-400 dark:text-gray-500 italic">(empty)</span>;
  }
  return (
    <span
      className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px] inline-block align-bottom"
      title={fullValue || value}
    >
      {value}
    </span>
  );
}

export function ConvertPostTypeModal({
  resource,
  currentPostType,
  postTypes,
  taxonomyConfig,
  onClose,
  onConvert,
}: ConvertPostTypeModalProps): React.ReactElement {
  const availableTargets = postTypes.filter(pt => pt.slug !== currentPostType.slug);

  const [targetPostType, setTargetPostType] = useState<PostTypeConfig | null>(
    availableTargets.length === 1 ? availableTargets[0] : null
  );
  const [savedMappings, setSavedMappings] = useState<FieldMappingEntry[]>([]);
  const [sourceFields, setSourceFields] = useState<MappableField[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [createRedirect, setCreateRedirect] = useState(true);
  const [trashOldPost, setTrashOldPost] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field preview values for this specific post
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fullValues, setFullValues] = useState<Record<string, string>>({});
  const [loadingValues, setLoadingValues] = useState(true);
  const [showUnmapped, setShowUnmapped] = useState(false);

  // Fetch field values for this post on mount
  useEffect(() => {
    setLoadingValues(true);
    fetch(`/api/field-mappings/preview?postId=${resource.id}`)
      .then(res => res.json())
      .then(data => {
        setFieldValues(data.values || {});
        setFullValues(data.fullValues || {});
      })
      .catch(() => {
        setFieldValues({});
        setFullValues({});
      })
      .finally(() => setLoadingValues(false));
  }, [resource.id]);

  // Load saved mappings + source fields when target post type changes
  useEffect(() => {
    if (!targetPostType) {
      setSavedMappings([]);
      setSourceFields([]);
      return;
    }

    setLoadingMappings(true);
    fetch(`/api/field-mappings?source=${currentPostType.slug}&target=${targetPostType.slug}`)
      .then(res => res.json())
      .then(data => {
        setSavedMappings(data.mappings || []);
        setSourceFields(data.sourceFields || []);
      })
      .catch(() => {
        setSavedMappings([]);
        setSourceFields([]);
      })
      .finally(() => setLoadingMappings(false));
  }, [targetPostType, currentPostType.slug]);

  // Separate mappings by category for display
  const coreMappings = savedMappings.filter(
    m => m.source.category === 'core' || m.target.category === 'core'
  );
  const metaMappings = savedMappings.filter(
    m => m.source.category === 'meta' && m.target.category === 'meta'
  );
  const taxonomyMappings = savedMappings.filter(
    m => m.source.category === 'taxonomy' || m.target.category === 'taxonomy'
  );

  // Compute unmapped fields that have data
  const mappedSourceKeys = new Set(savedMappings.map(m => m.source.key));
  const unmappedFieldsWithData = Object.entries(fieldValues)
    .filter(([key, value]) => !mappedSourceKeys.has(key) && value && value !== '0')
    .map(([key, value]) => {
      const field = sourceFields.find(f => f.key === key);
      return {
        key,
        value,
        fullValue: fullValues[key],
        category: field?.category || 'meta',
        label: field?.label || key,
      };
    });

  // Build the fieldMapping and taxonomyMapping objects from saved mappings for the API
  function buildApiMappings(): {
    fieldMapping: Record<string, string>;
    taxonomyMapping: Record<string, string>;
  } {
    const fieldMapping: Record<string, string> = {};
    const taxonomyMapping: Record<string, string> = {};

    for (const m of savedMappings) {
      if (m.source.category === 'taxonomy' && m.target.category === 'taxonomy') {
        taxonomyMapping[m.target.key] = m.source.key;
      } else {
        fieldMapping[m.target.key] = m.source.key;
      }
    }

    return { fieldMapping, taxonomyMapping };
  }

  const handleConvert = async (): Promise<void> => {
    if (!targetPostType) return;

    setIsConverting(true);
    setError(null);

    try {
      const { fieldMapping, taxonomyMapping } = buildApiMappings();

      const res = await fetch('/api/resources/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: resource.id,
          targetPostType: targetPostType.slug,
          targetRestBase: targetPostType.rest_base,
          sourceRestBase: currentPostType.rest_base,
          fieldMapping,
          taxonomyMapping,
          createRedirect,
          trashOldPost,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Conversion failed');
      }

      const warnings = result.errors as string[] | undefined;
      onConvert({ newPostId: result.newPostId, warnings });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsConverting(false);
    }
  };

  /** Render a single mapping row with field value */
  function renderMappingRow(
    m: FieldMappingEntry,
    index: number,
    sourceBgClass: string,
    sourceTextClass: string
  ): React.ReactElement {
    const sourceValue = fieldValues[m.source.key] || '';
    const sourceFullValue = fullValues[m.source.key];
    return (
      <div key={index} className="flex items-center gap-2 text-sm py-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={cn('px-2 py-1 rounded text-xs font-medium whitespace-nowrap', sourceBgClass, sourceTextClass)}>
            {m.source.key}
          </span>
          <FieldValue value={sourceValue} fullValue={sourceFullValue} />
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className={cn('px-2 py-1 rounded text-xs font-medium whitespace-nowrap', sourceBgClass, sourceTextClass)}>
          {m.target.key}
        </span>
      </div>
    );
  }

  const isLoading = loadingMappings || loadingValues;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Convert Post Type</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Converting &ldquo;{resource.title}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Post Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Convert from {currentPostType.name} to:
            </label>
            <div className="flex gap-2">
              {availableTargets.map(pt => (
                <button
                  key={pt.slug}
                  onClick={() => setTargetPostType(pt)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                    targetPostType?.slug === pt.slug
                      ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-400'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  )}
                >
                  {pt.name}
                </button>
              ))}
            </div>
          </div>

          {targetPostType && (
            <>
              {/* Field Mappings with Values */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Field Mappings
                    {!isLoading && savedMappings.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        ({savedMappings.length} mapped)
                      </span>
                    )}
                  </h3>
                  <Link
                    href="/settings/field-mappings"
                    className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Mappings
                  </Link>
                </div>

                {isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading field data...
                  </div>
                ) : savedMappings.length === 0 ? (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 text-center">
                    No field mappings configured.{' '}
                    <Link
                      href="/settings/field-mappings"
                      className="text-brand-600 hover:text-brand-700 underline"
                    >
                      Set up field mappings
                    </Link>{' '}
                    to control how fields are mapped during conversion.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Core field mappings */}
                    {coreMappings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Core Fields</p>
                        <div className="space-y-0.5">
                          {coreMappings.map((m, i) => renderMappingRow(
                            m, i,
                            'bg-blue-50 dark:bg-blue-900/30',
                            'text-blue-700 dark:text-blue-400'
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta field mappings */}
                    {metaMappings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Meta Fields</p>
                        <div className="space-y-0.5">
                          {metaMappings.map((m, i) => renderMappingRow(
                            m, i,
                            'bg-purple-50 dark:bg-purple-900/30',
                            'text-purple-700 dark:text-purple-400'
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Taxonomy mappings */}
                    {taxonomyMappings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Taxonomies</p>
                        <div className="space-y-0.5">
                          {taxonomyMappings.map((m, i) => {
                            const sourceTax = taxonomyConfig.find(t => t.slug === m.source.key);
                            const targetTax = taxonomyConfig.find(t => t.slug === m.target.key);
                            const sourceValue = fieldValues[m.source.key] || '';
                            const sourceFullValue = fullValues[m.source.key];
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm py-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium whitespace-nowrap">
                                    {sourceTax?.name || m.source.key}
                                  </span>
                                  <FieldValue value={sourceValue} fullValue={sourceFullValue} />
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium whitespace-nowrap">
                                  {targetTax?.name || m.target.key}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Unmapped Fields with Data */}
              {!isLoading && unmappedFieldsWithData.length > 0 && (
                <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowUnmapped(!showUnmapped)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Unmapped Fields with Data ({unmappedFieldsWithData.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Data will not be carried over
                      </span>
                      <ChevronDown className={cn(
                        'w-4 h-4 text-amber-600 dark:text-amber-400 transition-transform',
                        showUnmapped && 'rotate-180'
                      )} />
                    </div>
                  </button>

                  {showUnmapped && (
                    <div className="px-4 py-3 space-y-1.5 bg-white dark:bg-gray-800">
                      {unmappedFieldsWithData.map((field) => (
                        <div key={field.key} className="flex items-center gap-2 text-sm py-0.5">
                          <CategoryBadge category={field.category} />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono">
                            {field.key}
                          </span>
                          <span className="text-gray-300 dark:text-gray-600">=</span>
                          <FieldValue value={field.value} fullValue={field.fullValue} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Options</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createRedirect}
                    onChange={e => setCreateRedirect(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Create 301 redirect</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Redirects the old URL to the new post (via SEOPress)
                    </p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trashOldPost}
                    onChange={e => setTrashOldPost(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Trash old {currentPostType.name.toLowerCase()}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Moves the original post to trash on WordPress
                    </p>
                  </div>
                </label>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-300">
                  This will create a new <strong>{targetPostType.name.toLowerCase()}</strong> on
                  WordPress with the mapped fields.
                  {trashOldPost && ' The original post will be moved to trash.'}
                  {createRedirect && ' A 301 redirect will be created.'}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={!targetPostType || isConverting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors',
              'bg-brand-600 hover:bg-brand-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Convert to {targetPostType?.name || '...'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
