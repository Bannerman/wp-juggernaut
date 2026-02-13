import { getPrimaryPostType } from '../db';
import * as profiles from '../profiles';

// Mock the profiles module
jest.mock('../profiles');

// Mock better-sqlite3 to prevent actual DB connection during import
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    pragma: jest.fn(),
    prepare: jest.fn(),
    close: jest.fn(),
  }));
});

describe('Database Helpers', () => {
  const mockProfiles = profiles as jest.Mocked<typeof profiles>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPrimaryPostType', () => {
    it('should delegate to getProfilePrimaryPostTypeSlug', () => {
      // Setup the mock to return a specific slug
      mockProfiles.getProfilePrimaryPostTypeSlug.mockReturnValue('custom-slug');

      // Call the function under test
      const result = getPrimaryPostType();

      // Verify the result matches the mock
      expect(result).toBe('custom-slug');

      // Verify the delegate was called
      expect(mockProfiles.getProfilePrimaryPostTypeSlug).toHaveBeenCalled();
    });
  });
});
