/**
 * Split-DB module tests. Every test runs with a fresh JUGGERNAUT_DATA_DIR and
 * an isolated module registry so the per-env connection cache and
 * first-launch migration flag start clean.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

function freshDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juggernaut-db-test-'));
  process.env.JUGGERNAUT_DATA_DIR = dir;
  // Point site-config at the same fresh dir so resolveActiveEnvId() never
  // picks up the developer's real ~/.juggernaut/site-config.json — that would
  // route the migration into juggernaut-<real-active>.db instead of the
  // 'local' slot the tests exercise.
  process.env.JUGGERNAUT_CONFIG_DIR = dir;
  delete process.env.DATABASE_PATH;
  return dir;
}

function loadDb(): typeof import('../db') {
  let mod!: typeof import('../db');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../db');
  });
  return mod;
}

function cleanupDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('Split-DB', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = freshDataDir();
  });

  afterEach(() => {
    cleanupDir(dataDir);
  });

  describe('getEnvDb', () => {
    it('creates an env DB file on first call', () => {
      const db = loadDb();
      db.getEnvDb('local');
      expect(fs.existsSync(path.join(dataDir, 'juggernaut-local.db'))).toBe(true);
    });

    it('returns the same instance on repeated calls (per-env singleton)', () => {
      const db = loadDb();
      const a = db.getEnvDb('local');
      const b = db.getEnvDb('local');
      expect(a).toBe(b);
    });

    it('opens distinct files per env id', () => {
      const db = loadDb();
      db.getEnvDb('local');
      db.getEnvDb('production');
      expect(fs.existsSync(path.join(dataDir, 'juggernaut-local.db'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'juggernaut-production.db'))).toBe(true);
    });

    it('enables WAL journal mode', () => {
      const db = loadDb();
      const conn = db.getEnvDb('local');
      const mode = conn.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    });

    it('initializes env schema (posts, meta, terms, plugin_data, ...) — no planner tables', () => {
      const db = loadDb();
      const conn = db.getEnvDb('local');
      const rows = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const names = new Set(rows.map(r => r.name));
      expect(names).toContain('posts');
      expect(names).toContain('post_meta');
      expect(names).toContain('post_terms');
      expect(names).toContain('terms');
      expect(names).toContain('plugin_data');
      expect(names).toContain('change_log');
      expect(names).not.toContain('planner_ideas');
      expect(names).not.toContain('planner_keywords');
    });

    it('ATTACHes the project DB as `project` so planner tables are visible', () => {
      const db = loadDb();
      const conn = db.getEnvDb('local');
      const rows = conn.prepare("SELECT name FROM project.sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const names = new Set(rows.map(r => r.name));
      expect(names).toContain('planner_ideas');
      expect(names).toContain('planner_keywords');
    });
  });

  describe('getProjectDb', () => {
    it('creates the project DB file with only planner tables', () => {
      const db = loadDb();
      const conn = db.getProjectDb();
      expect(fs.existsSync(path.join(dataDir, 'juggernaut-project.db'))).toBe(true);
      const rows = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const names = new Set(rows.map(r => r.name));
      expect(names).toContain('planner_ideas');
      expect(names).toContain('planner_research_entries');
      expect(names).toContain('planner_keywords');
      expect(names).toContain('planner_terms');
      expect(names).not.toContain('posts');
      expect(names).not.toContain('post_meta');
    });

    it('planner_ideas has promoted_target_id column (env-scoped promotion pointer)', () => {
      const db = loadDb();
      const conn = db.getProjectDb();
      const cols = conn.prepare("PRAGMA table_info('planner_ideas')").all() as Array<{ name: string }>;
      const names = new Set(cols.map(c => c.name));
      expect(names).toContain('promoted_target_id');
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const db = loadDb();
      const a = db.getProjectDb();
      const b = db.getProjectDb();
      expect(a).toBe(b);
    });
  });

  describe('closeEnvDb / closeAllDbs', () => {
    it('closeEnvDb closes just the named env', () => {
      const db = loadDb();
      const local = db.getEnvDb('local');
      db.getEnvDb('production');
      db.closeEnvDb('local');
      expect(() => local.prepare('SELECT 1').get()).toThrow();
      // A subsequent getEnvDb('local') should return a fresh, working connection.
      const reopened = db.getEnvDb('local');
      expect(reopened).not.toBe(local);
      expect(reopened.prepare('SELECT 1').get()).toBeDefined();
    });

    it('closeAllDbs closes every env + the project DB', () => {
      const db = loadDb();
      const env = db.getEnvDb('local');
      const project = db.getProjectDb();
      db.closeAllDbs();
      expect(() => env.prepare('SELECT 1').get()).toThrow();
      expect(() => project.prepare('SELECT 1').get()).toThrow();
    });
  });

  describe('First-launch migration', () => {
    it('splits a pre-existing legacy juggernaut.db into env-{active}.db + project.db', () => {
      // Seed a legacy single-DB with one env-scoped row and one planner row.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3');
      const legacyPath = path.join(dataDir, 'juggernaut.db');
      const legacy = new Database(legacyPath);
      legacy.exec(`
        CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO sync_meta (key, value) VALUES ('schema_version', '9');
        CREATE TABLE posts (id INTEGER PRIMARY KEY, post_type TEXT, title TEXT, slug TEXT, status TEXT, content TEXT, excerpt TEXT, featured_media INTEGER, date_gmt TEXT, modified_gmt TEXT, synced_at TEXT, is_dirty INTEGER, synced_snapshot TEXT);
        CREATE TABLE post_meta (post_id INTEGER, field_id TEXT, value TEXT, PRIMARY KEY (post_id, field_id));
        CREATE TABLE post_terms (post_id INTEGER, term_id INTEGER, taxonomy TEXT, PRIMARY KEY (post_id, term_id));
        CREATE TABLE terms (id INTEGER PRIMARY KEY, taxonomy TEXT, name TEXT, slug TEXT, parent_id INTEGER);
        CREATE TABLE plugin_data (post_id INTEGER, plugin_id TEXT, data_key TEXT, data_value TEXT, PRIMARY KEY (post_id, plugin_id, data_key));
        CREATE TABLE change_log (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, field TEXT, old_value TEXT, new_value TEXT, changed_at TEXT);
        CREATE TABLE planner_ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT DEFAULT 'idea', description TEXT, notes TEXT, linked_keyword_ids TEXT, promoted_post_id INTEGER, pre_promote_status TEXT, deadline TEXT, frequency TEXT, refresh_next_due TEXT, cluster TEXT, priority INTEGER, estimated_effort_hours REAL, schema_types TEXT, monetization_angles TEXT, serp_targets TEXT, audience_personas TEXT, resource_type_term_id INTEGER, topic_term_ids TEXT, audience_term_ids TEXT, created_at TEXT, updated_at TEXT);
        INSERT INTO posts (id, title) VALUES (42, 'seed-post');
        INSERT INTO planner_ideas (id, title) VALUES (7, 'seed-idea');
      `);
      legacy.close();

      // Trigger the split. Active env falls back to 'local' when no site-config
      // is readable, so seed data should land in juggernaut-local.db.
      const db = loadDb();
      const envConn = db.getEnvDb('local');
      const post = envConn.prepare('SELECT title FROM posts WHERE id = 42').get() as { title: string } | undefined;
      expect(post?.title).toBe('seed-post');

      const projectConn = db.getProjectDb();
      const idea = projectConn.prepare('SELECT title FROM planner_ideas WHERE id = 7').get() as { title: string } | undefined;
      expect(idea?.title).toBe('seed-idea');

      // Env DB should not still carry planner tables; project DB should not carry env tables.
      const envTables = new Set((envConn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(r => r.name));
      expect(envTables).not.toContain('planner_ideas');
      const projTables = new Set((projectConn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(r => r.name));
      expect(projTables).not.toContain('posts');

      // Legacy file should be renamed for safety, not deleted.
      expect(fs.existsSync(path.join(dataDir, 'juggernaut.legacy.db'))).toBe(true);
      expect(fs.existsSync(path.join(dataDir, 'juggernaut.db'))).toBe(false);
    });
  });
});
