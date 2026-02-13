/**
 * Queries Module Tests
 * Tests for database query functions
 */

import {
  getResources,
  getResourceById,
  getDirtyResources,
  updateLocalResource,
  markResourceClean,
  getAllTerms,
  getTermsByTaxonomy,
  getAllTermsGrouped,
  getSyncStats,
  saveResourceSeo,
  LocalSeoData,
} from '../queries';
import * as db from '../db';

jest.mock('../db');

describe('Queries Module', () => {
  const mockDb = db as jest.Mocked<typeof db>;
  let mockDbInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDbInstance = {
      prepare: jest.fn(),
      pragma: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    };
    
    mockDb.getDb.mockReturnValue(mockDbInstance);
  });

  describe('getResources', () => {
    it('should return all resources with no filters', () => {
      const mockResources = [
        { id: 1, title: 'Resource 1', status: 'publish', is_dirty: 0 },
        { id: 2, title: 'Resource 2', status: 'draft', is_dirty: 1 },
      ];

      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue(mockResources),
      });

      const results = getResources();

      expect(results).toHaveLength(2);
      expect(results[0].is_dirty).toBe(false); // Converted to boolean
      expect(results[1].is_dirty).toBe(true);
    });

    it('should filter by status', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue([
          { id: 1, title: 'Published', status: 'publish', is_dirty: 0 },
        ]),
      });

      const results = getResources({ status: 'publish' });

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining("status = ?")
      );
    });

    it('should filter by search term', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });

      getResources({ search: 'bracket' });

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining("LIKE")
      );
    });

    it('should filter by dirty flag', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue([
          { id: 1, title: 'Dirty Resource', status: 'publish', is_dirty: 1 },
        ]),
      });

      const results = getResources({ isDirty: true });

      expect(results).toHaveLength(1);
      expect(results[0].is_dirty).toBe(true);
    });

    it('should filter by taxonomy terms', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue([
          { id: 1, title: 'Resource 1', status: 'publish', is_dirty: 0 },
        ]),
      });

      getResources({
        taxonomies: {
          'resource-type': [45],
          topic: [12, 34],
        },
      });

      // Should query with taxonomy filters
      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });

    it('should hydrate meta_box fields', () => {
      const mockResource = {
        id: 1,
        title: 'Test',
        status: 'publish',
        is_dirty: 0,
      };

      mockDbInstance.prepare
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([mockResource]),
        })
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([
            { post_id: 1, field_id: 'version', value: '"1.0"' },
            { post_id: 1, field_id: 'updated_for_year', value: '"2024"' },
          ]),
        })
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([]),
        });

      const results = getResources();

      expect(results[0].meta_box).toBeDefined();
      expect(results[0].meta_box.version).toBe('1.0');
    });
  });

  describe('getResourceById', () => {
    it('should return resource when found', () => {
      const mockResource = {
        id: 123,
        title: 'Test Resource',
        status: 'publish',
        is_dirty: 0,
      };

      mockDbInstance.prepare
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue(mockResource),
        })
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([]),
        })
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([]),
        });

      const result = getResourceById(123);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(123);
    });

    it('should return null when not found', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null),
      });

      const result = getResourceById(999);

      expect(result).toBeNull();
    });
  });

  describe('getDirtyResources', () => {
    it('should return only dirty resources', () => {
      mockDbInstance.prepare
        .mockReturnValueOnce({
          all: jest.fn().mockReturnValue([
            { id: 1, title: 'Dirty 1', status: 'publish', is_dirty: 1 },
            { id: 2, title: 'Dirty 2', status: 'draft', is_dirty: 1 },
          ]),
        })
        .mockReturnValue({
          all: jest.fn().mockReturnValue([]),
        });

      const results = getDirtyResources();

      expect(results).toHaveLength(2);
      expect(results.every(r => r.is_dirty)).toBe(true);
    });
  });

  describe('updateLocalResource', () => {
    it('should update resource and mark as dirty', () => {
      const mockResource = {
        id: 123,
        title: 'Old Title',
        status: 'draft',
        taxonomies: {},
        meta_box: {},
      };

      const mockGet = jest.fn().mockReturnValue(mockResource);
      const mockAll = jest.fn().mockReturnValue([]);
      const mockRun = jest.fn();

      mockDbInstance.prepare
        // getResourceById call
        .mockReturnValueOnce({ get: mockGet })
        // getPostMeta call
        .mockReturnValueOnce({ all: mockAll })
        // getPostTaxonomies call
        .mockReturnValueOnce({ all: mockAll })
        // update post query
        .mockReturnValue({ run: mockRun });

      updateLocalResource(123, {
        title: 'New Title',
        status: 'publish',
      });

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE posts')
      );
      expect(mockRun).toHaveBeenCalledWith('New Title', 'publish', 123);
    });

    it('should update taxonomy assignments', () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        status: 'publish',
        taxonomies: {},
        meta_box: {},
      };

      const mockGet = jest.fn().mockReturnValue(mockResource);
      const mockAll = jest.fn().mockReturnValue([]);
      const mockRun = jest.fn();

      // Mock dirty taxonomies fetch
      const mockGetDirty = jest.fn().mockReturnValue({ value: '[]' });

      mockDbInstance.prepare
        // getResourceById call
        .mockReturnValueOnce({ get: mockGet })
        // getPostMeta call
        .mockReturnValueOnce({ all: mockAll })
        // getPostTaxonomies call
        .mockReturnValueOnce({ all: mockAll })
        // get existing dirty taxonomies
        .mockReturnValueOnce({ get: mockGetDirty })
        // subsequent delete/insert/update calls
        .mockReturnValue({ run: mockRun });

      updateLocalResource(123, {
        taxonomies: {
          'resource-type': [45],
          topic: [12, 34],
        },
      });

      // Should delete old assignments
      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM post_terms')
      );
      
      // Should insert new assignments
      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO post_terms')
      );
    });

    it('should log changes to change_log', () => {
      const mockResource = {
        id: 123,
        title: 'Old Title',
        status: 'publish',
        taxonomies: {},
        meta_box: {},
      };

      const mockGet = jest.fn().mockReturnValue(mockResource);
      const mockAll = jest.fn().mockReturnValue([]);
      const mockRun = jest.fn();

      mockDbInstance.prepare
        // getResourceById call
        .mockReturnValueOnce({ get: mockGet })
        // getPostMeta call
        .mockReturnValueOnce({ all: mockAll })
        // getPostTaxonomies call
        .mockReturnValueOnce({ all: mockAll })
        // update post query
        .mockReturnValueOnce({ run: mockRun })
        // insert change log query
        .mockReturnValue({ run: mockRun });

      updateLocalResource(123, { title: 'New Title' });

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO change_log')
      );
    });
  });

  describe('markResourceClean', () => {
    it('should clear dirty flag', () => {
      const mockRun = jest.fn();
      mockDbInstance.prepare.mockReturnValue({ run: mockRun });

      markResourceClean(123);

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('is_dirty = 0')
      );
      expect(mockRun).toHaveBeenCalledWith(123);
    });
  });

  describe('getAllTerms', () => {
    it('should return all taxonomy terms', () => {
      const mockTerms = [
        { id: 1, taxonomy: 'resource-type', name: 'Bracket', slug: 'bracket', parent_id: 0 },
        { id: 2, taxonomy: 'topic', name: 'Basketball', slug: 'basketball', parent_id: 0 },
      ];

      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue(mockTerms),
      });

      const results = getAllTerms();

      expect(results).toHaveLength(2);
    });
  });

  describe('getTermsByTaxonomy', () => {
    it('should return terms for specific taxonomy', () => {
      const mockTerms = [
        { id: 1, taxonomy: 'resource-type', name: 'Bracket', slug: 'bracket', parent_id: 0 },
      ];

      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue(mockTerms),
      });

      const results = getTermsByTaxonomy('resource-type');

      expect(results).toHaveLength(1);
      expect(results[0].taxonomy).toBe('resource-type');
    });
  });

  describe('getAllTermsGrouped', () => {
    it('should group terms by taxonomy', () => {
      const mockTerms = [
        { id: 1, taxonomy: 'resource-type', name: 'Bracket', slug: 'bracket', parent_id: 0 },
        { id: 2, taxonomy: 'resource-type', name: 'Tracker', slug: 'tracker', parent_id: 0 },
        { id: 3, taxonomy: 'topic', name: 'Basketball', slug: 'basketball', parent_id: 0 },
      ];

      mockDbInstance.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue(mockTerms),
      });

      const results = getAllTermsGrouped();

      expect(results['resource-type']).toHaveLength(2);
      expect(results.topic).toHaveLength(1);
    });
  });

  describe('getSyncStats', () => {
    it('should return sync statistics', () => {
      mockDbInstance.prepare
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 100 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 10 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 50 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ value: '2024-01-01T00:00:00' }),
        });

      const stats = getSyncStats();

      expect(stats.totalResources).toBe(100);
      expect(stats.dirtyResources).toBe(10);
      expect(stats.totalTerms).toBe(50);
      expect(stats.lastSync).toBe('2024-01-01T00:00:00');
    });

    it('should handle null last sync', () => {
      mockDbInstance.prepare
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          get: jest.fn().mockReturnValue(null),
        });

      const stats = getSyncStats();

      expect(stats.lastSync).toBeNull();
    });
  });

  describe('saveResourceSeo', () => {
    const mockSeo: LocalSeoData = {
      title: 'Test Title',
      description: 'Test Description',
      canonical: 'https://example.com',
      targetKeywords: 'test',
      og: { title: 'OG Title', description: 'OG Description', image: 'og.jpg' },
      twitter: { title: 'Twitter Title', description: 'Twitter Description', image: 'twitter.jpg' },
      robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
    };

    it('should save SEO data and mark resource as dirty by default', () => {
      const mockRun = jest.fn();
      mockDbInstance.prepare.mockReturnValue({ run: mockRun });

      saveResourceSeo(123, mockSeo);

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO plugin_data')
      );
      expect(mockRun).toHaveBeenCalledWith(123, JSON.stringify(mockSeo));

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE posts SET is_dirty = 1')
      );
      expect(mockRun).toHaveBeenCalledWith(123);
    });

    it('should save SEO data but not mark as dirty when markDirty is false', () => {
      const mockRun = jest.fn();
      mockDbInstance.prepare.mockReturnValue({ run: mockRun });

      saveResourceSeo(123, mockSeo, false);

      expect(mockDbInstance.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO plugin_data')
      );
      expect(mockRun).toHaveBeenCalledWith(123, JSON.stringify(mockSeo));

      expect(mockDbInstance.prepare).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE posts SET is_dirty = 1')
      );
    });
  });
});
