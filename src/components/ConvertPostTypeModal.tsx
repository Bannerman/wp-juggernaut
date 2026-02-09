'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ArrowRight, AlertTriangle, Check, Loader2, Settings } from 'lucide-react';
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

interface ConvertPostTypeModalProps {
  resource: Resource;
  currentPostType: PostTypeConfig;
  postTypes: PostTypeConfig[];
  taxonomyConfig: TaxonomyConfig[];
  onClose: () => void;
  onConvert: (result: { newPostId: number }) => void;
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
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [createRedirect, setCreateRedirect] = useState(true);
  const [trashOldPost, setTrashOldPost] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved mappings when target post type changes
  useEffect(() => {
    if (!targetPostType) {
      setSavedMappings([]);
      return;
    }

    setLoadingMappings(true);
    fetch(`/api/field-mappings?source=${currentPostType.slug}&target=${targetPostType.slug}`)
      .then(res => res.json())
      .then(data => {
        setSavedMappings(data.mappings || []);
      })
      .catch(() => {
        setSavedMappings([]);
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
        // For field mappings (core-to-core, core-to-meta, meta-to-core, meta-to-meta)
        // The converter API expects { targetField: sourceField }
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

      onConvert({ newPostId: result.newPostId });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Convert Post Type</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Converting &ldquo;{resource.title}&rdquo;
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Post Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {pt.name}
                </button>
              ))}
            </div>
          </div>

          {targetPostType && (
            <>
              {/* Saved Field Mappings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Field Mappings</h3>
                  <Link
                    href="/settings/field-mappings"
                    className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Mappings
                  </Link>
                </div>

                {loadingMappings ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading saved mappings...
                  </div>
                ) : savedMappings.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500 text-center">
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
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Core Fields</p>
                        <div className="space-y-1">
                          {coreMappings.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium min-w-[100px]">
                                {m.source.key}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium min-w-[100px]">
                                {m.target.key}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta field mappings */}
                    {metaMappings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Meta Fields</p>
                        <div className="space-y-1">
                          {metaMappings.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium font-mono min-w-[100px]">
                                {m.source.key}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium font-mono min-w-[100px]">
                                {m.target.key}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Taxonomy mappings */}
                    {taxonomyMappings.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Taxonomies</p>
                        <div className="space-y-1">
                          {taxonomyMappings.map((m, i) => {
                            const sourceTax = taxonomyConfig.find(t => t.slug === m.source.key);
                            const targetTax = taxonomyConfig.find(t => t.slug === m.target.key);
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium min-w-[100px]">
                                  {sourceTax?.name || m.source.key}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium min-w-[100px]">
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

              {/* Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Options</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createRedirect}
                    onChange={e => setCreateRedirect(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700">Create 301 redirect</span>
                    <p className="text-xs text-gray-500">
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
                    <span className="text-sm text-gray-700">Trash old {currentPostType.name.toLowerCase()}</span>
                    <p className="text-xs text-gray-500">
                      Moves the original post to trash on WordPress
                    </p>
                  </div>
                </label>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  This will create a new <strong>{targetPostType.name.toLowerCase()}</strong> on
                  WordPress with the mapped fields.
                  {trashOldPost && ' The original post will be moved to trash.'}
                  {createRedirect && ' A 301 redirect will be created.'}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
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
