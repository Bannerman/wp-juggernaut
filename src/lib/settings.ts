import { getDb } from './db';

export interface AppSettings {
  ai_prompt_template: string;
}

const DEFAULT_AI_PROMPT_TEMPLATE = `Please provide content for a resource titled "{{title}}" with the following fields. Use the EXACT format below with the field markers.

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

const DEFAULTS: AppSettings = {
  ai_prompt_template: DEFAULT_AI_PROMPT_TEMPLATE,
};

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(`setting_${key}`) as { value: string } | undefined;

  if (!row) {
    return DEFAULTS[key];
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value as AppSettings[K];
  }
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  const db = getDb();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run(`setting_${key}`, serialized);
}

export function getAllSettings(): AppSettings {
  return {
    ai_prompt_template: getSetting('ai_prompt_template'),
  };
}

export function resetSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const db = getDb();
  db.prepare('DELETE FROM sync_meta WHERE key = ?').run(`setting_${key}`);
  return DEFAULTS[key];
}

export function getDefaultPromptTemplate(): string {
  return DEFAULT_AI_PROMPT_TEMPLATE;
}
