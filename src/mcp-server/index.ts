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

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

// After compilation, __dirname is src/mcp-server/dist/, so go up two levels to src/
const DB_PATH = process.env.DATABASE_PATH
  || path.resolve(__dirname, '..', '..', 'data', 'juggernaut.db');

let dbInstance: Database.Database | null = null;

/**
 * Returns the singleton database connection. Mirrors src/lib/db.ts settings
 * (WAL mode) with added busy_timeout for multi-process safety.
 */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('busy_timeout = 5000');
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

// ─── Validation ────────────────────────────────────────────────────────────────

function validateStatus(status: string): string | null {
  if (!VALID_STATUSES.has(status)) {
    return `Invalid status '${status}'. Must be one of: ${Array.from(VALID_STATUSES).join(', ')}`;
  }
  return null;
}

function validateTermIds(
  database: Database.Database,
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

function validateTaxonomyHasTerms(database: Database.Database, taxonomy: string): boolean {
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
];

// ─── Tool Handlers ─────────────────────────────────────────────────────────────
// Each handler accepts a Database instance for testability.

export function listPosts(database: Database.Database, args: ListPostsArgs): Record<string, unknown> {
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

export function getPost(database: Database.Database, args: GetPostArgs): Record<string, unknown> {
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

export function updatePost(database: Database.Database, args: UpdatePostArgs): Record<string, unknown> {
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

      for (const [fieldId, value] of Object.entries(args.meta)) {
        const existing = database
          .prepare('SELECT value FROM post_meta WHERE post_id = ? AND field_id = ?')
          .get(args.id, fieldId) as { value: string } | undefined;

        // Always JSON.stringify — matches src/lib/queries.ts updateLocalResource() encoding
        const newValue = JSON.stringify(value);
        metaStmt.run(args.id, fieldId, newValue);

        changes.push({
          field: `meta.${fieldId}`,
          old_value: existing ? existing.value : '(not set)',
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

export function updateSeo(database: Database.Database, args: UpdateSeoArgs): Record<string, unknown> {
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

export function listTerms(database: Database.Database, args: ListTermsArgs): Record<string, unknown> {
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

export function updatePostTerms(database: Database.Database, args: UpdatePostTermsArgs): Record<string, unknown> {
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

export function getStats(database: Database.Database, args: GetStatsArgs): Record<string, unknown> {
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

export function getPostHistory(database: Database.Database, args: GetPostHistoryArgs): Record<string, unknown> {
  const limit = Math.min(Math.max(args.limit || 20, 1), 100);

  const entries = database
    .prepare('SELECT * FROM change_log WHERE post_id = ? ORDER BY changed_at DESC LIMIT ?')
    .all(args.post_id, limit) as ChangeLogRow[];

  return { post_id: args.post_id, count: entries.length, entries };
}

// ─── Tool Dispatch ─────────────────────────────────────────────────────────────

type ToolHandler = (database: Database.Database, args: Record<string, unknown>) => Record<string, unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_posts: listPosts as unknown as ToolHandler,
  get_post: getPost as unknown as ToolHandler,
  update_post: updatePost as unknown as ToolHandler,
  update_seo: updateSeo as unknown as ToolHandler,
  list_terms: listTerms as unknown as ToolHandler,
  update_post_terms: updatePostTerms as unknown as ToolHandler,
  get_stats: getStats as unknown as ToolHandler,
  get_post_history: getPostHistory as unknown as ToolHandler,
};

// ─── MCP Protocol (JSON-RPC 2.0 + Content-Length framing) ──────────────────────

function send(message: JsonRpcResponse): void {
  const body = JSON.stringify(message);
  const byteLength = Buffer.byteLength(body, 'utf-8');
  process.stdout.write(`Content-Length: ${byteLength}\r\n\r\n${body}`);
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
        protocolVersion: '2024-11-05',
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
      sendError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  if (!isMcpPluginEnabled()) {
    process.stderr.write(
      '[juggernaut-mcp] MCP Server plugin is disabled. '
      + 'Enable it in Juggernaut Settings > Plugins, then restart your MCP client.\n'
    );
    process.exit(1);
  }

  process.stderr.write(`[juggernaut-mcp] Server starting (db: ${DB_PATH})\n`);

  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Process all complete messages in buffer
    while (buffer.length > 0) {
      // Find header/body separator
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      // Parse Content-Length header
      const headerStr = buffer.subarray(0, headerEnd).toString('ascii');
      const match = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Skip malformed header
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      // Wait for complete body
      if (buffer.length < bodyEnd) break;

      // Extract and process message
      const body = buffer.subarray(bodyStart, bodyEnd).toString('utf-8');
      buffer = buffer.subarray(bodyEnd);

      try {
        const message = JSON.parse(body) as JsonRpcRequest;
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
