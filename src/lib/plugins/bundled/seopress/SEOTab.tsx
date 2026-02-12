'use client';

import { Search, Globe, Share2, AlertTriangle, Loader2 } from 'lucide-react';
import { registerPluginTab } from '@/components/fields';
import type { PluginTabProps } from '@/components/fields';

/**
 * SEO data structure used by the SEO tab.
 * Matches the SEOData interface in EditModal.
 */
interface SEOData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: {
    title: string;
    description: string;
    image: string;
  };
  twitter: {
    title: string;
    description: string;
    image: string;
  };
  robots: {
    noindex: boolean;
    nofollow: boolean;
    nosnippet: boolean;
    noimageindex: boolean;
  };
}

/**
 * Context shape expected by the SEO tab.
 * EditModal passes this via `context` on PluginTabProps.
 */
export interface SEOTabContext {
  seoData: SEOData;
  seoLoading: boolean;
  seoError: string | null;
  seoHasChanges: boolean;
  seoTitleManuallyEdited: boolean;
  handleSeoTitleChange: (title: string) => void;
  updateSeoField: (field: keyof SEOData, value: unknown) => void;
  updateSeoNestedField: (parent: 'og' | 'twitter' | 'robots', field: string, value: unknown) => void;
}

/**
 * SEOPress SEO Tab Component
 *
 * Renders the SEO editing interface (title, description, social, robots).
 * Registered as a plugin tab via `registerPluginTab('seo', SEOTab)`.
 * Receives SEO state from EditModal through `context` prop.
 */
export function SEOTab({ isCreateMode, context }: PluginTabProps) {
  const ctx = context as unknown as SEOTabContext | undefined;

  if (!ctx) {
    return (
      <div className="p-4 text-sm text-gray-500">
        SEO context not available.
      </div>
    );
  }

  const {
    seoData,
    seoLoading,
    seoError,
    seoHasChanges,
    seoTitleManuallyEdited,
    handleSeoTitleChange,
    updateSeoField,
    updateSeoNestedField,
  } = ctx;

  return (
    <div className="space-y-6">
      {isCreateMode && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            SEO settings will be saved automatically after the resource is created.
          </p>
        </div>
      )}
      {!isCreateMode && seoLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500 dark:text-gray-400">Loading SEO data...</span>
        </div>
      ) : !isCreateMode && seoError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{seoError}</p>
        </div>
      ) : (
        <>
          {/* Basic SEO */}
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Search className="w-4 h-4" />
              Search Engine Optimization
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                SEO Title
                <span className="text-gray-400 font-normal ml-2">
                  {seoData.title.length}/60
                </span>
                {isCreateMode && !seoTitleManuallyEdited && <span className="text-green-600 font-normal ml-2">(auto-synced from title)</span>}
                {isCreateMode && seoTitleManuallyEdited && <span className="text-gray-400 font-normal ml-2">(manually edited)</span>}
              </label>
              <input
                type="text"
                value={seoData.title}
                onChange={(e) => handleSeoTitleChange(e.target.value)}
                placeholder="Custom title for search engines..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Meta Description
                <span className="text-gray-400 font-normal ml-2">
                  {seoData.description.length}/160
                </span>
              </label>
              <textarea
                value={seoData.description}
                onChange={(e) => updateSeoField('description', e.target.value)}
                placeholder="Brief description for search results..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Keywords
              </label>
              <input
                type="text"
                value={seoData.targetKeywords}
                onChange={(e) => updateSeoField('targetKeywords', e.target.value)}
                placeholder="keyword1, keyword2, keyword3..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Comma-separated list of target keywords</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Canonical URL
              </label>
              <input
                type="url"
                value={seoData.canonical}
                onChange={(e) => updateSeoField('canonical', e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty to use default URL</p>
            </div>
          </div>

          {/* Social Media */}
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Share2 className="w-4 h-4" />
              Social Media
            </div>

            {/* Facebook/OG */}
            <div className="border-l-4 border-blue-500 pl-4 space-y-3">
              <h4 className="text-sm font-medium text-blue-700">Facebook / Open Graph</h4>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={seoData.og.title}
                  onChange={(e) => updateSeoNestedField('og', 'title', e.target.value)}
                  placeholder="Facebook share title..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={seoData.og.description}
                  onChange={(e) => updateSeoNestedField('og', 'description', e.target.value)}
                  placeholder="Facebook share description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Image URL</label>
                <input
                  type="url"
                  value={seoData.og.image}
                  onChange={(e) => updateSeoNestedField('og', 'image', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                />
              </div>
            </div>

            {/* Twitter */}
            <div className="border-l-4 border-sky-500 pl-4 space-y-3">
              <h4 className="text-sm font-medium text-sky-700">Twitter / X</h4>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={seoData.twitter.title}
                  onChange={(e) => updateSeoNestedField('twitter', 'title', e.target.value)}
                  placeholder="Twitter share title..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={seoData.twitter.description}
                  onChange={(e) => updateSeoNestedField('twitter', 'description', e.target.value)}
                  placeholder="Twitter share description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Image URL</label>
                <input
                  type="url"
                  value={seoData.twitter.image}
                  onChange={(e) => updateSeoNestedField('twitter', 'image', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Robots / Indexing */}
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Globe className="w-4 h-4" />
              Indexing & Robots
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seoData.robots.noindex}
                  onChange={(e) => updateSeoNestedField('robots', 'noindex', e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">No Index</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seoData.robots.nofollow}
                  onChange={(e) => updateSeoNestedField('robots', 'nofollow', e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">No Follow</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seoData.robots.nosnippet}
                  onChange={(e) => updateSeoNestedField('robots', 'nosnippet', e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">No Snippet</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seoData.robots.noimageindex}
                  onChange={(e) => updateSeoNestedField('robots', 'noimageindex', e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">No Image Index</span>
              </label>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Check these options to prevent search engines from indexing or following links on this page.
            </p>
          </div>

          {seoHasChanges && !isCreateMode && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                SEO changes will be saved when you click Save Changes
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Self-register as a plugin tab so EditModal renders this component
// when the 'seo' tab is active and the SEOPress plugin is enabled.
registerPluginTab('seo', SEOTab);
