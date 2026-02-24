/**
 * Tests for Juggernaut MCP Server tool handlers.
 *
 * Uses an in-memory SQLite database with the same schema as src/lib/db.ts.
 * Each test gets a fresh database seeded with known data.
 */

import Database from 'better-sqlite3';
import {
  listPosts,
  getPost,
  updatePost,
  updateSeo,
  listTerms,
  updatePostTerms,
  getStats,
  getPostHistory,
} from '../index';

// ─── Test Setup ────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  // Schema matches src/lib/db.ts initializeSchema()
  db.exec(`
    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE terms (
      id INTEGER PRIMARY KEY,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent_id INTEGER DEFAULT 0,
      UNIQUE(id, taxonomy)
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      post_type TEXT DEFAULT 'resource',
      title TEXT,
      slug TEXT,
      status TEXT DEFAULT 'publish',
      content TEXT,
      excerpt TEXT,
      featured_media INTEGER DEFAULT 0,
      date_gmt TEXT,
      modified_gmt TEXT,
      synced_at TEXT,
      is_dirty INTEGER DEFAULT 0
    );

    CREATE TABLE post_meta (
      post_id INTEGER NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (post_id, field_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE post_terms (
      post_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      taxonomy TEXT NOT NULL,
      PRIMARY KEY (post_id, term_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE plugin_data (
      post_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      data_key TEXT NOT NULL,
      data_value TEXT,
      PRIMARY KEY (post_id, plugin_id, data_key),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO sync_meta (key, value) VALUES ('last_sync_time', '2026-02-20T12:00:00Z');
    INSERT INTO sync_meta (key, value) VALUES ('schema_version', '2');
  `);

  // Seed posts
  const insertPost = db.prepare(`
    INSERT INTO posts (id, post_type, title, slug, status, content, excerpt, modified_gmt, date_gmt, is_dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPost.run(100, 'resource', 'Alpha Guide', 'alpha-guide', 'publish', '<p>Alpha content</p>', 'Alpha excerpt', '2026-02-20T10:00:00Z', '2026-01-01T00:00:00Z', 1);
  insertPost.run(200, 'resource', 'Beta Tutorial', 'beta-tutorial', 'draft', '<p>Beta content</p>', 'Beta excerpt', '2026-02-19T10:00:00Z', '2026-01-02T00:00:00Z', 0);
  insertPost.run(300, 'post', 'Blog Post One', 'blog-post-one', 'publish', '<p>Blog content</p>', 'Blog excerpt', '2026-02-18T10:00:00Z', '2026-01-03T00:00:00Z', 0);

  // Seed terms
  const insertTerm = db.prepare('INSERT INTO terms (id, taxonomy, name, slug, parent_id) VALUES (?, ?, ?, ?, ?)');
  insertTerm.run(10, 'resource-type', 'Guide', 'guide', 0);
  insertTerm.run(11, 'resource-type', 'Tutorial', 'tutorial', 0);
  insertTerm.run(20, 'category', 'News', 'news', 0);
  insertTerm.run(21, 'category', 'Updates', 'updates', 0);

  // Seed post_terms
  const insertPostTerm = db.prepare('INSERT INTO post_terms (post_id, term_id, taxonomy) VALUES (?, ?, ?)');
  insertPostTerm.run(100, 10, 'resource-type');
  insertPostTerm.run(300, 20, 'category');

  // Seed post_meta
  const insertMeta = db.prepare('INSERT INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)');
  insertMeta.run(100, 'version', '"2.0"');
  insertMeta.run(100, 'download_count', '150');

  // Seed plugin_data (SEO)
  db.prepare(`
    INSERT INTO plugin_data (post_id, plugin_id, data_key, data_value) VALUES (?, 'seopress', 'seo', ?)
  `).run(100, JSON.stringify({
    title: 'Alpha Guide - SEO Title',
    description: 'SEO description for Alpha',
    canonical: '',
    targetKeywords: '',
    og: { title: '', description: '', image: '' },
    twitter: { title: '', description: '', image: '' },
    robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
  }));

  return db;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('list_posts', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns all posts when no filters applied', () => {
    const result = listPosts(db, {});
    expect(result.total).toBe(3);
    expect(result.count).toBe(3);
  });

  it('filters by post_type', () => {
    const result = listPosts(db, { post_type: 'resource' });
    expect(result.total).toBe(2);
    const posts = result.posts as Array<{ post_type: string }>;
    expect(posts.every((p) => p.post_type === 'resource')).toBe(true);
  });

  it('filters by status', () => {
    const result = listPosts(db, { status: 'draft' });
    expect(result.total).toBe(1);
  });

  it('rejects invalid status', () => {
    const result = listPosts(db, { status: 'banana' });
    expect(result.error).toBeDefined();
  });

  it('filters by is_dirty', () => {
    const result = listPosts(db, { is_dirty: true });
    expect(result.total).toBe(1);
    const posts = result.posts as Array<{ id: number }>;
    expect(posts[0].id).toBe(100);
  });

  it('searches title and content', () => {
    const result = listPosts(db, { search: 'Alpha' });
    expect(result.total).toBe(1);
  });

  it('escapes LIKE wildcards in search', () => {
    // Insert a post with % in title
    db.prepare("INSERT INTO posts (id, post_type, title, slug, status, content, modified_gmt, is_dirty) VALUES (400, 'post', '100% Complete', 'pct', 'publish', '', '2026-02-01T00:00:00Z', 0)").run();
    const result = listPosts(db, { search: '100%' });
    expect(result.total).toBe(1);
  });

  it('respects limit and offset', () => {
    const result = listPosts(db, { limit: 2, offset: 1 });
    expect(result.count).toBe(2);
    expect(result.offset).toBe(1);
  });

  it('clamps limit to 200', () => {
    const result = listPosts(db, { limit: 999 });
    expect(result.limit).toBe(200);
  });
});

describe('get_post', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns post with meta, terms, and plugin data', () => {
    const result = getPost(db, { id: 100 });
    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Alpha Guide');
    expect(result.is_dirty).toBe(true);

    const meta = result.meta as Record<string, unknown>;
    expect(meta.version).toBe('2.0');
    expect(meta.download_count).toBe(150);

    const terms = result.terms as Record<string, unknown[]>;
    expect(terms['resource-type']).toHaveLength(1);
    expect(terms['resource-type'][0]).toMatchObject({ name: 'Guide' });

    const pluginData = result.plugin_data as Record<string, Record<string, unknown>>;
    expect(pluginData.seopress.seo).toBeDefined();
  });

  it('returns error for non-existent post', () => {
    const result = getPost(db, { id: 999 });
    expect(result.error).toBeDefined();
  });
});

describe('update_post', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('updates basic fields and marks dirty', () => {
    const result = updatePost(db, { id: 200, title: 'Updated Title' });
    expect(result.success).toBe(true);
    expect(result.changes_made).toBe(1);

    const post = db.prepare('SELECT title, is_dirty FROM posts WHERE id = 200').get() as { title: string; is_dirty: number };
    expect(post.title).toBe('Updated Title');
    expect(post.is_dirty).toBe(1);
  });

  it('updates meta fields and logs changes', () => {
    const result = updatePost(db, { id: 100, meta: { version: '3.0', new_field: 'hello' } });
    expect(result.success).toBe(true);

    const meta = db.prepare("SELECT value FROM post_meta WHERE post_id = 100 AND field_id = 'version'").get() as { value: string };
    expect(meta.value).toBe('3.0');

    const newMeta = db.prepare("SELECT value FROM post_meta WHERE post_id = 100 AND field_id = 'new_field'").get() as { value: string };
    expect(newMeta.value).toBe('hello');

    const changes = db.prepare('SELECT COUNT(*) as count FROM change_log WHERE post_id = 100').get() as { count: number };
    expect(changes.count).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid status', () => {
    const result = updatePost(db, { id: 100, status: 'banana' });
    expect(result.error).toBeDefined();

    // Verify no changes were made
    const post = db.prepare('SELECT status FROM posts WHERE id = 100').get() as { status: string };
    expect(post.status).toBe('publish');
  });

  it('returns error for non-existent post', () => {
    const result = updatePost(db, { id: 999, title: 'Nope' });
    expect(result.error).toBeDefined();
  });

  it('stores non-string meta values as JSON', () => {
    updatePost(db, { id: 100, meta: { tags: ['a', 'b'], count: 42 } });

    const tags = db.prepare("SELECT value FROM post_meta WHERE post_id = 100 AND field_id = 'tags'").get() as { value: string };
    expect(JSON.parse(tags.value)).toEqual(['a', 'b']);

    const count = db.prepare("SELECT value FROM post_meta WHERE post_id = 100 AND field_id = 'count'").get() as { value: string };
    expect(count.value).toBe('42');
  });
});

describe('update_seo', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('merges with existing SEO data', () => {
    const result = updateSeo(db, { post_id: 100, description: 'New description' });
    expect(result.success).toBe(true);

    const seo = result.seo as { title: string; description: string };
    expect(seo.title).toBe('Alpha Guide - SEO Title');
    expect(seo.description).toBe('New description');
  });

  it('creates SEO data for post without existing SEO', () => {
    const result = updateSeo(db, { post_id: 200, title: 'Beta SEO Title', noindex: true });
    expect(result.success).toBe(true);

    const seo = result.seo as { title: string; robots: { noindex: boolean } };
    expect(seo.title).toBe('Beta SEO Title');
    expect(seo.robots.noindex).toBe(true);
  });

  it('marks post as dirty', () => {
    updateSeo(db, { post_id: 200, title: 'Test' });
    const post = db.prepare('SELECT is_dirty FROM posts WHERE id = 200').get() as { is_dirty: number };
    expect(post.is_dirty).toBe(1);
  });

  it('returns error for non-existent post', () => {
    const result = updateSeo(db, { post_id: 999, title: 'Nope' });
    expect(result.error).toBeDefined();
  });

  it('logs change to change_log', () => {
    updateSeo(db, { post_id: 100, description: 'Changed' });
    const log = db.prepare("SELECT * FROM change_log WHERE post_id = 100 AND field = 'seo'").get() as ChangeLogRowLike | undefined;
    expect(log).toBeDefined();
  });
});

interface ChangeLogRowLike {
  post_id: number;
  field: string;
  old_value: string;
  new_value: string;
}

describe('list_terms', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('lists all terms grouped by taxonomy', () => {
    const result = listTerms(db, {});
    expect(result.total).toBe(4);
    const taxonomies = result.taxonomies as Record<string, unknown[]>;
    expect(Object.keys(taxonomies)).toContain('resource-type');
    expect(Object.keys(taxonomies)).toContain('category');
  });

  it('filters by taxonomy', () => {
    const result = listTerms(db, { taxonomy: 'resource-type' });
    expect(result.count).toBe(2);
    expect(result.taxonomy).toBe('resource-type');
  });
});

describe('update_post_terms', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('assigns terms and marks dirty', () => {
    const result = updatePostTerms(db, { post_id: 200, taxonomy: 'resource-type', term_ids: [10, 11] });
    expect(result.success).toBe(true);
    expect(result.assigned_terms).toEqual(expect.arrayContaining(['Guide', 'Tutorial']));

    const post = db.prepare('SELECT is_dirty FROM posts WHERE id = 200').get() as { is_dirty: number };
    expect(post.is_dirty).toBe(1);
  });

  it('tracks dirty taxonomy in _dirty_taxonomies meta', () => {
    updatePostTerms(db, { post_id: 200, taxonomy: 'resource-type', term_ids: [10] });

    const meta = db.prepare(
      "SELECT value FROM post_meta WHERE post_id = 200 AND field_id = '_dirty_taxonomies'"
    ).get() as { value: string };
    const dirty = JSON.parse(meta.value) as string[];
    expect(dirty).toContain('resource-type');
  });

  it('rejects invalid term IDs', () => {
    const result = updatePostTerms(db, { post_id: 100, taxonomy: 'resource-type', term_ids: [10, 999] });
    expect(result.error).toBeDefined();
    expect(result.invalid_ids).toEqual([999]);
  });

  it('rejects unknown taxonomy', () => {
    const result = updatePostTerms(db, { post_id: 100, taxonomy: 'nonexistent', term_ids: [10] });
    expect(result.error).toBeDefined();
  });

  it('returns error for non-existent post', () => {
    const result = updatePostTerms(db, { post_id: 999, taxonomy: 'resource-type', term_ids: [10] });
    expect(result.error).toBeDefined();
  });
});

describe('get_stats', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns overall stats', () => {
    const result = getStats(db, {});
    expect(result.total).toBe(3);
    expect(result.dirty).toBe(1);
    expect(result.last_sync).toBe('2026-02-20T12:00:00Z');
  });

  it('filters stats by post_type', () => {
    const result = getStats(db, { post_type: 'resource' });
    expect(result.total).toBe(2);
    expect(result.dirty).toBe(1);
  });

  it('all_types always shows all post types', () => {
    const result = getStats(db, { post_type: 'resource' });
    const allTypes = result.all_types as Array<{ post_type: string }>;
    const types = allTypes.map((t) => t.post_type);
    expect(types).toContain('post');
    expect(types).toContain('resource');
  });
});

describe('get_post_history', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns empty for post with no changes', () => {
    const result = getPostHistory(db, { post_id: 200 });
    expect(result.count).toBe(0);
  });

  it('returns changes after update', () => {
    updatePost(db, { id: 100, title: 'Changed Title' });
    const result = getPostHistory(db, { post_id: 100 });
    expect(result.count).toBeGreaterThan(0);
    const entries = result.entries as Array<{ field: string }>;
    expect(entries.some((e) => e.field === 'title')).toBe(true);
  });

  it('respects limit', () => {
    // Make multiple changes
    updatePost(db, { id: 100, title: 'Change 1' });
    updatePost(db, { id: 100, title: 'Change 2' });
    updatePost(db, { id: 100, title: 'Change 3' });

    const result = getPostHistory(db, { post_id: 100, limit: 2 });
    expect(result.count).toBe(2);
  });
});
