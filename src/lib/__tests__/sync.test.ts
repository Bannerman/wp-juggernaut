/**
 * Sync Engine Module Tests
 * Tests for synchronization orchestration between WordPress and local database
 */

import { fullSync, incrementalSync, getLastSyncTime, setLastSyncTime } from '../sync';
import * as wpClient from '../wp-client';
import * as db from '../db';

// Mock dependencies
jest.mock('../wp-client');
jest.mock('../db');
jest.mock('../profiles', () => ({
  getProfileManager: () => ({
    getPostTypes: () => [
      { slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true },
      { slug: 'post', rest_base: 'posts', name: 'Posts', is_primary: false },
    ],
    getPrimaryPostType: () => ({ slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true }),
    getTaxonomySlugs: () => ['resource-type', 'topic'],
  }),
  ensureProfileLoaded: () => ({}),
  getProfileTaxonomyMetaFieldMapping: () => ({
    'resource-type': 'tax_resource_type',
    topic: 'tax_topic',
  }),
}));
jest.mock('../field-audit', () => ({
  collectMetaBoxKeys: jest.fn().mockReturnValue(new Map()),
  runFieldAudit: jest.fn().mockReturnValue([]),
  saveAuditResults: jest.fn().mockReturnValue('2024-01-01'),
}));
jest.mock('../queries', () => ({
  saveResourceSeo: jest.fn(),
}));
jest.mock('../utils', () => ({
  decodeHtmlEntities: (s: string) => s,
  pMap: jest.fn().mockImplementation(async (items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
    return Promise.all(items.map(fn));
  }),
}));

describe('Sync Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockDb = db as jest.Mocked<typeof db>;

  let mockPrepare: jest.Mock;
  let mockRun: jest.Mock;
  let mockGet: jest.Mock;
  let mockAll: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRun = jest.fn();
    mockGet = jest.fn().mockReturnValue(null);
    mockAll = jest.fn().mockReturnValue([]);
    mockPrepare = jest.fn().mockReturnValue({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    });

    const mockDbInstance = {
      prepare: mockPrepare,
      pragma: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
      // transaction() wraps a function — call it immediately with the provided args
      transaction: jest.fn().mockImplementation((fn: (...args: unknown[]) => void) => {
        return (...args: unknown[]) => fn(...args);
      }),
    };

    mockDb.getDb.mockReturnValue(mockDbInstance as any);

    // Default: getTaxonomies returns profile-driven taxonomies
    mockWpClient.getTaxonomies.mockReturnValue(['resource-type', 'topic']);
    mockWpClient.getPrimaryPostTypeRestBase.mockReturnValue('resource');
  });

  describe('fullSync', () => {
    it('should sync taxonomies and resources in order', async () => {
      // Mock taxonomy fetch
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({
        'resource-type': [
          { id: 1, name: 'Bracket', slug: 'bracket', taxonomy: 'resource-type', parent: 0 },
        ],
        topic: [],
      });

      // Mock resource fetch (called with restBase + onProgress callback)
      mockWpClient.fetchAllResources.mockResolvedValue([
        {
          id: 1,
          title: { rendered: 'Test Resource' },
          slug: 'test-resource',
          status: 'publish',
          content: { rendered: '' },
          excerpt: { rendered: '' },
          featured_media: 0,
          date_gmt: '2024-01-01T00:00:00',
          modified_gmt: '2024-01-01T00:00:00',
          'resource-type': [1],
          topic: [],
        } as any,
      ]);

      // Mock resource IDs for deletion detection
      mockWpClient.fetchResourceIds.mockResolvedValue([1]);

      const result = await fullSync();

      expect(result.taxonomiesUpdated).toBeGreaterThan(0);
      expect(result.resourcesUpdated).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      // Verify order: taxonomies before resources
      const fetchTaxCall = mockWpClient.fetchAllTaxonomies.mock.invocationCallOrder[0];
      const fetchResCall = mockWpClient.fetchAllResources.mock.invocationCallOrder[0];
      expect(fetchTaxCall).toBeLessThan(fetchResCall);
    });

    it('should detect and delete resources removed from WordPress', async () => {
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

      // Server has resources 1-5
      mockWpClient.fetchResourceIds.mockResolvedValue([1, 2, 3, 4, 5]);

      // Local database has resources 1-10
      mockAll.mockReturnValue([
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
        { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 10 },
      ]);

      const result = await fullSync();

      // Should delete resources 6-10 for each post type (resource + post)
      expect(result.resourcesDeleted).toBe(10);
    });

    it('should collect errors but continue syncing', async () => {
      mockWpClient.fetchAllTaxonomies.mockRejectedValue(new Error('Taxonomy error'));
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      const result = await fullSync();

      // Error message now includes prefix from sync.ts
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Taxonomy');
    });

    it('should update last sync time on success', async () => {
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      await fullSync();

      // Should have called prepare with INSERT OR REPLACE INTO sync_meta
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_meta')
      );
    });
  });

  describe('incrementalSync', () => {
    it('should use modified_after parameter', async () => {
      const lastSync = '2024-01-01T00:00:00';

      // Mock last sync time retrieval
      mockGet.mockReturnValue({ value: lastSync });

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

      await incrementalSync();

      // fetchAllResources is called with (lastSync, restBase, onProgress) for each post type
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        lastSync, 'resource', expect.any(Function)
      );
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        lastSync, 'posts', expect.any(Function)
      );
    });

    it('should skip deletion detection', async () => {
      mockGet.mockReturnValue({ value: '2024-01-01T00:00:00' });

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

      const result = await incrementalSync();

      // Should not fetch resource IDs (used for deletion detection)
      expect(mockWpClient.fetchResourceIds).not.toHaveBeenCalled();
      expect(result.resourcesDeleted).toBe(0);
    });

    it('should perform full sync if no last sync time', async () => {
      mockGet.mockReturnValue(null);

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      await incrementalSync();

      // With no last sync, modified_after should be undefined — triggers full fetch
      // fetchAllResources is called with (undefined, restBase, onProgress)
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        undefined, 'resource', expect.any(Function)
      );
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        undefined, 'posts', expect.any(Function)
      );
    });
  });

  describe('Preserve Dirty Flag', () => {
    it('should check is_dirty and skip overwrite for dirty posts', async () => {
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([
        {
          id: 1,
          title: { rendered: 'Updated from Server' },
          slug: 'test',
          status: 'publish',
          content: { rendered: '' },
          excerpt: { rendered: '' },
          featured_media: 0,
          date_gmt: '2024-01-01T00:00:00',
          modified_gmt: '2024-01-02T00:00:00',
        } as any,
      ]);
      mockWpClient.fetchResourceIds.mockResolvedValue([1]);

      await fullSync();

      // Should query is_dirty to decide whether to overwrite or only update snapshot
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT is_dirty FROM posts')
      );
      // Should store synced_snapshot in the INSERT
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('synced_snapshot')
      );
    });
  });

  describe('getLastSyncTime', () => {
    it('should return sync time from database', () => {
      mockGet.mockReturnValue({ value: '2024-01-01T00:00:00' });

      const result = getLastSyncTime();

      expect(result).toBe('2024-01-01T00:00:00');
    });

    it('should return null if never synced', () => {
      mockGet.mockReturnValue(null);

      const result = getLastSyncTime();

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTime', () => {
    it('should store sync time in database', () => {
      setLastSyncTime('2024-01-01T00:00:00');

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_meta')
      );
      expect(mockRun).toHaveBeenCalledWith('last_sync_time', '2024-01-01T00:00:00');
    });
  });
});
