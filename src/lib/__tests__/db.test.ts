/**
 * Database Module Tests
 * Tests for SQLite database connection and schema initialization
 */

import Database from 'better-sqlite3';
import { getDb, closeDb } from '../db';
import fs from 'fs';
import path from 'path';

describe('Database Module', () => {
  const TEST_DB_PATH = './test-data/test.db';

  beforeAll(() => {
    // Set test database path
    process.env.DATABASE_PATH = TEST_DB_PATH;
  });

  afterEach(() => {
    // Clean up: close database and remove test file
    try {
      closeDb();
      const dbPath = path.resolve(process.cwd(), TEST_DB_PATH);
      const dbDir = path.dirname(dbPath);
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      if (fs.existsSync(`${dbPath}-shm`)) {
        fs.unlinkSync(`${dbPath}-shm`);
      }
      if (fs.existsSync(`${dbPath}-wal`)) {
        fs.unlinkSync(`${dbPath}-wal`);
      }
      if (fs.existsSync(dbDir)) {
        fs.rmdirSync(dbDir, { recursive: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('getDb', () => {
    it('should return a database instance', () => {
      const db = getDb();
      expect(db).toBeDefined();
      expect(db.prepare).toBeDefined();
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });

    it('should initialize schema on first call', () => {
      const db = getDb();

      // Check that all tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        ORDER BY name
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('sync_meta');
      expect(tableNames).toContain('terms');
      expect(tableNames).toContain('posts');
      expect(tableNames).toContain('post_meta');
      expect(tableNames).toContain('post_terms');
      expect(tableNames).toContain('change_log');
    });

    it('should create all required indexes', () => {
      const db = getDb();

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as { name: string }[];

      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_terms_taxonomy');
      expect(indexNames).toContain('idx_post_terms_post');
      expect(indexNames).toContain('idx_post_terms_taxonomy');
      expect(indexNames).toContain('idx_post_meta_post');
      expect(indexNames).toContain('idx_posts_status');
      expect(indexNames).toContain('idx_posts_dirty');
    });

    it('should enable WAL mode', () => {
      const db = getDb();
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
    });
  });

  describe('closeDb', () => {
    it('should close the database connection', () => {
      const db = getDb();
      closeDb();

      // Attempting to use closed database should throw
      expect(() => {
        db.prepare('SELECT 1').get();
      }).toThrow();
    });

    it('should allow creating new instance after close', () => {
      getDb();
      closeDb();
      const newDb = getDb();

      expect(newDb).toBeDefined();
      expect(newDb.prepare).toBeDefined();
    });
  });

  describe('Schema Integrity', () => {
    it('should enforce foreign key constraints', () => {
      const db = getDb();

      // Enable foreign keys (SQLite requires explicit enabling)
      db.pragma('foreign_keys = ON');

      // Try to insert post_meta without parent post
      expect(() => {
        db.prepare(`
          INSERT INTO post_meta (post_id, field_id, value)
          VALUES (999, 'test_field', 'test_value')
        `).run();
      }).toThrow();
    });

    it('should cascade delete post_meta when post deleted', () => {
      const db = getDb();

      // Enable foreign keys
      db.pragma('foreign_keys = ON');

      // Use unique IDs to avoid collisions with other tests
      db.prepare(`
        INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, modified_gmt, synced_at)
        VALUES (100, 'resource', 'Test', 'test-cascade', 'publish', '2024-01-01', '2024-01-01')
      `).run();

      db.prepare(`
        INSERT OR REPLACE INTO post_meta (post_id, field_id, value)
        VALUES (100, 'test_field', 'test_value')
      `).run();

      // Delete post
      db.prepare('DELETE FROM posts WHERE id = 100').run();

      // Meta should be cascade-deleted
      const meta = db.prepare('SELECT * FROM post_meta WHERE post_id = 100').all();
      expect(meta).toHaveLength(0);
    });

    it('should enforce unique constraint on (post_id, term_id)', () => {
      const db = getDb();

      // Use unique IDs to avoid collisions with other tests
      db.prepare(`
        INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, modified_gmt, synced_at)
        VALUES (200, 'resource', 'Test', 'test-unique', 'publish', '2024-01-01', '2024-01-01')
      `).run();

      db.prepare(`
        INSERT OR REPLACE INTO terms (id, taxonomy, name, slug)
        VALUES (200, 'topic', 'Test Topic', 'test-topic')
      `).run();

      // Insert assignment
      db.prepare(`
        INSERT OR REPLACE INTO post_terms (post_id, term_id, taxonomy)
        VALUES (200, 200, 'topic')
      `).run();

      // Duplicate should fail
      expect(() => {
        db.prepare(`
          INSERT INTO post_terms (post_id, term_id, taxonomy)
          VALUES (200, 200, 'topic')
        `).run();
      }).toThrow();
    });
  });

  describe('Performance', () => {
    it('should initialize database quickly', () => {
      const start = Date.now();
      getDb();
      const duration = Date.now() - start;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
