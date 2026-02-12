import { createValidationProcessor, ImageProcessorContext } from '../imageProcessing';

describe('createValidationProcessor', () => {
  const createMockContext = (
    fileType: string,
    fileSize: number
  ): ImageProcessorContext => {
    // Create a mock File object
    const file = {
      name: 'test-file.jpg',
      type: fileType,
      size: fileSize,
    } as unknown as File;

    return {
      file,
      filename: 'test-file.jpg',
      title: 'Test File',
      altText: 'Test Alt Text',
    };
  };

  it('should pass validation for valid file type and size (default options)', async () => {
    const processor = createValidationProcessor();
    const context = createMockContext('image/jpeg', 1024 * 1024); // 1MB

    await expect(processor(context)).resolves.toEqual(context);
  });

  it('should throw error for invalid file type (default options)', async () => {
    const processor = createValidationProcessor();
    const context = createMockContext('application/pdf', 1024 * 1024); // 1MB

    await expect(processor(context)).rejects.toThrow(
      'Invalid file type: application/pdf. Allowed types: image/jpeg, image/png, image/webp, image/gif'
    );
  });

  it('should throw error for file larger than default max size (10MB)', async () => {
    const processor = createValidationProcessor();
    const context = createMockContext('image/png', 11 * 1024 * 1024); // 11MB

    await expect(processor(context)).rejects.toThrow(
      'File too large: 11.00MB. Max size: 10MB'
    );
  });

  it('should allow custom max size', async () => {
    const processor = createValidationProcessor(5); // 5MB limit

    // Test a file just under the limit
    const contextValid = createMockContext('image/jpeg', 4.9 * 1024 * 1024);
    await expect(processor(contextValid)).resolves.toEqual(contextValid);

    // Test a file just over the limit
    const contextInvalid = createMockContext('image/jpeg', 5.1 * 1024 * 1024);
    await expect(processor(contextInvalid)).rejects.toThrow(
      'File too large: 5.10MB. Max size: 5MB'
    );
  });

  it('should allow custom allowed types', async () => {
    const processor = createValidationProcessor(10, ['image/svg+xml']);

    // Test a custom allowed type
    const contextValid = createMockContext('image/svg+xml', 1024);
    await expect(processor(contextValid)).resolves.toEqual(contextValid);

    // Test a default allowed type that is now invalid
    const contextInvalid = createMockContext('image/jpeg', 1024);
    await expect(processor(contextInvalid)).rejects.toThrow(
      'Invalid file type: image/jpeg. Allowed types: image/svg+xml'
    );
  });

  it('should fail all files if allowedTypes is empty', async () => {
    const processor = createValidationProcessor(10, []);
    const context = createMockContext('image/jpeg', 1024);

    await expect(processor(context)).rejects.toThrow(
      'Invalid file type: image/jpeg. Allowed types: '
    );
  });

  it('should handle zero size file if it is within limit', async () => {
    const processor = createValidationProcessor();
    const context = createMockContext('image/jpeg', 0);

    await expect(processor(context)).resolves.toEqual(context);
  });

  it('should handle file with empty type string', async () => {
    const processor = createValidationProcessor();
    const context = createMockContext('', 1024);

    await expect(processor(context)).rejects.toThrow(
      'Invalid file type: . Allowed types: image/jpeg, image/png, image/webp, image/gif'
    );
  });
});
