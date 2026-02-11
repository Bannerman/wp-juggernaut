import { seopressPlugin, SEOData } from '../index';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SEOPressPlugin - updateSEOData', () => {
  const resourceId = 123;
  const baseUrl = 'https://example.com';
  const authHeader = 'Basic token';

  beforeEach(() => {
    mockFetch.mockClear();
    // Default success response for most calls
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => 'OK',
    });
  });

  it('should update title and description when provided', async () => {
    const seoData: Partial<SEOData> = {
      title: 'New Title',
      description: 'New Description',
    };

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/wp-json/seopress/v1/posts/${resourceId}/title-description-metas`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: authHeader,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          title: 'New Title',
          description: 'New Description',
        }),
      })
    );
  });

  it('should update target keywords when provided', async () => {
    const seoData: Partial<SEOData> = {
      targetKeywords: 'keyword1, keyword2',
    };

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/wp-json/seopress/v1/posts/${resourceId}/target-keywords`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          _seopress_analysis_target_kw: 'keyword1, keyword2',
        }),
      })
    );
  });

  it('should update social settings when provided', async () => {
    const seoData: Partial<SEOData> = {
      og: {
        title: 'OG Title',
        description: 'OG Desc',
        image: 'http://image.url',
      },
      twitter: {
        title: 'Twitter Title',
        description: 'Twitter Desc',
        image: 'http://twit.url',
      },
    } as any; // Cast because partial specific fields are allowed

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/wp-json/seopress/v1/posts/${resourceId}/social-settings`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          _seopress_social_fb_title: 'OG Title',
          _seopress_social_fb_desc: 'OG Desc',
          _seopress_social_fb_img: 'http://image.url',
          _seopress_social_twitter_title: 'Twitter Title',
          _seopress_social_twitter_desc: 'Twitter Desc',
          _seopress_social_twitter_img: 'http://twit.url',
        }),
      })
    );
  });

  it('should update robots settings when provided', async () => {
    const seoData: Partial<SEOData> = {
      robots: {
        noindex: true,
        nofollow: false,
        nosnippet: true,
        noimageindex: false,
      },
      canonical: 'http://canonical.url',
    };

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/wp-json/seopress/v1/posts/${resourceId}/meta-robot-settings`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          _seopress_robots_index: 'no',
          _seopress_robots_follow: 'yes',
          _seopress_robots_snippet: 'no',
          _seopress_robots_imageindex: 'yes',
          _seopress_robots_canonical: 'http://canonical.url',
        }),
      })
    );
  });

  it('should handle API errors gracefully', async () => {
    // Mock failure for title update
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    });

    const seoData: Partial<SEOData> = {
      title: 'Fail Title',
    };

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('title-description: Server Error');
  });

  it('should accumulate multiple errors', async () => {
    // Fail title update
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Title Error',
    });
    // Fail keywords update
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Keywords Error',
    });

    const seoData: Partial<SEOData> = {
      title: 'Title',
      targetKeywords: 'Key',
    };

    const result = await seopressPlugin.updateSEOData(resourceId, seoData, baseUrl, authHeader);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain('title-description: Title Error');
    expect(result.errors).toContain('target-keywords: Keywords Error');
  });
});
