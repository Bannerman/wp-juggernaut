/**
 * Built-in default prompt templates.
 *
 * Generic, site-agnostic starting points shipped with the app. Users replace
 * them by editing a template in Settings > Prompts; edits are saved to the
 * user prompt templates dir (~/.juggernaut/prompt-templates/<id>/template.md),
 * never to the app directory. Pure module (no fs) so client components can
 * import it as a fallback.
 */

export type PromptTemplateId = 'ai-fill' | 'featured-image' | 'faq';

const AI_FILL_DEFAULT = `Please provide content for a {{post_type_label}} titled "{{title}}". Use the EXACT format below with the field markers. Output ONLY the section markers and your filled-in values, in the same order.

---TITLE---
{{title}}

---INTRO_TEXT---
{{intro_text}}

---TEXT_CONTENT---
{{text_content}}

---TAXONOMIES---

# Classification rules
- Pick the FEWEST terms that accurately classify this post. Quality over quantity.
- LEAVE A TAXONOMY EMPTY if no listed term clearly applies. Empty is a valid answer.
- Use ONLY the EXACT term names from the available lists. No inventing, no synonyms.
- Do NOT pick a term just because its name appears in the title or content.

Available terms:
{{available_taxonomies}}

# Output format

Output one line per taxonomy below (slug, a colon, then comma-separated term names). If nothing fits a taxonomy, output the slug followed by a colon and nothing else:

{{taxonomy_selections}}

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

const FEATURED_IMAGE_DEFAULT = `Create a featured image for a blog post with the following information.

Title: {{title}}
What the post is about: {{intro_text}}
Topics: {{post_taxonomies}}

Make it eye-catching and on-brand for a modern professional blog. Use bright, high-contrast colors. Feel free to incorporate the post title or a short key phrase as bold display text within the image where it strengthens the design. Style: clean modern editorial illustration; confident and engaging, not generic stock photography.`;

const FAQ_DEFAULT = `Generate a set of FAQ (Frequently Asked Questions) about the TOPIC or SUBJECT this post is about.

Use the post's title, topics, and intro to identify the underlying subject, then write FAQs that someone interested in that subject would naturally ask.

**Post info:**
Title: {{title}}
Topics: {{post_taxonomies}}
Intro: {{intro_text}}

Please generate 5-8 FAQ pairs. Use the EXACT format below.

---FAQ_ITEMS---
Q: [Question about the subject]
A: [Factual, concise answer, 2-4 sentences]

Q: [Another question]
A: [Answer]

---END---

**Guidelines:**
- Focus on the subject itself: key facts, context, common questions, common misconceptions.
- Answers must be factually grounded. If you don't know a specific fact, omit that question rather than inventing.
- If existing FAQ data is provided below, use it as a starting point and improve it.

**Existing FAQ data:**
{{faq_items}}`;

const GENERIC_DEFAULT = `# {{title}}

{{intro_text}}

{{text_content}}

{{features}}

{{available_taxonomies}}

{{taxonomy_selections}}

{{changelog}}`;

/**
 * Get the built-in default content for a template.
 */
export function getBuiltInTemplate(templateId: string): string {
  switch (templateId) {
    case 'ai-fill':
      return AI_FILL_DEFAULT;
    case 'featured-image':
      return FEATURED_IMAGE_DEFAULT;
    case 'faq':
      return FAQ_DEFAULT;
    default:
      return GENERIC_DEFAULT;
  }
}
