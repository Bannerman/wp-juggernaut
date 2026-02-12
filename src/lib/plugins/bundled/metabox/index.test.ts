import { getTaxonomyMetaFieldMappingFromProfile } from './index';
import { ProfileManager } from '../../../profiles';
import type { SiteProfile } from '../../../plugins/types';

describe('Meta Box Plugin', () => {
  let manager: ProfileManager;

  const mockProfile: SiteProfile = {
    profile_id: 'test-profile',
    profile_name: 'Test Profile',
    profile_version: '1.0.0',
    sites: [],
    post_types: [],
    taxonomies: [
      { slug: 'custom-tax', name: 'Custom Tax', rest_base: 'custom-tax', meta_field: 'tax_custom' },
      { slug: 'no-meta-tax', name: 'No Meta Tax', rest_base: 'no-meta-tax' },
    ],
  };

  beforeEach(() => {
    ProfileManager.reset();
    manager = ProfileManager.getInstance();
  });

  afterEach(() => {
    ProfileManager.reset();
  });

  describe('getTaxonomyMetaFieldMappingFromProfile', () => {
    it('should return mappings from the current profile', () => {
      manager.registerProfile(mockProfile);
      manager.setCurrentProfile('test-profile');

      const mapping = getTaxonomyMetaFieldMappingFromProfile();

      expect(mapping).toEqual({
        'custom-tax': 'tax_custom',
      });
    });

    it('should fall back to default mappings if profile has no meta fields', () => {
      const emptyProfile: SiteProfile = {
        ...mockProfile,
        profile_id: 'empty-profile',
        taxonomies: [],
      };
      manager.registerProfile(emptyProfile);
      manager.setCurrentProfile('empty-profile');

      const mapping = getTaxonomyMetaFieldMappingFromProfile();

      // Should contain default mappings
      expect(mapping['resource-type']).toBe('tax_resource_type');
    });

    it('should fall back to default mappings if no profile is active', () => {
      const mapping = getTaxonomyMetaFieldMappingFromProfile();

      // Should contain default mappings
      expect(mapping['resource-type']).toBe('tax_resource_type');
    });
  });
});
