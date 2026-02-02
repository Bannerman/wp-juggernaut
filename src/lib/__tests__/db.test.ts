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

    it('should create database directory if it does not exist', () => {
      const db = getDb();
      const dbPath = path.resolve(process.cwd(), TEST_DB_PATH);
      const dbDir = path.dirname(dbPath);
      expect(fs.existsSync(dbDir)).toBe(true);
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
      expect(tableNames).toContain('resources');
      expect(tableNames).toContain('resource_meta');
      expect(tableNames).toContain('resource_terms');
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
      expect(indexNames).toContain('idx_resource_terms_resource');
      expect(indexNames).toContain('idx_resource_terms_taxonomy');
      expect(indexNames).toContain('idx_resource_meta_resource');
      expect(indexNames).toContain('idx_resources_status');
      expect(indexNames).toContain('idx_resources_dirty');
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
      
      // Try to insert resource_meta without parent resource
      expect(() => {
        db.prepare(`
          INSERT INTO resource_meta (resource_id, field_id, value)
          VALUES (999, 'test_field', 'test_value')
        `).run();
      }).toThrow();
    });

    it('should cascade delete resource_meta when resource deleted', () => {
      const db = getDb();
      
      // Insert resource
      db.prepare(`
        INSERT INTO resources (id, title, slug, status, modified_gmt, synced_at)
        VALUES (1, 'Test', 'test', 'publish', '2024-01-01', '2024-01-01')
      `).run();
      
      // Insert meta
      db.prepare(`
        INSERT INTO resource_meta (resource_id, field_id, value)
        VALUES (1, 'test_field', 'test_value')
      `).run();
      
      // Delete resource
      db.prepare('DELETE FROM resources WHERE id = 1').run();
      
      // Meta should be deleted
      const meta = db.prepare('SELECT * FROM resource_meta WHERE resource_id = 1').all();
      expect(meta).toHaveLength(0);
    });

    it('should enforce unique constraint on (resource_id, term_id)', () => {
      const db = getDb();
      
      // Insert resource and term
      db.prepare(`
        INSERT INTO resources (id, title, slug, status, modified_gmt, synced_at)
        VALUES (1, 'Test', 'test', 'publish', '2024-01-01', '2024-01-01')
      `).run();
      
      db.prepare(`
        INSERT INTO terms (id, taxonomy, name, slug)
        VALUES (1, 'topic', 'Test Topic', 'test-topic')
      `).run();
      
      // Insert assignment
      db.prepare(`
        INSERT INTO resource_terms (resource_id, term_id, taxonomy)
        VALUES (1, 1, 'topic')
      `).run();
      
      // Duplicate should fail
      expect(() => {
        db.prepare(`
          INSERT INTO resource_terms (resource_id, term_id, taxonomy)
          VALUES (1, 1, 'topic')
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
