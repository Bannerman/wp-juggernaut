'use client';

import { useState } from 'react';
import { X, ArrowRight, AlertTriangle, Check, Loader2 } from 'lucide-react';
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
  const [taxonomyMapping, setTaxonomyMapping] = useState<Record<string, string>>({});
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [createRedirect, setCreateRedirect] = useState(true);
  const [trashOldPost, setTrashOldPost] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get taxonomies for source and target
  const sourceTaxonomies = taxonomyConfig.filter(
    t => t.post_types?.includes(currentPostType.slug)
  );
  const targetTaxonomies = targetPostType
    ? taxonomyConfig.filter(t => t.post_types?.includes(targetPostType.slug))
    : [];

  // Get meta_box fields that have values
  const sourceMetaFields = Object.entries(resource.meta_box || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key]) => key);

  const handleConvert = async (): Promise<void> => {
    if (!targetPostType) return;

    setIsConverting(true);
    setError(null);

    try {
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
                  onClick={() => {
                    setTargetPostType(pt);
                    setTaxonomyMapping({});
                    setFieldMapping({});
                  }}
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
              {/* Taxonomy Mapping */}
              {sourceTaxonomies.length > 0 && targetTaxonomies.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Taxonomy Mapping</h3>
                  <div className="space-y-2">
                    {sourceTaxonomies
                      .filter(st => {
                        const termIds = resource.taxonomies?.[st.slug];
                        return termIds && termIds.length > 0;
                      })
                      .map(sourceTax => (
                        <div key={sourceTax.slug} className="flex items-center gap-3">
                          <div className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                            {sourceTax.name}
                            <span className="text-gray-400 ml-1">
                              ({resource.taxonomies[sourceTax.slug]?.length || 0} terms)
                            </span>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <select
                            value={taxonomyMapping[sourceTax.slug] || ''}
                            onChange={e => setTaxonomyMapping(prev => ({
                              ...prev,
                              // Store as targetTax: sourceTax for the API
                              ...(e.target.value
                                ? { [e.target.value]: sourceTax.slug }
                                : {}),
                            }))}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                          >
                            <option value="">Skip (don&apos;t map)</option>
                            {targetTaxonomies.map(tt => (
                              <option key={tt.slug} value={tt.slug}>{tt.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Meta Field Mapping */}
              {sourceMetaFields.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Field Mapping</h3>
                  <p className="text-xs text-gray-500 mb-2">
                    Map meta fields from the source to target. Leave blank to skip.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sourceMetaFields.map(field => (
                      <div key={field} className="flex items-center gap-3">
                        <div className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono truncate">
                          {field}
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={fieldMapping[field] || ''}
                          onChange={e => setFieldMapping(prev => ({
                            ...prev,
                            // Store as targetField: sourceField for the API
                            ...(e.target.value
                              ? { [e.target.value]: field }
                              : {}),
                          }))}
                          placeholder="Target field name"
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
