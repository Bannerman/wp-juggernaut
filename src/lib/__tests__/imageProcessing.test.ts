import { seoDataProcessor, ImageProcessorContext, ImageProcessorResult } from '../imageProcessing';

describe('seoDataProcessor', () => {
  // Helper to create a dummy File object since we are in a node environment without full DOM
  const createFile = (name: string, type: string = 'image/jpeg') => {
    return {
      name,
      type,
      size: 1024,
      arrayBuffer: async () => new ArrayBuffer(1024),
      stream: () => new ReadableStream(),
      slice: () => new Blob(),
      text: async () => '',
    } as unknown as File;
  };

  it('should extract title from filename if title is missing', async () => {
    const file = createFile('my-cool-image.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: '',
      altText: '',
    };

    const result = await seoDataProcessor(context);

    expect(result.seoData?.title).toBe('My Cool Image');
  });

  it('should use existing title if provided', async () => {
    const file = createFile('random-name.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: 'Existing Title',
      altText: '',
    };

    const result = await seoDataProcessor(context);

    expect(result.seoData?.title).toBe('Existing Title');
  });

  it('should generate keywords from title', async () => {
    const file = createFile('test.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: 'Amazing Sunset Over Mountains',
      altText: '',
    };

    const result = await seoDataProcessor(context);

    // Check keywords (case-insensitive check for presence)
    const keywords = result.seoData?.keywords || [];
    expect(keywords).toContain('amazing');
    expect(keywords).toContain('sunset');
    expect(keywords).toContain('mountains');
    // "over" might be a stop word
    expect(keywords).not.toContain('over');
  });

  it('should generate description if missing', async () => {
    const file = createFile('test.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: 'Red Sports Car',
      altText: '',
    };

    const result = await seoDataProcessor(context);

    expect(result.seoData?.description).toBeTruthy();
    expect(result.seoData?.description).toContain('Red Sports Car');
  });

  it('should populate altText if missing', async () => {
    const file = createFile('test.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: 'Blue Ocean',
      altText: '',
    };

    const result = await seoDataProcessor(context);

    expect(result.altText).toBe('Blue Ocean');
  });

  it('should not overwrite existing seoData', async () => {
    const file = createFile('test.jpg');
    const context: ImageProcessorContext = {
      file,
      filename: file.name,
      title: 'New Title',
      altText: '',
      seoData: {
        title: 'Original SEO Title',
        description: 'Original Description',
        keywords: ['original'],
      },
    };

    const result = await seoDataProcessor(context);

    expect(result.seoData?.title).toBe('Original SEO Title');
    expect(result.seoData?.description).toBe('Original Description');
    expect(result.seoData?.keywords).toEqual(['original']);
  });
});
