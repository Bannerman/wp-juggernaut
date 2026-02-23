'use client';

/**
 * AI Fill Tab Component
 *
 * Provides AI-powered content generation via prompt templates.
 * Users copy prompts to ChatGPT/Claude, paste responses back, and
 * the plugin parses the response to auto-fill resource fields.
 *
 * Self-registers via registerPluginTab('ai', AIFillTab) as a module side effect.
 */

import { useState, useEffect } from 'react';
import { Sparkles, Check, Wand2, Image as ImageIcon, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { registerPluginTab } from '@/components/fields';
import type { PluginTabProps } from '@/components/fields';

/**
 * Shape of the context object passed from EditModal when activeTab === 'ai'.
 * EditModal retains ownership of all state; AIFillTab reads and writes via these handles.
 */
interface AIFillContext {
  // State to read
  title: string;
  metaBox: Record<string, unknown>;
  taxonomies: Record<string, number[]>;
  seoData: SEOData;
  taxonomyConfig: TaxonomyConfig[];
  taxonomyLabels: Record<string, string>;
  fieldLayout?: Record<string, unknown[]>;

  // State updaters
  setTitle: (title: string) => void;
  setMetaBox: (meta: Record<string, unknown>) => void;
  setTaxonomies: (taxonomies: Record<string, number[]>) => void;
  setSeoData: (seo: SEOData) => void;
}

interface SEOData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: { title: string; description: string; image: string };
  twitter: { title: string; description: string; image: string };
  robots: { noindex: boolean; nofollow: boolean; nosnippet: boolean; noimageindex: boolean };
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

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

function AIFillTab({ terms, context }: PluginTabProps) {
  // --- AI Fill local state (hooks must be called unconditionally) ---
  const [aiPasteContent, setAiPasteContent] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});

  // Fetch prompt templates from prompt-templates API
  useEffect(() => {
    Promise.all([
      fetch('/api/prompt-templates/ai-fill').then(res => res.json()),
      fetch('/api/prompt-templates/featured-image').then(res => res.json()),
      fetch('/api/prompt-templates/faq').then(res => res.json()),
    ])
      .then(([aiFill, featuredImage, faq]) => {
        setPromptTemplates({
          'ai-fill': aiFill.template?.content || '',
          'featured-image': featuredImage.template?.content || '',
          'faq': faq.template?.content || '',
        });
      })
      .catch(() => setPromptTemplates({}));
  }, []);

  const ctx = context as unknown as AIFillContext | undefined;
  if (!ctx) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 italic">AI Fill context not available.</p>;
  }

  const {
    title,
    metaBox,
    taxonomies,
    seoData,
    taxonomyConfig,
    taxonomyLabels,
    setTitle,
    setMetaBox,
    setTaxonomies,
    setSeoData,
  } = ctx;

  // --- Prompt generation ---

  const generatePrompt = (templateId: 'ai-fill' | 'featured-image' | 'faq') => {
    // Build taxonomy options dynamically from synced terms and config
    const getTaxonomyExamples = (taxonomy: string, maxExamples = 3): string => {
      const taxTerms = terms[taxonomy] || [];
      if (taxTerms.length === 0) return '[none available]';
      return taxTerms.slice(0, maxExamples).map((t: Term) => t.name).join(', ');
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
      availableTaxonomies[taxonomy] = terms[taxonomy].map((t: Term) => t.name);
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
      const matched = formatTerms.find((t: Term) => t.id === termId);
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
      '{{faq_items}}': (() => {
        const faqGroup = (metaBox.faq_group as Array<{ question: string; answer: string }>) || [];
        if (faqGroup.length > 0) {
          return faqGroup.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n');
        }
        return '[No existing FAQ data]';
      })(),
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

---SEO---
seo_title: {{seo_title}}
seo_description: {{seo_description}}
seo_keywords: {{seo_keywords}}

---SOCIAL---
og_title: {{og_title}}
og_description: {{og_description}}
twitter_title: {{twitter_title}}
twitter_description: {{twitter_description}}

---END---`;
    }

    // Fallback for faq if not loaded
    if (!template && templateId === 'faq') {
      template = `Generate a set of FAQ (Frequently Asked Questions) for a resource with the following details. Each FAQ should be relevant, helpful, and written in a natural conversational tone.

**Title:** {{title}}

**Introduction:** {{intro_text}}

**Main Content:** {{text_content}}

**Features:**
{{features}}

**Categories:** {{available_taxonomies}}

Please generate 5-8 FAQ pairs that a user might ask about this resource. Use the EXACT format below.

---FAQ_ITEMS---
Q: [Question about the resource]
A: [Clear, helpful answer]

Q: [Another question]
A: [Clear, helpful answer]

---END---

**Guidelines:**
- Questions should be natural and reflect what real users would ask
- Answers should be concise but comprehensive (2-4 sentences)
- Cover topics like: what it is, how to use it, compatibility, customization, licensing
- If existing FAQ data is provided above, improve and expand upon it

**Existing FAQ data:**
{{faq_items}}`;
    }

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
      template = template.split(placeholder).join(value);
    }

    return template;
  };

  const copyPrompt = async (templateId: 'ai-fill' | 'featured-image' | 'faq') => {
    try {
      await navigator.clipboard.writeText(generatePrompt(templateId));
      setCopiedPrompt(templateId);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  // --- Response parsing ---

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
              .filter((t: Term) => selectedNames.includes(t.name.toLowerCase()))
              .map((t: Term) => t.id);
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
                  const matched = formatTerms.find((t: Term) => t.name.toLowerCase() === formatName);
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

      // Parse SEO and Social fields into a single object to avoid state race condition
      const updatedSeo = { ...seoData };
      let seoFieldsUpdated = false;

      // Parse SEO fields
      const seoMatch = content.match(/---SEO---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (seoMatch) {
        const seoContent = seoMatch[1];

        const seoTitleMatch = seoContent.match(/seo_title:\s*(.+)/i);
        if (seoTitleMatch && seoTitleMatch[1].trim() && !seoTitleMatch[1].includes('[')) {
          updatedSeo.title = seoTitleMatch[1].trim();
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }

        const seoDescMatch = seoContent.match(/seo_description:\s*(.+)/i);
        if (seoDescMatch && seoDescMatch[1].trim() && !seoDescMatch[1].includes('[')) {
          updatedSeo.description = seoDescMatch[1].trim();
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }

        const seoKeywordsMatch = seoContent.match(/seo_keywords:\s*(.+)/i);
        if (seoKeywordsMatch && seoKeywordsMatch[1].trim() && !seoKeywordsMatch[1].includes('[')) {
          updatedSeo.targetKeywords = seoKeywordsMatch[1].trim();
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }
      }

      // Parse Social fields (continues building on the same updatedSeo object)
      const socialMatch = content.match(/---SOCIAL---\s*([\s\S]*?)(?=---[A-Z_]+---|$)/);
      if (socialMatch) {
        const socialContent = socialMatch[1];

        const ogTitleMatch = socialContent.match(/og_title:\s*(.+)/i);
        if (ogTitleMatch && ogTitleMatch[1].trim() && !ogTitleMatch[1].includes('[')) {
          updatedSeo.og = { ...updatedSeo.og, title: ogTitleMatch[1].trim() };
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }

        const ogDescMatch = socialContent.match(/og_description:\s*(.+)/i);
        if (ogDescMatch && ogDescMatch[1].trim() && !ogDescMatch[1].includes('[')) {
          updatedSeo.og = { ...updatedSeo.og, description: ogDescMatch[1].trim() };
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }

        const twitterTitleMatch = socialContent.match(/twitter_title:\s*(.+)/i);
        if (twitterTitleMatch && twitterTitleMatch[1].trim() && !twitterTitleMatch[1].includes('[')) {
          updatedSeo.twitter = { ...updatedSeo.twitter, title: twitterTitleMatch[1].trim() };
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }

        const twitterDescMatch = socialContent.match(/twitter_description:\s*(.+)/i);
        if (twitterDescMatch && twitterDescMatch[1].trim() && !twitterDescMatch[1].includes('[')) {
          updatedSeo.twitter = { ...updatedSeo.twitter, description: twitterDescMatch[1].trim() };
          fieldsUpdated++;
          seoFieldsUpdated = true;
        }
      }

      // Parse FAQ Items
      const faqMatch = content.match(/---FAQ_ITEMS---\s*([\s\S]*?)(?=---[A-Z_]+---|---END---|$)/);
      if (faqMatch && faqMatch[1].trim()) {
        const faqContent = faqMatch[1].trim();
        const faqPairs: Array<{ question: string; answer: string }> = [];

        // Split on "Q:" to get individual FAQ entries
        const faqEntries = faqContent.split(/(?=Q:)/i).filter(Boolean);
        faqEntries.forEach(entry => {
          const qMatch = entry.match(/Q:\s*(.+)/i);
          const aMatch = entry.match(/A:\s*([\s\S]*?)$/i);
          if (qMatch && aMatch && qMatch[1].trim() && aMatch[1].trim()) {
            faqPairs.push({
              question: qMatch[1].trim(),
              answer: aMatch[1].trim(),
            });
          }
        });

        if (faqPairs.length > 0) {
          console.log('Parsed FAQ items:', faqPairs);
          updatedMeta.faq_group = faqPairs;
          fieldsUpdated++;
        }
      }

      // Apply all SEO + Social updates in a single setState call
      if (seoFieldsUpdated) {
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

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Copy Prompt Buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ai-fill' as const, label: 'AI Fill', icon: Sparkles, style: 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600' },
          { id: 'featured-image' as const, label: 'Image', icon: ImageIcon, style: 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600' },
          { id: 'faq' as const, label: 'FAQ', icon: HelpCircle, style: 'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600' },
        ].map(({ id, label, icon: Icon, style }) => (
          <button
            key={id}
            onClick={() => copyPrompt(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all hover:shadow-sm',
              copiedPrompt === id
                ? 'bg-green-600 text-white dark:bg-green-700'
                : style
            )}
          >
            {copiedPrompt === id ? (
              <Check className="w-4 h-4" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            {copiedPrompt === id ? 'Copied!' : label}
          </button>
        ))}
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Copy a prompt above → Paste into ChatGPT/Claude → Paste the response below → Click Apply
        </p>
      </div>

      {/* Paste Response */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
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
            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
        )}
      >
        <Wand2 className="w-4 h-4" />
        Apply AI Response to Fields
      </button>
    </div>
  );
}

// Self-register as a plugin tab
registerPluginTab('ai', AIFillTab);

export default AIFillTab;
