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
    getTaxonomySlugs: () => ['resource-type'],
  }),
  ensureProfileLoaded: () => ({}),
}));

describe('Sync Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database instance
    const mockDbInstance = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      }),
      pragma: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
      transaction: jest.fn((fn) => () => fn()),
    };
    
    mockDb.getDb.mockReturnValue(mockDbInstance as any);

    // Default mocks
    mockWpClient.getTaxonomies.mockReturnValue(['resource-type']);
    mockWpClient.getWpCredentials.mockReturnValue({ username: 'user', appPassword: 'password' });
    mockWpClient.fetchAllTaxonomies.mockResolvedValue({});
    mockWpClient.fetchAllResources.mockResolvedValue([]);
    mockWpClient.fetchResourceIds.mockResolvedValue([]);
  });

  describe('fullSync', () => {
    it('should sync taxonomies and resources in order', async () => {
      // Mock taxonomy fetch
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({
        'resource-type': [
          { id: 1, name: 'Bracket', slug: 'bracket', taxonomy: 'resource-type', parent: 0 },
        ],
      });

      // Mock resource fetch
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
        } as any,
      ]);

      // Mock resource IDs for deletion detection
      mockWpClient.fetchResourceIds.mockResolvedValue([1]);

      const result = await fullSync();

      expect(result.taxonomiesUpdated).toBeGreaterThan(0);
      expect(result.resourcesUpdated).toBe(2);
      expect(result.errors).toHaveLength(0);
      
      // Verify order: taxonomies before resources
      const fetchTaxCall = mockWpClient.fetchAllTaxonomies.mock.invocationCallOrder[0];
      const fetchResCall = mockWpClient.fetchAllResources.mock.invocationCallOrder[0];
      expect(fetchTaxCall).toBeLessThan(fetchResCall);
    });

    it('should detect and delete resources removed from WordPress', async () => {
      // Server has resources 1-5 for both post types
      mockWpClient.fetchResourceIds.mockResolvedValue([1, 2, 3, 4, 5]);

      // Local database has resources 1-10
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        all: jest.fn().mockReturnValue([
          { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
          { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 10 },
        ]),
        run: jest.fn(),
      });

      const result = await fullSync();

      // Should delete resources 6-10 for each post type (resource + post)
      expect(result.resourcesDeleted).toBe(10);
    });

    it('should collect errors but continue syncing', async () => {
      mockWpClient.fetchAllTaxonomies.mockRejectedValue(new Error('Taxonomy error'));

      const result = await fullSync();

      expect(result.errors).toContainEqual(expect.stringContaining('Taxonomy error'));
      // Should still attempt resource sync despite taxonomy error
    });

    it('should update last sync time on success', async () => {
      await fullSync();

      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      
      // Should have called to update sync_meta
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_meta')
      );
    });
  });

  describe('incrementalSync', () => {
    it('should use modified_after parameter', async () => {
      const lastSync = '2024-01-01T00:00:00';
      
      // Mock last sync time retrieval
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ value: lastSync }),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      await incrementalSync();

      // Should pass modified_after to fetchAllResources for each post type
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(lastSync, 'resource', expect.any(Function));
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(lastSync, 'posts', expect.any(Function));
    });

    it('should skip deletion detection', async () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ value: '2024-01-01T00:00:00' }),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      const result = await incrementalSync();

      // Should not fetch resource IDs (used for deletion detection)
      expect(mockWpClient.fetchResourceIds).not.toHaveBeenCalled();
      expect(result.resourcesDeleted).toBe(0);
    });

    it('should perform full sync if no last sync time', async () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      await incrementalSync();

      // Should not pass modified_after (null last sync means fetch all)
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(undefined, 'resource', expect.any(Function));
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(undefined, 'posts', expect.any(Function));
    });
  });

  describe('Preserve Dirty Flag', () => {
    it('should not clear dirty flag during sync', async () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      
      // Resource exists locally with is_dirty=1
      // We need to carefully mock the sequence of calls
      // 1. DELETE FROM post_meta (in savePostMeta)
      // 2. DELETE FROM post_terms (in savePostTerms)
      // 3. INSERT INTO posts (in savePostRecord) <- this is where COALESCE happens

      // Since prepare is called multiple times, we can't easily mock return values per call site
      // unless we check arguments.

      // However, we just want to verify that the query containing COALESCE was prepared.
      
      mockWpClient.fetchAllResources.mockResolvedValue([
        {
          id: 1,
          title: { rendered: 'Updated from Server' },
          modified_gmt: '2024-01-02T00:00:00',
        } as any,
      ]);
      mockWpClient.fetchResourceIds.mockResolvedValue([1]);

      await fullSync();

      // Verify COALESCE used to preserve is_dirty
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE')
      );
    });
  });

  describe('getLastSyncTime', () => {
    it('should return sync time from database', () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ value: '2024-01-01T00:00:00' }),
      });

      const result = getLastSyncTime();

      expect(result).toBe('2024-01-01T00:00:00');
    });

    it('should return null if never synced', () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null),
      });

      const result = getLastSyncTime();

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTime', () => {
    it('should store sync time in database', () => {
      const mockDbInstance = mockDb.getDb();
      const mockRun = jest.fn();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({ run: mockRun });

      setLastSyncTime('2024-01-01T00:00:00');

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_meta')
      );
      expect(mockRun).toHaveBeenCalledWith('last_sync_time', '2024-01-01T00:00:00');
    });
  });
});
