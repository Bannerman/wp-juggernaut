'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Sparkles, Check, Wand2, Upload, Image as ImageIcon, Loader2, Search, Globe, Share2, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { imagePipeline, createFilenameProcessor, seoDataProcessor, shortpixelProcessor, createValidationProcessor, ImageProcessingPipeline } from '@/lib/imageProcessing';
import { DynamicTab } from '@/components/fields';
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
  /** Site URL from profile (e.g., "https://plexkits.com") */
  siteUrl?: string;
  /** Post type slug for URL building (e.g., "resource") */
  postTypeSlug?: string;
  /** Post type label for display (e.g., "Resource") */
  postTypeLabel?: string;
  /** Field layout from profile (maps tab ID to field definitions) */
  fieldLayout?: Record<string, FieldDefinition[]>;
  /** Tab configuration from profile */
  tabConfig?: Array<{ id: string; label: string; source: string; icon?: string; position?: number; dynamic?: boolean }>;
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
  { id: 'ai', label: 'AI Fill', icon: 'sparkles', plugin: 'core' },
];

// Core tabs that are always handled with hardcoded rendering
// Note: 'seo' is NOT core — it's provided by the seopress plugin via enabledTabs
const CORE_TAB_IDS = new Set(['basic', 'classification', 'ai']);

// Tabs with hardcoded rendering (core + plugin tabs that have custom JSX)
const HARDCODED_TAB_IDS = new Set(['basic', 'seo', 'classification', 'ai']);

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
      // Profile-driven tabs: core tabs + dynamic tabs that have field_layout entries
      return tabConfig
        .filter(tab => {
          if (CORE_TAB_IDS.has(tab.id)) return true;
          // Non-core tabs need to be in enabledTabs
          if (!enabledTabs.includes(tab.id)) return false;
          // Dynamic tabs need a field_layout entry
          if (tab.dynamic && (!fieldLayout || !fieldLayout[tab.id])) return false;
          return true;
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
          setSeoData(data.seo);
          setOriginalSeoData(data.seo);
        }
      })
      .catch(err => {
        console.error('Failed to fetch SEO data:', err);
        setSeoError('Failed to load SEO data');
      })
      .finally(() => setSeoLoading(false));
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

  // AI Fill state and helpers
  const [aiPasteContent, setAiPasteContent] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});

  // Fetch prompt templates from prompt-templates API
  useEffect(() => {
    Promise.all([
      fetch('/api/prompt-templates/ai-fill').then(res => res.json()),
      fetch('/api/prompt-templates/featured-image').then(res => res.json()),
    ])
      .then(([aiFill, featuredImage]) => {
        setPromptTemplates({
          'ai-fill': aiFill.template?.content || '',
          'featured-image': featuredImage.template?.content || '',
        });
      })
      .catch(() => setPromptTemplates({}));
  }, []);

  // Featured Image Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTitlePrompt, setShowTitlePrompt] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generatePrompt = (templateId: 'ai-fill' | 'featured-image') => {
    // Build taxonomy options dynamically from synced terms and config
    const getTaxonomyExamples = (taxonomy: string, maxExamples = 3): string => {
      const taxTerms = terms[taxonomy] || [];
      if (taxTerms.length === 0) return '[none available]';
      return taxTerms.slice(0, maxExamples).map(t => t.name).join(', ');
    };

    // Build taxonomy lines dynamically from profile config
    const taxonomyLines = taxonomyConfig.map(tax => {
      const note = tax.conditional?.show_when
        ? `only if ${tax.conditional.show_when.taxonomy} matches`
        : undefined;
      return {
        key: tax.slug,
        label: tax.slug,
        examples: getTaxonomyExamples(tax.slug),
        note,
      };
    });

    const taxonomySelectionsBlock = taxonomyLines
      .filter(t => (terms[t.key]?.length || 0) > 0)
      .map(t => `${t.label}: [e.g., ${t.examples}${t.note ? ` - ${t.note}` : ''}]`)
      .join('\n');

    const availableTaxonomies: Record<string, string[]> = {};
    Object.keys(terms).forEach((taxonomy) => {
      availableTaxonomies[taxonomy] = terms[taxonomy].map((t) => t.name);
    });

    const availableTaxonomiesBlock = Object.entries(availableTaxonomies)
      .map(([tax, names]) => `${taxonomyLabels[tax] || tax}: ${names.slice(0, 15).join(', ')}${names.length > 15 ? '...' : ''}`)
      .join('\n');

    const aiFeatures = (metaBox.group_features as Array<{ feature_text: string }>) || [];
    const featuresBlock = aiFeatures.length > 0
      ? aiFeatures.map(f => `- ${f.feature_text}`).join('\n')
      : '[List features, one per line with - prefix]\n- Feature 1\n- Feature 2\n- Feature 3';

    const aiChangelog = (metaBox.group_changelog as Array<{ changelog_version: string; changelog_date: string; changelog_notes: string[] }>) || [];
    const changelogBlock = aiChangelog.length > 0
      ? aiChangelog.map(c =>
          `version: ${c.changelog_version}\ndate: ${c.changelog_date}\nnotes:\n${(c.changelog_notes || []).map(n => `- ${n}`).join('\n')}`
        ).join('\n\n')
      : 'version: 1.0\ndate: [YYYY-MM-DD]\nnotes:\n- Initial release';

    // Build downloads block from existing download_sections
    const aiDownloads = (metaBox.download_sections as Array<{
      download_section_heading: string;
      download_section_color?: string;
      download_archive?: boolean;
      download_links?: Array<{
        link_text: string;
        download_link_type?: string;
        download_file_format?: number;
        download_link_url?: string;
      }>;
    }>) || [];

    // Helper to resolve file_format term ID to name
    const getFileFormatName = (termId?: number): string => {
      if (!termId) return '';
      const formatTerms = terms['file_format'] || [];
      const matched = formatTerms.find(t => t.id === termId);
      return matched ? matched.name : '';
    };

    const downloadsBlock = aiDownloads.length > 0
      ? aiDownloads.map(section => {
          const lines = [`section: ${section.download_section_heading}`];
          if (section.download_section_color) lines.push(`color: ${section.download_section_color}`);
          lines.push(`archive: ${section.download_archive ? 'yes' : 'no'}`);
          lines.push('links:');
          (section.download_links || []).forEach(link => {
            const parts = [`text: ${link.link_text}`];
            const formatName = getFileFormatName(link.download_file_format);
            if (formatName) parts.push(`format: ${formatName}`);
            parts.push(`type: ${link.download_link_type || 'link'}`);
            if (link.download_link_url) parts.push(`url: ${link.download_link_url}`);
            lines.push(`- ${parts.join(' | ')}`);
          });
          return lines.join('\n');
        }).join('\n\n')
      : `section: Download the ${title || '[Post Title]'}\ncolor: [hex color, e.g., #6366f1]\narchive: no\nlinks:\n- text: [Link Text] | format: [File Format] | type: link | url: [URL]`;

    // Build placeholder replacements
    const replacements: Record<string, string> = {
      '{{title}}': title || '[Enter a descriptive title]',
      '{{intro_text}}': (metaBox.intro_text as string) || '[Enter a short introduction paragraph]',
      '{{text_content}}': (metaBox.text_content as string) || '[Enter the main content/description]',
      '{{features}}': featuresBlock,
      '{{available_taxonomies}}': availableTaxonomiesBlock,
      '{{taxonomy_selections}}': taxonomySelectionsBlock,
      '{{timer_enabled}}': metaBox.timer_enable ? 'yes' : 'no',
      '{{timer_title}}': (metaBox.timer_title as string) || '[e.g., EVENT STARTS]',
      '{{timer_datetime}}': (metaBox.timer_single_datetime as string) || '[YYYY-MM-DDTHH:MM format]',
      '{{downloads}}': downloadsBlock,
      '{{changelog}}': changelogBlock,
      // SEO fields
      '{{seo_title}}': seoData.title || '[SEO title - max 60 characters]',
      '{{seo_description}}': seoData.description || '[Meta description - max 160 characters]',
      '{{seo_keywords}}': seoData.targetKeywords || '[keyword1, keyword2, keyword3]',
      '{{og_title}}': seoData.og.title || '[Facebook share title]',
      '{{og_description}}': seoData.og.description || '[Facebook share description]',
      '{{twitter_title}}': seoData.twitter.title || '[Twitter share title]',
      '{{twitter_description}}': seoData.twitter.description || '[Twitter share description]',
    };

    // Get template content
    let template = promptTemplates[templateId] || '';

    // Fallback for ai-fill if not loaded
    if (!template && templateId === 'ai-fill') {
      template = `Please provide content for a resource titled "{{title}}" with the following fields. Use the EXACT format below with the field markers.

---TITLE---
{{title}}

---INTRO_TEXT---
{{intro_text}}

---TEXT_CONTENT---
{{text_content}}

---FEATURES---
{{features}}

---TAXONOMIES---
IMPORTANT: Do NOT repeat the options below. Only output the "Your selections" section with your chosen values.

Available options for reference:
{{available_taxonomies}}

Your selections (comma-separated, ONLY include the field name and your selections):
{{taxonomy_selections}}

---TIMER---
timer_enabled: {{timer_enabled}}
timer_title: {{timer_title}}
timer_datetime: {{timer_datetime}}

---DOWNLOADS---
Use this EXACT format for each download section. The first section heading MUST follow the pattern "Download the [Post Title]".
Multiple sections are separated by a blank line. Each link is on its own line starting with "- ".
Format per section:
section: [Section Heading]
color: [hex color, e.g., #6366f1]
archive: yes|no
links:
- text: [Link Text] | format: [File Format] | type: link | url: [URL]

Current data:
{{downloads}}

---CHANGELOG---
Use this EXACT format for changelog entries. Multiple entries are separated by a blank line.
Format per entry:
version: [version number]
date: [YYYY-MM-DD]
notes:
- [change description]

Current data:
{{changelog}}

---END---`;
    }

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
      template = template.split(placeholder).join(value);
    }

    return template;
  };

  const copyPrompt = async (templateId: 'ai-fill' | 'featured-image') => {
    try {
      await navigator.clipboard.writeText(generatePrompt(templateId));
      setCopiedPrompt(templateId);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const parseAiResponse = () => {
    if (!aiPasteContent.trim()) {
      setParseStatus({ type: 'error', message: 'Please paste AI response first' });
      return;
    }

    try {
      const content = aiPasteContent;
      let fieldsUpdated = 0;
      const updatedMeta = { ...metaBox };

      // Parse Title
      const titleMatch = content.match(/---TITLE---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (titleMatch && titleMatch[1].trim()) {
        const newTitle = titleMatch[1].trim();
        console.log('Parsed title:', newTitle);
        setTitle(newTitle);
        fieldsUpdated++;
      }

      // Parse Intro Text
      const introMatch = content.match(/---INTRO_TEXT---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (introMatch && introMatch[1].trim()) {
        const introText = introMatch[1].trim();
        console.log('Parsed intro_text:', introText);
        updatedMeta.intro_text = introText;
        fieldsUpdated++;
      }

      // Parse Text Content
      const textMatch = content.match(/---TEXT_CONTENT---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (textMatch && textMatch[1].trim()) {
        const textContent = textMatch[1].trim();
        console.log('Parsed text_content:', textContent);
        updatedMeta.text_content = textContent;
        fieldsUpdated++;
      }

      // Parse Features - handle both with and without dash prefix
      const featuresMatch = content.match(/---FEATURES---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (featuresMatch && featuresMatch[1].trim()) {
        const rawText = featuresMatch[1].trim();
        // Remove any instruction text like "[List features...]"
        const cleanedText = rawText.replace(/\[.*?\]/g, '');
        const featureLines = cleanedText.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('['))
          .map(line => ({ feature_text: line.replace(/^[-•*]\s*/, '').trim() }))
          .filter(f => f.feature_text && f.feature_text.length > 2);
        if (featureLines.length > 0) {
          console.log('Parsed features:', featureLines);
          updatedMeta.group_features = featureLines;
          fieldsUpdated++;
        }
      }

      // Parse Taxonomies - comprehensive patterns
      const taxMatch = content.match(/---TAXONOMIES---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (taxMatch) {
        const taxContent = taxMatch[1];
        const newTaxonomies = { ...taxonomies };
        
        const taxPatterns = [
          { key: 'resource-type', pattern: /resource-type:\s*(.+)/i },
          { key: 'intent', pattern: /intent:\s*(.+)/i },
          { key: 'topic', pattern: /topic:\s*(.+)/i },
          { key: 'audience', pattern: /audience:\s*(.+)/i },
          { key: 'leagues', pattern: /league:\s*(.+)/i },
          { key: 'bracket-size', pattern: /bracket[\s-]*size:\s*(.+)/i },
          { key: 'file-format', pattern: /file[\s-]*format:\s*(.+)/i },
          { key: 'competition_format', pattern: /competition[\s-]*format:\s*(.+)/i },
        ];

        taxPatterns.forEach(({ key, pattern }) => {
          const match = taxContent.match(pattern);
          if (match && match[1]) {
            const selectedNames = match[1].split(',').map(s => s.trim().toLowerCase());
            const matchedIds = (terms[key] || [])
              .filter(t => selectedNames.includes(t.name.toLowerCase()))
              .map(t => t.id);
            if (matchedIds.length > 0) {
              newTaxonomies[key] = matchedIds;
              fieldsUpdated++;
            }
          }
        });

        setTaxonomies(newTaxonomies);
      }

      // Parse Timer
      const timerMatch = content.match(/---TIMER---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (timerMatch) {
        const timerContent = timerMatch[1];
        
        const enabledMatch = timerContent.match(/timer_enabled:\s*(yes|no)/i);
        if (enabledMatch) {
          updatedMeta.timer_enable = enabledMatch[1].toLowerCase() === 'yes';
          fieldsUpdated++;
        }
        
        const titleTimerMatch = timerContent.match(/timer_title:\s*(.+)/i);
        if (titleTimerMatch && titleTimerMatch[1].trim() && !titleTimerMatch[1].includes('[')) {
          updatedMeta.timer_title = titleTimerMatch[1].trim();
          fieldsUpdated++;
        }
        
        const datetimeMatch = timerContent.match(/timer_datetime:\s*(\d{4}-\d{2}-\d{2}T?\d{2}:\d{2})/i);
        if (datetimeMatch) {
          updatedMeta.timer_single_datetime = datetimeMatch[1];
          fieldsUpdated++;
        }
      }

      // Parse Downloads
      const downloadsMatch = content.match(/---DOWNLOADS---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (downloadsMatch && downloadsMatch[1].trim()) {
        const downloadsContent = downloadsMatch[1].trim();
        const sections: Array<{
          download_section_heading: string;
          download_section_color?: string;
          download_archive?: boolean;
          download_links: Array<{
            link_text: string;
            download_link_type: string;
            download_file_format?: number;
            download_link_url?: string;
          }>;
        }> = [];

        // Split into section blocks by "section:" prefix
        const sectionBlocks = downloadsContent.split(/(?=section:)/i).filter(Boolean);
        sectionBlocks.forEach(block => {
          const headingMatch = block.match(/section:\s*(.+)/i);
          if (!headingMatch || headingMatch[1].includes('[')) return;

          const colorMatch = block.match(/color:\s*(#[0-9a-fA-F]{3,8})/i);
          const archiveMatch = block.match(/archive:\s*(yes|no)/i);
          const linksContent = block.match(/links:\s*([\s\S]*?)(?=section:|$)/i);

          const downloadLinks: Array<{
            link_text: string;
            download_link_type: string;
            download_file_format?: number;
            download_link_url?: string;
          }> = [];

          if (linksContent) {
            // Match each link line — any prefix (-, *, •, or none)
            // Just check if the line contains "text:" which is the required field
            const linkLines = linksContent[1].split('\n').filter(l => {
              const t = l.trim();
              return t.length > 0 && t.toLowerCase().includes('text:');
            });
            linkLines.forEach(line => {
              const stripped = line.replace(/^[-•*]\s*/, '').trim();
              if (!stripped || stripped.startsWith('[')) return;

              const textMatch = stripped.match(/text:\s*([^|]+)/i);
              const formatMatch = stripped.match(/format:\s*([^|]+)/i);
              const typeMatch = stripped.match(/type:\s*([^|]+)/i);
              const urlMatch = stripped.match(/url:\s*(.+)/i);

              if (textMatch && textMatch[1].trim()) {
                const link: {
                  link_text: string;
                  download_link_type: string;
                  download_file_format?: number;
                  download_link_url?: string;
                } = {
                  link_text: textMatch[1].trim(),
                  download_link_type: typeMatch ? typeMatch[1].trim().toLowerCase() : 'link',
                };

                // Resolve file format name to term ID
                if (formatMatch && formatMatch[1].trim()) {
                  const formatName = formatMatch[1].trim().toLowerCase();
                  const formatTerms = terms['file_format'] || [];
                  const matched = formatTerms.find(t => t.name.toLowerCase() === formatName);
                  if (matched) {
                    link.download_file_format = matched.id;
                  }
                }

                if (urlMatch && urlMatch[1].trim()) {
                  // Strip markdown link syntax: [url](url) → url
                  let rawUrl = urlMatch[1].trim();
                  const mdLink = rawUrl.match(/\[([^\]]+)\]\(([^)]+)\)/);
                  if (mdLink) {
                    rawUrl = mdLink[2];
                  }
                  link.download_link_url = rawUrl;
                }

                downloadLinks.push(link);
              }
            });
          }

          sections.push({
            download_section_heading: headingMatch[1].trim(),
            download_section_color: colorMatch ? colorMatch[1] : undefined,
            download_archive: archiveMatch ? archiveMatch[1].toLowerCase() === 'yes' : false,
            download_links: downloadLinks,
          });
        });

        if (sections.length > 0) {
          updatedMeta.download_sections = sections;
          fieldsUpdated++;
        }
      }

      // Parse Changelog - handle notes with or without dash prefix
      const changelogMatch = content.match(/---CHANGELOG---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (changelogMatch && changelogMatch[1].trim()) {
        const changelogContent = changelogMatch[1].trim();
        const entries: Array<{ changelog_version: string; changelog_date: string; changelog_notes: string[] }> = [];
        
        const versionBlocks = changelogContent.split(/(?=version:)/i).filter(Boolean);
        versionBlocks.forEach(block => {
          const versionMatch = block.match(/version:\s*(.+)/i);
          const dateMatch = block.match(/date:\s*(\d{4}-\d{2}-\d{2})/i);
          const notesMatch = block.match(/notes:\s*([\s\S]*?)(?=version:|$)/i);
          
          if (versionMatch) {
            let notes: string[] = [];
            if (notesMatch) {
              notes = notesMatch[1].split('\n')
                .map(l => l.replace(/^[-•*]\s*/, '').trim())
                .filter(l => l.length > 0 && !l.startsWith('['));
            }
            entries.push({
              changelog_version: versionMatch[1].trim(),
              changelog_date: dateMatch ? dateMatch[1] : '',
              changelog_notes: notes,
            });
          }
        });
        
        if (entries.length > 0) {
          updatedMeta.group_changelog = entries;
          fieldsUpdated++;
        }
      }

      // Parse SEO fields
      const seoMatch = content.match(/---SEO---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (seoMatch) {
        const seoContent = seoMatch[1];
        const updatedSeo = { ...seoData };

        const seoTitleMatch = seoContent.match(/seo_title:\s*(.+)/i);
        if (seoTitleMatch && seoTitleMatch[1].trim() && !seoTitleMatch[1].includes('[')) {
          updatedSeo.title = seoTitleMatch[1].trim();
          fieldsUpdated++;
        }

        const seoDescMatch = seoContent.match(/seo_description:\s*(.+)/i);
        if (seoDescMatch && seoDescMatch[1].trim() && !seoDescMatch[1].includes('[')) {
          updatedSeo.description = seoDescMatch[1].trim();
          fieldsUpdated++;
        }

        const seoKeywordsMatch = seoContent.match(/seo_keywords:\s*(.+)/i);
        if (seoKeywordsMatch && seoKeywordsMatch[1].trim() && !seoKeywordsMatch[1].includes('[')) {
          updatedSeo.targetKeywords = seoKeywordsMatch[1].trim();
          fieldsUpdated++;
        }

        setSeoData(updatedSeo);
      }

      // Parse Social fields
      const socialMatch = content.match(/---SOCIAL---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (socialMatch) {
        const socialContent = socialMatch[1];
        const updatedSeo = { ...seoData };

        const ogTitleMatch = socialContent.match(/og_title:\s*(.+)/i);
        if (ogTitleMatch && ogTitleMatch[1].trim() && !ogTitleMatch[1].includes('[')) {
          updatedSeo.og = { ...updatedSeo.og, title: ogTitleMatch[1].trim() };
          fieldsUpdated++;
        }

        const ogDescMatch = socialContent.match(/og_description:\s*(.+)/i);
        if (ogDescMatch && ogDescMatch[1].trim() && !ogDescMatch[1].includes('[')) {
          updatedSeo.og = { ...updatedSeo.og, description: ogDescMatch[1].trim() };
          fieldsUpdated++;
        }

        const twitterTitleMatch = socialContent.match(/twitter_title:\s*(.+)/i);
        if (twitterTitleMatch && twitterTitleMatch[1].trim() && !twitterTitleMatch[1].includes('[')) {
          updatedSeo.twitter = { ...updatedSeo.twitter, title: twitterTitleMatch[1].trim() };
          fieldsUpdated++;
        }

        const twitterDescMatch = socialContent.match(/twitter_description:\s*(.+)/i);
        if (twitterDescMatch && twitterDescMatch[1].trim() && !twitterDescMatch[1].includes('[')) {
          updatedSeo.twitter = { ...updatedSeo.twitter, description: twitterDescMatch[1].trim() };
          fieldsUpdated++;
        }

        setSeoData(updatedSeo);
      }

      // Apply all metaBox updates at once
      setMetaBox(updatedMeta);

      if (fieldsUpdated > 0) {
        setParseStatus({ type: 'success', message: `Successfully updated ${fieldsUpdated} field(s)! Review the other tabs.` });
        setAiPasteContent('');
      } else {
        setParseStatus({ type: 'error', message: 'No fields could be parsed. Check the format.' });
      }
    } catch (err) {
      setParseStatus({ type: 'error', message: 'Error parsing response. Check format.' });
      console.error('Parse error:', err);
    }
  };

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

      if (processed.seoData) {
        if (processed.seoData.description) {
          formData.append('description', processed.seoData.description);
          // Use description as caption too if available
          formData.append('caption', processed.seoData.description);
        }
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {displayLabel} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
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
                    : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
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
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {taxLabel} Subtopics
        </label>
        <div className="space-y-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
          {expandedParents.map((parent) => {
            const children = childrenByParent.get(parent.id) || [];
            if (children.length === 0) return null;

            return (
              <div key={`children-${parent.id}`}>
                <p className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide">{parent.name}</p>
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
                            : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
        <div className="relative bg-white rounded-xl shadow-xl w-[900px] h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className={cn(
            "flex items-center justify-between px-6 py-4 border-b border-gray-200",
            isCreateMode && "bg-green-50"
          )}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 line-clamp-1">
                {isCreateMode ? (title || `New ${postTypeLabel}`) : title}
              </h2>
              {!isCreateMode && (
                <p className="text-sm text-gray-500">
                  ID: {effectiveResource.id}
                  {slug && siteUrl && (
                    <>
                      <span className="mx-2">·</span>
                      <a
                        href={`${siteUrl}/${postTypeSlug}/${slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {siteUrl.replace(/^https?:\/\//, '')}/{postTypeSlug}/{slug}/
                      </a>
                    </>
                  )}
                </p>
              )}
              {isCreateMode && <p className="text-sm text-green-600">Creating new {postTypeLabel.toLowerCase()}</p>}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-4 -mb-px overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5',
                    activeTab === tab.id
                      ? tab.id === 'ai' ? 'border-purple-500 text-purple-600' : 'border-brand-500 text-brand-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL Slug
                    {isCreateMode && !slugManuallyEdited && <span className="text-green-600 font-normal ml-1">(auto-synced from title)</span>}
                    {isCreateMode && slugManuallyEdited && <span className="text-gray-400 font-normal ml-1">(manually edited)</span>}
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder={isCreateMode ? 'auto-generated' : ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                  />
                </div>

                {/* Featured Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Featured Image</label>
                  
                  {/* URL Input */}
                  <input
                    type="url"
                    value={rewriteMediaUrl(metaBox.featured_image_url)}
                    onChange={(e) => updateMetaField('featured_image_url', e.target.value)}
                    placeholder={`${siteUrl || 'https://example.com'}/wp-content/uploads/...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 mb-2"
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
                          ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
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
                    <span className="text-xs text-gray-500">
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
                      <p className="text-xs text-gray-500 mb-1">Preview:</p>
                      <img
                        src={rewriteMediaUrl(metaBox.featured_image_url)}
                        alt="Featured image preview"
                        className="max-w-xs max-h-48 rounded-lg border border-gray-200 object-cover"
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
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Post Title Required</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Please enter a post title to name the image file. This will also be used as the page title.
                      </p>
                      <input
                        type="text"
                        placeholder="Enter post title..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 mb-4"
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
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
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

            {/* SEO Tab */}
            {activeTab === 'seo' && (
              <div className="space-y-6">
                {isCreateMode && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-700">
                      SEO settings will be saved automatically after the resource is created.
                    </p>
                  </div>
                )}
                {!isCreateMode && seoLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-500">Loading SEO data...</span>
                  </div>
                ) : !isCreateMode && seoError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700">{seoError}</p>
                  </div>
                ) : (
                  <>
                    {/* Basic SEO */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                        <Search className="w-4 h-4" />
                        Search Engine Optimization
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Target Keywords
                        </label>
                        <input
                          type="text"
                          value={seoData.targetKeywords}
                          onChange={(e) => updateSeoField('targetKeywords', e.target.value)}
                          placeholder="keyword1, keyword2, keyword3..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Comma-separated list of target keywords</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Canonical URL
                        </label>
                        <input
                          type="url"
                          value={seoData.canonical}
                          onChange={(e) => updateSeoField('canonical', e.target.value)}
                          placeholder="https://..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave empty to use default URL</p>
                      </div>
                    </div>

                    {/* Social Media */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                        <Share2 className="w-4 h-4" />
                        Social Media
                      </div>

                      {/* Facebook/OG */}
                      <div className="border-l-4 border-blue-500 pl-4 space-y-3">
                        <h4 className="text-sm font-medium text-blue-700">Facebook / Open Graph</h4>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                          <input
                            type="text"
                            value={seoData.og.title}
                            onChange={(e) => updateSeoNestedField('og', 'title', e.target.value)}
                            placeholder="Facebook share title..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                          <textarea
                            value={seoData.og.description}
                            onChange={(e) => updateSeoNestedField('og', 'description', e.target.value)}
                            placeholder="Facebook share description..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                          <input
                            type="url"
                            value={seoData.og.image}
                            onChange={(e) => updateSeoNestedField('og', 'image', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                          />
                        </div>
                      </div>

                      {/* Twitter */}
                      <div className="border-l-4 border-sky-500 pl-4 space-y-3">
                        <h4 className="text-sm font-medium text-sky-700">Twitter / X</h4>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                          <input
                            type="text"
                            value={seoData.twitter.title}
                            onChange={(e) => updateSeoNestedField('twitter', 'title', e.target.value)}
                            placeholder="Twitter share title..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                          <textarea
                            value={seoData.twitter.description}
                            onChange={(e) => updateSeoNestedField('twitter', 'description', e.target.value)}
                            placeholder="Twitter share description..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                          <input
                            type="url"
                            value={seoData.twitter.image}
                            onChange={(e) => updateSeoNestedField('twitter', 'image', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Robots / Indexing */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
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
                          <span className="text-sm text-gray-700">No Index</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={seoData.robots.nofollow}
                            onChange={(e) => updateSeoNestedField('robots', 'nofollow', e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-700">No Follow</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={seoData.robots.nosnippet}
                            onChange={(e) => updateSeoNestedField('robots', 'nosnippet', e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-700">No Snippet</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={seoData.robots.noimageindex}
                            onChange={(e) => updateSeoNestedField('robots', 'noimageindex', e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-gray-700">No Image Index</span>
                        </label>
                      </div>

                      <p className="text-xs text-gray-500">
                        Check these options to prevent search engines from indexing or following links on this page.
                      </p>
                    </div>

                    {seoHasChanges && !isCreateMode && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-yellow-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          SEO changes will be saved when you click Save Changes
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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

            {/* AI Fill Tab */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                {/* Copy Prompt Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => copyPrompt('ai-fill')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all',
                      copiedPrompt === 'ai-fill'
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 hover:border-purple-400 hover:shadow-md'
                    )}
                  >
                    {copiedPrompt === 'ai-fill' ? (
                      <Check className="w-8 h-8" />
                    ) : (
                      <Sparkles className="w-8 h-8 text-purple-600" />
                    )}
                    <div className="text-center">
                      <span className="block font-semibold text-gray-900">
                        {copiedPrompt === 'ai-fill' ? 'Copied!' : 'Copy AI Fill Prompt'}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">Generate all content fields</span>
                    </div>
                  </button>

                  <button
                    onClick={() => copyPrompt('featured-image')}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all',
                      copiedPrompt === 'featured-image'
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 hover:border-amber-400 hover:shadow-md'
                    )}
                  >
                    {copiedPrompt === 'featured-image' ? (
                      <Check className="w-8 h-8" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-amber-600" />
                    )}
                    <div className="text-center">
                      <span className="block font-semibold text-gray-900">
                        {copiedPrompt === 'featured-image' ? 'Copied!' : 'Copy Image Prompt'}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">Generate featured image ideas</span>
                    </div>
                  </button>
                </div>

                {/* Instructions */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm text-gray-600 text-center">
                    Copy a prompt above → Paste into ChatGPT/Claude → Paste the response below → Click Apply
                  </p>
                </div>

                {/* Paste Response */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paste AI Response
                  </label>
                  <textarea
                    value={aiPasteContent}
                    onChange={(e) => {
                      setAiPasteContent(e.target.value);
                      setParseStatus({ type: null, message: '' });
                    }}
                    placeholder="Paste the AI-generated response here..."
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                  />
                </div>

                {/* Parse Status */}
                {parseStatus.type && (
                  <div className={cn(
                    'p-3 rounded-lg text-sm',
                    parseStatus.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  )}>
                    {parseStatus.message}
                  </div>
                )}

                {/* Apply Button */}
                <button
                  onClick={parseAiResponse}
                  disabled={!aiPasteContent.trim()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                    aiPasteContent.trim()
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  )}
                >
                  <Wand2 className="w-4 h-4" />
                  Apply AI Response to Fields
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={cn(
            "flex items-center justify-between px-6 py-4 border-t border-gray-200",
            isCreateMode ? "bg-green-50" : "bg-gray-50"
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Status:</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                  ))}
                </select>
              </div>
              {hasChanges && !isCreateMode && (
                <div className="flex items-center gap-1.5 text-yellow-700">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">Unsaved changes</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isCreateMode && onConvertPostType && (
                <button
                  onClick={onConvertPostType}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  Convert Type
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
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
                <Save className="w-4 h-4" />
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
