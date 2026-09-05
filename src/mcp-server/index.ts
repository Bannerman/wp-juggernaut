/**
 * Juggernaut MCP Server
 *
 * Model Context Protocol server for managing WordPress content
 * through Juggernaut's local SQLite database.
 *
 * Implements MCP (JSON-RPC 2.0 with Content-Length framing over stdio).
 * Only dependency beyond Node.js builtins is better-sqlite3 (already in project).
 *
 * Architecture note: This runs as a separate process from the Electron/Next.js app.
 * It opens its own SQLite connection to the same database file. WAL mode and
 * busy_timeout ensure safe concurrent access. The connection setup mirrors
 * src/lib/db.ts but does NOT run migrations — the database must already be
 * initialized by the main app (first sync).
 *
 * Database layer: Tool handlers accept a Database instance parameter for
 * testability. The patterns (meta JSON encoding, dirty tracking,
 * _dirty_taxonomies) match src/lib/queries.ts exactly.
 */

import type DatabaseType from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface PostRow {
  id: number;
  post_type: string;
  title: string;
  slug: string;
  status: string;
  content: string;
  excerpt: string;
  featured_media: number;
  date_gmt: string;
  modified_gmt: string;
  synced_at: string;
  is_dirty: number;
}

interface MetaRow {
  field_id: string;
  value: string;
}

interface TermJoinRow {
  taxonomy: string;
  id: number;
  name: string;
  slug: string;
}

interface PluginDataRow {
  plugin_id: string;
  data_key: string;
  data_value: string;
}

interface CountRow {
  count: number;
}

interface StatusCountRow {
  status: string;
  count: number;
}

interface TypeCountRow {
  post_type: string;
  count: number;
}

interface ChangeLogRow {
  id: number;
  post_id: number;
  field: string;
  old_value: string;
  new_value: string;
  changed_at: string;
}

interface TermRow {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

// Tool argument interfaces
interface ListPostsArgs {
  post_type?: string;
  status?: string;
  is_dirty?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

interface GetPostArgs {
  id: number;
}

interface UpdatePostArgs {
  id: number;
  title?: string;
  content?: string;
  excerpt?: string;
  slug?: string;
  status?: string;
  meta?: Record<string, unknown>;
}

interface CreatePostArgs {
  post_type: string;
  title: string;
  slug?: string;
  status?: string;
  content?: string;
  excerpt?: string;
  meta?: Record<string, unknown>;
  taxonomies?: Record<string, number[]>;
}

interface UpdateSeoArgs {
  post_id: number;
  title?: string;
  description?: string;
  canonical?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  noindex?: boolean;
  nofollow?: boolean;
}

interface ListTermsArgs {
  taxonomy?: string;
}

interface UpdatePostTermsArgs {
  post_id: number;
  taxonomy: string;
  term_ids: number[];
}

interface GetStatsArgs {
  post_type?: string;
}

interface GetPostHistoryArgs {
  post_id: number;
  limit?: number;
}

interface GetSiteIndexArgs {
  post_type?: string;
  status?: string;
}

interface SeoData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: { title: string; description: string; image: string };
  twitter: { title: string; description: string; image: string };
  robots: { noindex: boolean; nofollow: boolean; nosnippet: boolean; noimageindex: boolean };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['publish', 'draft', 'pending', 'private', 'trash', 'future']);
const BASIC_FIELDS = ['title', 'content', 'excerpt', 'slug', 'status'] as const;

const DEFAULT_SEO: SeoData = {
  title: '',
  description: '',
  canonical: '',
  targetKeywords: '',
  og: { title: '', description: '', image: '' },
  twitter: { title: '', description: '', image: '' },
  robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
};

// ─── Database ──────────────────────────────────────────────────────────────────

// Split-DB layout (see docs/v1.0-spec.md §16 "Split-DB Per Environment"):
// each env has its own file (posts, meta, terms, plugin_data, ...) and the
// project DB (juggernaut-project.db) holds cross-env planner tables. mcp-server
// opens the currently-active env DB and ATTACHes the project DB as `project`,
// so planner tables are addressed as `project.planner_ideas` etc.
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const SITE_CONFIG_PATH = path.join(os.homedir(), '.juggernaut', 'site-config.json');

function resolveActiveEnvId(): string {
  try {
    const raw = fs.readFileSync(SITE_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { activeTarget?: string };
    if (parsed?.activeTarget) return parsed.activeTarget;
  } catch {
    // Site config unreadable — fall back to 'local'.
  }
  return 'local';
}

function sanitizeEnvId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const ACTIVE_ENV_ID = resolveActiveEnvId();
const ENV_DB_PATH = process.env.DATABASE_PATH
  || path.join(DATA_DIR, `juggernaut-${sanitizeEnvId(ACTIVE_ENV_ID)}.db`);
const PROJECT_DB_PATH = path.join(DATA_DIR, 'juggernaut-project.db');
// Kept for the startup log message.
const DB_PATH = ENV_DB_PATH;

let dbInstance: DatabaseType.Database | null = null;

/**
 * Returns the singleton database connection. Opens the env DB and ATTACHes
 * the project DB as `project` so cross-DB transactions and joins work.
 * Mirrors src/lib/db.ts settings (WAL mode) with added busy_timeout for
 * multi-process safety.
 */
export function getDb(): DatabaseType.Database {
  if (!dbInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof DatabaseType;
    dbInstance = new Database(ENV_DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('busy_timeout = 5000');
    dbInstance.exec(`ATTACH DATABASE '${PROJECT_DB_PATH.replace(/'/g, "''")}' AS project`);
  }
  return dbInstance;
}

/** Close database and reset singleton. Used in tests. */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ─── Plugin Registry Check ────────────────────────────────────────────────────

/**
 * Check if the mcp-server plugin is enabled in plugin-registry.json.
 * Returns true only if explicitly enabled; false for disabled, missing, or unreadable.
 */
function isMcpPluginEnabled(): boolean {
  const registryPath = process.env.JUGGERNAUT_DATA_DIR
    ? path.join(process.env.JUGGERNAUT_DATA_DIR, 'data', 'plugin-registry.json')
    : path.resolve(__dirname, '..', '..', 'data', 'plugin-registry.json');

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content) as { plugins: Record<string, { enabled: boolean }> };
    return registry.plugins?.['mcp-server']?.enabled === true;
  } catch {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMeta(rows: MetaRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.field_id] = JSON.parse(row.value);
    } catch {
      result[row.field_id] = row.value;
    }
  }
  return result;
}

function groupTerms(rows: TermJoinRow[]): Record<string, Array<{ id: number; name: string; slug: string }>> {
  const result: Record<string, Array<{ id: number; name: string; slug: string }>> = {};
  for (const row of rows) {
    if (!result[row.taxonomy]) result[row.taxonomy] = [];
    result[row.taxonomy].push({ id: row.id, name: row.name, slug: row.slug });
  }
  return result;
}

function parsePluginData(rows: PluginDataRow[]): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!result[row.plugin_id]) result[row.plugin_id] = {};
    try {
      result[row.plugin_id][row.data_key] = JSON.parse(row.data_value);
    } catch {
      result[row.plugin_id][row.data_key] = row.data_value;
    }
  }
  return result;
}

function truncate(str: string, max = 200): string {
  return str.length > max ? str.substring(0, max) + '...' : str;
}

/** Escape SQL LIKE wildcards to prevent injection via search input. */
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ─── HTML Analysis Helpers ──────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities for plain text / word counting. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  const plain = stripHtml(text);
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const tag = match[1].toUpperCase();
    const text = stripHtml(match[2]);
    if (text) headings.push(`${tag}: ${text}`);
  }
  return headings;
}

interface ExtractedLinks {
  internal: string[];
  external: string[];
}

function extractLinks(html: string, siteSlug?: string): ExtractedLinks {
  const internal: string[] = [];
  const external: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    // Relative links or links to the same site are internal
    if (href.startsWith('/') || (siteSlug && href.includes(siteSlug))) {
      if (!internal.includes(href)) internal.push(href);
    } else if (href.startsWith('http')) {
      if (!external.includes(href)) external.push(href);
    }
  }
  return { internal, external };
}

function countImages(html: string): number {
  const matches = html.match(/<img\s/gi);
  return matches ? matches.length : 0;
}

function extractImagesMissingAlt(html: string): number {
  const re = /<img\s([^>]*)>/gi;
  let count = 0;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1];
    if (!attrs.includes('alt=') || /alt=["']\s*["']/i.test(attrs)) {
      count++;
    }
  }
  return count;
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateStatus(status: string): string | null {
  if (!VALID_STATUSES.has(status)) {
    return `Invalid status '${status}'. Must be one of: ${Array.from(VALID_STATUSES).join(', ')}`;
  }
  return null;
}

function validateTermIds(
  database: DatabaseType.Database,
  termIds: number[],
  taxonomy: string
): { valid: number[]; invalid: number[] } {
  const valid: number[] = [];
  const invalid: number[] = [];
  const stmt = database.prepare('SELECT id FROM terms WHERE id = ? AND taxonomy = ?');
  for (const id of termIds) {
    const row = stmt.get(id, taxonomy);
    if (row) valid.push(id);
    else invalid.push(id);
  }
  return { valid, invalid };
}

function validateTaxonomyHasTerms(database: DatabaseType.Database, taxonomy: string): boolean {
  const row = database.prepare(
    'SELECT COUNT(*) as count FROM terms WHERE taxonomy = ?'
  ).get(taxonomy) as CountRow;
  return row.count > 0;
}

// ─── Tool Definitions (JSON Schema) ───────────────────────────────────────────

const TOOLS: McpToolDef[] = [
  {
    name: 'list_posts',
    description:
      'List WordPress posts from the local Juggernaut database with optional filters. Returns post summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        post_type: { type: 'string', description: "Filter by post type slug (e.g., 'resource', 'post')" },
        status: {
          type: 'string',
          enum: ['publish', 'draft', 'pending', 'private', 'trash', 'future'],
          description: 'Filter by status',
        },
        is_dirty: { type: 'boolean', description: 'Filter by dirty flag (true = locally modified, pending push)' },
        search: { type: 'string', description: 'Search in title and content' },
        limit: { type: 'number', description: 'Max results to return (default: 50, max: 200)' },
        offset: { type: 'number', description: 'Pagination offset (default: 0)' },
      },
    },
  },
  {
    name: 'get_post',
    description: 'Get a single post with all its content, meta fields, taxonomy terms, and plugin data.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'WordPress post ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_post',
    description:
      'Create a new draft post locally. The post lives in the Juggernaut DB with a temporary negative ID and is marked dirty — it does NOT exist on WordPress until the user pushes from the app, at which point Juggernaut creates it on WP and renumbers to the real WP ID. Use the returned local_id to chain subsequent update_post / update_post_terms / update_seo calls.',
    inputSchema: {
      type: 'object',
      properties: {
        post_type: {
          type: 'string',
          description: "Post type slug (e.g., 'resource', 'post', 'page').",
        },
        title: { type: 'string', description: 'Post title (required).' },
        slug: { type: 'string', description: 'URL slug. Auto-generated by WP on push if omitted.' },
        status: {
          type: 'string',
          enum: ['publish', 'draft', 'pending', 'private'],
          description: "Post status. Defaults to 'draft'.",
        },
        content: { type: 'string', description: 'Post content (HTML).' },
        excerpt: { type: 'string', description: 'Post excerpt.' },
        meta: {
          type: 'object',
          description: 'Meta fields as key-value pairs. Values are JSON-encoded.',
        },
        taxonomies: {
          type: 'object',
          description: 'Map of taxonomy slug to array of term IDs (e.g., { "topic": [432] }).',
        },
      },
      required: ['post_type', 'title'],
    },
  },
  {
    name: 'update_post',
    description:
      "Update a post's fields and/or meta data. Marks the post as dirty (pending push to WordPress). Changes are logged.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'WordPress post ID to update' },
        title: { type: 'string', description: 'Post title' },
        content: { type: 'string', description: 'Post content (HTML)' },
        excerpt: { type: 'string', description: 'Post excerpt' },
        slug: { type: 'string', description: 'URL slug' },
        status: {
          type: 'string',
          enum: ['publish', 'draft', 'pending', 'private'],
          description: 'Post status',
        },
        meta: {
          type: 'object',
          description: 'Meta fields to update as key-value pairs. Values are stored as JSON.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_seo',
    description:
      'Update SEO metadata for a post (title, description, Open Graph, robots). Stored as SEOPress plugin data.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'number', description: 'WordPress post ID' },
        title: { type: 'string', description: 'SEO title' },
        description: { type: 'string', description: 'SEO meta description' },
        canonical: { type: 'string', description: 'Canonical URL' },
        og_title: { type: 'string', description: 'Open Graph title' },
        og_description: { type: 'string', description: 'Open Graph description' },
        og_image: { type: 'string', description: 'Open Graph image URL' },
        noindex: { type: 'boolean', description: 'Set noindex' },
        nofollow: { type: 'boolean', description: 'Set nofollow' },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'list_terms',
    description: 'List taxonomy terms. Can list all terms or filter by a specific taxonomy.',
    inputSchema: {
      type: 'object',
      properties: {
        taxonomy: {
          type: 'string',
          description: "Taxonomy slug to filter by (e.g., 'category', 'resource-type'). Omit to list all.",
        },
      },
    },
  },
  {
    name: 'update_post_terms',
    description:
      'Set taxonomy terms for a post. Replaces all existing terms for the specified taxonomy. Marks the post as dirty.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'number', description: 'WordPress post ID' },
        taxonomy: { type: 'string', description: "Taxonomy slug (e.g., 'category', 'resource-type')" },
        term_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of term IDs to assign',
        },
      },
      required: ['post_id', 'taxonomy', 'term_ids'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get overview statistics about posts in the local database.',
    inputSchema: {
      type: 'object',
      properties: {
        post_type: { type: 'string', description: 'Filter stats by post type' },
      },
    },
  },
  {
    name: 'get_post_history',
    description: 'View the change log for a specific post. Shows what fields were changed, with old and new values.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'number', description: 'WordPress post ID' },
        limit: { type: 'number', description: 'Max entries to return (default: 20)' },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'get_site_index',
    description:
      'Get a lightweight, analysis-ready snapshot of every post. Returns structured metadata per post: word count, headings, internal/external links, image count, SEO data, taxonomy terms. Designed for bulk content auditing — no full HTML content, so the response fits all posts in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        post_type: { type: 'string', description: "Filter by post type (e.g., 'resource', 'post', 'product'). Omit for all types." },
        status: {
          type: 'string',
          enum: ['publish', 'draft', 'pending', 'private', 'trash', 'future'],
          description: "Filter by status. Defaults to 'publish' if omitted.",
        },
      },
    },
  },
  // ── Content Planner tools ──
  {
    name: 'planner_list_ideas',
    description:
      'List planner ideas with optional filters (status, cluster, deadline_before). Planner ideas are pre-publication content plans tracked in the Juggernaut DB; they live separately from WP posts until promoted.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['idea', 'researching', 'drafting', 'ready', 'published'] },
        cluster: { type: 'string', description: 'Filter to a single cluster tag (e.g. "office-pools")' },
        deadline_before: { type: 'string', description: 'ISO date; return ideas whose deadline is on or before this date' },
        limit: { type: 'number', description: 'Default 100, max 500' },
      },
    },
  },
  {
    name: 'planner_get_idea',
    description: 'Get a single planner idea by ID, plus all its typed research entries.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'planner_create_idea',
    description:
      'Create a planner idea with optional rich planning fields and an initial batch of research entries. This is the primary way for an agent to fill the planner in one pass. Term IDs (resource_type_term_id, topic_term_ids, audience_term_ids) reference rows in the local `terms` table synced from WordPress; use list_terms first to discover IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        status: { type: 'string', enum: ['idea', 'researching', 'drafting', 'ready', 'published'], description: "Defaults to 'idea'." },
        description: { type: 'string', description: '2-4 sentence elevator pitch: what is this template + why best-in-class.' },
        notes: { type: 'string', description: 'Free scratch.' },
        deadline: { type: 'string', description: 'ISO date.' },
        frequency: { type: 'string', enum: ['annual', 'seasonal', 'quarterly', 'once'], description: 'Publish/refresh cycle. Renamed from refresh_cadence in v7.' },
        refresh_cadence: { type: 'string', enum: ['annual', 'seasonal', 'quarterly', 'once'], description: 'Deprecated alias for `frequency`. New code should use `frequency`.' },
        refresh_next_due: { type: 'string', description: 'ISO date for the next refresh.' },
        cluster: { type: 'string', description: 'Free-form cluster tag (e.g. "office-pools").' },
        priority: { type: 'number', description: 'Integer 1-10.' },
        estimated_effort_hours: { type: 'number' },
        schema_types: { type: 'array', items: { type: 'string' }, description: 'e.g. ["HowTo", "FAQPage"].' },
        monetization_angles: { type: 'array', items: { type: 'string' }, description: 'e.g. ["ads", "email_capture", "affiliate"].' },
        serp_targets: { type: 'array', items: { type: 'string' }, description: 'e.g. ["featured_snippet", "paa", "image_pack"].' },
        audience_personas: { type: 'array', items: { type: 'string' }, description: 'Free-form personas. Deprecated in favor of audience_term_ids; kept for back-compat.' },
        resource_type_term_id: { type: 'number', description: 'Single term ID from the `resource-type` taxonomy (e.g. brackets, spreadsheets, slide decks).' },
        topic_term_ids: { type: 'array', items: { type: 'number' }, description: 'Term IDs from the `topic` taxonomy. These are the PLEXKITS tags.' },
        audience_term_ids: { type: 'array', items: { type: 'number' }, description: 'Term IDs from the `audience` taxonomy.' },
        research_entries: {
          type: 'array',
          description: 'Initial batch of typed research findings to seed the log.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['seo', 'structure', 'audience', 'competitor', 'internal_linking', 'monetization', 'schema_markup', 'serp_features', 'publishing', 'templates', 'legal_compliance', 'tech_notes'],
              },
              content: { type: 'string' },
              source_url: { type: 'string' },
            },
            required: ['type', 'content'],
          },
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'planner_update_idea',
    description: 'Patch a planner idea. Any field omitted is left untouched. Pass null to clear nullable fields.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        status: { type: 'string', enum: ['idea', 'researching', 'drafting', 'ready', 'published'] },
        description: { type: 'string' },
        notes: { type: 'string' },
        deadline: { type: 'string' },
        frequency: { type: 'string', enum: ['annual', 'seasonal', 'quarterly', 'once'] },
        refresh_cadence: { type: 'string', enum: ['annual', 'seasonal', 'quarterly', 'once'], description: 'Deprecated alias for `frequency`.' },
        refresh_next_due: { type: 'string' },
        cluster: { type: 'string' },
        priority: { type: 'number' },
        estimated_effort_hours: { type: 'number' },
        schema_types: { type: 'array', items: { type: 'string' } },
        monetization_angles: { type: 'array', items: { type: 'string' } },
        serp_targets: { type: 'array', items: { type: 'string' } },
        audience_personas: { type: 'array', items: { type: 'string' }, description: 'Deprecated. Use audience_term_ids.' },
        resource_type_term_id: { type: 'number', description: 'Single term ID from the `resource-type` taxonomy.' },
        topic_term_ids: { type: 'array', items: { type: 'number' }, description: 'Term IDs from the `topic` taxonomy.' },
        audience_term_ids: { type: 'array', items: { type: 'number' }, description: 'Term IDs from the `audience` taxonomy.' },
        promoted_post_id: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'planner_add_research_entry',
    description: 'Append a typed research finding to an idea. Use to log SEO angles, competitor checks, schema decisions, audience notes, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        idea_id: { type: 'number' },
        type: {
          type: 'string',
          enum: ['seo', 'structure', 'audience', 'competitor', 'internal_linking', 'monetization', 'schema_markup', 'serp_features', 'publishing', 'templates', 'legal_compliance', 'tech_notes'],
        },
        content: { type: 'string', description: 'Concrete finding. Be specific.' },
        source_url: { type: 'string', description: 'Optional URL backing the finding.' },
      },
      required: ['idea_id', 'type', 'content'],
    },
  },
  {
    name: 'planner_list_keywords',
    description: 'List planner keywords with optional substring search and a gap-only filter (returns only keywords with no target_post_id).',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'LIKE substring on term.' },
        gap_only: { type: 'boolean', description: 'Only return keywords without a target post yet.' },
        limit: { type: 'number', description: 'Default 200, max 1000.' },
      },
    },
  },
  {
    name: 'planner_create_term',
    description:
      'Create a pending taxonomy term that does not yet exist on WordPress. Returns a row with a negative ID that can be used directly in planner_create_idea / planner_update_idea (in resource_type_term_id, topic_term_ids, audience_term_ids). On a future promote-to-draft, pending terms get created on WP and the negative ID gets renumbered to the real WP term ID. Use this when the desired taxonomy term does not appear in list_terms.',
    inputSchema: {
      type: 'object',
      properties: {
        taxonomy: { type: 'string', description: "Taxonomy slug, e.g. 'audience', 'topic', 'resource-type'." },
        name: { type: 'string', description: 'Human-readable term name. WP slug will be generated on promote unless `slug` is also provided.' },
        slug: { type: 'string', description: 'Optional slug override.' },
        parent_id: { type: 'number', description: 'Parent term ID for hierarchical taxonomies. May reference a synced WP term (positive) or another pending term (negative).' },
      },
      required: ['taxonomy', 'name'],
    },
  },
  {
    name: 'planner_list_terms',
    description:
      'List pending planner terms (taxonomy terms created locally that have not been promoted to WordPress yet). Use to discover the negative IDs that may already be referenced by planner_ideas.',
    inputSchema: {
      type: 'object',
      properties: {
        taxonomy: { type: 'string', description: 'Filter to a single taxonomy slug.' },
      },
    },
  },
  {
    name: 'planner_upsert_keyword',
    description: 'Insert a new planner keyword, or update an existing one keyed by term. Returns {keyword, created:bool}.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string' },
        volume: { type: 'number' },
        target_post_id: { type: 'number', description: 'WP post ID this keyword maps to. Omit to leave the row as a gap.' },
        notes: { type: 'string' },
      },
      required: ['term'],
    },
  },
];

// ─── Tool Handlers ─────────────────────────────────────────────────────────────
// Each handler accepts a Database instance for testability.

export function listPosts(database: DatabaseType.Database, args: ListPostsArgs): Record<string, unknown> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (args.post_type) {
    conditions.push('post_type = ?');
    values.push(args.post_type);
  }
  if (args.status) {
    const err = validateStatus(args.status);
    if (err) return { error: err };
    conditions.push('status = ?');
    values.push(args.status);
  }
  if (args.is_dirty !== undefined) {
    conditions.push('is_dirty = ?');
    values.push(args.is_dirty ? 1 : 0);
  }
  if (args.search) {
    conditions.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
    const escaped = `%${escapeLike(args.search)}%`;
    values.push(escaped, escaped);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(args.limit || 50, 1), 200);
  const offset = Math.max(args.offset || 0, 0);

  const total = (database.prepare(`SELECT COUNT(*) as count FROM posts ${where}`).get(...values) as CountRow).count;
  const posts = database
    .prepare(
      `SELECT id, title, slug, status, post_type, is_dirty, modified_gmt, date_gmt
       FROM posts ${where} ORDER BY modified_gmt DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as PostRow[];

  return { total, count: posts.length, limit, offset, posts };
}

export function getPost(database: DatabaseType.Database, args: GetPostArgs): Record<string, unknown> {
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(args.id) as PostRow | undefined;
  if (!post) return { error: `Post ${args.id} not found` };

  const meta = database
    .prepare('SELECT field_id, value FROM post_meta WHERE post_id = ?')
    .all(args.id) as MetaRow[];

  const terms = database
    .prepare(
      `SELECT pt.taxonomy, t.id, t.name, t.slug
       FROM post_terms pt
       JOIN terms t ON pt.term_id = t.id AND pt.taxonomy = t.taxonomy
       WHERE pt.post_id = ?`
    )
    .all(args.id) as TermJoinRow[];

  const pluginRows = database
    .prepare('SELECT plugin_id, data_key, data_value FROM plugin_data WHERE post_id = ?')
    .all(args.id) as PluginDataRow[];

  return {
    ...post,
    is_dirty: post.is_dirty === 1,
    meta: parseMeta(meta),
    terms: groupTerms(terms),
    plugin_data: parsePluginData(pluginRows),
  };
}

/**
 * Create a new local-only post stub. The post lives in SQLite with a synthetic
 * negative ID and is_dirty=1; the push engine creates it on WordPress and
 * renumbers to the real WP ID on the next push. This is the only handler in
 * the MCP server that doesn't have a corresponding WP REST call — by design,
 * because the MCP server runs outside the Electron process and doesn't have
 * WP credentials.
 */
/**
 * Lowercase the title, replace runs of non-alphanumeric chars with single
 * hyphens, trim leading/trailing hyphens. Matches WordPress's sanitize_title
 * for ASCII input; non-ASCII falls back to a hyphen which is the same shape
 * WP would produce after percent-decode + strip. Empty result falls back to
 * 'post' so we always have something for the eye-icon URL.
 */
function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}

export function createPost(database: DatabaseType.Database, args: CreatePostArgs): Record<string, unknown> {
  if (!args.post_type || typeof args.post_type !== 'string') {
    return { error: 'post_type is required and must be a string' };
  }
  if (!args.title || typeof args.title !== 'string') {
    return { error: 'title is required and must be a string' };
  }
  const status = args.status || 'draft';
  const err = validateStatus(status);
  if (err) return { error: err };

  // Synthetic ID: one less than the current minimum. Guarantees uniqueness
  // and stays out of the way of any real WP IDs (which are positive).
  const minRow = database.prepare('SELECT MIN(id) as m FROM posts').get() as { m: number | null };
  const localId = Math.min(minRow.m ?? 0, -1) - 1;
  const now = new Date().toISOString();

  // Derive a slug from the title when the caller didn't supply one. Matches
  // WP's sanitize_title for the common ASCII case so the "View on site" eye
  // can render before the row round-trips through a sync. WP may rewrite on
  // create if this slug collides; pushNewResource() then backfills with the
  // actual server-assigned slug from the create response.
  const effectiveSlug = (args.slug && args.slug.trim()) || slugifyTitle(args.title);

  const transaction = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO posts (id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`
      )
      .run(
        localId,
        args.post_type,
        args.title,
        effectiveSlug,
        status,
        args.content || '',
        args.excerpt || '',
        now,
        now,
        now
      );

    if (args.meta && typeof args.meta === 'object') {
      const metaStmt = database.prepare(
        'INSERT INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)'
      );
      for (const [fieldId, value] of Object.entries(args.meta)) {
        metaStmt.run(localId, fieldId, JSON.stringify(value));
      }
    }

    if (args.taxonomies && typeof args.taxonomies === 'object') {
      const termStmt = database.prepare(
        'INSERT INTO post_terms (post_id, term_id, taxonomy) VALUES (?, ?, ?)'
      );
      const dirtyTaxonomies: string[] = [];
      for (const [taxonomy, termIds] of Object.entries(args.taxonomies)) {
        if (!Array.isArray(termIds)) continue;
        for (const termId of termIds) {
          if (typeof termId === 'number') termStmt.run(localId, termId, taxonomy);
        }
        dirtyTaxonomies.push(taxonomy);
      }
      // Mark every assigned taxonomy dirty so the push engine includes it.
      // (push.ts:buildUpdatePayload only pushes taxonomies listed here.)
      if (dirtyTaxonomies.length > 0) {
        database
          .prepare('INSERT INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)')
          .run(localId, '_dirty_taxonomies', JSON.stringify(dirtyTaxonomies));
      }
    }

    database
      .prepare('INSERT INTO change_log (post_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
      .run(localId, '_created', '(none)', `local stub — pending push to WP as ${args.post_type}`);
  });

  transaction();

  return {
    local_id: localId,
    post_type: args.post_type,
    title: args.title,
    slug: effectiveSlug,
    status,
    is_dirty: true,
    pending_push: true,
    note: 'This is a local-only draft. It does NOT exist on WordPress until you push from the Juggernaut app. The next push will create it on WP and assign a real ID (replacing this negative local_id).',
  };
}

export function updatePost(database: DatabaseType.Database, args: UpdatePostArgs): Record<string, unknown> {
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(args.id) as PostRow | undefined;
  if (!post) return { error: `Post ${args.id} not found` };

  // Validate status if provided
  if (args.status !== undefined) {
    const err = validateStatus(args.status);
    if (err) return { error: err };
  }

  const changes: Array<{ field: string; old_value: string; new_value: string }> = [];

  const transaction = database.transaction(() => {
    // Update basic fields
    const fieldUpdates: string[] = [];
    const fieldValues: unknown[] = [];

    for (const field of BASIC_FIELDS) {
      if (args[field] !== undefined) {
        fieldUpdates.push(`${field} = ?`);
        fieldValues.push(args[field]);
        changes.push({
          field,
          old_value: String(post[field] || ''),
          new_value: String(args[field]),
        });
      }
    }

    if (fieldUpdates.length > 0) {
      fieldUpdates.push('is_dirty = 1');
      database
        .prepare(`UPDATE posts SET ${fieldUpdates.join(', ')} WHERE id = ?`)
        .run(...fieldValues, args.id);
    }

    // Update meta fields (matches src/lib/queries.ts encoding: strings stored as-is, others JSON.stringify'd)
    if (args.meta && typeof args.meta === 'object') {
      const metaStmt = database.prepare(
        'INSERT OR REPLACE INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)'
      );

      const fieldIds = Object.keys(args.meta);
      const existingMeta = new Map<string, string>();
      if (fieldIds.length > 0) {
        const placeholders = fieldIds.map(() => '?').join(', ');
        const rows = database
          .prepare(
            `SELECT field_id, value FROM post_meta WHERE post_id = ? AND field_id IN (${placeholders})`
          )
          .all(args.id, ...fieldIds) as { field_id: string; value: string }[];
        for (const row of rows) {
          existingMeta.set(row.field_id, row.value);
        }
      }

      for (const [fieldId, value] of Object.entries(args.meta)) {
        const existingValue = existingMeta.get(fieldId);

        // Always JSON.stringify — matches src/lib/queries.ts updateLocalResource() encoding
        const newValue = JSON.stringify(value);
        metaStmt.run(args.id, fieldId, newValue);

        changes.push({
          field: `meta.${fieldId}`,
          old_value: existingValue !== undefined ? existingValue : '(not set)',
          new_value: newValue,
        });
      }

      if (fieldUpdates.length === 0) {
        database.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(args.id);
      }
    }

    // Log changes to change_log (matches src/lib/queries.ts pattern)
    const logStmt = database.prepare(
      'INSERT INTO change_log (post_id, field, old_value, new_value) VALUES (?, ?, ?, ?)'
    );
    for (const change of changes) {
      logStmt.run(args.id, change.field, change.old_value, change.new_value);
    }
  });

  transaction();

  return {
    success: true,
    post_id: args.id,
    changes_made: changes.length,
    changes: changes.map((c) => ({
      field: c.field,
      from: truncate(c.old_value),
      to: truncate(c.new_value),
    })),
    note: 'Post marked as dirty. Review changes in Juggernaut UI and push when ready.',
  };
}

export function updateSeo(database: DatabaseType.Database, args: UpdateSeoArgs): Record<string, unknown> {
  const post = database.prepare('SELECT id FROM posts WHERE id = ?').get(args.post_id) as PostRow | undefined;
  if (!post) return { error: `Post ${args.post_id} not found` };

  // Entire read-merge-write wrapped in a transaction to prevent TOCTOU race
  const result = database.transaction(() => {
    const existing = database
      .prepare(
        "SELECT data_value FROM plugin_data WHERE post_id = ? AND plugin_id = 'seopress' AND data_key = 'seo'"
      )
      .get(args.post_id) as { data_value: string } | undefined;

    let seoData: SeoData = { ...DEFAULT_SEO, og: { ...DEFAULT_SEO.og }, twitter: { ...DEFAULT_SEO.twitter }, robots: { ...DEFAULT_SEO.robots } };

    if (existing) {
      try {
        const parsed = JSON.parse(existing.data_value) as Partial<SeoData>;
        seoData = {
          ...seoData,
          ...parsed,
          og: { ...seoData.og, ...(parsed.og || {}) },
          twitter: { ...seoData.twitter, ...(parsed.twitter || {}) },
          robots: { ...seoData.robots, ...(parsed.robots || {}) },
        };
      } catch {
        /* ignore parse errors, use defaults */
      }
    }

    // Apply updates
    if (args.title !== undefined) seoData.title = args.title;
    if (args.description !== undefined) seoData.description = args.description;
    if (args.canonical !== undefined) seoData.canonical = args.canonical;
    if (args.og_title !== undefined) seoData.og.title = args.og_title;
    if (args.og_description !== undefined) seoData.og.description = args.og_description;
    if (args.og_image !== undefined) seoData.og.image = args.og_image;
    if (args.noindex !== undefined) seoData.robots.noindex = args.noindex;
    if (args.nofollow !== undefined) seoData.robots.nofollow = args.nofollow;

    database
      .prepare(
        "INSERT OR REPLACE INTO plugin_data (post_id, plugin_id, data_key, data_value) VALUES (?, 'seopress', 'seo', ?)"
      )
      .run(args.post_id, JSON.stringify(seoData));

    database.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(args.post_id);

    // Log change
    database
      .prepare('INSERT INTO change_log (post_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
      .run(
        args.post_id,
        'seo',
        existing ? existing.data_value : '(not set)',
        JSON.stringify(seoData)
      );

    return seoData;
  })();

  return {
    success: true,
    post_id: args.post_id,
    seo: result,
    note: 'SEO data updated. Post marked as dirty.',
  };
}

export function listTerms(database: DatabaseType.Database, args: ListTermsArgs): Record<string, unknown> {
  if (args.taxonomy) {
    const terms = database
      .prepare('SELECT * FROM terms WHERE taxonomy = ? ORDER BY name')
      .all(args.taxonomy) as TermRow[];
    return { taxonomy: args.taxonomy, count: terms.length, terms };
  }

  const terms = database.prepare('SELECT * FROM terms ORDER BY taxonomy, name').all() as TermRow[];
  const grouped: Record<string, TermRow[]> = {};
  for (const term of terms) {
    if (!grouped[term.taxonomy]) grouped[term.taxonomy] = [];
    grouped[term.taxonomy].push(term);
  }

  return { total: terms.length, taxonomies: grouped };
}

export function updatePostTerms(database: DatabaseType.Database, args: UpdatePostTermsArgs): Record<string, unknown> {
  const post = database.prepare('SELECT id FROM posts WHERE id = ?').get(args.post_id) as PostRow | undefined;
  if (!post) return { error: `Post ${args.post_id} not found` };

  // Validate taxonomy has terms in the database
  if (!validateTaxonomyHasTerms(database, args.taxonomy)) {
    return { error: `Unknown taxonomy '${args.taxonomy}'. No terms found for this taxonomy.` };
  }

  // Validate all term IDs exist
  const { valid, invalid } = validateTermIds(database, args.term_ids, args.taxonomy);
  if (invalid.length > 0) {
    return {
      error: `Invalid term IDs for taxonomy '${args.taxonomy}': ${invalid.join(', ')}`,
      valid_ids: valid,
      invalid_ids: invalid,
    };
  }

  const transaction = database.transaction(() => {
    // Remove existing terms for this taxonomy
    database
      .prepare('DELETE FROM post_terms WHERE post_id = ? AND taxonomy = ?')
      .run(args.post_id, args.taxonomy);

    // Insert new terms
    const insert = database.prepare(
      'INSERT INTO post_terms (post_id, term_id, taxonomy) VALUES (?, ?, ?)'
    );
    for (const termId of args.term_ids) {
      insert.run(args.post_id, termId, args.taxonomy);
    }

    // Mark dirty
    database.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(args.post_id);

    // Track dirty taxonomy in _dirty_taxonomies meta.
    // This is consumed by the push engine (src/lib/push.ts) to determine which
    // taxonomies to send. The push engine clears it after successful push.
    const dirtyMeta = database
      .prepare("SELECT value FROM post_meta WHERE post_id = ? AND field_id = '_dirty_taxonomies'")
      .get(args.post_id) as { value: string } | undefined;

    let dirtyTaxonomies: string[] = [];
    if (dirtyMeta) {
      try {
        dirtyTaxonomies = JSON.parse(dirtyMeta.value) as string[];
      } catch {
        /* reset if corrupt */
      }
    }

    if (!dirtyTaxonomies.includes(args.taxonomy)) {
      dirtyTaxonomies.push(args.taxonomy);
    }

    database
      .prepare("INSERT OR REPLACE INTO post_meta (post_id, field_id, value) VALUES (?, '_dirty_taxonomies', ?)")
      .run(args.post_id, JSON.stringify(dirtyTaxonomies));
  });

  transaction();

  // Get assigned term names for confirmation
  const placeholders = args.term_ids.map(() => '?').join(',');
  const assigned =
    args.term_ids.length > 0
      ? (database
          .prepare(`SELECT name FROM terms WHERE id IN (${placeholders}) AND taxonomy = ?`)
          .all(...args.term_ids, args.taxonomy) as Array<{ name: string }>)
      : [];

  return {
    success: true,
    post_id: args.post_id,
    taxonomy: args.taxonomy,
    assigned_terms: assigned.map((t) => t.name),
    note: 'Post marked as dirty. Push from Juggernaut UI when ready.',
  };
}

export function getStats(database: DatabaseType.Database, args: GetStatsArgs): Record<string, unknown> {
  const typeFilter = args.post_type ? 'WHERE post_type = ?' : '';
  const dirtyFilter = args.post_type
    ? 'WHERE post_type = ? AND is_dirty = 1'
    : 'WHERE is_dirty = 1';
  const params = args.post_type ? [args.post_type] : [];

  const total = (
    database.prepare(`SELECT COUNT(*) as count FROM posts ${typeFilter}`).get(...params) as CountRow
  ).count;

  const dirty = (
    database.prepare(`SELECT COUNT(*) as count FROM posts ${dirtyFilter}`).get(...params) as CountRow
  ).count;

  const byStatus = database
    .prepare(`SELECT status, COUNT(*) as count FROM posts ${typeFilter} GROUP BY status ORDER BY count DESC`)
    .all(...params) as StatusCountRow[];

  // byType always shows all post types for context, even when filtering by one type
  const byType = database
    .prepare('SELECT post_type, COUNT(*) as count FROM posts GROUP BY post_type ORDER BY count DESC')
    .all() as TypeCountRow[];

  const lastSync = database
    .prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'")
    .get() as { value: string } | undefined;

  const recentChanges = database
    .prepare("SELECT COUNT(*) as count FROM change_log WHERE changed_at > datetime('now', '-24 hours')")
    .get() as CountRow;

  return {
    total,
    dirty,
    by_status: byStatus,
    all_types: byType,
    last_sync: lastSync ? lastSync.value : 'never',
    changes_last_24h: recentChanges.count,
  };
}

export function getPostHistory(database: DatabaseType.Database, args: GetPostHistoryArgs): Record<string, unknown> {
  const limit = Math.min(Math.max(args.limit || 20, 1), 100);

  const entries = database
    .prepare('SELECT * FROM change_log WHERE post_id = ? ORDER BY changed_at DESC LIMIT ?')
    .all(args.post_id, limit) as ChangeLogRow[];

  return { post_id: args.post_id, count: entries.length, entries };
}

export function getSiteIndex(database: DatabaseType.Database, args: GetSiteIndexArgs): Record<string, unknown> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (args.post_type) {
    conditions.push('post_type = ?');
    values.push(args.post_type);
  }

  // Default to published posts only
  const status = args.status || 'publish';
  const err = validateStatus(status);
  if (err) return { error: err };
  conditions.push('status = ?');
  values.push(status);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const posts = database
    .prepare(
      `SELECT id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, is_dirty
       FROM posts ${where} ORDER BY modified_gmt DESC`
    )
    .all(...values) as PostRow[];

  // Batch-load all SEO data
  const seoMap = new Map<number, SeoData>();
  const seoRows = database
    .prepare("SELECT post_id, data_value FROM plugin_data WHERE plugin_id = 'seopress' AND data_key = 'seo'")
    .all() as Array<{ post_id: number; data_value: string }>;
  for (const row of seoRows) {
    try {
      seoMap.set(row.post_id, JSON.parse(row.data_value) as SeoData);
    } catch { /* skip malformed */ }
  }

  // Batch-load all taxonomy terms
  const termRows = database
    .prepare(
      `SELECT pt.post_id, pt.taxonomy, t.name
       FROM post_terms pt
       JOIN terms t ON pt.term_id = t.id AND pt.taxonomy = t.taxonomy`
    )
    .all() as Array<{ post_id: number; taxonomy: string; name: string }>;

  const termsMap = new Map<number, Record<string, string[]>>();
  for (const row of termRows) {
    if (!termsMap.has(row.post_id)) termsMap.set(row.post_id, {});
    const postTerms = termsMap.get(row.post_id)!;
    if (!postTerms[row.taxonomy]) postTerms[row.taxonomy] = [];
    postTerms[row.taxonomy].push(row.name);
  }

  // Build index entries
  const index = posts.map((post) => {
    const content = post.content || '';
    const links = extractLinks(content);
    const seo = seoMap.get(post.id);
    const terms = termsMap.get(post.id) || {};
    const imgCount = countImages(content);
    const imgsMissingAlt = extractImagesMissingAlt(content);

    return {
      id: post.id,
      post_type: post.post_type,
      title: post.title,
      slug: post.slug,
      status: post.status,
      is_dirty: post.is_dirty === 1,
      excerpt: truncate(post.excerpt || '', 150),
      featured_media: post.featured_media > 0,
      date_gmt: post.date_gmt,
      modified_gmt: post.modified_gmt,
      word_count: countWords(content),
      headings: extractHeadings(content),
      internal_links: links.internal,
      external_links: links.external,
      image_count: imgCount,
      images_missing_alt: imgsMissingAlt,
      seo: seo
        ? {
            title: seo.title || null,
            description: seo.description || null,
            noindex: seo.robots?.noindex || false,
            nofollow: seo.robots?.nofollow || false,
          }
        : null,
      terms,
    };
  });

  return { total: index.length, posts: index };
}

// ─── Planner (content-planner plugin) ─────────────────────────────────────────

const PLANNER_RESEARCH_TYPES = [
  'seo', 'structure', 'audience', 'competitor', 'internal_linking',
  'monetization', 'schema_markup', 'serp_features', 'publishing',
  'templates', 'legal_compliance', 'tech_notes',
] as const;
type PlannerResearchType = typeof PLANNER_RESEARCH_TYPES[number];
const PLANNER_VALID_STATUSES = ['idea', 'researching', 'drafting', 'ready', 'published'] as const;
const PLANNER_VALID_FREQUENCIES = ['annual', 'seasonal', 'quarterly', 'once'] as const;

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string');
  } catch { /* fall through */ }
  return [];
}

function parseIdeaRow(row: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!row) return null;
  let linkedKw: number[] = [];
  if (typeof row.linked_keyword_ids === 'string' && row.linked_keyword_ids) {
    try {
      const v = JSON.parse(row.linked_keyword_ids);
      if (Array.isArray(v)) linkedKw = v.filter((n): n is number => typeof n === 'number');
    } catch { /* ignore */ }
  }
  const parseNumberArr = (raw: unknown): number[] => {
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter((n): n is number => typeof n === 'number');
    } catch { /* ignore */ }
    return [];
  };
  return {
    ...row,
    linked_keyword_ids: linkedKw,
    schema_types: parseStringArray(row.schema_types),
    monetization_angles: parseStringArray(row.monetization_angles),
    serp_targets: parseStringArray(row.serp_targets),
    audience_personas: parseStringArray(row.audience_personas),
    topic_term_ids: parseNumberArr(row.topic_term_ids),
    audience_term_ids: parseNumberArr(row.audience_term_ids),
  };
}

interface PlannerListIdeasArgs {
  status?: string;
  cluster?: string;
  deadline_before?: string;
  limit?: number;
}

export function plannerListIdeas(database: DatabaseType.Database, args: PlannerListIdeasArgs): Record<string, unknown> {
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (args.status) {
    if (!(PLANNER_VALID_STATUSES as readonly string[]).includes(args.status)) {
      return { error: `status must be one of ${PLANNER_VALID_STATUSES.join(', ')}` };
    }
    conds.push('status = ?'); vals.push(args.status);
  }
  if (args.cluster) { conds.push('cluster = ?'); vals.push(args.cluster); }
  if (args.deadline_before) { conds.push('deadline IS NOT NULL AND deadline <= ?'); vals.push(args.deadline_before); }
  const limit = Math.min(Math.max(args.limit || 100, 1), 500);
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = database.prepare(
    `SELECT * FROM project.planner_ideas ${where} ORDER BY updated_at DESC LIMIT ?`,
  ).all(...vals, limit) as Array<Record<string, unknown>>;
  return { total: rows.length, ideas: rows.map(parseIdeaRow) };
}

interface PlannerGetIdeaArgs { id: number }

export function plannerGetIdea(database: DatabaseType.Database, args: PlannerGetIdeaArgs): Record<string, unknown> {
  if (typeof args.id !== 'number') return { error: 'id is required' };
  const row = database.prepare('SELECT * FROM project.planner_ideas WHERE id = ?').get(args.id) as Record<string, unknown> | undefined;
  if (!row) return { error: 'idea not found' };
  const idea = parseIdeaRow(row);
  const research = database
    .prepare('SELECT * FROM project.planner_research_entries WHERE idea_id = ? ORDER BY created_at ASC')
    .all(args.id);
  return { idea, research_entries: research };
}

interface PlannerCreateIdeaArgs {
  title: string;
  status?: typeof PLANNER_VALID_STATUSES[number];
  description?: string;
  notes?: string;
  deadline?: string;
  frequency?: typeof PLANNER_VALID_FREQUENCIES[number];
  /** @deprecated Pre-v7 alias for `frequency`. */
  refresh_cadence?: typeof PLANNER_VALID_FREQUENCIES[number];
  refresh_next_due?: string;
  cluster?: string;
  priority?: number;
  estimated_effort_hours?: number;
  schema_types?: string[];
  monetization_angles?: string[];
  serp_targets?: string[];
  audience_personas?: string[];
  resource_type_term_id?: number;
  topic_term_ids?: number[];
  audience_term_ids?: number[];
  research_entries?: Array<{ type: PlannerResearchType; content: string; source_url?: string }>;
}

export function plannerCreateIdea(database: DatabaseType.Database, args: PlannerCreateIdeaArgs): Record<string, unknown> {
  if (!args.title || typeof args.title !== 'string') return { error: 'title is required' };
  if (args.status && !(PLANNER_VALID_STATUSES as readonly string[]).includes(args.status)) {
    return { error: `status must be one of ${PLANNER_VALID_STATUSES.join(', ')}` };
  }
  const freq = args.frequency ?? args.refresh_cadence;
  if (freq && !(PLANNER_VALID_FREQUENCIES as readonly string[]).includes(freq)) {
    return { error: `frequency must be one of ${PLANNER_VALID_FREQUENCIES.join(', ')}` };
  }
  const jsonOrNull = (v: unknown) => Array.isArray(v) ? JSON.stringify(v) : null;
  let newId = 0;
  const transaction = database.transaction(() => {
    const result = database.prepare(
      `INSERT INTO project.planner_ideas (
         title, status, description, notes,
         deadline, frequency, refresh_next_due, cluster, priority,
         estimated_effort_hours, schema_types, monetization_angles,
         serp_targets, audience_personas,
         resource_type_term_id, topic_term_ids, audience_term_ids
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      args.title,
      args.status || 'idea',
      args.description || null,
      args.notes || null,
      args.deadline || null,
      freq || null,
      args.refresh_next_due || null,
      args.cluster || null,
      typeof args.priority === 'number' ? args.priority : null,
      typeof args.estimated_effort_hours === 'number' ? args.estimated_effort_hours : null,
      jsonOrNull(args.schema_types),
      jsonOrNull(args.monetization_angles),
      jsonOrNull(args.serp_targets),
      jsonOrNull(args.audience_personas),
      typeof args.resource_type_term_id === 'number' ? args.resource_type_term_id : null,
      jsonOrNull(args.topic_term_ids),
      jsonOrNull(args.audience_term_ids),
    );
    newId = Number(result.lastInsertRowid);
    if (Array.isArray(args.research_entries)) {
      const stmt = database.prepare(
        'INSERT INTO project.planner_research_entries (idea_id, type, content, source_url) VALUES (?, ?, ?, ?)',
      );
      for (const e of args.research_entries) {
        if (!e?.type || !(PLANNER_RESEARCH_TYPES as readonly string[]).includes(e.type)) continue;
        if (typeof e.content !== 'string' || !e.content.trim()) continue;
        stmt.run(newId, e.type, e.content, e.source_url || null);
      }
    }
  });
  transaction();
  return plannerGetIdea(database, { id: newId });
}

interface PlannerUpdateIdeaArgs extends Omit<PlannerCreateIdeaArgs, 'title' | 'research_entries'> {
  id: number;
  title?: string;
  promoted_post_id?: number;
}

export function plannerUpdateIdea(database: DatabaseType.Database, args: PlannerUpdateIdeaArgs): Record<string, unknown> {
  if (typeof args.id !== 'number') return { error: 'id is required' };
  if (args.status && !(PLANNER_VALID_STATUSES as readonly string[]).includes(args.status)) {
    return { error: `status must be one of ${PLANNER_VALID_STATUSES.join(', ')}` };
  }
  const freq = args.frequency ?? args.refresh_cadence;
  if (freq && !(PLANNER_VALID_FREQUENCIES as readonly string[]).includes(freq)) {
    return { error: `frequency must be one of ${PLANNER_VALID_FREQUENCIES.join(', ')}` };
  }
  const fields: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown) => { fields.push(`${col} = ?`); vals.push(v); };
  const pushJson = (col: string, v: unknown) => { fields.push(`${col} = ?`); vals.push(Array.isArray(v) ? JSON.stringify(v) : null); };

  if (args.title !== undefined) push('title', args.title);
  if (args.status !== undefined) push('status', args.status);
  if (args.description !== undefined) push('description', args.description);
  if (args.notes !== undefined) push('notes', args.notes);
  if (args.deadline !== undefined) push('deadline', args.deadline);
  if (args.frequency !== undefined || args.refresh_cadence !== undefined) push('frequency', freq ?? null);
  if (args.refresh_next_due !== undefined) push('refresh_next_due', args.refresh_next_due);
  if (args.cluster !== undefined) push('cluster', args.cluster);
  if (args.priority !== undefined) push('priority', args.priority);
  if (args.estimated_effort_hours !== undefined) push('estimated_effort_hours', args.estimated_effort_hours);
  if (args.schema_types !== undefined) pushJson('schema_types', args.schema_types);
  if (args.monetization_angles !== undefined) pushJson('monetization_angles', args.monetization_angles);
  if (args.serp_targets !== undefined) pushJson('serp_targets', args.serp_targets);
  if (args.audience_personas !== undefined) pushJson('audience_personas', args.audience_personas);
  if (args.resource_type_term_id !== undefined) push('resource_type_term_id', args.resource_type_term_id);
  if (args.topic_term_ids !== undefined) pushJson('topic_term_ids', args.topic_term_ids);
  if (args.audience_term_ids !== undefined) pushJson('audience_term_ids', args.audience_term_ids);
  if (args.promoted_post_id !== undefined) push('promoted_post_id', args.promoted_post_id);

  if (fields.length === 0) return plannerGetIdea(database, { id: args.id });
  fields.push("updated_at = datetime('now')");
  vals.push(args.id);
  const result = database.prepare(`UPDATE project.planner_ideas SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  if (result.changes === 0) return { error: 'idea not found' };
  return plannerGetIdea(database, { id: args.id });
}

interface PlannerAddResearchArgs {
  idea_id: number;
  type: PlannerResearchType;
  content: string;
  source_url?: string;
}

export function plannerAddResearchEntry(database: DatabaseType.Database, args: PlannerAddResearchArgs): Record<string, unknown> {
  if (typeof args.idea_id !== 'number') return { error: 'idea_id is required' };
  if (!args.type || !(PLANNER_RESEARCH_TYPES as readonly string[]).includes(args.type)) {
    return { error: `type must be one of ${PLANNER_RESEARCH_TYPES.join(', ')}` };
  }
  if (!args.content || typeof args.content !== 'string') return { error: 'content is required' };
  const exists = database.prepare('SELECT id FROM project.planner_ideas WHERE id = ?').get(args.idea_id);
  if (!exists) return { error: 'idea not found' };
  const result = database.prepare(
    'INSERT INTO project.planner_research_entries (idea_id, type, content, source_url) VALUES (?, ?, ?, ?)',
  ).run(args.idea_id, args.type, args.content, args.source_url || null);
  const id = Number(result.lastInsertRowid);
  const entry = database.prepare('SELECT * FROM project.planner_research_entries WHERE id = ?').get(id);
  return { entry };
}

interface PlannerListKeywordsArgs {
  search?: string;
  gap_only?: boolean;
  limit?: number;
}

export function plannerListKeywords(database: DatabaseType.Database, args: PlannerListKeywordsArgs): Record<string, unknown> {
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (args.search) { conds.push('term LIKE ?'); vals.push(`%${args.search}%`); }
  if (args.gap_only) conds.push('target_post_id IS NULL');
  const limit = Math.min(Math.max(args.limit || 200, 1), 1000);
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = database.prepare(
    `SELECT * FROM project.planner_keywords ${where} ORDER BY (volume IS NULL), volume DESC, term ASC LIMIT ?`,
  ).all(...vals, limit);
  return { total: rows.length, keywords: rows };
}

interface PlannerUpsertKeywordArgs {
  term: string;
  volume?: number;
  target_post_id?: number;
  notes?: string;
}

interface PlannerCreateTermArgs {
  taxonomy: string;
  name: string;
  slug?: string;
  parent_id?: number;
}

export function plannerCreateTerm(database: DatabaseType.Database, args: PlannerCreateTermArgs): Record<string, unknown> {
  if (!args.taxonomy || typeof args.taxonomy !== 'string') return { error: 'taxonomy is required' };
  if (!args.name || typeof args.name !== 'string') return { error: 'name is required' };
  const taxonomy = args.taxonomy.trim();
  const name = args.name.trim();
  // Negative IDs so this row coexists with positive WP-term IDs inside the
  // same JSON-array columns on planner_ideas.
  const minRow = database.prepare('SELECT MIN(id) as m FROM project.planner_terms').get() as { m: number | null };
  const nextId = Math.min(minRow.m ?? 0, 0) - 1;
  try {
    database.prepare(
      `INSERT INTO project.planner_terms (id, taxonomy, name, slug, parent_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(nextId, taxonomy, name, args.slug || null, typeof args.parent_id === 'number' ? args.parent_id : 0);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      const existing = database.prepare('SELECT * FROM project.planner_terms WHERE taxonomy = ? AND name = ?').get(taxonomy, name);
      return { term: existing, created: false, note: 'pending term already existed' };
    }
    throw err;
  }
  const term = database.prepare('SELECT * FROM project.planner_terms WHERE id = ?').get(nextId);
  return { term, created: true };
}

interface PlannerListTermsArgs { taxonomy?: string }

export function plannerListTerms(database: DatabaseType.Database, args: PlannerListTermsArgs): Record<string, unknown> {
  let rows;
  if (args.taxonomy) {
    rows = database.prepare('SELECT * FROM project.planner_terms WHERE taxonomy = ? ORDER BY name ASC').all(args.taxonomy);
  } else {
    rows = database.prepare('SELECT * FROM project.planner_terms ORDER BY taxonomy ASC, name ASC').all();
  }
  return { total: (rows as unknown[]).length, terms: rows };
}

export function plannerUpsertKeyword(database: DatabaseType.Database, args: PlannerUpsertKeywordArgs): Record<string, unknown> {
  if (!args.term || typeof args.term !== 'string') return { error: 'term is required' };
  const trimmed = args.term.trim();
  const existing = database.prepare('SELECT * FROM project.planner_keywords WHERE term = ?').get(trimmed) as Record<string, unknown> | undefined;
  if (existing) {
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (args.volume !== undefined) { fields.push('volume = ?'); vals.push(args.volume); }
    if (args.target_post_id !== undefined) { fields.push('target_post_id = ?'); vals.push(args.target_post_id); }
    if (args.notes !== undefined) { fields.push('notes = ?'); vals.push(args.notes); }
    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      vals.push(existing.id);
      database.prepare(`UPDATE project.planner_keywords SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    }
    return { keyword: database.prepare('SELECT * FROM project.planner_keywords WHERE id = ?').get(existing.id), created: false };
  }
  const result = database.prepare(
    'INSERT INTO project.planner_keywords (term, volume, target_post_id, notes) VALUES (?, ?, ?, ?)',
  ).run(
    trimmed,
    typeof args.volume === 'number' ? args.volume : null,
    typeof args.target_post_id === 'number' ? args.target_post_id : null,
    args.notes || null,
  );
  const id = Number(result.lastInsertRowid);
  return { keyword: database.prepare('SELECT * FROM project.planner_keywords WHERE id = ?').get(id), created: true };
}

// ─── Tool Dispatch ─────────────────────────────────────────────────────────────

type ToolHandler = (database: DatabaseType.Database, args: Record<string, unknown>) => Record<string, unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_posts: listPosts as unknown as ToolHandler,
  get_post: getPost as unknown as ToolHandler,
  create_post: createPost as unknown as ToolHandler,
  update_post: updatePost as unknown as ToolHandler,
  update_seo: updateSeo as unknown as ToolHandler,
  list_terms: listTerms as unknown as ToolHandler,
  update_post_terms: updatePostTerms as unknown as ToolHandler,
  get_stats: getStats as unknown as ToolHandler,
  get_post_history: getPostHistory as unknown as ToolHandler,
  get_site_index: getSiteIndex as unknown as ToolHandler,
  planner_list_ideas: plannerListIdeas as unknown as ToolHandler,
  planner_get_idea: plannerGetIdea as unknown as ToolHandler,
  planner_create_idea: plannerCreateIdea as unknown as ToolHandler,
  planner_update_idea: plannerUpdateIdea as unknown as ToolHandler,
  planner_add_research_entry: plannerAddResearchEntry as unknown as ToolHandler,
  planner_list_keywords: plannerListKeywords as unknown as ToolHandler,
  planner_upsert_keyword: plannerUpsertKeyword as unknown as ToolHandler,
  planner_create_term: plannerCreateTerm as unknown as ToolHandler,
  planner_list_terms: plannerListTerms as unknown as ToolHandler,
};

// ─── MCP Protocol (JSON-RPC 2.0 + newline-delimited JSON over stdio) ───────────

function send(message: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function sendResult(id: number | string, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id: number | string, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleMessage(msg: JsonRpcRequest): void {
  // Notifications (no id) — no response needed
  if (msg.id === undefined || msg.id === null) {
    return;
  }

  switch (msg.method) {
    case 'initialize':
      sendResult(msg.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'juggernaut', version: '1.0.0' },
      });
      break;

    case 'ping':
      sendResult(msg.id, {});
      break;

    case 'tools/list':
      sendResult(msg.id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const params = msg.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const handler = toolName ? TOOL_HANDLERS[toolName] : undefined;

      if (!handler || !toolName) {
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
          isError: true,
        } satisfies McpToolResult);
        break;
      }

      try {
        const result = handler(getDb(), toolArgs);
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        } satisfies McpToolResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        } satisfies McpToolResult);
      }
      break;
    }

    default:
      // Notifications (no id) should be silently ignored, not answered
      if (msg.id !== undefined) {
        sendError(msg.id, -32601, `Method not found: ${msg.method}`);
      }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  try {
    const enabled = isMcpPluginEnabled();
    process.stderr.write(`[juggernaut-mcp] Plugin enabled: ${enabled}\n`);
    if (!enabled) {
      process.stderr.write(
        '[juggernaut-mcp] MCP Server plugin is disabled. '
        + 'Enable it in Juggernaut Settings > Plugins, then restart your MCP client.\n'
      );
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`[juggernaut-mcp] Plugin check error: ${err}\n`);
    // Continue anyway — don't let the gate crash the server
  }

  process.stderr.write(`[juggernaut-mcp] Server starting (db: ${DB_PATH})\n`);

  let buffer: Buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk: Buffer) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    buffer = buffer.length ? (Buffer.concat([buffer, chunk]) as typeof buffer) : chunk;

    // Process all complete newline-delimited JSON messages
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.subarray(0, newlineIndex).toString('utf-8').replace(/\r$/, '');
      buffer = buffer.subarray(newlineIndex + 1);

      if (!line) continue; // skip empty lines

      try {
        const message = JSON.parse(line) as JsonRpcRequest;
        handleMessage(message);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[juggernaut-mcp] Parse error: ${errMsg}\n`);
      }
    }
  });

  process.stdin.on('end', () => {
    process.stderr.write('[juggernaut-mcp] stdin closed, shutting down\n');
    closeDb();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });
}

// Only run when executed directly (not when imported for testing)
if (require.main === module) {
  main();
}
