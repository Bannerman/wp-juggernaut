import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Default to juggernaut.db, but support legacy plexkits.db for backward compatibility
const DB_PATH = process.env.DATABASE_PATH || './data/juggernaut.db';
const LEGACY_DB_PATH = './data/plexkits.db';

// Schema version - increment when making breaking changes
const SCHEMA_VERSION = 7;

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

    // Check for legacy database and migrate if needed.
    // Skip when DATABASE_PATH is explicitly set (e.g. Electron points at userData);
    // in that case `process.cwd()` may be inside an app bundle that ships a stale
    // legacy DB, which would silently overwrite a wiped database on next launch.
    if (!process.env.DATABASE_PATH && !fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
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
    const columns = database.prepare('SELECT name FROM pragma_table_info(?)').all(tableName) as Array<{ name: string }>;
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

  // Version 3 -> 4: Add planner_ideas + planner_keywords tables (content-planner plugin)
  if (fromVersion < 4) {
    migrateV3toV4(database);
  }

  // Version 4 -> 5: Add description column to planner_ideas
  if (fromVersion < 5) {
    migrateV4toV5(database);
  }

  // Version 5 -> 6: research entries table + planning columns on planner_ideas
  if (fromVersion < 6) {
    migrateV5toV6(database);
  }

  // Version 6 -> 7: bind planner_ideas to PLEXKITS taxonomies + rename refresh_cadence -> frequency
  if (fromVersion < 7) {
    migrateV6toV7(database);
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
 * Migration from v3 to v4: Add planner_ideas + planner_keywords tables.
 * Backs the content-planner plugin. Both tables are plugin-global, not keyed
 * on post_id (unlike plugin_data), since the planner needs free-standing
 * idea/keyword records that may have no associated WP post yet.
 */
function migrateV3toV4(database: Database.Database): void {
  console.log('[db] Running migration v3 -> v4...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS planner_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idea',
      notes TEXT,
      linked_keyword_ids TEXT,
      promoted_post_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_planner_ideas_status ON planner_ideas(status);

    CREATE TABLE IF NOT EXISTS planner_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      volume INTEGER,
      target_post_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(term)
    );

    CREATE INDEX IF NOT EXISTS idx_planner_keywords_target ON planner_keywords(target_post_id);
  `);

  console.log('[db] Migration v3 -> v4 complete');
}

/**
 * Migration from v4 to v5: Add description column to planner_ideas.
 * Powers the longer-form "what is this template" field surfaced in the
 * idea drawer; existing rows get NULL until edited.
 */
function migrateV4toV5(database: Database.Database): void {
  console.log('[db] Running migration v4 -> v5...');

  if (tableExists(database, 'planner_ideas') && !columnExists(database, 'planner_ideas', 'description')) {
    database.exec('ALTER TABLE planner_ideas ADD COLUMN description TEXT');
    console.log('[db] Added description column to planner_ideas');
  }

  console.log('[db] Migration v4 -> v5 complete');
}

/**
 * Migration from v5 to v6: powers the Phase C.2 planner upgrade.
 *
 * Adds `planner_research_entries` for typed research-log entries (one row per
 * finding, type from a fixed taxonomy) and ten new planning columns on
 * `planner_ideas`: deadline, refresh_cadence, refresh_next_due, cluster,
 * priority, estimated_effort_hours, and four JSON-array columns for
 * schema_types, monetization_angles, serp_targets, audience_personas.
 *
 * The typed columns let the kanban filter/sort by deadline and cluster; the
 * JSON columns hold structured shapes that an agent (via the new MCP tools)
 * can populate end-to-end during a planning pass.
 */
function migrateV5toV6(database: Database.Database): void {
  console.log('[db] Running migration v5 -> v6...');

  if (tableExists(database, 'planner_ideas')) {
    const cols: Array<[string, string]> = [
      ['deadline', 'TEXT'],
      ['refresh_cadence', 'TEXT'],
      ['refresh_next_due', 'TEXT'],
      ['cluster', 'TEXT'],
      ['priority', 'INTEGER'],
      ['estimated_effort_hours', 'REAL'],
      ['schema_types', 'TEXT'],
      ['monetization_angles', 'TEXT'],
      ['serp_targets', 'TEXT'],
      ['audience_personas', 'TEXT'],
    ];
    for (const [name, type] of cols) {
      if (!columnExists(database, 'planner_ideas', name)) {
        database.exec(`ALTER TABLE planner_ideas ADD COLUMN ${name} ${type}`);
      }
    }
    console.log('[db] Added planning columns to planner_ideas');
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS planner_research_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN (
        'seo', 'structure', 'audience', 'competitor', 'internal_linking',
        'monetization', 'schema_markup', 'serp_features', 'publishing',
        'templates', 'legal_compliance', 'tech_notes'
      )),
      content TEXT NOT NULL,
      source_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (idea_id) REFERENCES planner_ideas(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_planner_research_idea ON planner_research_entries(idea_id);
    CREATE INDEX IF NOT EXISTS idx_planner_research_type ON planner_research_entries(type);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_cluster ON planner_ideas(cluster);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_deadline ON planner_ideas(deadline);
  `);

  console.log('[db] Migration v5 -> v6 complete');
}

/**
 * Migration from v6 to v7: bind the content-planner to PLEXKITS taxonomies.
 *
 * Renames `refresh_cadence` → `frequency` to match how PLEXKITS describes the
 * publish cycle on resources, and adds three taxonomy-term-id columns so a
 * planner idea maps cleanly onto a real WP resource when promoted:
 *   - `resource_type_term_id` (single, taxonomy='resource-type')
 *   - `topic_term_ids`        (JSON array, taxonomy='topic'  → "Tags")
 *   - `audience_term_ids`     (JSON array, taxonomy='audience')
 *
 * The pre-v7 free-form `audience_personas` column stays in the schema for
 * back-compat (SQLite ALTER can't drop a column without a full rebuild) but
 * the UI/MCP surface stop using it.
 */
function migrateV6toV7(database: Database.Database): void {
  console.log('[db] Running migration v6 -> v7...');

  if (tableExists(database, 'planner_ideas')) {
    if (columnExists(database, 'planner_ideas', 'refresh_cadence') && !columnExists(database, 'planner_ideas', 'frequency')) {
      database.exec('ALTER TABLE planner_ideas RENAME COLUMN refresh_cadence TO frequency');
      console.log('[db] Renamed planner_ideas.refresh_cadence -> frequency');
    }
    const cols: Array<[string, string]> = [
      ['resource_type_term_id', 'INTEGER'],
      ['topic_term_ids', 'TEXT'],
      ['audience_term_ids', 'TEXT'],
    ];
    for (const [name, type] of cols) {
      if (!columnExists(database, 'planner_ideas', name)) {
        database.exec(`ALTER TABLE planner_ideas ADD COLUMN ${name} ${type}`);
      }
    }
    console.log('[db] Added PLEXKITS-taxonomy columns to planner_ideas');
  }

  console.log('[db] Migration v6 -> v7 complete');
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

    -- Content planner (content-planner plugin)
    CREATE TABLE IF NOT EXISTS planner_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idea',
      description TEXT,
      notes TEXT,
      linked_keyword_ids TEXT,
      promoted_post_id INTEGER,
      deadline TEXT,
      frequency TEXT,
      refresh_next_due TEXT,
      cluster TEXT,
      priority INTEGER,
      estimated_effort_hours REAL,
      schema_types TEXT,
      monetization_angles TEXT,
      serp_targets TEXT,
      audience_personas TEXT,
      resource_type_term_id INTEGER,
      topic_term_ids TEXT,
      audience_term_ids TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planner_research_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN (
        'seo', 'structure', 'audience', 'competitor', 'internal_linking',
        'monetization', 'schema_markup', 'serp_features', 'publishing',
        'templates', 'legal_compliance', 'tech_notes'
      )),
      content TEXT NOT NULL,
      source_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (idea_id) REFERENCES planner_ideas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS planner_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      volume INTEGER,
      target_post_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(term)
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
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_status ON planner_ideas(status);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_cluster ON planner_ideas(cluster);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_deadline ON planner_ideas(deadline);
    CREATE INDEX IF NOT EXISTS idx_planner_keywords_target ON planner_keywords(target_post_id);
    CREATE INDEX IF NOT EXISTS idx_planner_research_idea ON planner_research_entries(idea_id);
    CREATE INDEX IF NOT EXISTS idx_planner_research_type ON planner_research_entries(type);
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
