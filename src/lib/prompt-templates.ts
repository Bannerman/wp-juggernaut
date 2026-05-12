import fs from 'fs';
import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'prompt-templates');

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
    description: 'Main prompt for generating resource content via AI',
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
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  for (const templateId of Object.keys(TEMPLATE_META)) {
    const templateDir = path.join(TEMPLATES_DIR, templateId);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
  }
}

/**
 * Get the path to the main template file
 */
function getMainTemplatePath(templateId: string): string {
  return path.join(TEMPLATES_DIR, templateId, 'template.md');
}

/**
 * Get the default content for a template
 */
export function getDefaultTemplate(templateId: string): string {
  if (templateId === 'ai-fill') {
    return `Please provide content for a resource titled "{{title}}". Use the EXACT format below with the field markers — output ONLY the section markers and your filled-in values, in the same order.

---TITLE---
{{title}}

---INTRO_TEXT---
{{intro_text}}

---TEXT_CONTENT---
{{text_content}}

---FEATURES---
{{features}}

---TAXONOMIES---

# Classification rules — read carefully, these override your default tendencies
- Pick the FEWEST terms that accurately classify this post. Quality over quantity.
- LEAVE A TAXONOMY EMPTY if no listed term clearly applies. Empty is a valid answer.
- Use ONLY the EXACT term names from the available lists — no inventing, no synonyms.
- Do NOT pick a term just because its name appears in the title or content.
- Each taxonomy has a strict pick count — never exceed it. Pick fewer when in doubt.

## Q1: FORMAT — what is the user actually getting? (resource-type, pick exactly 1)
Available: {{terms_resource-type}}

Decision rules:
- Bracket = a tournament/competition structure
- Tracker = ongoing data entry over time (workout log, expense tracker, draft tracker)
- Calculator = formula-driven output (mortgage calc, calorie calc)
- Checklist = a task list with checkboxes
- Spreadsheet = one-time data organization or reference (NOT ongoing tracking)
- Slide Deck = a presentation file
- Poster = a printable reference or wall display
- Document = a fillable form, contract, or long-form text
- Worksheet = a single-use activity sheet (especially for students)
- Lesson Plan = a teaching resource with activities

## Q2: DOMAIN — what would someone search for? (topic, pick 1-3, primary first)
Available: {{terms_topic}}

The first term you list is treated as the primary topic (used in URL/breadcrumb). For sports posts, the primary should usually be the sport itself (Football, Basketball, etc.); add Sports as secondary only if useful. Drill down to the most specific applicable term — don't pick both a parent and a child unless both add information.

## Q3: LEAGUE — only if the post is tied to a specific pro league (leagues, pick 0-2)
Available: {{terms_leagues}}

LEAVE EMPTY for generic brackets (any-league templates), multi-sport events (Olympics), or non-sports posts.

## Q4: INTENT — what job is the user trying to accomplish? (intent, pick 1-3)
Available: {{terms_intent}}

Definitions:
- Plan = prepare, schedule, or organize future activities
- Track = record and monitor ongoing data
- Compete = run or participate in competitions
- Manage = oversee operations, teams, or projects
- Analyze = review data, calculate, or evaluate
- Learn = understand concepts or acquire skills

## Q5: AUDIENCE — only if specifically designed for a professional role (audience, pick 0-2, DEFAULT EMPTY)
Available: {{terms_audience}}

Pick a term ONLY if the resource is explicitly built for that role's professional workflow — not just because the role might use it. Most resources are general-consumer; for those, output empty. Examples where audience IS appropriate: a Lesson Plan for \`teachers\`, a Tournament Director Run-of-Show for \`tournament-directors\`. Examples where audience is NOT appropriate: a generic NFL Draft Tracker (sports fans, not professionals).

## Q6: BRACKET SIZE — only if the resource-type is Bracket (bracket-size, pick exactly 1 if applicable)
Available: {{terms_bracket-size}}

Empty if the post is not a bracket.

## Q7: COMPETITION FORMAT — only if the post organizes a tournament (competition_format, pick exactly 1 if applicable)
Available: {{terms_competition_format}}

Empty if the post does not organize a competition.

# Output format

Output one line per taxonomy below. If nothing fits a taxonomy, output the slug followed by a colon and nothing else. Use the slugs exactly as written:

resource-type:
topic:
leagues:
intent:
audience:
bracket-size:
competition_format:

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

**Link text rule (default):** keep link text formulaic — \`Download the [Format] version\` (e.g. \`Download the Google Sheet version\`, \`Download the Excel version\`, \`Download the PDF version\`). Do NOT invent custom marketing copy. Custom link text is OPTIONAL — only use a custom phrase if the existing data already has one and you're preserving it. When in doubt, use the formulaic default.

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

  if (templateId === 'featured-image') {
    return `Create a featured image for a blog post with the following information.

Title: {{title}}
What the post is about: {{intro_text}}
Topics: {{post_taxonomies}}

Make it eye-catching and on-brand for a modern professional blog. Use bright, high-contrast colors. Feel free to incorporate the post title or a short key phrase as bold display text within the image where it strengthens the design. Style: clean modern editorial illustration — confident and engaging, not generic stock photography.`;
  }

  if (templateId === 'faq') {
    return `Generate a set of FAQ (Frequently Asked Questions) about the EVENT, TOPIC, or SUBJECT this post is about — NOT about the post/resource itself.

Use the post's title, topics, and intro to identify the underlying subject (e.g. a specific UFC event, a championship, a financial concept, an educational topic), then research and write FAQs that someone interested in that subject would naturally ask.

**Post info (use this to identify the subject — do NOT make the FAQ about the post itself):**
Title: {{title}}
Topics: {{post_taxonomies}}
Intro: {{intro_text}}

Please generate 5-8 FAQ pairs about the underlying subject. Use the EXACT format below.

---FAQ_ITEMS---
Q: [Question about the SUBJECT — when, who, what, why, where, how it ended]
A: [Factual, concise answer about the subject — 2–4 sentences]

Q: [Another question]
A: [Answer]

---END---

**Guidelines:**
- Focus on the SUBJECT itself: dates, participants, results, context, history, key facts.
- DO NOT ask "how do I use this bracket/tracker/template" — those are about the resource, not the subject. Skip them entirely.
- For named events (UFC 327, Super Bowl LVIII, NHL Draft, etc.): when did it happen, who fought / played / competed, what was the main card, who won, where was it held, what was notable about it.
- For topical posts (Wedding Budget, Mortgage Calculator, etc.): what is the concept, common questions, key numbers / formulas, common misconceptions, why it matters.
- Answers must be factually grounded. If you don't know a specific fact, omit that question rather than inventing.
- If existing FAQ data is provided above, use it as a starting point and improve relevance to the subject.

**Existing FAQ data:**
{{faq_items}}`;
  }

  return `# {{title}}

{{intro_text}}

{{text_content}}

{{features}}

{{available_taxonomies}}

{{taxonomy_selections}}

{{changelog}}`;
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

  const templateDir = path.join(TEMPLATES_DIR, templateId);
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

  const templateDir = path.join(TEMPLATES_DIR, templateId);
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
  const templateDir = path.join(TEMPLATES_DIR, templateId);
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
