import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || './data/plexkits.db';

let db: Database.Database | null = null;

/**
 * Database module for PLEXKITS Resource Manager
 */
export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(process.cwd(), DB_PATH);
    const dbDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database.Database) {
  database.exec(`
    -- Sync metadata
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Taxonomy terms (all taxonomies in one table)
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent_id INTEGER DEFAULT 0,
      UNIQUE(id, taxonomy)
    );

    -- Resource posts
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY,
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

    -- Meta Box fields (stored as JSON)
    CREATE TABLE IF NOT EXISTS resource_meta (
      resource_id INTEGER NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (resource_id, field_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    -- Resource <-> Taxonomy term assignments
    CREATE TABLE IF NOT EXISTS resource_terms (
      resource_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      taxonomy TEXT NOT NULL,
      PRIMARY KEY (resource_id, term_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    -- Change tracking for undo/audit
    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

    -- Field audit results from sync
    CREATE TABLE IF NOT EXISTS field_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_run_at TEXT NOT NULL,
      field_name TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      affected_resources TEXT,
      UNIQUE(audit_run_at, field_name)
    );

    -- SEO data (from SEOPress or similar)
    CREATE TABLE IF NOT EXISTS resource_seo (
      resource_id INTEGER PRIMARY KEY,
      seo_title TEXT DEFAULT '',
      seo_description TEXT DEFAULT '',
      seo_canonical TEXT DEFAULT '',
      seo_target_keywords TEXT DEFAULT '',
      og_title TEXT DEFAULT '',
      og_description TEXT DEFAULT '',
      og_image TEXT DEFAULT '',
      twitter_title TEXT DEFAULT '',
      twitter_description TEXT DEFAULT '',
      twitter_image TEXT DEFAULT '',
      robots_noindex INTEGER DEFAULT 0,
      robots_nofollow INTEGER DEFAULT 0,
      robots_nosnippet INTEGER DEFAULT 0,
      robots_noimageindex INTEGER DEFAULT 0,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_terms_taxonomy ON terms(taxonomy);
    CREATE INDEX IF NOT EXISTS idx_resource_terms_resource ON resource_terms(resource_id);
    CREATE INDEX IF NOT EXISTS idx_resource_terms_taxonomy ON resource_terms(taxonomy);
    CREATE INDEX IF NOT EXISTS idx_resource_meta_resource ON resource_meta(resource_id);
    CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
    CREATE INDEX IF NOT EXISTS idx_resources_dirty ON resources(is_dirty);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
