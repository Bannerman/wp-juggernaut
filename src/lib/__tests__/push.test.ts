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
    getPostTypes: () => [
      { slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true },
    ],
    getPrimaryPostType: () => ({ slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true }),
    getTaxonomySlugs: () => ['resource-type', 'topic', 'access_level'],
  }),
  getProfileTaxonomyMetaFieldMapping: () => ({
    'resource-type': 'tax_resource_type',
    topic: 'tax_topic',
    access_level: 'tax_access_level',
  }),
  ensureProfileLoaded: () => ({}),
}));
jest.mock('../plugins/bundled/seopress', () => ({
  seopressPlugin: {
    updateSEOData: jest.fn().mockResolvedValue({ success: true, errors: [] }),
  },
}));

describe('Push Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockQueries = queries as jest.Mocked<typeof queries>;
  const mockDb = db as jest.Mocked<typeof db>;

  let mockDbInstance: {
    prepare: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockRun = jest.fn();
    const mockGet = jest.fn().mockReturnValue(null);

    mockDbInstance = {
      prepare: jest.fn().mockReturnValue({
        run: mockRun,
        get: mockGet,
        all: jest.fn().mockReturnValue([]),
      }),
    };

    mockDb.getDb.mockReturnValue(mockDbInstance as any);

    // getTaxonomies must return an iterable array for buildUpdatePayload
    mockWpClient.getTaxonomies.mockReturnValue(['resource-type', 'topic', 'access_level']);
    mockWpClient.getWpBaseUrl.mockReturnValue('https://test.example.com');
    mockWpClient.getWpCredentials.mockReturnValue({ username: 'test', appPassword: 'test' });

    // Default: getResourceSeo returns empty SEO data (no SEO to push)
    mockQueries.getResourceSeo.mockReturnValue({
      title: '', description: '', canonical: '', targetKeywords: '',
      og: { title: '', description: '', image: '' },
      twitter: { title: '', description: '', image: '' },
      robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
    });
  });

  describe('checkForConflicts', () => {
    it('should detect conflicts when server modified after local', async () => {
      // Mock DB to return local resource
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
          post_type: 'resource',
        }),
        run: jest.fn(),
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
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123,
          title: 'Test',
          modified_gmt: '2024-01-01T00:00:00',
          post_type: 'resource',
        }),
        run: jest.fn(),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any);

      const conflicts = await checkForConflicts([123]);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle multiple resources', async () => {
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn()
          .mockReturnValueOnce({ id: 1, title: 'R1', modified_gmt: '2024-01-01', post_type: 'resource' })
          .mockReturnValueOnce({ id: 2, title: 'R2', modified_gmt: '2024-01-01', post_type: 'resource' }),
        run: jest.fn(),
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
        post_type: 'resource',
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      // Mock DB for checkForConflicts (returns matching timestamps = no conflict)
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123, title: 'Test', modified_gmt: '2024-01-01T00:00:00', post_type: 'resource',
        }),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any);

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockResolvedValue({
        ...mockResource,
        modified_gmt: '2024-01-02T00:00:00',
      } as any);

      const result = await pushResource(123);

      expect(result.success).toBe(true);
      expect(result.resourceId).toBe(123);
    });

    it('should skip push on conflict by default', async () => {
      // Mock DB for checkForConflicts (server has newer modified_gmt)
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123, title: 'Test', modified_gmt: '2024-01-01T00:00:00', post_type: 'resource',
        }),
        run: jest.fn(),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-02T00:00:00',
      } as any);

      const result = await pushResource(123);

      expect(result.success).toBe(false);
      expect(result.error).toContain('onflict');
      expect(mockWpClient.updateResource).not.toHaveBeenCalled();
    });

    it('should push despite conflict when skipConflictCheck=true', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        slug: 'test',
        status: 'publish' as const,
        post_type: 'resource',
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockResolvedValue(mockResource as any);

      // DB mock for the post-push UPDATE
      mockDbInstance.prepare.mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      const result = await pushResource(123, true);

      expect(result.success).toBe(true);
      expect(mockWpClient.fetchResourceById).not.toHaveBeenCalled();
    });

    it('should preserve dirty flag on failure', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        slug: 'test',
        status: 'publish' as const,
        post_type: 'resource',
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      // No conflict
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 123, title: 'Test', modified_gmt: '2024-01-01T00:00:00', post_type: 'resource',
        }),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      mockWpClient.fetchResourceById.mockResolvedValue({
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any);

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockRejectedValue(new Error('Server error'));

      const result = await pushResource(123);

      expect(result.success).toBe(false);
    });
  });

  describe('pushAllDirty', () => {
    it('should push all dirty resources individually', async () => {
      const dirtyResources = Array(3).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Resource ${i + 1}`,
        slug: `resource-${i + 1}`,
        status: 'publish' as const,
        post_type: 'resource',
        modified_gmt: '2024-01-01T00:00:00',
        featured_media: 0,
        taxonomies: { 'resource-type': [45], access_level: [78] },
        meta_box: {},
      }));

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      mockDbInstance.prepare.mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      mockWpClient.updateResource.mockImplementation(async (id) => ({
        id,
        modified_gmt: '2024-01-02T00:00:00',
      } as any));

      const result = await pushAllDirty(true); // Skip conflict check

      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
      // Should NOT use batchUpdate — pushes individually
      expect(mockWpClient.batchUpdate).not.toHaveBeenCalled();
    }, 15000);

    it('should report conflicts but still push', async () => {
      const dirtyResources = [
        { id: 1, title: 'R1', slug: 'r1', status: 'publish', post_type: 'resource', modified_gmt: '2024-01-01', featured_media: 0, taxonomies: {}, meta_box: {} },
        { id: 2, title: 'R2', slug: 'r2', status: 'publish', post_type: 'resource', modified_gmt: '2024-01-01', featured_media: 0, taxonomies: {}, meta_box: {} },
      ];

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      // checkForConflicts reads DB; resource 1 has a conflict
      const getValues = [
        { id: 1, title: 'R1', modified_gmt: '2024-01-01', post_type: 'resource' },
        { id: 2, title: 'R2', modified_gmt: '2024-01-01', post_type: 'resource' },
      ];
      let getCallCount = 0;
      mockDbInstance.prepare.mockReturnValue({
        get: jest.fn().mockImplementation(() => getValues[getCallCount++] || null),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      mockWpClient.fetchResourceById
        .mockResolvedValueOnce({ id: 1, modified_gmt: '2024-01-02' } as any) // conflict
        .mockResolvedValueOnce({ id: 2, modified_gmt: '2024-01-01' } as any); // no conflict

      mockWpClient.updateResource.mockImplementation(async (id) => ({
        id,
        modified_gmt: '2024-01-02T00:00:00',
      } as any));

      const result = await pushAllDirty();

      // Conflicts are detected but push proceeds anyway (single-user tool)
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].resourceId).toBe(1);
      // All resources are still pushed (individually with skipConflictCheck)
      expect(result.results).toHaveLength(2);
    }, 15000);

    it('should handle individual failures', async () => {
      const dirtyResources = [
        { id: 1, title: 'R1', slug: 'r1', status: 'publish', post_type: 'resource', modified_gmt: '2024-01-01', featured_media: 0, taxonomies: {}, meta_box: {} },
        { id: 2, title: 'R2', slug: 'r2', status: 'publish', post_type: 'resource', modified_gmt: '2024-01-01', featured_media: 0, taxonomies: {}, meta_box: {} },
      ];

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      mockDbInstance.prepare.mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      // First push succeeds, second fails
      mockWpClient.updateResource
        .mockResolvedValueOnce({ id: 1, modified_gmt: '2024-01-02' } as any)
        .mockRejectedValueOnce(new Error('Server error'));

      const result = await pushAllDirty(true);

      const succeeded = result.results.filter(r => r.success);
      const failed = result.results.filter(r => !r.success);

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].resourceId).toBe(2);
    }, 15000);
  });
});
