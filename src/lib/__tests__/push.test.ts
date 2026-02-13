/**
 * Push Engine Module Tests
 * Tests for pushing local changes to WordPress
 */

import {
  pushResource,
  pushAllDirty,
  checkForConflicts,
} from '../push';
import * as wpClient from '../wp-client';
import * as queries from '../queries';
import * as db from '../db';

jest.mock('../wp-client');
jest.mock('../queries');
jest.mock('../db');
jest.mock('../profiles', () => ({
  getProfileManager: () => ({
    getTaxonomySlugs: () => ['resource-type', 'topic', 'access_level'],
    getPrimaryPostType: () => ({ slug: 'resource', rest_base: 'resource' }),
    getPostTypes: () => [{ slug: 'resource', rest_base: 'resource' }],
  }),
  ensureProfileLoaded: () => {},
  getProfileTaxonomyMetaFieldMapping: () => ({
    'resource-type': 'tax_resource_type',
    topic: 'tax_topic',
    access_level: 'tax_access_level',
  }),
}));
jest.mock('../plugins/bundled/seopress', () => ({
  seopressPlugin: {
    updateSEOData: jest.fn().mockResolvedValue({ success: true, errors: [] }),
  },
}));
jest.mock('../site-config', () => ({
  getActiveBaseUrl: () => 'https://test.example.com',
  getActiveTarget: () => ({ id: 'test', url: 'https://test.example.com', name: 'Test' }),
  getCredentials: () => ({ username: 'testuser', appPassword: 'testpass' }),
  getConfig: () => ({ activeTarget: 'test' }),
}));

describe('Push Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockQueries = queries as jest.Mocked<typeof queries>;
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Provide explicit implementations for auto-mocked wp-client utility functions
    mockWpClient.getTaxonomies.mockReturnValue(['resource-type', 'topic', 'access_level']);
    mockWpClient.getWpBaseUrl.mockReturnValue('https://test.example.com');
    mockWpClient.getWpCredentials.mockReturnValue({ username: 'testuser', appPassword: 'testpass' });
    (mockWpClient as any).getPrimaryPostTypeRestBase?.mockReturnValue?.('resource');

    // Mock database instance for checkForConflicts and pushResource
    const mockDbInstance = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(),
      }),
      pragma: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    };
    mockDb.getDb.mockReturnValue(mockDbInstance as any);

    // Default mock for getResourceSeo (SEO push)
    mockQueries.getResourceSeo.mockReturnValue({
      title: '', description: '', canonical: '', targetKeywords: '',
      og: { title: '', description: '', image: '' },
      twitter: { title: '', description: '', image: '' },
      robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
    });
  });

  describe('checkForConflicts', () => {
    it('should detect conflicts when server modified after local', async () => {
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
        }),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        title: { rendered: 'Test' },
        modified_gmt: '2024-01-02T00:00:00',
      } as any);

      const conflicts = await checkForConflicts([123]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].resourceId).toBe(123);
      expect(conflicts[0].localModified).toBe('2024-01-01T00:00:00');
      expect(conflicts[0].serverModified).toBe('2024-01-02T00:00:00');
    });

    it('should not detect conflict when timestamps match', async () => {
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
        }),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any);

      const conflicts = await checkForConflicts([123]);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle multiple resources', async () => {
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        get: jest.fn()
          .mockReturnValueOnce({ id: 1, title: 'R1', modified_gmt: '2024-01-01' })
          .mockReturnValueOnce({ id: 2, title: 'R2', modified_gmt: '2024-01-01' }),
      });

      mockWpClient.fetchResourceById
        .mockResolvedValueOnce({ id: 1, modified_gmt: '2024-01-02' } as any)
        .mockResolvedValueOnce({ id: 2, modified_gmt: '2024-01-01' } as any);

      const conflicts = await checkForConflicts([1, 2]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].resourceId).toBe(1);
    });
  });

  describe('pushResource', () => {
    it('should push resource successfully', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        slug: 'test',
        status: 'publish' as const,
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      const updatedResource = {
        ...mockResource,
        title: { rendered: 'Test' },
        modified_gmt: '2024-01-02T00:00:00',
        status: 'publish',
      };

      const mockDbInstance = mockDb.getDb();
      // For conflict check
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
        }),
        run: jest.fn(),
      });

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.fetchResourceById.mockResolvedValue(mockResource as any);
      mockWpClient.updateResource.mockResolvedValue(updatedResource as any);

      const result = await pushResource(123);

      expect(result.success).toBe(true);
      expect(result.resourceId).toBe(123);
    });

    it('should skip push on conflict by default', async () => {
      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
        }),
        run: jest.fn(),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-02T00:00:00',
      } as any);

      const result = await pushResource(123);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Conflict');
      expect(mockWpClient.updateResource).not.toHaveBeenCalled();
    });

    it('should push despite conflict when skipConflictCheck=true', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        slug: 'test',
        status: 'publish' as const,
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      const updatedResource = {
        ...mockResource,
        title: { rendered: 'Test' },
        modified_gmt: '2024-01-02T00:00:00',
        status: 'publish',
      };

      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
      });

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockResolvedValue(updatedResource as any);

      const result = await pushResource(123, true);

      expect(result.success).toBe(true);
      expect(mockWpClient.fetchResourceById).not.toHaveBeenCalled();
    });

    it('should preserve dirty flag on failure', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        slug: 'test',
        status: 'publish',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
      });

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockRejectedValue(new Error('Server error'));

      const result = await pushResource(123, true);

      expect(result.success).toBe(false);
    });
  });

  describe('pushAllDirty', () => {
    it('should push all dirty resources individually', async () => {
      const dirtyResources = [
        { id: 1, title: 'R1', slug: 'r1', status: 'publish', featured_media: 0, taxonomies: {}, meta_box: {} },
        { id: 2, title: 'R2', slug: 'r2', status: 'publish', featured_media: 0, taxonomies: {}, meta_box: {} },
        { id: 3, title: 'R3', slug: 'r3', status: 'publish', featured_media: 0, taxonomies: {}, meta_box: {} },
      ];

      const mockDbInstance = mockDb.getDb();
      (mockDbInstance.prepare as jest.Mock).mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
      });

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );
      mockWpClient.updateResource.mockImplementation(async (id) => ({
        id,
        title: { rendered: 'Updated' },
        modified_gmt: '2024-01-02T00:00:00',
        status: 'publish',
      } as any));

      const result = await pushAllDirty(true); // Skip conflict check

      // Should push individually (no batch)
      expect(mockWpClient.updateResource).toHaveBeenCalledTimes(3);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
    }, 10000);

    it('should return empty results when no dirty resources', async () => {
      mockQueries.getDirtyResources.mockReturnValue([]);

      const result = await pushAllDirty();

      expect(result.results).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });
  });
});
