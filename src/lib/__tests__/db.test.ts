/**
 * Database Module Tests
 * Tests for SQLite database connection and schema initialization
 */

// Set DATABASE_PATH BEFORE importing db module so the module-level constant picks it up
process.env.DATABASE_PATH = './test-data/test.db';

import { getDb, closeDb } from '../db';
import fs from 'fs';
import path from 'path';

describe('Database Module', () => {
  afterAll(() => {
    // Clean up test database after all tests complete
    try {
      closeDb();
      const dbPath = path.resolve(process.cwd(), './test-data/test.db');
      const dbDir = path.dirname(dbPath);
      for (const ext of ['', '-shm', '-wal']) {
        const file = dbPath + ext;
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
    } catch {
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

    it('should initialize schema with all required tables', () => {
      const db = getDb();

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
      expect(tableNames).toContain('plugin_data');
      expect(tableNames).toContain('change_log');
      expect(tableNames).toContain('field_audit');
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
      expect(indexNames).toContain('idx_posts_post_type');
      expect(indexNames).toContain('idx_posts_status');
      expect(indexNames).toContain('idx_posts_dirty');
      expect(indexNames).toContain('idx_plugin_data_plugin');
      expect(indexNames).toContain('idx_plugin_data_post');
    });

    it('should enable WAL mode', () => {
      const db = getDb();
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
    });
  });

  describe('closeDb', () => {
    it('should close the database and allow creating a new instance', () => {
      const db = getDb();
      closeDb();

      // Getting a new instance should work
      const newDb = getDb();
      expect(newDb).toBeDefined();
      expect(newDb.prepare).toBeDefined();

      // The new db should still have schema
      const tables = newDb.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='posts'
      `).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('Schema Integrity', () => {
    it('should enforce foreign key constraints on post_meta', () => {
      const db = getDb();

      // Try to insert post_meta without parent post — should fail
      expect(() => {
        db.prepare(`
          INSERT INTO post_meta (post_id, field_id, value)
          VALUES (99999, 'test_field', 'test_value')
        `).run();
      }).toThrow();
    });

    it('should cascade delete post_meta when post deleted', () => {
      const db = getDb();

      // Use unique IDs to avoid conflicts with other tests
      const postId = 10001;

      // Insert post
      db.prepare(`
        INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, modified_gmt, synced_at)
        VALUES (?, 'resource', 'Cascade Test', 'cascade-test', 'publish', '2024-01-01', '2024-01-01')
      `).run(postId);

      // Insert meta
      db.prepare(`
        INSERT OR REPLACE INTO post_meta (post_id, field_id, value)
        VALUES (?, 'test_field', 'test_value')
      `).run(postId);

      // Delete post — meta should cascade
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

      const meta = db.prepare('SELECT * FROM post_meta WHERE post_id = ?').all(postId);
      expect(meta).toHaveLength(0);
    });

    it('should enforce unique constraint on (post_id, term_id)', () => {
      const db = getDb();

      const postId = 10002;
      const termId = 10002;

      // Insert post and term
      db.prepare(`
        INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, modified_gmt, synced_at)
        VALUES (?, 'resource', 'Unique Test', 'unique-test', 'publish', '2024-01-01', '2024-01-01')
      `).run(postId);

      db.prepare(`
        INSERT OR REPLACE INTO terms (id, taxonomy, name, slug)
        VALUES (?, 'topic', 'Test Topic', 'test-topic')
      `).run(termId);

      // First insert should succeed
      db.prepare(`
        INSERT OR REPLACE INTO post_terms (post_id, term_id, taxonomy)
        VALUES (?, ?, 'topic')
      `).run(postId, termId);

      // Duplicate should fail (INSERT without OR REPLACE)
      expect(() => {
        db.prepare(`
          INSERT INTO post_terms (post_id, term_id, taxonomy)
          VALUES (?, ?, 'topic')
        `).run(postId, termId);
      }).toThrow();

      // Clean up
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
      db.prepare('DELETE FROM terms WHERE id = ?').run(termId);
    });
  });

  describe('Performance', () => {
    it('should initialize database quickly', () => {
      // Force fresh initialization by closing and re-opening
      closeDb();

      const start = Date.now();
      getDb();
      const duration = Date.now() - start;

      // Should complete in under 200ms (allows for WAL + schema check)
      expect(duration).toBeLessThan(200);
    });
  });
});
