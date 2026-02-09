/**
 * Field Mapping Tests
 * Tests for ProfileManager field mapping methods and related functionality
 */

import { ProfileManager } from '../profiles';
import type { SiteProfile, FieldMappingEntry } from '../plugins/types';

describe('Field Mapping', () => {
  let manager: ProfileManager;

  const mockProfile: SiteProfile = {
    profile_id: 'test-profile',
    profile_name: 'Test Profile',
    profile_version: '1.0.0',
    sites: [
      { id: 'test', name: 'Test', url: 'http://test.local', is_default: true },
    ],
    post_types: [
      { slug: 'resource', name: 'Resources', rest_base: 'resource', is_primary: true },
      { slug: 'post', name: 'Posts', rest_base: 'posts' },
    ],
    taxonomies: [
      { slug: 'resource-type', name: 'Resource Type', rest_base: 'resource-type', post_types: ['resource'] },
      { slug: 'category', name: 'Category', rest_base: 'categories', post_types: ['post'] },
    ],
    field_mappings: {
      'resource->post': [
        {
          source: { key: 'text_content', category: 'meta' },
          target: { key: 'content', category: 'core' },
        },
        {
          source: { key: 'intro_text', category: 'meta' },
          target: { key: 'excerpt', category: 'core' },
        },
      ],
    },
  };

  beforeEach(() => {
    ProfileManager.reset();
    manager = ProfileManager.getInstance();
    // Deep clone to prevent mutation leaking between tests
    const profileCopy = JSON.parse(JSON.stringify(mockProfile)) as SiteProfile;
    manager.registerProfile(profileCopy);
    manager.setCurrentProfile('test-profile');
  });

  afterEach(() => {
    ProfileManager.reset();
  });

  describe('getFieldMappings', () => {
    it('should return saved mappings for a configured pair', () => {
      const mappings = manager.getFieldMappings('resource', 'post');

      expect(mappings).toHaveLength(2);
      expect(mappings[0].source.key).toBe('text_content');
      expect(mappings[0].target.key).toBe('content');
      expect(mappings[1].source.key).toBe('intro_text');
      expect(mappings[1].target.key).toBe('excerpt');
    });

    it('should return empty array for unconfigured pair', () => {
      const mappings = manager.getFieldMappings('post', 'resource');

      expect(mappings).toEqual([]);
    });

    it('should return empty array for unknown post types', () => {
      const mappings = manager.getFieldMappings('page', 'resource');

      expect(mappings).toEqual([]);
    });
  });

  describe('getAllFieldMappings', () => {
    it('should return all mapping sets', () => {
      const allMappings = manager.getAllFieldMappings();

      expect(Object.keys(allMappings)).toEqual(['resource->post']);
      expect(allMappings['resource->post']).toHaveLength(2);
    });

    it('should return empty object when no mappings configured', () => {
      const noMappingsProfile: SiteProfile = {
        ...mockProfile,
        profile_id: 'no-mappings',
        field_mappings: undefined,
      };
      manager.registerProfile(noMappingsProfile);
      manager.setCurrentProfile('no-mappings');

      const allMappings = manager.getAllFieldMappings();

      expect(allMappings).toEqual({});
    });
  });

  describe('setFieldMappings', () => {
    it('should set new mappings for a pair', () => {
      const newMappings: FieldMappingEntry[] = [
        {
          source: { key: 'content', category: 'core' },
          target: { key: 'text_content', category: 'meta' },
        },
      ];

      manager.setFieldMappings('post', 'resource', newMappings);

      const result = manager.getFieldMappings('post', 'resource');
      expect(result).toHaveLength(1);
      expect(result[0].source.key).toBe('content');
      expect(result[0].target.key).toBe('text_content');
    });

    it('should overwrite existing mappings', () => {
      const updatedMappings: FieldMappingEntry[] = [
        {
          source: { key: 'title', category: 'core' },
          target: { key: 'title', category: 'core' },
        },
      ];

      manager.setFieldMappings('resource', 'post', updatedMappings);

      const result = manager.getFieldMappings('resource', 'post');
      expect(result).toHaveLength(1);
      expect(result[0].source.key).toBe('title');
    });

    it('should initialize field_mappings if not present', () => {
      const noMappingsProfile: SiteProfile = {
        ...mockProfile,
        profile_id: 'fresh',
        field_mappings: undefined,
      };
      manager.registerProfile(noMappingsProfile);
      manager.setCurrentProfile('fresh');

      const newMappings: FieldMappingEntry[] = [
        {
          source: { key: 'title', category: 'core' },
          target: { key: 'title', category: 'core' },
        },
      ];

      manager.setFieldMappings('resource', 'post', newMappings);

      const result = manager.getFieldMappings('resource', 'post');
      expect(result).toHaveLength(1);
    });

    it('should handle empty mappings array (clear all)', () => {
      manager.setFieldMappings('resource', 'post', []);

      const result = manager.getFieldMappings('resource', 'post');
      expect(result).toEqual([]);
    });

    it('should not interfere with other mapping pairs', () => {
      const newMappings: FieldMappingEntry[] = [
        {
          source: { key: 'content', category: 'core' },
          target: { key: 'text_content', category: 'meta' },
        },
      ];

      manager.setFieldMappings('post', 'resource', newMappings);

      // Original resource->post mappings should be untouched
      const original = manager.getFieldMappings('resource', 'post');
      expect(original).toHaveLength(2);

      // New post->resource mappings should exist
      const added = manager.getFieldMappings('post', 'resource');
      expect(added).toHaveLength(1);
    });
  });

  describe('field mapping categories', () => {
    it('should preserve source and target categories', () => {
      const mixedMappings: FieldMappingEntry[] = [
        { source: { key: 'title', category: 'core' }, target: { key: 'title', category: 'core' } },
        { source: { key: 'text_content', category: 'meta' }, target: { key: 'content', category: 'core' } },
        { source: { key: 'resource-type', category: 'taxonomy' }, target: { key: 'category', category: 'taxonomy' } },
      ];

      manager.setFieldMappings('resource', 'post', mixedMappings);

      const result = manager.getFieldMappings('resource', 'post');
      expect(result).toHaveLength(3);

      // Core → Core
      expect(result[0].source.category).toBe('core');
      expect(result[0].target.category).toBe('core');

      // Meta → Core
      expect(result[1].source.category).toBe('meta');
      expect(result[1].target.category).toBe('core');

      // Taxonomy → Taxonomy
      expect(result[2].source.category).toBe('taxonomy');
      expect(result[2].target.category).toBe('taxonomy');
    });
  });
});
