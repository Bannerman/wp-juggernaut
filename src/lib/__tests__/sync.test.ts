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
jest.mock('../queries', () => ({
  saveResourceSeo: jest.fn(),
}));
jest.mock('../field-audit', () => ({
  collectMetaBoxKeys: jest.fn().mockReturnValue({}),
  runFieldAudit: jest.fn().mockReturnValue([]),
  saveAuditResults: jest.fn().mockReturnValue('2024-01-01T00:00:00'),
}));
jest.mock('../utils', () => ({
  decodeHtmlEntities: (s: string) => s,
  pMap: async <T, R>(items: T[], fn: (item: T) => Promise<R>, _concurrency?: number) => {
    const results: R[] = [];
    for (const item of items) {
      results.push(await fn(item));
    }
    return results;
  },
}));
jest.mock('../profiles', () => ({
  getProfileManager: () => ({
    getPostTypes: () => [
      { slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true },
      { slug: 'post', rest_base: 'posts', name: 'Posts', is_primary: false },
    ],
    getPrimaryPostType: () => ({ slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true }),
    getTaxonomySlugs: () => ['resource-type', 'topic'],
    getCurrentProfile: () => ({
      taxonomies: [
        { slug: 'resource-type', rest_base: 'resource-type' },
        { slug: 'topic', rest_base: 'topic' },
      ],
    }),
  }),
  ensureProfileLoaded: () => ({}),
  getProfileTaxonomyMetaFieldMapping: () => ({}),
}));
jest.mock('../site-config', () => ({
  getActiveBaseUrl: () => 'https://test.example.com',
  getActiveTarget: () => ({ id: 'test', url: 'https://test.example.com', name: 'Test' }),
  getCredentials: () => ({ username: 'testuser', appPassword: 'testpass' }),
  getConfig: () => ({ activeTarget: 'test' }),
}));

// Mock global fetch for fetchMediaUrl / fetchSeoData
global.fetch = jest.fn().mockResolvedValue({
  ok: false,
  status: 404,
  json: async () => ({}),
} as Response);

describe('Sync Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();

    // Provide explicit implementations for auto-mocked wp-client utility functions
    mockWpClient.getTaxonomies.mockReturnValue(['resource-type', 'topic']);
    mockWpClient.getWpBaseUrl.mockReturnValue('https://test.example.com');
    mockWpClient.getWpCredentials.mockReturnValue({ username: 'testuser', appPassword: 'testpass' });
    (mockWpClient as any).getPrimaryPostTypeRestBase?.mockReturnValue?.('resource');

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
      transaction: jest.fn((fn: Function) => fn),
    };

    mockDb.getDb.mockReturnValue(mockDbInstance as any);
  });

  describe('fullSync', () => {
    it('should sync taxonomies and resources in order', async () => {
      // Mock taxonomy fetch
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({
        'resource-type': [
          { id: 1, name: 'Bracket', slug: 'bracket', taxonomy: 'resource-type', parent: 0, count: 0 },
        ],
        topic: [],
      });

      // Mock resource fetch — returns 1 resource per post type call
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
          date: '2024-01-01T00:00:00',
          modified: '2024-01-01T00:00:00',
          'resource-type': [1],
          topic: [],
        } as any,
      ]);

      // Mock resource IDs for deletion detection
      mockWpClient.fetchResourceIds.mockResolvedValue([1]);

      const result = await fullSync();

      expect(result.taxonomiesUpdated).toBeGreaterThan(0);
      // 2 post types (resource + post), each returning 1 resource = 2 total
      expect(result.resourcesUpdated).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify order: taxonomies before resources
      const fetchTaxCall = mockWpClient.fetchAllTaxonomies.mock.invocationCallOrder[0];
      const fetchResCall = mockWpClient.fetchAllResources.mock.invocationCallOrder[0];
      expect(fetchTaxCall).toBeLessThan(fetchResCall);
    });

    it('should detect and delete resources removed from WordPress', async () => {
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

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

      // Re-mock transaction since we changed prepare
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      const result = await fullSync();

      // Should delete resources 6-10 for each post type (resource + post)
      expect(result.resourcesDeleted).toBe(10);
    });

    it('should collect errors but continue syncing', async () => {
      mockWpClient.fetchAllTaxonomies.mockRejectedValue(new Error('Taxonomy error'));
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      // Mock transaction
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      const result = await fullSync();

      expect(result.errors.some(e => e.includes('Taxonomy'))).toBe(true);
    });

    it('should complete without errors on empty sync', async () => {
      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      // Mock transaction
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      const result = await fullSync();

      // Should complete without errors
      expect(result.errors).toHaveLength(0);
      expect(result.resourcesUpdated).toBe(0);
      expect(result.resourcesDeleted).toBe(0);
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
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

      await incrementalSync();

      // Should pass modified_after to fetchAllResources for each post type
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        lastSync, 'resource', expect.any(Function)
      );
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        lastSync, 'posts', expect.any(Function)
      );
    });

    it('should skip deletion detection', async () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;
      mockPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ value: '2024-01-01T00:00:00' }),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);

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
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
      mockWpClient.fetchAllResources.mockResolvedValue([]);
      mockWpClient.fetchResourceIds.mockResolvedValue([]);

      await incrementalSync();

      // Should not pass modified_after (null last sync means fetch all)
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        undefined, 'resource', expect.any(Function)
      );
      expect(mockWpClient.fetchAllResources).toHaveBeenCalledWith(
        undefined, 'posts', expect.any(Function)
      );
    });
  });

  describe('Preserve Dirty Flag', () => {
    it('should not clear dirty flag during sync', async () => {
      const mockDbInstance = mockDb.getDb();
      const mockPrepare = mockDbInstance.prepare as jest.Mock;

      // Resource exists locally with is_dirty=1
      const mockGet = jest.fn()
        .mockReturnValueOnce({ is_dirty: 1 }) // Check if exists
        .mockReturnValueOnce(null); // Other queries

      mockPrepare.mockReturnValue({
        get: mockGet,
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });
      (mockDbInstance as any).transaction = jest.fn((fn: Function) => fn);

      mockWpClient.fetchAllTaxonomies.mockResolvedValue({} as any);
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
