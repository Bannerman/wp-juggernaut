import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Data directory (parent of every DB file). Electron sets DATABASE_PATH to a
// legacy single-file path — we derive DATA_DIR from its parent for backward
// compatibility with existing deployments.
const LEGACY_ENV_PATH = process.env.DATABASE_PATH;
const DATA_DIR = process.env.JUGGERNAUT_DATA_DIR
  || (LEGACY_ENV_PATH ? path.resolve(process.cwd(), path.dirname(LEGACY_ENV_PATH)) : path.resolve(process.cwd(), './data'));

// Legacy single-DB paths (used only for first-launch migration).
const LEGACY_SINGLE_DB = path.join(DATA_DIR, 'juggernaut.db');
const LEGACY_PLEXKITS_DB = path.join(DATA_DIR, 'plexkits.db');
const LEGACY_RENAMED = path.join(DATA_DIR, 'juggernaut.legacy.db');

// Project DB (cross-env: content-planner tables live here).
const PROJECT_DB_PATH = path.join(DATA_DIR, 'juggernaut-project.db');

// Per-env DB path. Env id comes from the active site target in site-config.
function envDbPath(envId: string): string {
  return path.join(DATA_DIR, `juggernaut-${sanitizeEnvId(envId)}.db`);
}

function sanitizeEnvId(envId: string): string {
  return envId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Schema versions. Env and project schemas evolve independently.
const ENV_SCHEMA_VERSION = 1;
const PROJECT_SCHEMA_VERSION = 1;

// Env-scoped table names (all WP-mirrored data). The first-launch migration
// drops these from the project DB; every env DB owns its own copy.
const ENV_TABLES = [
  'posts',
  'post_meta',
  'post_terms',
  'terms',
  'plugin_data',
  'change_log',
  'field_audit',
] as const;

// Project-scoped table names (content-planner). The first-launch migration
// drops these from every env DB; only the project DB owns them.
const PROJECT_TABLES = [
  'planner_ideas',
  'planner_research_entries',
  'planner_keywords',
  'planner_terms',
] as const;

// Connection cache. One entry per env id; project DB is a singleton.
const envDbCache = new Map<string, Database.Database>();
let projectDb: Database.Database | null = null;

// Track which env connections have the project DB ATTACHed so we don't
// attach twice on the same connection (SQLite errors on that).
const attachedProject = new WeakSet<Database.Database>();

// First-launch migration is idempotent but expensive — gate on a module-level
// flag so repeated getEnvDb()/getProjectDb() calls skip the check.
let firstLaunchChecked = false;

/**
 * Returns the SQLite database for the given env id (or the active target when
 * omitted). The project DB is automatically ATTACHed as `project` so
 * cross-DB transactions can reference planner tables via `project.planner_ideas`.
 * @param envId Optional env id override. Falls back to site-config's activeTarget.
 * @returns better-sqlite3 Database handle for the requested env.
 */
export function getEnvDb(envId?: string): Database.Database {
  ensureDataDir();
  ensureFirstLaunchMigration();

  const targetId = envId || resolveActiveEnvId();
  const cached = envDbCache.get(targetId);
  if (cached) {
    ensureProjectAttached(cached);
    return cached;
  }

  const dbPath = envDbPath(targetId);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  ensureEnvSchema(db);
  envDbCache.set(targetId, db);
  ensureProjectAttached(db);
  return db;
}

/**
 * Returns the singleton project SQLite database (content-planner tables).
 * Shared across all envs — planner ideas belong to the project, not to a
 * specific WordPress install.
 */
export function getProjectDb(): Database.Database {
  ensureDataDir();
  ensureFirstLaunchMigration();

  if (projectDb) return projectDb;

  const db = new Database(PROJECT_DB_PATH);
  db.pragma('journal_mode = WAL');
  ensureProjectSchema(db);
  projectDb = db;
  return db;
}

/**
 * Closes the env DB connection for the given env id. Called by site-config
 * when the active target switches so the next getEnvDb() opens a fresh
 * connection to the new env's file.
 */
export function closeEnvDb(envId: string): void {
  const cached = envDbCache.get(envId);
  if (cached) {
    try { cached.close(); } catch { /* ignore */ }
    envDbCache.delete(envId);
  }
}

/**
 * Closes every open DB connection (env and project). Used at shutdown or
 * before a bulk reset.
 */
export function closeAllDbs(): void {
  envDbCache.forEach((db) => {
    try { db.close(); } catch { /* ignore */ }
  });
  envDbCache.clear();
  if (projectDb) {
    try { projectDb.close(); } catch { /* ignore */ }
    projectDb = null;
  }
}

/**
 * Returns the primary post type slug from the active profile.
 * Falls back to 'resource' if the profile is not loaded or has no primary post type.
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function resolveActiveEnvId(): string {
  // Read site-config lazily to avoid a circular import (site-config imports
  // profiles which may transitively touch db).
  try {
    const { getConfig } = require('./site-config');
    const config = getConfig();
    if (config?.activeTarget) return config.activeTarget;
  } catch {
    // Fall through to default.
  }
  return 'local';
}

function ensureProjectAttached(envDb: Database.Database): void {
  if (attachedProject.has(envDb)) return;
  // Make sure the project DB file exists before we ATTACH — SQLite creates
  // an empty file when attaching a missing path, which would skip schema init.
  getProjectDb();
  envDb.exec(`ATTACH DATABASE '${PROJECT_DB_PATH.replace(/'/g, "''")}' AS project`);
  attachedProject.add(envDb);
}

/**
 * One-time migration from the legacy single-DB layout to the split layout.
 * Runs once per install (gated by a marker file). Idempotent — safe to call
 * repeatedly. Does nothing when no legacy DB is present.
 */
function ensureFirstLaunchMigration(): void {
  if (firstLaunchChecked) return;
  firstLaunchChecked = true;

  const projectExists = fs.existsSync(PROJECT_DB_PATH);
  if (projectExists) {
    // Already migrated (or a fresh split-DB install). Nothing to do.
    return;
  }

  // Locate a legacy single DB. Prefer juggernaut.db; fall back to plexkits.db.
  let legacySource: string | null = null;
  if (fs.existsSync(LEGACY_SINGLE_DB)) legacySource = LEGACY_SINGLE_DB;
  else if (fs.existsSync(LEGACY_PLEXKITS_DB)) legacySource = LEGACY_PLEXKITS_DB;

  if (!legacySource) {
    // Fresh install — no legacy data to split. Callers will initialize each
    // DB with its own schema on demand.
    return;
  }

  const activeEnvId = resolveActiveEnvId();
  const envTarget = envDbPath(activeEnvId);

  console.log(`[db] First-launch split-DB migration: legacy=${legacySource} → env(${activeEnvId})+project`);

  // Bring the legacy DB up to the pre-split schema (v9) so the tables we
  // copy are in a known-good shape.
  {
    const legacy = new Database(legacySource);
    try {
      legacy.pragma('journal_mode = WAL');
      migrateLegacyToV9(legacy);
    } finally {
      legacy.close();
    }
  }

  // Copy legacy → env-{active}.db
  if (!fs.existsSync(envTarget)) {
    fs.copyFileSync(legacySource, envTarget);
  }
  // Copy legacy → project.db
  fs.copyFileSync(legacySource, PROJECT_DB_PATH);

  // Rename original so nothing writes to it again.
  if (legacySource === LEGACY_SINGLE_DB && !fs.existsSync(LEGACY_RENAMED)) {
    try {
      fs.renameSync(LEGACY_SINGLE_DB, LEGACY_RENAMED);
    } catch (err) {
      console.warn(`[db] Could not rename legacy DB (safe to ignore): ${(err as Error).message}`);
    }
  }

  // Prune the wrong tables from each copy. Also seed schema version markers.
  {
    const envDb = new Database(envTarget);
    try {
      envDb.pragma('journal_mode = WAL');
      dropTables(envDb, PROJECT_TABLES);
      ensureEnvSchema(envDb);
    } finally {
      envDb.close();
    }
  }
  {
    const projDb = new Database(PROJECT_DB_PATH);
    try {
      projDb.pragma('journal_mode = WAL');
      dropTables(projDb, ENV_TABLES);
      ensureProjectSchema(projDb);
    } finally {
      projDb.close();
    }
  }

  console.log('[db] Split-DB migration complete');
}

function dropTables(db: Database.Database, tables: readonly string[]): void {
  // Legacy v1→v2 migration left back-compat VIEWs alongside the renamed
  // tables (`resources`, `resource_meta`, `resource_terms`). Drop those
  // explicitly first — SQLite errors on `DROP VIEW IF EXISTS <t>` when a
  // TABLE named <t> exists, so we can't just fire that at every name.
  const viewRows = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as Array<{ name: string }>;
  const legacyViews = new Set(['resources', 'resource_meta', 'resource_terms']);
  for (const v of viewRows) {
    if (legacyViews.has(v.name)) db.exec(`DROP VIEW IF EXISTS ${v.name};`);
  }
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS ${t};`);
  }
}

// ---------------------------------------------------------------------------
// Env DB schema
// ---------------------------------------------------------------------------

function ensureEnvSchema(db: Database.Database): void {
  ensureSyncMeta(db);
  const version = getSchemaVersion(db, 'schema_version');

  if (version === 0 && !tableExists(db, 'posts')) {
    initializeEnvSchema(db);
    setSchemaVersion(db, 'schema_version', ENV_SCHEMA_VERSION);
    return;
  }

  // Pre-split DBs used a single schema_version key that covered planner too
  // (v1..v9). If we see one of those, ensure only env tables remain and stamp
  // the new marker. planner tables should already have been pruned during the
  // first-launch migration; this is a belt-and-suspenders check.
  if (version < ENV_SCHEMA_VERSION) {
    setSchemaVersion(db, 'schema_version', ENV_SCHEMA_VERSION);
  }
}

function initializeEnvSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent_id INTEGER DEFAULT 0,
      UNIQUE(id, taxonomy)
    );

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

    CREATE TABLE IF NOT EXISTS post_meta (
      post_id INTEGER NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (post_id, field_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_terms (
      post_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      taxonomy TEXT NOT NULL,
      PRIMARY KEY (post_id, term_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plugin_data (
      post_id INTEGER NOT NULL,
      plugin_id TEXT NOT NULL,
      data_key TEXT NOT NULL,
      data_value TEXT,
      PRIMARY KEY (post_id, plugin_id, data_key),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

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
}

// ---------------------------------------------------------------------------
// Project DB schema
// ---------------------------------------------------------------------------

function ensureProjectSchema(db: Database.Database): void {
  ensureSyncMeta(db);
  const version = getSchemaVersion(db, 'project_schema_version');

  if (version === 0 && !tableExists(db, 'planner_ideas')) {
    initializeProjectSchema(db);
    setSchemaVersion(db, 'project_schema_version', PROJECT_SCHEMA_VERSION);
    return;
  }

  // planner_ideas may have arrived from a legacy split-DB copy. Ensure the
  // promoted_target_id column exists (added in project schema v1 alongside
  // the split — legacy rows only carry promoted_post_id).
  if (tableExists(db, 'planner_ideas') && !columnExists(db, 'planner_ideas', 'promoted_target_id')) {
    db.exec('ALTER TABLE planner_ideas ADD COLUMN promoted_target_id TEXT');
  }

  if (version < PROJECT_SCHEMA_VERSION) {
    setSchemaVersion(db, 'project_schema_version', PROJECT_SCHEMA_VERSION);
  }
}

function initializeProjectSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS planner_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idea',
      description TEXT,
      notes TEXT,
      linked_keyword_ids TEXT,
      promoted_post_id INTEGER,
      promoted_target_id TEXT,
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
      pre_promote_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS planner_terms (
      id INTEGER PRIMARY KEY,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT,
      parent_id INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created')),
      wp_term_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(taxonomy, name)
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

    CREATE INDEX IF NOT EXISTS idx_planner_ideas_status ON planner_ideas(status);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_cluster ON planner_ideas(cluster);
    CREATE INDEX IF NOT EXISTS idx_planner_ideas_deadline ON planner_ideas(deadline);
    CREATE INDEX IF NOT EXISTS idx_planner_keywords_target ON planner_keywords(target_post_id);
    CREATE INDEX IF NOT EXISTS idx_planner_research_idea ON planner_research_entries(idea_id);
    CREATE INDEX IF NOT EXISTS idx_planner_research_type ON planner_research_entries(type);
    CREATE INDEX IF NOT EXISTS idx_planner_terms_taxonomy ON planner_terms(taxonomy);
    CREATE INDEX IF NOT EXISTS idx_planner_terms_status ON planner_terms(status);
  `);
}

// ---------------------------------------------------------------------------
// Legacy pre-split schema migration (v1 → v9) — invoked once during the
// first-launch split. Kept in this file so an old juggernaut.db can always
// be brought up to a known state before being copied into the split layout.
// ---------------------------------------------------------------------------

function migrateLegacyToV9(db: Database.Database): void {
  ensureSyncMeta(db);
  const version = getSchemaVersion(db, 'schema_version');
  if (version >= 9) return;

  console.log(`[db] Pre-split migration: legacy v${version} → v9`);

  db.exec('BEGIN TRANSACTION');
  try {
    if (version < 2) migrateV1toV2(db);
    if (version < 3) migrateV2toV3(db);
    if (version < 4) migrateV3toV4(db);
    if (version < 5) migrateV4toV5(db);
    if (version < 6) migrateV5toV6(db);
    if (version < 7) migrateV6toV7(db);
    if (version < 8) migrateV7toV8(db);
    if (version < 9) migrateV8toV9(db);
    setSchemaVersion(db, 'schema_version', 9);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function migrateV1toV2(db: Database.Database): void {
  if (tableExists(db, 'resources') && !tableExists(db, 'posts')) {
    db.exec(`
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
  }
  if (tableExists(db, 'resource_meta') && !tableExists(db, 'post_meta')) {
    db.exec(`
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
  }
  if (tableExists(db, 'resource_terms') && !tableExists(db, 'post_terms')) {
    db.exec(`
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
  }
  if (!tableExists(db, 'plugin_data')) {
    db.exec(`
      CREATE TABLE plugin_data (
        post_id INTEGER NOT NULL,
        plugin_id TEXT NOT NULL,
        data_key TEXT NOT NULL,
        data_value TEXT,
        PRIMARY KEY (post_id, plugin_id, data_key),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
    `);
  }
  if (tableExists(db, 'resource_seo')) {
    const rows = db.prepare('SELECT * FROM resource_seo').all() as Array<Record<string, unknown>>;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO plugin_data (post_id, plugin_id, data_key, data_value)
      VALUES (?, 'seopress', 'seo', ?)
    `);
    for (const row of rows) {
      const seoData = JSON.stringify({
        title: row.seo_title || '',
        description: row.seo_description || '',
        canonical: row.seo_canonical || '',
        targetKeywords: row.seo_target_keywords || '',
        og: { title: row.og_title || '', description: row.og_description || '', image: row.og_image || '' },
        twitter: { title: row.twitter_title || '', description: row.twitter_description || '', image: row.twitter_image || '' },
        robots: {
          noindex: row.robots_noindex === 1,
          nofollow: row.robots_nofollow === 1,
          nosnippet: row.robots_nosnippet === 1,
          noimageindex: row.robots_noimageindex === 1,
        },
      });
      stmt.run(row.resource_id, seoData);
    }
  }
  if (tableExists(db, 'change_log') && columnExists(db, 'change_log', 'resource_id')) {
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
  }
}

function migrateV2toV3(db: Database.Database): void {
  if (tableExists(db, 'posts') && !columnExists(db, 'posts', 'synced_snapshot')) {
    db.exec('ALTER TABLE posts ADD COLUMN synced_snapshot TEXT');
  }
}

function migrateV3toV4(db: Database.Database): void {
  db.exec(`
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
  `);
}

function migrateV4toV5(db: Database.Database): void {
  if (tableExists(db, 'planner_ideas') && !columnExists(db, 'planner_ideas', 'description')) {
    db.exec('ALTER TABLE planner_ideas ADD COLUMN description TEXT');
  }
}

function migrateV5toV6(db: Database.Database): void {
  if (tableExists(db, 'planner_ideas')) {
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
      if (!columnExists(db, 'planner_ideas', name)) {
        db.exec(`ALTER TABLE planner_ideas ADD COLUMN ${name} ${type}`);
      }
    }
  }
  db.exec(`
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
  `);
}

function migrateV6toV7(db: Database.Database): void {
  if (tableExists(db, 'planner_ideas')) {
    if (columnExists(db, 'planner_ideas', 'refresh_cadence') && !columnExists(db, 'planner_ideas', 'frequency')) {
      db.exec('ALTER TABLE planner_ideas RENAME COLUMN refresh_cadence TO frequency');
    }
    for (const [name, type] of [
      ['resource_type_term_id', 'INTEGER'],
      ['topic_term_ids', 'TEXT'],
      ['audience_term_ids', 'TEXT'],
    ] as Array<[string, string]>) {
      if (!columnExists(db, 'planner_ideas', name)) {
        db.exec(`ALTER TABLE planner_ideas ADD COLUMN ${name} ${type}`);
      }
    }
  }
}

function migrateV7toV8(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS planner_terms (
      id INTEGER PRIMARY KEY,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT,
      parent_id INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created')),
      wp_term_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(taxonomy, name)
    );
  `);
}

function migrateV8toV9(db: Database.Database): void {
  if (tableExists(db, 'planner_ideas') && !columnExists(db, 'planner_ideas', 'pre_promote_status')) {
    db.exec('ALTER TABLE planner_ideas ADD COLUMN pre_promote_status TEXT');
  }
}

// ---------------------------------------------------------------------------
// sync_meta helpers (present in both env and project DBs)
// ---------------------------------------------------------------------------

function ensureSyncMeta(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function getSchemaVersion(db: Database.Database, key: string): number {
  try {
    const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: Database.Database, key: string, version: number): void {
  db.prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run(key, String(version));
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all(tableName) as Array<{ name: string }>;
    return columns.some(col => col.name === columnName);
  } catch {
    return false;
  }
}
