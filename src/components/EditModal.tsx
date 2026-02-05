'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Plus, Trash2, GripVertical, Sparkles, Copy, Check, Wand2, Upload, Image as ImageIcon, Loader2, Search, Globe, Share2 } from 'lucide-react';
import { cn, TAXONOMY_LABELS } from '@/lib/utils';
import { imagePipeline, createFilenameProcessor, seoDataProcessor, shortpixelProcessor, createValidationProcessor, ImageProcessingPipeline } from '@/lib/imageProcessing';

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

interface EditModalProps {
  resource: Resource | null;
  terms: Record<string, Term[]>;
  onClose: () => void;
  onSave: (updates: Partial<Resource>) => void;
  onCreate?: (data: { title: string; slug?: string; status: string; taxonomies: Record<string, number[]>; meta_box: Record<string, unknown> }) => void;
  isCreating?: boolean;
}

interface FeatureItem {
  feature_text: string;
  feature_icon?: string;
}

interface ChangelogItem {
  changelog_version: string;
  changelog_date: string;
  changelog_notes: string[];
}

interface DownloadLink {
  link_text: string;
  download_link_type: 'link' | 'upload';
  download_file_format?: number;
  download_link_url?: string;
  download_link_upload?: string;
}

interface DownloadSection {
  download_section_heading: string;
  download_section_color?: string;
  download_archive?: boolean;
  download_links: DownloadLink[];
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

const TABS = [
  { id: 'basic', label: 'Basic' },
  { id: 'seo', label: 'SEO' },
  { id: 'content', label: 'Content' },
  { id: 'features', label: 'Features' },
  { id: 'classification', label: 'Classification' },
  { id: 'timer', label: 'Timer' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'changelog', label: 'Changelog' },
  { id: 'ai', label: 'AI Fill', icon: 'sparkles' },
];

const STATUS_OPTIONS = ['publish', 'draft'];

// Conditional visibility constants from PHP
const BRACKET_RESOURCE_TYPE_ID = 417;
const SPORTS_TOPIC_ID = 432;

export function EditModal({ resource, terms, onClose, onSave, onCreate, isCreating = false }: EditModalProps) {
  const isCreateMode = resource === null;

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
  const [taxonomies, setTaxonomies] = useState<Record<string, number[]>>(() =>
    JSON.parse(JSON.stringify(effectiveResource.taxonomies))
  );
  const [metaBox, setMetaBox] = useState<Record<string, unknown>>(() =>
    JSON.parse(JSON.stringify(effectiveResource.meta_box))
  );
  const [isSaving, setIsSaving] = useState(false);

  // Derived state for conditional visibility
  const isBracketType = (taxonomies['resource-type'] || []).includes(BRACKET_RESOURCE_TYPE_ID);
  const hasSportsTopic = (taxonomies['topic'] || []).includes(SPORTS_TOPIC_ID);
  const timerEnabled = Boolean(metaBox.timer_enable);

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

  const saveSeoData = async () => {
    if (!effectiveResource.id || !seoHasChanges) return;

    setSeoSaving(true);
    try {
      const res = await fetch(`/api/seo/${effectiveResource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seoData),
      });

      if (!res.ok) throw new Error('Failed to save SEO data');

      setOriginalSeoData(seoData);
    } catch (err) {
      console.error('Failed to save SEO data:', err);
      throw err;
    } finally {
      setSeoSaving(false);
    }
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
        await onCreate({
          title,
          slug: slug || undefined,
          status,
          taxonomies,
          meta_box: metaBox,
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
      // Save resource changes
      if (resourceHasChanges) {
        await onSave({
          title,
          slug,
          status,
          taxonomies,
          meta_box: metaBox,
        });
      }

      // Save SEO changes
      if (seoHasChanges) {
        await saveSeoData();
      }

      onClose();
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

  // Features helpers
  const features = (metaBox.group_features as FeatureItem[]) || [];
  const addFeature = () => {
    updateMetaField('group_features', [...features, { feature_text: '' }]);
  };
  const updateFeature = (index: number, text: string) => {
    const updated = [...features];
    updated[index] = { ...updated[index], feature_text: text };
    updateMetaField('group_features', updated);
  };
  const removeFeature = (index: number) => {
    updateMetaField('group_features', features.filter((_, i) => i !== index));
  };

  // Changelog helpers
  const changelog = (metaBox.group_changelog as ChangelogItem[]) || [];
  const addChangelogEntry = () => {
    updateMetaField('group_changelog', [...changelog, { changelog_version: '', changelog_date: '', changelog_notes: [] }]);
  };
  const updateChangelog = (index: number, field: keyof ChangelogItem, value: unknown) => {
    const updated = [...changelog];
    updated[index] = { ...updated[index], [field]: value };
    updateMetaField('group_changelog', updated);
  };
  const removeChangelog = (index: number) => {
    updateMetaField('group_changelog', changelog.filter((_, i) => i !== index));
  };

  // Download sections helpers
  const downloadSections = (metaBox.download_sections as DownloadSection[]) || [];
  const addDownloadSection = () => {
    updateMetaField('download_sections', [...downloadSections, { download_section_heading: '', download_links: [] }]);
  };
  const updateDownloadSection = (index: number, field: keyof DownloadSection, value: unknown) => {
    const updated = [...downloadSections];
    updated[index] = { ...updated[index], [field]: value };
    updateMetaField('download_sections', updated);
  };
  const removeDownloadSection = (index: number) => {
    updateMetaField('download_sections', downloadSections.filter((_, i) => i !== index));
  };
  const addDownloadLink = (sectionIndex: number) => {
    const updated = [...downloadSections];
    const section = { ...updated[sectionIndex] };
    const links = section.download_links || [];
    section.download_links = [...links, { link_text: '', download_link_type: 'link' }];
    updated[sectionIndex] = section;
    updateMetaField('download_sections', updated);
  };
  const updateDownloadLink = (sectionIndex: number, linkIndex: number, field: keyof DownloadLink, value: unknown) => {
    const updated = [...downloadSections];
    const section = { ...updated[sectionIndex] };
    const links = [...(section.download_links || [])];
    links[linkIndex] = { ...links[linkIndex], [field]: value };
    section.download_links = links;
    updated[sectionIndex] = section;
    updateMetaField('download_sections', updated);
  };
  const removeDownloadLink = (sectionIndex: number, linkIndex: number) => {
    const updated = [...downloadSections];
    const section = { ...updated[sectionIndex] };
    section.download_links = section.download_links.filter((_, i) => i !== linkIndex);
    updated[sectionIndex] = section;
    updateMetaField('download_sections', updated);
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
    // Build taxonomy options dynamically from synced terms
    const getTaxonomyExamples = (taxonomy: string, maxExamples = 3): string => {
      const taxTerms = terms[taxonomy] || [];
      if (taxTerms.length === 0) return '[none available]';
      return taxTerms.slice(0, maxExamples).map(t => t.name).join(', ');
    };

    const taxonomyLines = [
      { key: 'resource-type', label: 'resource-type', examples: getTaxonomyExamples('resource-type') },
      { key: 'intent', label: 'intent', examples: getTaxonomyExamples('intent') },
      { key: 'topic', label: 'topic', examples: getTaxonomyExamples('topic') },
      { key: 'audience', label: 'audience', examples: getTaxonomyExamples('audience') },
      { key: 'leagues', label: 'leagues', examples: getTaxonomyExamples('leagues'), note: 'only if sports-related' },
      { key: 'bracket-size', label: 'bracket-size', examples: getTaxonomyExamples('bracket-size'), note: 'only if bracket' },
      { key: 'file_format', label: 'file-format', examples: getTaxonomyExamples('file_format') },
      { key: 'competition_format', label: 'competition-format', examples: getTaxonomyExamples('competition_format'), note: 'only if tournament' },
    ];

    const taxonomySelectionsBlock = taxonomyLines
      .filter(t => (terms[t.key]?.length || 0) > 0)
      .map(t => `${t.label}: [e.g., ${t.examples}${t.note ? ` - ${t.note}` : ''}]`)
      .join('\n');

    const availableTaxonomies: Record<string, string[]> = {};
    Object.keys(terms).forEach((taxonomy) => {
      availableTaxonomies[taxonomy] = terms[taxonomy].map((t) => t.name);
    });

    const availableTaxonomiesBlock = Object.entries(availableTaxonomies)
      .map(([tax, names]) => `${TAXONOMY_LABELS[tax] || tax}: ${names.slice(0, 15).join(', ')}${names.length > 15 ? '...' : ''}`)
      .join('\n');

    const featuresBlock = features.length > 0
      ? features.map(f => `- ${f.feature_text}`).join('\n')
      : '[List features, one per line with - prefix]\n- Feature 1\n- Feature 2\n- Feature 3';

    const changelogBlock = changelog.length > 0
      ? changelog.map(c =>
          `version: ${c.changelog_version}\ndate: ${c.changelog_date}\nnotes:\n${(c.changelog_notes || []).map(n => `- ${n}`).join('\n')}`
        ).join('\n\n')
      : 'version: 1.0\ndate: [YYYY-MM-DD]\nnotes:\n- Initial release';

    // Build placeholder replacements
    const replacements: Record<string, string> = {
      '{{title}}': title || '[Enter a descriptive title]',
      '{{intro_text}}': (metaBox.intro_text as string) || '[Enter a short introduction paragraph]',
      '{{text_content}}': (metaBox.text_content as string) || '[Enter the main content/description]',
      '{{features}}': featuresBlock,
      '{{available_taxonomies}}': availableTaxonomiesBlock,
      '{{taxonomy_selections}}': taxonomySelectionsBlock,
      '{{timer_enabled}}': timerEnabled ? 'yes' : 'no',
      '{{timer_title}}': (metaBox.timer_title as string) || '[e.g., EVENT STARTS]',
      '{{timer_datetime}}': (metaBox.timer_single_datetime as string) || '[YYYY-MM-DDTHH:MM format]',
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

---CHANGELOG---
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

      // Parse Changelog - handle notes with or without dash prefix
      const changelogMatch = content.match(/---CHANGELOG---\s*([\s\S]*?)(?=---END---|$)/);
      if (changelogMatch && changelogMatch[1].trim()) {
        const changelogContent = changelogMatch[1].trim();
        const entries: ChangelogItem[] = [];
        
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
  const renderTaxonomy = (taxonomy: string, label: string, required = false) => {
    const taxonomyTerms = terms[taxonomy] || [];
    const selectedIds = taxonomies[taxonomy] || [];
    if (taxonomyTerms.length === 0) return null;

    // For topic taxonomy, use hierarchical rendering
    if (taxonomy === 'topic') {
      return renderHierarchicalTaxonomy(taxonomyTerms, selectedIds, label, required);
    }

    return (
      <div key={taxonomy}>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
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

  // Get topic hierarchy data for use in rendering
  const getTopicHierarchy = () => {
    const taxonomyTerms = terms['topic'] || [];
    const selectedIds = taxonomies['topic'] || [];

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

  // Render just the top-level topic categories
  const renderHierarchicalTaxonomy = (
    taxonomyTerms: Term[],
    selectedIds: number[],
    label: string,
    required: boolean
  ) => {
    const { topLevel, childrenByParent } = getTopicHierarchy();

    const hasSelectedChild = (parentId: number) => {
      const children = childrenByParent.get(parentId) || [];
      return children.some(c => selectedIds.includes(c.id));
    };

    return (
      <div key="topic">
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
                onClick={() => toggleTerm('topic', term.id)}
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

  // Render subtopics as a separate section (like League/Competition Format)
  const renderTopicSubtopics = () => {
    const { childrenByParent, selectedIds, expandedParents } = getTopicHierarchy();

    if (expandedParents.length === 0) return null;

    return (
      <div key="topic-subtopics">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Topic Subtopics
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
                        onClick={() => toggleTerm('topic', term.id)}
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
                {isCreateMode ? (title || 'New Resource') : title}
              </h2>
              {!isCreateMode && (
                <p className="text-sm text-gray-500">
                  ID: {effectiveResource.id}
                  {slug && (
                    <>
                      <span className="mx-2">·</span>
                      <a
                        href={`https://plexkits.com/resource/${slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        plexkits.com/resource/{slug}/
                      </a>
                    </>
                  )}
                </p>
              )}
              {isCreateMode && <p className="text-sm text-green-600">Creating new resource</p>}
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
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL Slug
                    {isCreateMode && <span className="text-gray-400 font-normal ml-1">(optional - auto-generated from title if empty)</span>}
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
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
                    value={(metaBox.featured_image_url as string) || ''}
                    onChange={(e) => updateMetaField('featured_image_url', e.target.value)}
                    placeholder="https://plexkits.com/wp-content/uploads/..."
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
                        src={(metaBox.featured_image_url as string)}
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
                {isCreateMode ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-700">
                      SEO settings will be available after the resource is created.
                    </p>
                  </div>
                ) : seoLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-500">Loading SEO data...</span>
                  </div>
                ) : seoError ? (
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
                        </label>
                        <input
                          type="text"
                          value={seoData.title}
                          onChange={(e) => updateSeoField('title', e.target.value)}
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

                    {seoHasChanges && (
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

            {/* Content Tab */}
            {activeTab === 'content' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Intro Text</label>
                  <textarea
                    value={(metaBox.intro_text as string) || ''}
                    onChange={(e) => updateMetaField('intro_text', e.target.value)}
                    rows={3}
                    placeholder="Introduction paragraph..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Content Text</label>
                  <textarea
                    value={(metaBox.text_content as string) || ''}
                    onChange={(e) => updateMetaField('text_content', e.target.value)}
                    rows={6}
                    placeholder="Main content..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Content</label>
                  <textarea
                    value={(metaBox.text_ as string) || ''}
                    onChange={(e) => updateMetaField('text_', e.target.value)}
                    rows={4}
                    placeholder="Additional content block..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            {/* Features Tab */}
            {activeTab === 'features' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Feature List</label>
                  <button onClick={addFeature} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Feature
                  </button>
                </div>
                {features.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No features added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={feature.feature_text}
                          onChange={(e) => updateFeature(index, e.target.value)}
                          placeholder="Feature description..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                        />
                        <button onClick={() => removeFeature(index)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Classification Tab */}
            {activeTab === 'classification' && (
              <div className="space-y-4">
                {renderTaxonomy('resource-type', 'Resource Type', true)}
                {renderTaxonomy('intent', 'Intent')}
                {renderTaxonomy('topic', 'Topic')}

                {/* Conditional: Topic Subtopics (appears when a parent topic with children is selected) */}
                {renderTopicSubtopics()}

                {renderTaxonomy('audience', 'Audience')}

                {/* Conditional: Bracket Size (visible when resource-type = 417) */}
                {isBracketType && renderTaxonomy('bracket-size', 'Bracket Size', true)}

                {/* Conditional: League & Competition Format (visible when topic contains 432) */}
                {hasSportsTopic && (
                  <>
                    {renderTaxonomy('leagues', 'League', true)}
                    {renderTaxonomy('competition_format', 'Competition Format')}
                  </>
                )}
              </div>
            )}

            {/* Timer Tab */}
            {activeTab === 'timer' && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={timerEnabled}
                    onChange={(e) => updateMetaField('timer_enable', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable Timer</span>
                </label>

                {timerEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timer Title</label>
                      <input
                        type="text"
                        value={(metaBox.timer_title as string) || ''}
                        onChange={(e) => updateMetaField('timer_title', e.target.value)}
                        placeholder="e.g., TOURNAMENT STARTS"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timer Date/Time</label>
                      <input
                        type="datetime-local"
                        value={(metaBox.timer_single_datetime as string)?.slice(0, 16) || ''}
                        onChange={(e) => updateMetaField('timer_single_datetime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Downloads Tab */}
            {activeTab === 'downloads' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Download Sections</label>
                  <button onClick={addDownloadSection} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Section
                  </button>
                </div>
                {downloadSections.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No download sections added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {downloadSections.map((section, sectionIndex) => (
                      <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <input
                            type="text"
                            value={section.download_section_heading}
                            onChange={(e) => updateDownloadSection(sectionIndex, 'download_section_heading', e.target.value)}
                            placeholder="Section heading..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                          />
                          <button onClick={() => removeDownloadSection(sectionIndex)} className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                          <input
                            type="color"
                            value={section.download_section_color || '#3B82F6'}
                            onChange={(e) => updateDownloadSection(sectionIndex, 'download_section_color', e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer"
                          />
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={section.download_archive || false}
                              onChange={(e) => updateDownloadSection(sectionIndex, 'download_archive', e.target.checked)}
                              className="rounded border-gray-300 text-brand-600"
                            />
                            <span className="text-sm text-gray-700">Archive Download</span>
                          </label>
                        </div>

                        {/* Download Links within section */}
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-600 uppercase">Download Links</label>
                            <button onClick={() => addDownloadLink(sectionIndex)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                              <Plus className="w-3 h-3" /> Add Link
                            </button>
                          </div>
                          {(section.download_links || []).length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No download links in this section.</p>
                          ) : (
                            <div className="space-y-3">
                              {(section.download_links || []).map((link, linkIndex) => (
                                <div key={linkIndex} className="bg-white border border-gray-200 rounded p-3">
                                  <div className="flex items-start gap-2 mb-2">
                                    <input
                                      type="text"
                                      value={link.link_text}
                                      onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'link_text', e.target.value)}
                                      placeholder="Link text..."
                                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-500"
                                    />
                                    <button onClick={() => removeDownloadLink(sectionIndex, linkIndex)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <select
                                      value={link.download_link_type}
                                      onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'download_link_type', e.target.value)}
                                      className="text-xs px-2 py-1 border border-gray-300 rounded"
                                    >
                                      <option value="link">External Link</option>
                                      <option value="upload">Upload File</option>
                                    </select>
                                    {link.download_link_type === 'link' && (
                                      <input
                                        type="url"
                                        value={link.download_link_url || ''}
                                        onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'download_link_url', e.target.value)}
                                        placeholder="https://..."
                                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-brand-500"
                                      />
                                    )}
                                    {link.download_link_type === 'upload' && (
                                      <span className="text-xs text-gray-500 italic">File upload managed in WordPress</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <label className="text-xs text-gray-500 whitespace-nowrap">File Format:</label>
                                    <select
                                      value={link.download_file_format || ''}
                                      onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'download_file_format', e.target.value ? Number(e.target.value) : undefined)}
                                      className="text-xs px-2 py-1 border border-gray-300 rounded flex-1"
                                    >
                                      <option value="">None</option>
                                      {(terms['file_format'] || []).map((term) => (
                                        <option key={term.id} value={term.id}>{term.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Changelog Tab */}
            {activeTab === 'changelog' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Changelog</label>
                  <button onClick={addChangelogEntry} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Version
                  </button>
                </div>
                {changelog.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No changelog entries yet.</p>
                ) : (
                  <div className="space-y-4">
                    {changelog.map((entry, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex gap-3 flex-1">
                            <input
                              type="text"
                              value={entry.changelog_version}
                              onChange={(e) => updateChangelog(index, 'changelog_version', e.target.value)}
                              placeholder="v1.0"
                              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                            />
                            <input
                              type="date"
                              value={entry.changelog_date}
                              onChange={(e) => updateChangelog(index, 'changelog_date', e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <button onClick={() => removeChangelog(index)} className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={(entry.changelog_notes || []).join('\n')}
                          onChange={(e) => updateChangelog(index, 'changelog_notes', e.target.value.split('\n').filter(Boolean))}
                          placeholder="Notes (one per line)..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
