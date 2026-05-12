/**
 * Prompt templates.
 *
 * Built-in generic defaults ship with the app (lib/prompt-template-defaults.ts).
 * User templates live in the user prompt templates dir
 * (~/.juggernaut/prompt-templates/<id>/template.md, override with
 * JUGGERNAUT_CONFIG_DIR). Saving writes there, with a timestamped backup
 * (template-<ISO>.md) of the previous version alongside. Nothing is ever
 * written to the app/repo directory.
 */

import fs from 'fs';
import path from 'path';
import { getUserPromptTemplatesDir } from './user-config-dir';
import { getBuiltInTemplate } from './prompt-template-defaults';

/** Resolved per call so the user config dir can change (tests). */
function templatesDir(): string {
  return getUserPromptTemplatesDir();
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  updatedAt: string;
}

export interface TemplateVersion {
  filename: string;
  timestamp: string;
  displayDate: string;
}

// Template metadata
const TEMPLATE_META: Record<string, { name: string; description: string }> = {
  'ai-fill': {
    name: 'AI Fill',
    description: 'Main prompt for generating post content via AI',
  },
  'featured-image': {
    name: 'Featured Image',
    description: 'Prompt for generating featured image descriptions or prompts',
  },
  'faq': {
    name: 'FAQ',
    description: 'Prompt for generating FAQ question and answer pairs',
  },
};

/**
 * Ensure the templates directory and subdirectories exist
 */
function ensureDirectories(): void {
  if (!fs.existsSync(templatesDir())) {
    fs.mkdirSync(templatesDir(), { recursive: true });
  }

  for (const templateId of Object.keys(TEMPLATE_META)) {
    const templateDir = path.join(templatesDir(), templateId);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
  }
}

/**
 * Get the path to the main template file
 */
function getMainTemplatePath(templateId: string): string {
  return path.join(templatesDir(), templateId, 'template.md');
}

/**
 * Get the default content for a template (the built-in generic default).
 */
export function getDefaultTemplate(templateId: string): string {
  return getBuiltInTemplate(templateId);
}

/**
 * Get a template by ID
 */
export function getTemplate(templateId: string): PromptTemplate | null {
  ensureDirectories();

  const meta = TEMPLATE_META[templateId];
  if (!meta) return null;

  const templatePath = getMainTemplatePath(templateId);

  let content: string;
  let updatedAt: string;

  if (fs.existsSync(templatePath)) {
    content = fs.readFileSync(templatePath, 'utf-8');
    const stats = fs.statSync(templatePath);
    updatedAt = stats.mtime.toISOString();
  } else {
    // Return default template
    content = getDefaultTemplate(templateId);
    updatedAt = new Date().toISOString();
  }

  return {
    id: templateId,
    name: meta.name,
    description: meta.description,
    content,
    updatedAt,
  };
}

/**
 * Get all available templates
 */
export function getAllTemplates(): PromptTemplate[] {
  ensureDirectories();

  return Object.keys(TEMPLATE_META).map((id) => {
    const template = getTemplate(id);
    return template!;
  });
}

/**
 * Save a template (creates timestamped backup)
 */
export function saveTemplate(templateId: string, content: string): PromptTemplate {
  ensureDirectories();

  const meta = TEMPLATE_META[templateId];
  if (!meta) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const templateDir = path.join(templatesDir(), templateId);
  const mainPath = getMainTemplatePath(templateId);

  // Create timestamped backup if main file exists
  if (fs.existsSync(mainPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(templateDir, `template-${timestamp}.md`);
    const currentContent = fs.readFileSync(mainPath, 'utf-8');
    fs.writeFileSync(backupPath, currentContent, 'utf-8');
  }

  // Save main template
  fs.writeFileSync(mainPath, content, 'utf-8');

  return {
    id: templateId,
    name: meta.name,
    description: meta.description,
    content,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get all versions of a template (including current)
 */
export function getTemplateVersions(templateId: string): TemplateVersion[] {
  ensureDirectories();

  const templateDir = path.join(templatesDir(), templateId);
  if (!fs.existsSync(templateDir)) {
    return [];
  }

  const files = fs.readdirSync(templateDir);
  const versions: TemplateVersion[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(templateDir, file);
    const stats = fs.statSync(filePath);

    if (file === 'template.md') {
      versions.push({
        filename: file,
        timestamp: stats.mtime.toISOString(),
        displayDate: 'Current',
      });
    } else {
      // Parse timestamp from filename: template-2024-01-15T10-30-00-000Z.md
      const match = file.match(/template-(.+)\.md$/);
      if (match) {
        const timestamp = match[1].replace(/-/g, (m, offset) => {
          // Restore colons and dots in ISO timestamp
          if (offset === 13 || offset === 16) return ':';
          if (offset === 19) return '.';
          return m;
        });
        versions.push({
          filename: file,
          timestamp: stats.mtime.toISOString(),
          displayDate: new Date(stats.mtime).toLocaleString(),
        });
      }
    }
  }

  // Sort by timestamp, newest first
  versions.sort((a, b) => {
    if (a.filename === 'template.md') return -1;
    if (b.filename === 'template.md') return 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return versions;
}

/**
 * Get content of a specific version
 */
export function getTemplateVersion(templateId: string, filename: string): string | null {
  const templateDir = path.join(templatesDir(), templateId);
  const filePath = path.join(templateDir, path.basename(filename));

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Restore a previous version (saves current as backup first)
 */
export function restoreTemplateVersion(templateId: string, filename: string): PromptTemplate {
  const content = getTemplateVersion(templateId, filename);
  if (!content) {
    throw new Error(`Version not found: ${filename}`);
  }

  return saveTemplate(templateId, content);
}

/**
 * Reset template to default
 */
export function resetTemplate(templateId: string): PromptTemplate {
  const defaultContent = getDefaultTemplate(templateId);
  return saveTemplate(templateId, defaultContent);
}

/**
 * Available placeholder tags (for documentation)
 */
export const PLACEHOLDER_TAGS = [
  { tag: '{{title}}', description: 'Resource title' },
  { tag: '{{intro_text}}', description: 'Introduction paragraph' },
  { tag: '{{text_content}}', description: 'Main content text' },
  { tag: '{{features}}', description: 'Feature list (formatted)' },
  { tag: '{{available_taxonomies}}', description: 'All taxonomy options' },
  { tag: '{{taxonomy_selections}}', description: 'Selected taxonomy template' },
  { tag: '{{timer_enabled}}', description: 'Timer enabled (yes/no)' },
  { tag: '{{timer_title}}', description: 'Timer title text' },
  { tag: '{{timer_datetime}}', description: 'Timer date/time' },
  { tag: '{{downloads}}', description: 'Download sections (formatted)' },
  { tag: '{{changelog}}', description: 'Changelog entries (formatted)' },
  { tag: '{{seo_title}}', description: 'SEO title (max 60 chars)' },
  { tag: '{{seo_description}}', description: 'Meta description (max 160 chars)' },
  { tag: '{{seo_keywords}}', description: 'Target keywords (comma-separated)' },
  { tag: '{{og_title}}', description: 'Facebook/OG title' },
  { tag: '{{og_description}}', description: 'Facebook/OG description' },
  { tag: '{{twitter_title}}', description: 'Twitter/X title' },
  { tag: '{{twitter_description}}', description: 'Twitter/X description' },
  { tag: '{{faq_items}}', description: 'FAQ question/answer pairs (formatted)' },
];
