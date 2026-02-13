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
    // Mock both plugin_data and resource_seo queries to return undefined
    mockDbInstance.prepare.mockReturnValue({
      get: jest.fn().mockReturnValue(undefined),
    });

    const result = getResourceSeo(123);

    expect(result).toEqual(DEFAULT_SEO);
    // Should attempt plugin_data first, then fallback to resource_seo
    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(2);
    expect(mockDbInstance.prepare).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM plugin_data")
    );
    expect(mockDbInstance.prepare).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM resource_seo")
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

  it('should fall back to legacy resource_seo table if plugin_data is missing', () => {
    // First call (plugin_data) returns undefined
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue(undefined),
    });

    // Second call (resource_seo) returns legacy row
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue({
        seo_title: 'Legacy Title',
        seo_description: 'Legacy Description',
        seo_canonical: 'https://example.com',
        seo_target_keywords: 'legacy, keywords',
        og_title: 'Legacy OG Title',
        og_description: 'Legacy OG Desc',
        og_image: 'legacy-og.jpg',
        twitter_title: 'Legacy Tw Title',
        twitter_description: 'Legacy Tw Desc',
        twitter_image: 'legacy-tw.jpg',
        robots_noindex: 1,
        robots_nofollow: 0,
        robots_nosnippet: 0,
        robots_noimageindex: 1,
      }),
    });

    const result = getResourceSeo(123);

    expect(result).toEqual({
      ...DEFAULT_SEO,
      title: 'Legacy Title',
      description: 'Legacy Description',
      canonical: 'https://example.com',
      targetKeywords: 'legacy, keywords',
      og: {
        title: 'Legacy OG Title',
        description: 'Legacy OG Desc',
        image: 'legacy-og.jpg',
      },
      twitter: {
        title: 'Legacy Tw Title',
        description: 'Legacy Tw Desc',
        image: 'legacy-tw.jpg',
      },
      robots: {
        noindex: true,
        nofollow: false,
        nosnippet: false,
        noimageindex: true,
      },
    });

    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(2);
  });

  it('should fall back to legacy resource_seo table if plugin_data is malformed JSON', () => {
    // First call (plugin_data) returns invalid JSON
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue({ data_value: '{ invalid json' }),
    });

    // Second call (resource_seo) returns legacy row
    mockDbInstance.prepare.mockReturnValueOnce({
      get: jest.fn().mockReturnValue({
        seo_title: 'Fallback Title',
        // ... minimalist row for brevity
      }),
    });

    const result = getResourceSeo(123);

    expect(result.title).toBe('Fallback Title');
    expect(mockDbInstance.prepare).toHaveBeenCalledTimes(2);
  });
});
