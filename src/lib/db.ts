import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Default to juggernaut.db, but support legacy plexkits.db for backward compatibility
const DB_PATH = process.env.DATABASE_PATH || './data/juggernaut.db';
const LEGACY_DB_PATH = './data/plexkits.db';

// Schema version - increment when making breaking changes
const SCHEMA_VERSION = 3;

let db: Database.Database | null = null;

/**
 * Returns the singleton SQLite database instance. Initializes the database on first
 * call: creates the data directory, applies schema migrations, and enables WAL mode.
 * Handles legacy plexkits.db → juggernaut.db migration automatically.
 * @returns The shared better-sqlite3 Database instance
 */
export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(process.cwd(), DB_PATH);
    const legacyDbPath = path.resolve(process.cwd(), LEGACY_DB_PATH);
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Check for legacy database and migrate if needed
    if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
      console.log('[db] Found legacy plexkits.db, copying to juggernaut.db...');
      fs.copyFileSync(legacyDbPath, dbPath);
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Check schema version and migrate if needed
    const currentVersion = getSchemaVersion(db);
    if (currentVersion === 0 && !tableExists(db, 'resources') && !tableExists(db, 'posts')) {
      // Fresh database - create schema from scratch
      initializeSchema(db);
    } else if (currentVersion < SCHEMA_VERSION) {
      migrateSchema(db, currentVersion, SCHEMA_VERSION);
    }

    // Fix any incomplete migrations (change_log might still have resource_id)
    if (tableExists(db, 'change_log') && columnExists(db, 'change_log', 'resource_id')) {
      console.log('[db] Fixing incomplete migration: change_log table...');
      db.exec(`
        CREATE TABLE change_log_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          field TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO change_log_new (id, post_id, field, old_value, new_value, changed_at)
        SELECT id, resource_id, field, old_value, new_value, changed_at FROM change_log;

        DROP TABLE change_log;
        ALTER TABLE change_log_new RENAME TO change_log;
      `);
      console.log('[db] change_log table fixed');
    }
  }
  return db;
}

/**
 * Get current schema version from database
 */
function getSchemaVersion(database: Database.Database): number {
  try {
    const row = database.prepare(
      "SELECT value FROM sync_meta WHERE key = 'schema_version'"
    ).get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    // sync_meta table might not exist yet
    return 0;
  }
}

/**
 * Set schema version in database
 */
function setSchemaVersion(database: Database.Database, version: number): void {
  database.prepare(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('schema_version', ?)"
  ).run(String(version));
}

/**
 * Check if a table exists
 */
function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { name: string } | undefined;
  return !!row;
}

/**
 * Check if a column exists in a table
 */
function columnExists(database: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some(col => col.name === columnName);
  } catch {
    return false;
  }
}

/**
 * Migrate schema from one version to another
 */
function migrateSchema(database: Database.Database, fromVersion: number, toVersion: number): void {
  console.log(`[db] Migrating schema from v${fromVersion} to v${toVersion}...`);

  // Version 1 -> 2: Add post_type column, create plugin_data table, rename tables
  if (fromVersion < 2) {
    migrateV1toV2(database);
  }

  // Version 2 -> 3: Add synced_snapshot column to posts
  if (fromVersion < 3) {
    migrateV2toV3(database);
  }

  setSchemaVersion(database, toVersion);
  console.log(`[db] Migration complete. Schema is now at v${toVersion}`);
}

/**
 * Migration from v1 (original schema) to v2 (modular schema)
 *
 * Changes:
 * - Rename resources -> posts (with post_type column)
 * - Rename resource_meta -> post_meta
 * - Rename resource_terms -> post_terms
 * - Migrate resource_seo -> plugin_data
 * - Update change_log to reference post_id
 */
function migrateV1toV2(database: Database.Database): void {
  console.log('[db] Running migration v1 -> v2...');

  // Start transaction for safety
  database.exec('BEGIN TRANSACTION');

  try {
    // Ensure sync_meta exists for schema versioning
    database.exec(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Check if we're already on v2 schema (posts table exists)
    if (tableExists(database, 'posts')) {
      console.log('[db] Already on v2 schema, skipping table renames');
    } else if (tableExists(database, 'resources')) {
      // Rename resources -> posts and add post_type column
      console.log('[db] Renaming resources -> posts...');

      // SQLite doesn't support direct ALTER TABLE RENAME with new columns,
      // so we create new table, copy data, drop old, rename
      database.exec(`
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

        INSERT INTO posts (id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty)
        SELECT id, 'resource', title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty
        FROM resources;

        DROP TABLE resources;
      `);

      // Create backward-compatible view
      database.exec(`
        CREATE VIEW IF NOT EXISTS resources AS
        SELECT id, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty
        FROM posts WHERE post_type = 'resource';
      `);
    }

    // Rename resource_meta -> post_meta
    if (!tableExists(database, 'post_meta') && tableExists(database, 'resource_meta')) {
      console.log('[db] Renaming resource_meta -> post_meta...');
      database.exec(`
        CREATE TABLE post_meta (
          post_id INTEGER NOT NULL,
          field_id TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (post_id, field_id),
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );

        INSERT INTO post_meta (post_id, field_id, value)
        SELECT resource_id, field_id, value FROM resource_meta;

        DROP TABLE resource_meta;
      `);

      // Create backward-compatible view
      database.exec(`
        CREATE VIEW IF NOT EXISTS resource_meta AS
        SELECT post_id AS resource_id, field_id, value FROM post_meta;
      `);
    }

    // Rename resource_terms -> post_terms
    if (!tableExists(database, 'post_terms') && tableExists(database, 'resource_terms')) {
      console.log('[db] Renaming resource_terms -> post_terms...');
      database.exec(`
        CREATE TABLE post_terms (
          post_id INTEGER NOT NULL,
          term_id INTEGER NOT NULL,
          taxonomy TEXT NOT NULL,
          PRIMARY KEY (post_id, term_id),
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );

        INSERT INTO post_terms (post_id, term_id, taxonomy)
        SELECT resource_id, term_id, taxonomy FROM resource_terms;

        DROP TABLE resource_terms;
      `);

      // Create backward-compatible view
      database.exec(`
        CREATE VIEW IF NOT EXISTS resource_terms AS
        SELECT post_id AS resource_id, term_id, taxonomy FROM post_terms;
      `);
    }

    // Create plugin_data table for generic plugin storage
    if (!tableExists(database, 'plugin_data')) {
      console.log('[db] Creating plugin_data table...');
      database.exec(`
        CREATE TABLE plugin_data (
          post_id INTEGER NOT NULL,
          plugin_id TEXT NOT NULL,
          data_key TEXT NOT NULL,
          data_value TEXT,
          PRIMARY KEY (post_id, plugin_id, data_key),
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_plugin_data_plugin ON plugin_data(plugin_id);
        CREATE INDEX IF NOT EXISTS idx_plugin_data_post ON plugin_data(post_id);
      `);
    }

    // Migrate resource_seo -> plugin_data (seopress plugin)
    if (tableExists(database, 'resource_seo')) {
      console.log('[db] Migrating resource_seo -> plugin_data...');

      const seoRows = database.prepare('SELECT * FROM resource_seo').all() as Array<{
        resource_id: number;
        seo_title: string;
        seo_description: string;
        seo_canonical: string;
        seo_target_keywords: string;
        og_title: string;
        og_description: string;
        og_image: string;
        twitter_title: string;
        twitter_description: string;
        twitter_image: string;
        robots_noindex: number;
        robots_nofollow: number;
        robots_nosnippet: number;
        robots_noimageindex: number;
      }>;

      const insertStmt = database.prepare(`
        INSERT OR REPLACE INTO plugin_data (post_id, plugin_id, data_key, data_value)
        VALUES (?, 'seopress', 'seo', ?)
      `);

      for (const row of seoRows) {
        const seoData = JSON.stringify({
          title: row.seo_title || '',
          description: row.seo_description || '',
          canonical: row.seo_canonical || '',
          targetKeywords: row.seo_target_keywords || '',
          og: {
            title: row.og_title || '',
            description: row.og_description || '',
            image: row.og_image || '',
          },
          twitter: {
            title: row.twitter_title || '',
            description: row.twitter_description || '',
            image: row.twitter_image || '',
          },
          robots: {
            noindex: row.robots_noindex === 1,
            nofollow: row.robots_nofollow === 1,
            nosnippet: row.robots_nosnippet === 1,
            noimageindex: row.robots_noimageindex === 1,
          },
        });
        insertStmt.run(row.resource_id, seoData);
      }

      // Keep resource_seo table for backward compatibility but mark it as deprecated
      // Will be removed in a future version
      console.log('[db] SEO data migrated to plugin_data. resource_seo table kept for compatibility.');
    }

    // Migrate change_log table: resource_id -> post_id
    if (tableExists(database, 'change_log') && columnExists(database, 'change_log', 'resource_id')) {
      console.log('[db] Migrating change_log table...');
      database.exec(`
        CREATE TABLE change_log_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          field TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO change_log_new (id, post_id, field, old_value, new_value, changed_at)
        SELECT id, resource_id, field, old_value, new_value, changed_at FROM change_log;

        DROP TABLE change_log;
        ALTER TABLE change_log_new RENAME TO change_log;
      `);
    }

    // Create new indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_posts_dirty ON posts(is_dirty);
      CREATE INDEX IF NOT EXISTS idx_post_meta_post ON post_meta(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_terms_post ON post_terms(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_terms_taxonomy ON post_terms(taxonomy);
    `);

    database.exec('COMMIT');
    console.log('[db] Migration v1 -> v2 complete');
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('[db] Migration failed, rolled back:', error);
    throw error;
  }
}

/**
 * Migration from v2 to v3: Add synced_snapshot column to posts table.
 * Stores a JSON snapshot of server values at sync time for dirty field detection.
 */
function migrateV2toV3(database: Database.Database): void {
  console.log('[db] Running migration v2 -> v3...');

  if (tableExists(database, 'posts') && !columnExists(database, 'posts', 'synced_snapshot')) {
    database.exec('ALTER TABLE posts ADD COLUMN synced_snapshot TEXT');
    console.log('[db] Added synced_snapshot column to posts');
  }

  console.log('[db] Migration v2 -> v3 complete');
}

/**
 * Initialize a fresh database with v2 schema
 */
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

    -- Posts (all post types)
    CREATE TABLE IF NOT EXISTS posts (
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
      is_dirty INTEGER DEFAULT 0,
      synced_snapshot TEXT
    );

    -- Meta fields (stored as JSON)
    CREATE TABLE IF NOT EXISTS post_meta (
      post_id INTEGER NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (post_id, field_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    -- Post <-> Taxonomy term assignments
    CREATE TABLE IF NOT EXISTS post_terms (
      post_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      taxonomy TEXT NOT NULL,
      PRIMARY KEY (post_id, term_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    -- Plugin data (generic storage for any plugin)
    CREATE TABLE IF NOT EXISTS plugin_data (
      post_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      data_key TEXT NOT NULL,
      data_value TEXT,
      PRIMARY KEY (post_id, plugin_id, data_key),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    -- Change tracking for undo/audit
    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
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

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_terms_taxonomy ON terms(taxonomy);
    CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_dirty ON posts(is_dirty);
    CREATE INDEX IF NOT EXISTS idx_post_meta_post ON post_meta(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_terms_post ON post_terms(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_terms_taxonomy ON post_terms(taxonomy);
    CREATE INDEX IF NOT EXISTS idx_plugin_data_plugin ON plugin_data(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_data_post ON plugin_data(post_id);
  `);

  setSchemaVersion(database, SCHEMA_VERSION);
}

/**
 * Returns the primary post type slug from the active profile.
 * Falls back to 'resource' if the profile is not loaded or has no primary post type.
 * @returns The primary post type slug (e.g. 'resource', 'post')
 */
export function getPrimaryPostType(): string {
  try {
    const { getProfileManager } = require('./profiles');
    const manager = getProfileManager();
    const postType = manager.getPrimaryPostType();
    return postType?.slug || 'resource';
  } catch {
    return 'resource';
  }
}

/**
 * Closes the database connection and resets the singleton. The next call to
 * `getDb()` will create a fresh connection.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
