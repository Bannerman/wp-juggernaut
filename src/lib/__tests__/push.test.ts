/**
 * Push Engine Module Tests
 * Tests for pushing local changes to WordPress
 */

import {
  pushResource,
  pushAllDirty,
  checkForConflicts,
  buildUpdatePayload,
} from '../push';
import * as wpClient from '../wp-client';
import * as queries from '../queries';

jest.mock('../wp-client');
jest.mock('../queries');

describe('Push Engine Module', () => {
  const mockWpClient = wpClient as jest.Mocked<typeof wpClient>;
  const mockQueries = queries as jest.Mocked<typeof queries>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildUpdatePayload', () => {
    it('should build correct WordPress API payload', () => {
      const mockResource = {
        id: 123,
        title: 'Test Resource',
        slug: 'test-resource',
        status: 'publish' as const,
        content: 'Test content',
        excerpt: 'Test excerpt',
        featured_media: 0,
        date_gmt: '2024-01-01T00:00:00',
        modified_gmt: '2024-01-01T00:00:00',
        synced_at: '2024-01-01T00:00:00',
        is_dirty: true,
        meta_box: {
          version: '1.0',
          updated_for_year: '2024',
        },
        taxonomies: {
          'resource-type': [45],
          topic: [12, 34],
          intent: [56],
          audience: [],
          leagues: [],
          access_level: [78],
          competition_format: [],
          'bracket-size': [],
          file_format: [],
        },
      };

      mockQueries.getResourceById.mockReturnValue(mockResource);

      const payload = buildUpdatePayload(123);

      expect(payload.title).toBe('Test Resource');
      expect(payload.status).toBe('publish');
      expect(payload['resource-type']).toEqual([45]);
      expect(payload.topic).toEqual([12, 34]);
      expect(payload.meta_box).toEqual({
        version: '1.0',
        updated_for_year: '2024',
      });
    });

    it('should validate required taxonomies', () => {
      const mockResource = {
        id: 123,
        title: 'Invalid Resource',
        status: 'publish' as const,
        taxonomies: {
          'resource-type': [], // Invalid: empty
          access_level: [78],
        },
      } as any;

      mockQueries.getResourceById.mockReturnValue(mockResource);

      expect(() => buildUpdatePayload(123)).toThrow();
    });
  });

  describe('checkForConflicts', () => {
    it('should detect conflicts when server modified after local', async () => {
      const localResource = {
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any;

      const serverResource = {
        id: 123,
        title: { rendered: 'Test' },
        modified_gmt: '2024-01-02T00:00:00',
      } as any;

      mockQueries.getResourceById.mockReturnValue(localResource);
      mockWpClient.fetchResourceById.mockResolvedValue(serverResource);

      const conflicts = await checkForConflicts([123]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].resourceId).toBe(123);
      expect(conflicts[0].localModified).toBe('2024-01-01T00:00:00');
      expect(conflicts[0].serverModified).toBe('2024-01-02T00:00:00');
    });

    it('should not detect conflict when timestamps match', async () => {
      const localResource = {
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any;

      const serverResource = {
        id: 123,
        modified_gmt: '2024-01-01T00:00:00',
      } as any;

      mockQueries.getResourceById.mockReturnValue(localResource);
      mockWpClient.fetchResourceById.mockResolvedValue(serverResource);

      const conflicts = await checkForConflicts([123]);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle multiple resources', async () => {
      mockQueries.getResourceById
        .mockReturnValueOnce({ id: 1, modified_gmt: '2024-01-01' } as any)
        .mockReturnValueOnce({ id: 2, modified_gmt: '2024-01-01' } as any);

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
        status: 'publish' as const,
        modified_gmt: '2024-01-01T00:00:00',
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      const updatedResource = {
        ...mockResource,
        modified_gmt: '2024-01-02T00:00:00',
      };

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.fetchResourceById.mockResolvedValue(mockResource as any);
      mockWpClient.updateResource.mockResolvedValue(updatedResource as any);

      const result = await pushResource(123);

      expect(result.success).toBe(true);
      expect(result.resourceId).toBe(123);
      expect(mockQueries.markResourceClean).toHaveBeenCalledWith(123);
    });

    it('should skip push on conflict by default', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        modified_gmt: '2024-01-01T00:00:00',
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
      } as any;

      const serverResource = {
        ...mockResource,
        modified_gmt: '2024-01-02T00:00:00',
      };

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.fetchResourceById.mockResolvedValue(serverResource as any);

      const result = await pushResource(123);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
      expect(mockWpClient.updateResource).not.toHaveBeenCalled();
    });

    it('should push despite conflict when skipConflictCheck=true', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        status: 'publish' as const,
        modified_gmt: '2024-01-01T00:00:00',
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      } as any;

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.updateResource.mockResolvedValue(mockResource as any);

      const result = await pushResource(123, true);

      expect(result.success).toBe(true);
      expect(mockWpClient.fetchResourceById).not.toHaveBeenCalled();
    });

    it('should preserve dirty flag on failure', async () => {
      const mockResource = {
        id: 123,
        title: 'Test',
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
      } as any;

      mockQueries.getResourceById.mockReturnValue(mockResource);
      mockWpClient.fetchResourceById.mockResolvedValue(mockResource as any);
      mockWpClient.updateResource.mockRejectedValue(new Error('Server error'));

      const result = await pushResource(123);

      expect(result.success).toBe(false);
      expect(mockQueries.markResourceClean).not.toHaveBeenCalled();
    });
  });

  describe('pushAllDirty', () => {
    it('should push all dirty resources in batches', async () => {
      const dirtyResources = Array(75).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Resource ${i + 1}`,
        status: 'publish' as const,
        modified_gmt: '2024-01-01T00:00:00',
        taxonomies: {
          'resource-type': [45],
          access_level: [78],
        },
        meta_box: {},
      }));

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      // Mock batch responses
      mockWpClient.batchUpdate.mockResolvedValue({
        responses: Array(25).fill({ status: 200, body: {} }),
      } as any);

      const result = await pushAllDirty(true); // Skip conflict check

      // Should make 3 batch requests (25 + 25 + 25)
      expect(mockWpClient.batchUpdate).toHaveBeenCalledTimes(3);
      expect(result.results).toHaveLength(75);
    });

    it('should filter out conflicting resources', async () => {
      const dirtyResources = [
        { id: 1, modified_gmt: '2024-01-01' },
        { id: 2, modified_gmt: '2024-01-01' },
        { id: 3, modified_gmt: '2024-01-01' },
      ];

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      // Resources 1 and 3 have conflicts
      mockWpClient.fetchResourceById
        .mockResolvedValueOnce({ id: 1, modified_gmt: '2024-01-02' } as any)
        .mockResolvedValueOnce({ id: 2, modified_gmt: '2024-01-01' } as any)
        .mockResolvedValueOnce({ id: 3, modified_gmt: '2024-01-03' } as any);

      const result = await pushAllDirty();

      expect(result.conflicts).toHaveLength(2);
      expect(result.conflicts.map(c => c.resourceId)).toEqual([1, 3]);
    });

    it('should handle individual failures in batch', async () => {
      const dirtyResources = [
        { id: 1, title: 'Test 1', taxonomies: { 'resource-type': [45], access_level: [78] }, meta_box: {} },
        { id: 2, title: 'Test 2', taxonomies: { 'resource-type': [45], access_level: [78] }, meta_box: {} },
        { id: 3, title: 'Test 3', taxonomies: { 'resource-type': [45], access_level: [78] }, meta_box: {} },
      ];

      mockQueries.getDirtyResources.mockReturnValue(dirtyResources as any);
      mockQueries.getResourceById.mockImplementation((id) =>
        dirtyResources.find(r => r.id === id) as any
      );

      // Batch response with one failure
      mockWpClient.batchUpdate.mockResolvedValue({
        responses: [
          { status: 200, body: { id: 1 } },
          { status: 500, body: { message: 'Server error' } },
          { status: 200, body: { id: 3 } },
        ],
      } as any);

      const result = await pushAllDirty(true);

      const succeeded = result.results.filter(r => r.success);
      const failed = result.results.filter(r => !r.success);

      expect(succeeded).toHaveLength(2);
      expect(failed).toHaveLength(1);
      expect(failed[0].resourceId).toBe(2);
    });
  });
});
