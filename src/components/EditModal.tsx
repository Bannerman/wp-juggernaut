'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Sparkles, Upload, Loader2, Repeat, ExternalLink, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createFilenameProcessor, seoDataProcessor, shortpixelProcessor, createValidationProcessor, ImageProcessingPipeline } from '@/lib/imageProcessing';
import { DynamicTab, getPluginTab } from '@/components/fields';
// Side-effect imports: register plugin tabs via registerPluginTab()
import '@/lib/plugins/bundled/seopress/SEOTab';
import '@/lib/plugins/bundled/ai-fill/AIFillTab';
import type { FieldDefinition } from '@/lib/plugins/types';

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

interface TaxonomyConfig {
  slug: string;
  name: string;
  rest_base: string;
  hierarchical?: boolean;
  show_in_filter?: boolean;
  filter_position?: number;
  conditional?: { show_when?: { taxonomy: string; has_term_id: number } };
}

interface EditModalProps {
  resource: Resource | null;
  terms: Record<string, Term[]>;
  onClose: () => void;
  onSave: (updates: Partial<Resource>) => void;
  onCreate?: (data: { title: string; slug?: string; status: string; taxonomies: Record<string, number[]>; meta_box: Record<string, unknown>; seoData?: SEOData }) => void;
  isCreating?: boolean;
  enabledTabs?: string[];
  taxonomyConfig?: TaxonomyConfig[];
  taxonomyLabels?: Record<string, string>;
  /** Site URL from profile (e.g., "https://example.com") */
  siteUrl?: string;
  /** Post type slug for URL building (e.g., "resource") */
  postTypeSlug?: string;
  /** Post type label for display (e.g., "Resource") */
  postTypeLabel?: string;
  /** Field layout from profile (maps tab ID to field definitions) */
  fieldLayout?: Record<string, FieldDefinition[]>;
  /** Tab configuration from profile */
  tabConfig?: Array<{ id: string; label: string; source: string; icon?: string; position?: number; dynamic?: boolean; post_types?: string[] }>;
  /** Callback to open post type conversion (only shown when multiple post types exist) */
  onConvertPostType?: () => void;
}

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

const DEFAULT_SEO: SEOData = {
  title: '',
  description: '',
  canonical: '',
  targetKeywords: '',
  og: { title: '', description: '', image: '' },
  twitter: { title: '', description: '', image: '' },
  robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
};

// Fallback tab list when no profile tabs are configured
const FALLBACK_TABS = [
  { id: 'basic', label: 'Basic', plugin: 'core' },
  { id: 'seo', label: 'SEO', plugin: 'seopress' },
  { id: 'classification', label: 'Classification', plugin: 'core' },
  { id: 'ai', label: 'AI Fill', icon: 'sparkles', plugin: 'ai-fill' },
];

// Core tabs that are always handled with hardcoded rendering
// Plugin tabs like 'seo' and 'ai' are rendered via registerPluginTab + getPluginTab.
const CORE_TAB_IDS = new Set(['basic', 'classification']);

// Tabs with hardcoded rendering in this file (core tabs only).
// Plugin tabs like 'seo' and 'ai' are rendered via registerPluginTab + getPluginTab.
const HARDCODED_TAB_IDS = new Set(['basic', 'classification']);

const STATUS_OPTIONS = ['publish', 'draft'];

export function EditModal({
  resource,
  terms,
  onClose,
  onSave,
  onCreate,
  isCreating = false,
  enabledTabs = [],
  taxonomyConfig = [],
  taxonomyLabels = {},
  siteUrl = '',
  postTypeSlug = 'resource',
  postTypeLabel = 'Resource',
  fieldLayout,
  tabConfig = [],
  onConvertPostType,
}: EditModalProps) {
  const isCreateMode = resource === null;

  // Rewrite media URLs to match the active site (e.g., production → local)
  const rewriteMediaUrl = (url: string | unknown): string => {
    if (typeof url !== 'string' || !url || !siteUrl) return (url as string) || '';
    try {
      const parsed = new URL(url);
      const active = new URL(siteUrl);
      if (parsed.hostname !== active.hostname) {
        parsed.protocol = active.protocol;
        parsed.hostname = active.hostname;
        parsed.port = active.port;
        return parsed.toString();
      }
    } catch { /* not a valid URL, return as-is */ }
    return url;
  };

  // Build tab list from profile config or fallback
  const TABS = (() => {
    if (tabConfig.length > 0) {
      // Profile-driven tabs: core tabs + plugin tabs + dynamic tabs
      return tabConfig
        .filter(tab => {
          // Core tabs always show
          if (CORE_TAB_IDS.has(tab.id)) return true;
          // Filter by post_types — skip if tab is scoped and doesn't include current post type
          if (tab.post_types && tab.post_types.length > 0 && !tab.post_types.includes(postTypeSlug)) return false;
          // Dynamic tabs (profile-configured) need a field_layout entry but don't need enabledTabs
          if (tab.dynamic) {
            return fieldLayout != null && fieldLayout[tab.id] != null;
          }
          // Plugin tabs (non-dynamic, non-core) need to be in enabledTabs
          return enabledTabs.includes(tab.id);
        })
        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
        .map(tab => ({ id: tab.id, label: tab.label, plugin: tab.source, icon: tab.icon }));
    }
    // Fallback: core tabs only
    return FALLBACK_TABS.filter(tab => {
      if (tab.plugin === 'core') return true;
      return enabledTabs.includes(tab.id);
    });
  })();

  // Default empty resource for create mode
  const defaultResource: Resource = {
    id: 0,
    title: '',
    slug: '',
    status: 'publish',
    modified_gmt: '',
    is_dirty: false,
    taxonomies: {},
    meta_box: {},
  };

  const effectiveResource = resource || defaultResource;

  const [activeTab, setActiveTab] = useState('basic');
  const [title, setTitle] = useState(effectiveResource.title);
  const [slug, setSlug] = useState(effectiveResource.slug);
  const [status, setStatus] = useState(effectiveResource.status);

  // Track whether slug and SEO title have been manually edited (breaks auto-population)
  // In edit mode, start as "manually edited" to preserve existing values
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!isCreateMode || effectiveResource.slug !== '');
  const [seoTitleManuallyEdited, setSeoTitleManuallyEdited] = useState(false);

  // Helper to generate slug from title
  const generateSlugFromTitle = (titleText: string): string => {
    return titleText
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/-+/g, '-')           // Replace multiple hyphens with single
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
  };

  // Handle title change with auto-population of connected fields
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);

    // Auto-populate slug if not manually edited
    if (!slugManuallyEdited) {
      setSlug(generateSlugFromTitle(newTitle));
    }

    // Auto-populate SEO title if not manually edited
    if (!seoTitleManuallyEdited) {
      setSeoData(prev => ({ ...prev, title: newTitle }));
    }
  };

  // Handle direct slug edit (breaks auto-population)
  const handleSlugChange = (newSlug: string) => {
    const sanitizedSlug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setSlug(sanitizedSlug);
    setSlugManuallyEdited(true);
  };

  // Handle direct SEO title edit (breaks auto-population)
  const handleSeoTitleChange = (newSeoTitle: string) => {
    setSeoData(prev => ({ ...prev, title: newSeoTitle }));
    setSeoTitleManuallyEdited(true);
  };
  const [taxonomies, setTaxonomies] = useState<Record<string, number[]>>(() =>
    JSON.parse(JSON.stringify(effectiveResource.taxonomies))
  );
  const [metaBox, setMetaBox] = useState<Record<string, unknown>>(() =>
    JSON.parse(JSON.stringify(effectiveResource.meta_box))
  );
  const [isSaving, setIsSaving] = useState(false);

  // Check if a taxonomy's conditional visibility is satisfied
  const isTaxonomyVisible = (taxSlug: string): boolean => {
    const taxConfig = taxonomyConfig.find(t => t.slug === taxSlug);
    if (!taxConfig?.conditional?.show_when) return true;

    const { taxonomy, has_term_id } = taxConfig.conditional.show_when;
    const selectedTerms = taxonomies[taxonomy] || [];
    return selectedTerms.includes(has_term_id);
  };

  // Get taxonomies sorted by filter_position for classification tab
  const classificationTaxonomies = taxonomyConfig
    .filter(t => t.show_in_filter !== false) // Show all taxonomies in classification, not just filter ones
    .sort((a, b) => (a.filter_position || 99) - (b.filter_position || 99));

  const resourceHasChanges = isCreateMode
    ? title.trim().length > 0  // For create mode, just need a title
    : title !== effectiveResource.title ||
      slug !== effectiveResource.slug ||
      status !== effectiveResource.status ||
      JSON.stringify(taxonomies) !== JSON.stringify(effectiveResource.taxonomies) ||
      JSON.stringify(metaBox) !== JSON.stringify(effectiveResource.meta_box);

  // SEO state
  const [seoData, setSeoData] = useState<SEOData>(DEFAULT_SEO);
  const [originalSeoData, setOriginalSeoData] = useState<SEOData>(DEFAULT_SEO);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [seoSaving, setSeoSaving] = useState(false);

  const seoHasChanges = JSON.stringify(seoData) !== JSON.stringify(originalSeoData);

  // Fetch SEO data when editing an existing resource
  useEffect(() => {
    if (isCreateMode || !effectiveResource.id) return;

    setSeoLoading(true);
    setSeoError(null);

    fetch(`/api/seo/${effectiveResource.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.seo) {
          const seo = data.seo as SEOData;
          // If SEO title was previously saved, mark as manually edited so
          // changing the post title won't overwrite the saved SEO title
          if (seo.title) {
            setSeoTitleManuallyEdited(true);
          } else {
            // Fallback: use post title when no SEO title has been set
            seo.title = effectiveResource.title;
          }
          setSeoData(seo);
          setOriginalSeoData(data.seo);
        }
      })
      .catch(err => {
        console.error('Failed to fetch SEO data:', err);
        setSeoError('Failed to load SEO data');
      })
      .finally(() => setSeoLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when resource ID changes, not on title edits
  }, [isCreateMode, effectiveResource.id]);

  // SEO is now saved locally with the resource, not directly to WordPress
  const saveSeoData = async () => {
    // This is now handled in handleSave by including seo in the resource update
    // Kept for backwards compatibility but should not be called directly
  };

  const updateSeoField = (field: keyof SEOData, value: unknown) => {
    setSeoData(prev => ({ ...prev, [field]: value }));
  };

  const updateSeoNestedField = (parent: 'og' | 'twitter' | 'robots', field: string, value: unknown) => {
    setSeoData(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (isCreateMode) {
      if (!title.trim() || !onCreate) return;
      setIsSaving(true);
      try {
        // Include SEO data if any fields were filled
        const hasSeoData = seoData.title || seoData.description || seoData.targetKeywords ||
                           seoData.og.title || seoData.og.description ||
                           seoData.twitter.title || seoData.twitter.description;

        await onCreate({
          title,
          slug: slug || undefined,
          status,
          taxonomies,
          meta_box: metaBox,
          seoData: hasSeoData ? seoData : undefined,
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!resourceHasChanges && !seoHasChanges) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Save resource changes (including SEO if changed)
      // SEO is now saved locally with the resource, then pushed to WordPress with the rest
      await onSave({
        title,
        slug,
        status,
        taxonomies,
        meta_box: metaBox,
        ...(seoHasChanges ? { seo: seoData } : {}),
      });

      // Update originalSeoData so we know it's been saved
      if (seoHasChanges) {
        setOriginalSeoData(seoData);
      }

      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      setSeoError(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Combined hasChanges for UI (defined after seoHasChanges is available)
  const hasChanges = resourceHasChanges || seoHasChanges;

  const toggleTerm = (taxonomy: string, termId: number) => {
    const current = taxonomies[taxonomy] || [];
    const updated = current.includes(termId)
      ? current.filter((id) => id !== termId)
      : [...current, termId];
    
    setTaxonomies({ ...taxonomies, [taxonomy]: updated });
  };

  const updateMetaField = (field: string, value: unknown) => {
    setMetaBox(prev => ({ ...prev, [field]: value }));
  };

  // Featured Image Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTitlePrompt, setShowTitlePrompt] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Featured Image Upload handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Check if title exists, if not show prompt
    if (!title.trim()) {
      setPendingFile(file);
      setShowTitlePrompt(true);
      return;
    }

    await processAndUploadImage(file, title);
  };

  const processAndUploadImage = async (file: File, imageTitle: string) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // Configure the image processing pipeline
      const pipeline = new ImageProcessingPipeline()
        .addProcessor(createValidationProcessor(10, ['image/jpeg', 'image/png', 'image/webp', 'image/gif']))
        .addProcessor(seoDataProcessor)
        .addProcessor(shortpixelProcessor)
        .addProcessor(createFilenameProcessor(() => imageTitle));

      // Process the image
      const processed = await pipeline.process({
        file,
        filename: file.name,
        title: imageTitle,
        altText: imageTitle,
      });

      // Upload to WordPress
      const formData = new FormData();
      formData.append('file', processed.file);
      formData.append('filename', processed.filename);
      formData.append('title', processed.title);
      formData.append('alt_text', processed.altText);
      // Attach media to the post so WordPress tracks which images belong to which post
      if (effectiveResource.id) {
        formData.append('post_id', String(effectiveResource.id));
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      // Update the featured image URL and media ID
      updateMetaField('featured_image_url', result.url);
      updateMetaField('featured_media_id', result.id);

    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(String(err));
    } finally {
      setIsUploading(false);
      setPendingFile(null);
    }
  };

  const handleTitlePromptSubmit = async (promptTitle: string) => {
    if (!promptTitle.trim()) return;
    
    // Set the title for the resource
    setTitle(promptTitle);
    
    // Close the prompt
    setShowTitlePrompt(false);
    
    // Process and upload the pending file
    if (pendingFile) {
      await processAndUploadImage(pendingFile, promptTitle);
    }
  };

  // Taxonomy renderer with conditional visibility
  const renderTaxonomy = (taxonomy: string, label?: string, required = false) => {
    const taxonomyTerms = terms[taxonomy] || [];
    const selectedIds = taxonomies[taxonomy] || [];
    if (taxonomyTerms.length === 0) return null;

    const taxConfig = taxonomyConfig.find(t => t.slug === taxonomy);
    const displayLabel = label || taxonomyLabels[taxonomy] || taxConfig?.name || taxonomy;
    const isHierarchical = taxConfig?.hierarchical ?? false;

    // For hierarchical taxonomies, use hierarchical rendering
    if (isHierarchical) {
      return renderHierarchicalTaxonomy(taxonomyTerms, selectedIds, displayLabel, required, taxonomy);
    }

    return (
      <div key={taxonomy}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {displayLabel} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          {taxonomyTerms.map((term) => {
            const isSelected = selectedIds.includes(term.id);
            return (
              <button
                key={term.id}
                type="button"
                onClick={() => toggleTerm(taxonomy, term.id)}
                className={cn(
                  'px-3 py-1 rounded-full text-sm border transition-colors',
                  isSelected
                    ? 'bg-brand-100 border-brand-300 text-brand-700'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-brand-300'
                )}
              >
                {term.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Get hierarchy data for any hierarchical taxonomy
  const getHierarchyData = (taxSlug: string) => {
    const taxonomyTerms = terms[taxSlug] || [];
    const selectedIds = taxonomies[taxSlug] || [];

    const topLevel = taxonomyTerms.filter(t => t.parent_id === 0);
    const childrenByParent = new Map<number, Term[]>();

    taxonomyTerms.forEach(term => {
      if (term.parent_id !== 0) {
        const siblings = childrenByParent.get(term.parent_id) || [];
        siblings.push(term);
        childrenByParent.set(term.parent_id, siblings);
      }
    });

    const hasSelectedChild = (parentId: number) => {
      const children = childrenByParent.get(parentId) || [];
      return children.some(c => selectedIds.includes(c.id));
    };

    // Parents that are selected or have selected children
    const expandedParents = topLevel.filter(
      p => (selectedIds.includes(p.id) || hasSelectedChild(p.id)) && childrenByParent.has(p.id)
    );

    return { topLevel, childrenByParent, selectedIds, expandedParents };
  };

  // Render just the top-level categories for hierarchical taxonomies
  const renderHierarchicalTaxonomy = (
    taxonomyTerms: Term[],
    selectedIds: number[],
    label: string,
    required: boolean,
    taxSlug: string
  ) => {
    const { topLevel, childrenByParent } = getHierarchyData(taxSlug);

    const hasSelectedChild = (parentId: number) => {
      const children = childrenByParent.get(parentId) || [];
      return children.some(c => selectedIds.includes(c.id));
    };

    return (
      <div key={taxSlug}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex flex-wrap gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          {topLevel.map((term) => {
            const isSelected = selectedIds.includes(term.id);
            const hasChildren = childrenByParent.has(term.id);
            const childSelected = hasSelectedChild(term.id);
            return (
              <button
                key={term.id}
                type="button"
                onClick={() => toggleTerm(taxSlug, term.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm border transition-colors',
                  isSelected
                    ? 'bg-brand-600 border-brand-600 text-white font-medium'
                    : childSelected
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-brand-300'
                )}
              >
                {term.name}
                {hasChildren && (
                  <span className={cn(
                    'ml-1 text-xs',
                    isSelected ? 'text-brand-200' : 'text-gray-400'
                  )}>
                    ({(childrenByParent.get(term.id) || []).length})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render subtopics as a separate section for hierarchical taxonomies
  const renderHierarchicalSubtopics = (taxSlug: string) => {
    const taxConfig = taxonomyConfig.find(t => t.slug === taxSlug);
    if (!taxConfig?.hierarchical) return null;

    const { childrenByParent, selectedIds, expandedParents } = getHierarchyData(taxSlug);
    const taxLabel = taxonomyLabels[taxSlug] || taxConfig?.name || taxSlug;

    if (expandedParents.length === 0) return null;

    return (
      <div key={`${taxSlug}-subtopics`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {taxLabel} Subtopics
        </label>
        <div className="space-y-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          {expandedParents.map((parent) => {
            const children = childrenByParent.get(parent.id) || [];
            if (children.length === 0) return null;

            return (
              <div key={`children-${parent.id}`}>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium uppercase tracking-wide">{parent.name}</p>
                <div className="flex flex-wrap gap-2">
                  {children.map((term) => {
                    const isSelected = selectedIds.includes(term.id);
                    return (
                      <button
                        key={term.id}
                        type="button"
                        onClick={() => toggleTerm(taxSlug, term.id)}
                        className={cn(
                          'px-3 py-1 rounded-full text-sm border transition-colors',
                          isSelected
                            ? 'bg-brand-100 border-brand-300 text-brand-700'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-brand-300'
                        )}
                      >
                        {term.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[900px] h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className={cn(
            "flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700",
            isCreateMode && "bg-green-50 dark:bg-green-900/20"
          )}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1">
                {isCreateMode ? (title || `New ${postTypeLabel}`) : title}
              </h2>
              {!isCreateMode && (
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap">
                  <span>ID: {effectiveResource.id}</span>
                  {siteUrl && (
                    <>
                      <span className="mx-1">·</span>
                      <a
                        href={`${siteUrl}/wp-admin/post.php?post=${effectiveResource.id}&action=edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit in WP
                      </a>
                    </>
                  )}
                  {slug && siteUrl && (
                    <>
                      <span className="mx-1">·</span>
                      <a
                        href={`${siteUrl}/${postTypeSlug}/${slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </a>
                    </>
                  )}
                </p>
              )}
              {isCreateMode && <p className="text-sm text-green-600">Creating new {postTypeLabel.toLowerCase()}</p>}
            </div>
            <button onClick={onClose} aria-label="Close modal" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700 px-6">
            <nav className="flex gap-4 -mb-px overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5',
                    activeTab === tab.id
                      ? tab.id === 'ai' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-brand-500 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  {tab.id === 'ai' && <Sparkles className="w-4 h-4" />}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {/* Basic Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL Slug
                    {isCreateMode && !slugManuallyEdited && <span className="text-green-600 font-normal ml-1">(auto-synced from title)</span>}
                    {isCreateMode && slugManuallyEdited && <span className="text-gray-400 font-normal ml-1">(manually edited)</span>}
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder={isCreateMode ? 'auto-generated' : ''}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                  />
                </div>

                {/* Featured Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Featured Image</label>
                  
                  {/* URL Input */}
                  <input
                    type="url"
                    value={rewriteMediaUrl(metaBox.featured_image_url)}
                    onChange={(e) => updateMetaField('featured_image_url', e.target.value)}
                    placeholder={`${siteUrl || 'https://example.com'}/wp-content/uploads/...`}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 mb-2"
                  />
                  
                  {/* Upload Button */}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                        isUploading
                          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      )}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload Image
                        </>
                      )}
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Max 10MB. JPG, PNG, WebP, GIF
                    </span>
                  </div>
                  
                  {/* Error Display */}
                  {uploadError && (
                    <p className="mt-2 text-sm text-red-600">{uploadError}</p>
                  )}
                  
                  {/* Image Preview */}
                  {(metaBox.featured_image_url as string) && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview:</p>
                      <img
                        src={rewriteMediaUrl(metaBox.featured_image_url)}
                        alt="Featured image preview"
                        className="max-w-xs max-h-48 rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Title Prompt Modal */}
                {showTitlePrompt && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Post Title Required</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Please enter a post title to name the image file. This will also be used as the page title.
                      </p>
                      <input
                        type="text"
                        placeholder="Enter post title..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 mb-4"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleTitlePromptSubmit((e.target as HTMLInputElement).value);
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowTitlePrompt(false);
                            setPendingFile(null);
                          }}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            const input = document.querySelector('input[placeholder="Enter post title..."]') as HTMLInputElement;
                            handleTitlePromptSubmit(input?.value || '');
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SEO Tab — rendered by seopress plugin via registerPluginTab('seo', SEOTab) */}

            {/* Classification Tab */}
            {activeTab === 'classification' && (
              <div className="space-y-4">
                {classificationTaxonomies.map((taxConfig) => {
                  // Check conditional visibility
                  if (!isTaxonomyVisible(taxConfig.slug)) return null;

                  return (
                    <div key={taxConfig.slug}>
                      {renderTaxonomy(taxConfig.slug)}
                      {/* Render subtopics for hierarchical taxonomies */}
                      {taxConfig.hierarchical && renderHierarchicalSubtopics(taxConfig.slug)}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dynamic Tabs (from field_layout) */}
            {fieldLayout && fieldLayout[activeTab] && !HARDCODED_TAB_IDS.has(activeTab) && (
              <DynamicTab
                key={activeTab}
                fields={fieldLayout[activeTab] as FieldDefinition[]}
                values={metaBox}
                onChange={updateMetaField}
                terms={terms}
                resourceTitle={title}
              />
            )}

            {/* Plugin-registered Tabs (custom React components via registerPluginTab) */}
            {!HARDCODED_TAB_IDS.has(activeTab) && !(fieldLayout && fieldLayout[activeTab]) && (() => {
              const PluginTab = getPluginTab(activeTab);
              if (!PluginTab) return null;

              // Build plugin-specific context
              const pluginContext: Record<string, unknown> = {};
              if (activeTab === 'seo') {
                Object.assign(pluginContext, {
                  seoData,
                  seoLoading,
                  seoError,
                  seoHasChanges,
                  seoTitleManuallyEdited,
                  handleSeoTitleChange,
                  updateSeoField,
                  updateSeoNestedField,
                });
              }
              if (activeTab === 'ai') {
                Object.assign(pluginContext, {
                  title,
                  metaBox,
                  taxonomies,
                  seoData,
                  taxonomyConfig,
                  taxonomyLabels,
                  fieldLayout,
                  setTitle,
                  setMetaBox,
                  setTaxonomies,
                  setSeoData,
                });
              }

              return (
                <PluginTab
                  key={activeTab}
                  resource={effectiveResource}
                  terms={terms}
                  updateMetaField={updateMetaField}
                  isCreateMode={isCreateMode}
                  siteUrl={siteUrl}
                  context={pluginContext}
                />
              );
            })()}

            {/* AI Fill Tab — rendered by ai-fill plugin via registerPluginTab('ai', AIFillTab) */}
          </div>

          {/* Footer */}
          <div className={cn(
            "flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700",
            isCreateMode ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-800/80"
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                  ))}
                </select>
              </div>
              {hasChanges && !isCreateMode && (
                <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                  <span className="text-sm">Unsaved changes</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isCreateMode && onConvertPostType && (
                <button
                  onClick={onConvertPostType}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  Convert Type
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving || isCreating}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  hasChanges
                    ? isCreateMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                )}
              >
                {isSaving || isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving || isCreating
                  ? (isCreateMode ? 'Creating...' : 'Saving...')
                  : (isCreateMode ? 'Create Resource' : 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
