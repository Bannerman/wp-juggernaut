import { seoDataProcessor, ImageProcessorContext } from '../imageProcessing';

describe('seoDataProcessor', () => {
  const createFile = (name: string, type: string = 'image/jpeg') => {
    return new File(['test'], name, { type });
  };

  const createContext = (overrides: Partial<ImageProcessorContext> = {}): ImageProcessorContext => ({
    file: createFile('test-image.jpg'),
    filename: 'test-image.jpg',
    title: 'Test Image',
    altText: '',
    ...overrides,
  });

  it('should preserve existing SEO data', async () => {
    const context = createContext({
      seoData: {
        title: 'Existing Title',
        description: 'Existing Description',
        keywords: ['existing'],
      },
    });

    const result = await seoDataProcessor(context);

    expect(result.seoData).toEqual({
      title: 'Existing Title',
      description: 'Existing Description',
      keywords: ['existing'],
    });
  });

  it('should generate SEO data when missing', async () => {
    const context = createContext({
      title: 'My Awesome Image',
      filename: 'my-awesome-image.jpg',
      seoData: undefined,
    });

    const result = await seoDataProcessor(context);

    expect(result.seoData).toBeDefined();
    expect(result.seoData?.title).toBe('My Awesome Image');
    expect(result.seoData?.description).toBe('My Awesome Image');

    expect(result.seoData?.keywords).toEqual(expect.arrayContaining(['awesome', 'image']));
    // 'my' should be filtered out by STOP_WORDS
    expect(result.seoData?.keywords).not.toContain('my');
  });

  it('should cleanup filename when used as title', async () => {
    const context = createContext({
      title: '',
      filename: 'my-awesome-image.jpg',
      seoData: undefined,
    });

    const result = await seoDataProcessor(context);

    expect(result.seoData?.title).toBe('my awesome image');
    expect(result.seoData?.keywords).toEqual(expect.arrayContaining(['awesome', 'image']));
  });
});
