#!/usr/bin/env node

/**
 * Juggernaut MCP Server
 *
 * Model Context Protocol server for managing WordPress content
 * through Juggernaut's local SQLite database.
 *
 * Implements MCP protocol (JSON-RPC 2.0 over stdio) with no external
 * dependencies beyond better-sqlite3 (already a project dependency).
 *
 * Tools:
 *   list_posts       - List/search posts with filters
 *   get_post         - Get full post with meta, terms, plugin data
 *   update_post      - Update fields and/or meta, marks dirty, logs changes
 *   update_seo       - Update SEO metadata (SEOPress plugin data)
 *   list_terms       - List taxonomy terms
 *   update_post_terms - Assign taxonomy terms to a post
 *   get_stats        - Overview statistics
 *   get_post_history - View change log for a post
 *
 * Usage:
 *   node src/mcp-server/index.js
 *
 * Environment:
 *   DATABASE_PATH - Path to SQLite database (default: src/data/juggernaut.db)
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

// ─── Database ──────────────────────────────────────────────────────────────────

const DB_PATH = process.env.DATABASE_PATH
  || path.resolve(__dirname, '..', 'data', 'juggernaut.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMeta(rows) {
  const result = {};
  for (const row of rows) {
    try {
      result[row.field_id] = JSON.parse(row.value);
    } catch {
      result[row.field_id] = row.value;
    }
  }
  return result;
}

function groupTerms(rows) {
  const result = {};
  for (const row of rows) {
    if (!result[row.taxonomy]) result[row.taxonomy] = [];
    result[row.taxonomy].push({ id: row.id, name: row.name, slug: row.slug });
  }
  return result;
}

function parsePluginData(rows) {
  const result = {};
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

function truncate(str, max = 200) {
  if (typeof str !== 'string') return str;
  return str.length > max ? str.substring(0, max) + '...' : str;
}

// ─── Tool Definitions (JSON Schema) ───────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_posts',
    description: 'List WordPress posts from the local Juggernaut database with optional filters. Returns post summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        post_type: { type: 'string', description: "Filter by post type slug (e.g., 'resource', 'post')" },
        status: { type: 'string', description: "Filter by status ('publish', 'draft', 'pending', 'private')" },
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
      "Update a post's fields and/or meta data. Automatically marks the post as dirty (pending push to WordPress). Changes are logged for review in Juggernaut UI.",
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
    description: 'Update SEO metadata for a post (title, description, Open Graph, robots). Stored as SEOPress plugin data.',
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

function listPosts(args) {
  const database = getDb();
  const conditions = [];
  const values = [];

  if (args.post_type) {
    conditions.push('post_type = ?');
    values.push(args.post_type);
  }
  if (args.status) {
    conditions.push('status = ?');
    values.push(args.status);
  }
  if (args.is_dirty !== undefined) {
    conditions.push('is_dirty = ?');
    values.push(args.is_dirty ? 1 : 0);
  }
  if (args.search) {
    conditions.push('(title LIKE ? OR content LIKE ?)');
    values.push(`%${args.search}%`, `%${args.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(args.limit || 50, 200);
  const offset = args.offset || 0;

  const total = database.prepare(`SELECT COUNT(*) as count FROM posts ${where}`).get(...values).count;

  const posts = database
    .prepare(
      `SELECT id, title, slug, status, post_type, is_dirty, modified_gmt, date_gmt
       FROM posts ${where} ORDER BY modified_gmt DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return { total, count: posts.length, limit, offset, posts };
}

function getPost(args) {
  const database = getDb();
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(args.id);
  if (!post) return { error: `Post ${args.id} not found` };

  const meta = database
    .prepare('SELECT field_id, value FROM post_meta WHERE post_id = ?')
    .all(args.id);

  const terms = database
    .prepare(
      `SELECT pt.taxonomy, t.id, t.name, t.slug
       FROM post_terms pt
       JOIN terms t ON pt.term_id = t.id AND pt.taxonomy = t.taxonomy
       WHERE pt.post_id = ?`
    )
    .all(args.id);

  const pluginRows = database
    .prepare('SELECT plugin_id, data_key, data_value FROM plugin_data WHERE post_id = ?')
    .all(args.id);

  return {
    ...post,
    is_dirty: post.is_dirty === 1,
    meta: parseMeta(meta),
    terms: groupTerms(terms),
    plugin_data: parsePluginData(pluginRows),
  };
}

function updatePost(args) {
  const database = getDb();
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(args.id);
  if (!post) return { error: `Post ${args.id} not found` };

  const BASIC_FIELDS = ['title', 'content', 'excerpt', 'slug', 'status'];
  const changes = [];

  const transaction = database.transaction(() => {
    // Update basic fields
    const fieldUpdates = [];
    const fieldValues = [];

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

    // Update meta fields
    if (args.meta && typeof args.meta === 'object') {
      const metaStmt = database.prepare(
        'INSERT OR REPLACE INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)'
      );

      for (const [fieldId, value] of Object.entries(args.meta)) {
        const existing = database
          .prepare('SELECT value FROM post_meta WHERE post_id = ? AND field_id = ?')
          .get(args.id, fieldId);

        const newValue = typeof value === 'string' ? value : JSON.stringify(value);
        metaStmt.run(args.id, fieldId, newValue);

        changes.push({
          field: `meta.${fieldId}`,
          old_value: existing ? existing.value : '(not set)',
          new_value: newValue,
        });
      }

      // Mark dirty if no basic fields were updated
      if (fieldUpdates.length === 0) {
        database.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(args.id);
      }
    }

    // Log changes
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

function updateSeo(args) {
  const database = getDb();
  const post = database.prepare('SELECT id FROM posts WHERE id = ?').get(args.post_id);
  if (!post) return { error: `Post ${args.post_id} not found` };

  // Load existing SEO data
  const existing = database
    .prepare(
      "SELECT data_value FROM plugin_data WHERE post_id = ? AND plugin_id = 'seopress' AND data_key = 'seo'"
    )
    .get(args.post_id);

  let seoData = {
    title: '',
    description: '',
    canonical: '',
    targetKeywords: '',
    og: { title: '', description: '', image: '' },
    twitter: { title: '', description: '', image: '' },
    robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
  };

  if (existing) {
    try {
      const parsed = JSON.parse(existing.data_value);
      seoData = {
        ...seoData,
        ...parsed,
        og: { ...seoData.og, ...(parsed.og || {}) },
        twitter: { ...seoData.twitter, ...(parsed.twitter || {}) },
        robots: { ...seoData.robots, ...(parsed.robots || {}) },
      };
    } catch {
      /* ignore parse errors */
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

  // Log the change
  database
    .prepare('INSERT INTO change_log (post_id, field, old_value, new_value) VALUES (?, ?, ?, ?)')
    .run(
      args.post_id,
      'seo',
      existing ? existing.data_value : '(not set)',
      JSON.stringify(seoData)
    );

  return {
    success: true,
    post_id: args.post_id,
    seo: seoData,
    note: 'SEO data updated. Post marked as dirty.',
  };
}

function listTerms(args) {
  const database = getDb();

  if (args.taxonomy) {
    const terms = database
      .prepare('SELECT * FROM terms WHERE taxonomy = ? ORDER BY name')
      .all(args.taxonomy);
    return { taxonomy: args.taxonomy, count: terms.length, terms };
  }

  const terms = database.prepare('SELECT * FROM terms ORDER BY taxonomy, name').all();

  // Group by taxonomy for readability
  const grouped = {};
  for (const term of terms) {
    if (!grouped[term.taxonomy]) grouped[term.taxonomy] = [];
    grouped[term.taxonomy].push(term);
  }

  return { total: terms.length, taxonomies: grouped };
}

function updatePostTerms(args) {
  const database = getDb();
  const post = database.prepare('SELECT id FROM posts WHERE id = ?').get(args.post_id);
  if (!post) return { error: `Post ${args.post_id} not found` };

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

    // Track dirty taxonomy in meta (so push engine knows what to send)
    const dirtyMeta = database
      .prepare(
        "SELECT value FROM post_meta WHERE post_id = ? AND field_id = '_dirty_taxonomies'"
      )
      .get(args.post_id);

    let dirtyTaxonomies = [];
    if (dirtyMeta) {
      try {
        dirtyTaxonomies = JSON.parse(dirtyMeta.value);
      } catch {
        /* ignore */
      }
    }

    if (!dirtyTaxonomies.includes(args.taxonomy)) {
      dirtyTaxonomies.push(args.taxonomy);
    }

    database
      .prepare(
        "INSERT OR REPLACE INTO post_meta (post_id, field_id, value) VALUES (?, '_dirty_taxonomies', ?)"
      )
      .run(args.post_id, JSON.stringify(dirtyTaxonomies));
  });

  transaction();

  // Get assigned term names for confirmation
  const placeholders = args.term_ids.map(() => '?').join(',');
  const assigned =
    args.term_ids.length > 0
      ? database
          .prepare(
            `SELECT name FROM terms WHERE id IN (${placeholders}) AND taxonomy = ?`
          )
          .all(...args.term_ids, args.taxonomy)
      : [];

  return {
    success: true,
    post_id: args.post_id,
    taxonomy: args.taxonomy,
    assigned_terms: assigned.map((t) => t.name),
    note: 'Post marked as dirty. Push from Juggernaut UI when ready.',
  };
}

function getStats(args) {
  const database = getDb();
  const typeFilter = args.post_type ? 'WHERE post_type = ?' : '';
  const dirtyFilter = args.post_type ? 'WHERE post_type = ? AND is_dirty = 1' : 'WHERE is_dirty = 1';
  const params = args.post_type ? [args.post_type] : [];

  const total = database
    .prepare(`SELECT COUNT(*) as count FROM posts ${typeFilter}`)
    .get(...params).count;

  const dirty = database
    .prepare(`SELECT COUNT(*) as count FROM posts ${dirtyFilter}`)
    .get(...params).count;

  const byStatus = database
    .prepare(
      `SELECT status, COUNT(*) as count FROM posts ${typeFilter} GROUP BY status ORDER BY count DESC`
    )
    .all(...params);

  const byType = database
    .prepare('SELECT post_type, COUNT(*) as count FROM posts GROUP BY post_type ORDER BY count DESC')
    .all();

  const lastSync = database
    .prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'")
    .get();

  const recentChanges = database
    .prepare(
      "SELECT COUNT(*) as count FROM change_log WHERE changed_at > datetime('now', '-24 hours')"
    )
    .get();

  return {
    total,
    dirty,
    by_status: byStatus,
    by_type: byType,
    last_sync: lastSync ? lastSync.value : 'never',
    changes_last_24h: recentChanges.count,
  };
}

function getPostHistory(args) {
  const database = getDb();
  const limit = args.limit || 20;

  const entries = database
    .prepare('SELECT * FROM change_log WHERE post_id = ? ORDER BY changed_at DESC LIMIT ?')
    .all(args.post_id, limit);

  return { post_id: args.post_id, count: entries.length, entries };
}

// ─── Tool Dispatch ─────────────────────────────────────────────────────────────

const TOOL_HANDLERS = {
  list_posts: listPosts,
  get_post: getPost,
  update_post: updatePost,
  update_seo: updateSeo,
  list_terms: listTerms,
  update_post_terms: updatePostTerms,
  get_stats: getStats,
  get_post_history: getPostHistory,
};

// ─── MCP Protocol (JSON-RPC 2.0 over stdio) ───────────────────────────────────

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleMessage(msg) {
  // Notifications (no id) — no response needed
  if (msg.id === undefined) {
    return;
  }

  switch (msg.method) {
    case 'initialize':
      sendResult(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'juggernaut',
          version: '1.0.0',
        },
      });
      break;

    case 'ping':
      sendResult(msg.id, {});
      break;

    case 'tools/list':
      sendResult(msg.id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const toolName = msg.params && msg.params.name;
      const toolArgs = (msg.params && msg.params.arguments) || {};
      const handler = TOOL_HANDLERS[toolName];

      if (!handler) {
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
          isError: true,
        });
        break;
      }

      try {
        const result = handler(toolArgs);
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        sendResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        });
      }
      break;
    }

    default:
      sendError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  process.stderr.write(`[juggernaut-mcp] Server starting (db: ${DB_PATH})\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const message = JSON.parse(trimmed);
      handleMessage(message);
    } catch (err) {
      process.stderr.write(`[juggernaut-mcp] Failed to parse message: ${err.message}\n`);
    }
  });

  rl.on('close', () => {
    process.stderr.write('[juggernaut-mcp] stdin closed, shutting down\n');
    if (db) db.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    if (db) db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (db) db.close();
    process.exit(0);
  });
}

main();
