import { createFilenameProcessor, ImageProcessorContext } from '../imageProcessing';

describe('createFilenameProcessor', () => {
  // Helper to create a context
  const createContext = (filename: string, title: string = '', fileType: string = 'image/jpeg'): ImageProcessorContext => {
    // Create a File object. In Node environment (Jest w/ jsdom), File should be available.
    // If running in strict Node without jsdom, might need polyfill, but package.json has jest-environment-jsdom.
    const file = new File(['dummy content'], filename, { type: fileType });
    return {
      file,
      filename,
      title,
      altText: '',
      seoData: {
        title: '',
        description: '',
        keywords: [],
      },
      metadata: {},
    };
  };

  it('should use the provided title to generate a slugified filename', async () => {
    const processor = createFilenameProcessor(() => 'My Cool Image Title');
    const context = createContext('original_image.jpg');

    const result = await processor(context);

    // Expected slug: "my-cool-image-title"
    expect(result.filename).toBe('my-cool-image-title.jpg');
    // Title should be updated to the provided title if context.title was empty
    expect(result.title).toBe('My Cool Image Title');
    // The File object should also be updated with the new name
    expect(result.file.name).toBe('my-cool-image-title.jpg');
  });

  it('should handle missing title by using onMissingTitle callback', async () => {
    const onMissingTitle = jest.fn().mockResolvedValue('Fallback Title From Callback');
    const processor = createFilenameProcessor(() => null, onMissingTitle);
    const context = createContext('original.png');

    const result = await processor(context);

    expect(onMissingTitle).toHaveBeenCalled();
    expect(result.filename).toBe('fallback-title-from-callback.png');
    expect(result.title).toBe('Fallback Title From Callback');
  });

  it('should fallback to original filename (without extension) if no title provided anywhere', async () => {
    const processor = createFilenameProcessor(() => null);
    // Filename "IMG_2023.jpg" -> Base title "IMG_2023" -> Slug "img-2023"
    const context = createContext('IMG_2023.jpg');

    const result = await processor(context);

    expect(result.filename).toBe('img-2023.jpg');
    // The title field should be populated with the base title (original name without extension)
    expect(result.title).toBe('IMG_2023');
  });

  it('should handle special characters and clean them up in filename', async () => {
    const processor = createFilenameProcessor(() => 'Hello World! @#$ %^&*()');
    const context = createContext('test.jpg');

    const result = await processor(context);

    // "Hello World! @#$ %^&*()" -> "hello-world"
    // Spaces become dashes, special chars removed.
    // Logic: replace(/[^a-z0-9]+/g, '-') -> "hello-world-"
    // replace(/^-+|-+$/g, '') -> "hello-world"
    expect(result.filename).toBe('hello-world.jpg');
  });

  it('should handle multiple consecutive dashes and trim them', async () => {
    const processor = createFilenameProcessor(() => '  Double  Space  -- Dash  ');
    const context = createContext('test.jpg');

    const result = await processor(context);

    // "  Double  Space  -- Dash  "
    // Lowercase: "  double  space  -- dash  "
    // Replace non-alphanum with -: "--double--space-----dash--"
    // Trim leading/trailing dashes: "double--space-----dash"
    // Wait, the regex replace(/[^a-z0-9]+/g, '-') replaces *one or more* non-alphanum chars with a single dash.
    // So "  " -> "-"
    // "  -- " -> "-"
    // So it should be "double-space-dash"

    // Let's trace carefully:
    // "  Double  Space  -- Dash  "
    // Lowercase: "  double  space  -- dash  "
    // /[^a-z0-9]+/g matches "  ", "  ", "  -- ", "  "
    // Replaced by "-": "-double-space-dash-"
    // Trim: "double-space-dash"

    expect(result.filename).toBe('double-space-dash.jpg');
  });

  it('should preserve the original file extension', async () => {
    const processor = createFilenameProcessor(() => 'Simple Title');
    const context = createContext('image.webp', '', 'image/webp');

    const result = await processor(context);

    expect(result.filename).toBe('simple-title.webp');
    expect(result.file.type).toBe('image/webp');
  });

  it('should handle file with no extension', async () => {
    const processor = createFilenameProcessor(() => 'Simple Title');
    const context = createContext('README'); // No extension

    const result = await processor(context);

    // Implementation: split('.').pop() || 'jpg'
    // 'README'.split('.') -> ['README']. pop() -> 'README'
    // So extension effectively becomes the filename itself if no dot.
    // Result: "simple-title.README"
    expect(result.filename).toBe('simple-title.README');
  });

  it('should handle file with multiple dots correctly', async () => {
    const processor = createFilenameProcessor(() => 'Simple Title');
    const context = createContext('archive.tar.gz');

    const result = await processor(context);

    // 'archive.tar.gz'.split('.').pop() -> 'gz'
    // Result: "simple-title.gz"
    // Note: It doesn't preserve .tar.gz, just the last part. This is expected behavior of current implementation.
    expect(result.filename).toBe('simple-title.gz');
  });

  it('should not overwrite existing title in context if provided', async () => {
    // If context.title exists, result.title uses context.title || baseTitle.
    // Wait, let's check implementation:
    // return { ... title: context.title || baseTitle }
    // If context.title is truthy, it returns context.title.

    const processor = createFilenameProcessor(() => 'New Generated Title');
    const context = createContext('img.jpg', 'Existing Title');

    const result = await processor(context);

    // Filename is generated from getTitle() -> "New Generated Title"
    expect(result.filename).toBe('new-generated-title.jpg');
    // Title is preserved from context
    expect(result.title).toBe('Existing Title');
  });
});
