import { getResourceSeo, LocalSeoData } from '../queries';
import * as db from '../db';

jest.mock('../db');

describe('Queries Module - getResourceSeo', () => {
  const mockDb = db as jest.Mocked<typeof db>;
  let mockDbInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbInstance = {
      prepare: jest.fn(),
      pragma: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    };

    mockDb.getDb.mockReturnValue(mockDbInstance);
  });

  const DEFAULT_SEO: LocalSeoData = {
    title: '',
    description: '',
    canonical: '',
    targetKeywords: '',
    og: { title: '', description: '', image: '' },
    twitter: { title: '', description: '', image: '' },
    robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
  };

  it('should return default SEO data when no data found', () => {
    mockDbInstance.prepare.mockReturnValue({
      get: jest.fn().mockReturnValue(undefined),
    });

    const result = getResourceSeo(123);

    expect(result).toEqual(DEFAULT_SEO);
    // Only plugin_data is queried — the legacy resource_seo fallback was removed
    // because the table no longer exists in the current schema.
    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(1);
    expect(mockDbInstance.prepare).toHaveBeenCalledWith(
      expect.stringContaining("FROM plugin_data")
    );
  });

  it('should return data from plugin_data table (seopress)', () => {
    const mockSeoData: Partial<LocalSeoData> = {
      title: 'Plugin Title',
      description: 'Plugin Description',
      og: { title: 'OG Title', description: 'OG Desc', image: 'og.jpg' },
      robots: { noindex: true, nofollow: false, nosnippet: false, noimageindex: false },
    };

    // First call (plugin_data) returns valid JSON
    // Second call (resource_seo) should not happen
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue({ data_value: JSON.stringify(mockSeoData) }),
    });

    const result = getResourceSeo(123);

    expect(result).toEqual({
      ...DEFAULT_SEO,
      ...mockSeoData,
      og: { ...DEFAULT_SEO.og, ...mockSeoData.og },
      twitter: { ...DEFAULT_SEO.twitter, ...mockSeoData.twitter }, // Should use defaults merged
      robots: { ...DEFAULT_SEO.robots, ...mockSeoData.robots },
    });

    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(1);
    expect(mockDbInstance.prepare).toHaveBeenCalledWith(
      expect.stringContaining("FROM plugin_data")
    );
  });

  it('should return defaults when plugin_data has malformed JSON', () => {
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue({ data_value: '{ invalid json' }),
    });

    const result = getResourceSeo(123);

    expect(result).toEqual(DEFAULT_SEO);
    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(1);
  });
});
