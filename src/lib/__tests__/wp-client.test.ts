/**
 * WordPress Client Module Tests
 * Tests for WordPress REST API client functions
 */

import {
  fetchResources,
  fetchAllResources,
  fetchResourceById,
  fetchResourceIds,
  fetchTaxonomyTerms,
  fetchAllTaxonomies,
  updateResource,
  batchUpdate,
  testConnection,
} from '../wp-client';

// Mock site-config — wp-client delegates to getActiveBaseUrl() / getCredentials()
jest.mock('../site-config', () => ({
  getActiveBaseUrl: () => 'https://test.example.com',
  getActiveTarget: () => ({ id: 'test', url: 'https://test.example.com', name: 'Test' }),
  getCredentials: () => ({ username: 'testuser', appPassword: 'test1234 test5678' }),
  getConfig: () => ({ activeTarget: 'test' }),
  setActiveTarget: jest.fn(),
}));

// Mock profiles — wp-client calls getProfileManager() for taxonomies and post types
const MOCK_TAXONOMIES = [
  { slug: 'resource-type', name: 'Resource Type', rest_base: 'resource-type', post_types: ['resource'] },
  { slug: 'topic', name: 'Topic', rest_base: 'topic', post_types: ['resource'] },
  { slug: 'intent', name: 'Intent', rest_base: 'intent', post_types: ['resource'] },
  { slug: 'audience', name: 'Audience', rest_base: 'audience', post_types: ['resource'] },
  { slug: 'leagues', name: 'Leagues', rest_base: 'leagues', post_types: ['resource'] },
  { slug: 'access_level', name: 'Access Level', rest_base: 'access_level', post_types: ['resource'] },
  { slug: 'competition_format', name: 'Competition Format', rest_base: 'competition_format', post_types: ['resource'] },
  { slug: 'bracket-size', name: 'Bracket Size', rest_base: 'bracket-size', post_types: ['resource'] },
  { slug: 'file_format', name: 'File Format', rest_base: 'file_format', post_types: ['resource'] },
];

jest.mock('../profiles', () => ({
  getProfileManager: () => ({
    getCurrentProfile: () => ({
      profile_name: 'Test',
      taxonomies: MOCK_TAXONOMIES,
    }),
    getTaxonomySlugs: () => MOCK_TAXONOMIES.map(t => t.slug),
    getTaxonomyLabels: () => ({}),
    getPrimaryPostType: () => ({ slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true }),
    getPostTypes: () => [
      { slug: 'resource', rest_base: 'resource', name: 'Resources', is_primary: true },
    ],
  }),
  ensureProfileLoaded: () => {},
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('WordPress Client Module', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Authentication', () => {
    it('should create correct Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '1', 'x-wp-totalpages': '1' }),
        json: async () => [{ id: 1, title: { rendered: 'Test' } }],
      } as Response);

      await fetchResources();

      const call = mockFetch.mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;

      // Verify base64 encoding of credentials
      const base64Part = headers.Authorization.replace('Basic ', '');
      const decoded = Buffer.from(base64Part, 'base64').toString();
      expect(decoded).toBe('testuser:test1234 test5678');
    });
  });

  describe('fetchResources', () => {
    it('should fetch resources with default options', async () => {
      const mockResources = [
        { id: 1, title: { rendered: 'Resource 1' }, status: 'publish' },
        { id: 2, title: { rendered: 'Resource 2' }, status: 'draft' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '2', 'x-wp-totalpages': '1' }),
        json: async () => mockResources,
      } as Response);

      const result = await fetchResources();

      expect(result.resources).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should handle pagination options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '100', 'x-wp-totalpages': '10' }),
        json: async () => [],
      } as Response);

      await fetchResources({ page: 2, perPage: 10 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('per_page=10');
    });

    it('should handle modified_after parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '5', 'x-wp-totalpages': '1' }),
        json: async () => [],
      } as Response);

      await fetchResources({ modifiedAfter: '2024-01-01T00:00:00' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('modified_after=2024-01-01T00%3A00%3A00');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchResources()).rejects.toThrow('Network error');
    });

    it('should throw on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid credentials',
      } as Response);

      await expect(fetchResources()).rejects.toThrow();
    });
  });

  describe('fetchAllResources', () => {
    it('should fetch all pages automatically', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '150', 'x-wp-totalpages': '2' }),
        json: async () => Array(100).fill(null).map((_, i) => ({
          id: i + 1,
          title: { rendered: `Resource ${i + 1}` },
        })),
      } as Response);

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '150', 'x-wp-totalpages': '2' }),
        json: async () => Array(50).fill(null).map((_, i) => ({
          id: i + 101,
          title: { rendered: `Resource ${i + 101}` },
        })),
      } as Response);

      const resources = await fetchAllResources();

      expect(resources).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should pass modified_after to all pages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '10', 'x-wp-totalpages': '1' }),
        json: async () => [],
      } as Response);

      await fetchAllResources('2024-01-01T00:00:00');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('modified_after=2024-01-01T00%3A00%3A00');
    });
  });

  describe('fetchResourceById', () => {
    it('should fetch single resource', async () => {
      const mockResource = {
        id: 123,
        title: { rendered: 'Test Resource' },
        status: 'publish',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResource,
        headers: new Headers(),
      } as Response);

      const resource = await fetchResourceById(123);

      expect(resource.id).toBe(123);
      expect(mockFetch.mock.calls[0][0]).toContain('/resource/123');
    });

    it('should throw on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Resource not found',
      } as Response);

      await expect(fetchResourceById(999)).rejects.toThrow();
    });
  });

  describe('fetchResourceIds', () => {
    it('should fetch only IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '3', 'x-wp-totalpages': '1' }),
        json: async () => [
          { id: 1 },
          { id: 2 },
          { id: 3 },
        ],
      } as Response);

      const ids = await fetchResourceIds();

      expect(ids).toEqual([1, 2, 3]);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('_fields=id');
    });
  });

  describe('fetchTaxonomyTerms', () => {
    it('should fetch terms for specific taxonomy', async () => {
      const mockTerms = [
        { id: 1, name: 'Bracket', slug: 'bracket', taxonomy: 'resource-type', parent: 0 },
        { id: 2, name: 'Tracker', slug: 'tracker', taxonomy: 'resource-type', parent: 0 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-wp-total': '2', 'x-wp-totalpages': '1' }),
        json: async () => mockTerms,
      } as Response);

      const terms = await fetchTaxonomyTerms('resource-type');

      expect(terms).toHaveLength(2);
      expect(mockFetch.mock.calls[0][0]).toContain('/resource-type');
    });
  });

  describe('fetchAllTaxonomies', () => {
    it('should fetch all profile-configured taxonomies in parallel', async () => {
      // Mock responses for all taxonomies from profile
      MOCK_TAXONOMIES.forEach(() => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'x-wp-total': '1', 'x-wp-totalpages': '1' }),
          json: async () => [
            { id: 1, name: 'Test', slug: 'test', taxonomy: 'test', parent: 0 },
          ],
        } as Response);
      });

      const result = await fetchAllTaxonomies();

      expect(Object.keys(result)).toHaveLength(MOCK_TAXONOMIES.length);
      expect(mockFetch).toHaveBeenCalledTimes(MOCK_TAXONOMIES.length);

      // Verify all taxonomies present
      MOCK_TAXONOMIES.forEach(tax => {
        expect(result[tax.slug]).toBeDefined();
      });
    });
  });

  describe('updateResource', () => {
    it('should update resource with correct payload', async () => {
      const mockUpdated = {
        id: 123,
        title: { rendered: 'Updated Title' },
        modified_gmt: '2024-01-02T00:00:00',
        status: 'publish',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUpdated,
        headers: new Headers(),
      } as Response);

      const payload = {
        title: 'Updated Title',
        status: 'publish' as const,
        'resource-type': [45],
      };

      const result = await updateResource(123, payload);

      expect(result.id).toBe(123);

      const call = mockFetch.mock.calls[0];
      const method = call[1]?.method;
      const body = JSON.parse(call[1]?.body as string);

      expect(method).toBe('POST');
      expect(body).toEqual(payload);
    });
  });

  describe('batchUpdate', () => {
    it('should send batch request', async () => {
      const mockResponses = [
        { status: 200, body: { id: 1, title: { rendered: 'Updated 1' } } },
        { status: 200, body: { id: 2, title: { rendered: 'Updated 2' } } },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ responses: mockResponses }),
      } as Response);

      const requests = [
        { method: 'PUT' as const, path: '/wp/v2/resource/1', body: { title: 'Updated 1' } },
        { method: 'PUT' as const, path: '/wp/v2/resource/2', body: { title: 'Updated 2' } },
      ];

      const result = await batchUpdate(requests);

      expect(result.responses).toHaveLength(2);
      expect(mockFetch.mock.calls[0][0]).toContain('/batch/v1');
    });
  });

  describe('testConnection', () => {
    it('should return success on valid connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '6.0.0' }),
      } as Response);

      const result = await testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connected');
    });

    it('should return failure on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('should return failure on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });
});
