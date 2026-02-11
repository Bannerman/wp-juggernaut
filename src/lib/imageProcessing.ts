/**
 * Modular Image Processing Pipeline
 * 
 * This module provides a flexible pipeline for processing images before upload.
 * Each processor is a function that takes an ImageProcessorContext and returns
 * a modified context. Processors can be easily added, removed, or reordered.
 */

export interface ImageProcessorContext {
  file: File;
  filename: string;
  title: string;
  altText: string;
  seoData?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface ImageProcessorResult {
  file: File;
  filename: string;
  title: string;
  altText: string;
  metadata?: Record<string, unknown>;
}

export type ImageProcessor = (context: ImageProcessorContext) => Promise<ImageProcessorContext>;

/**
 * Pipeline that runs all registered processors in sequence
 */
export class ImageProcessingPipeline {
  private processors: ImageProcessor[] = [];

  /**
   * Add a processor to the pipeline
   */
  addProcessor(processor: ImageProcessor): this {
    this.processors.push(processor);
    return this;
  }

  /**
   * Remove a processor from the pipeline
   */
  removeProcessor(processor: ImageProcessor): this {
    this.processors = this.processors.filter(p => p !== processor);
    return this;
  }

  /**
   * Clear all processors
   */
  clearProcessors(): this {
    this.processors = [];
    return this;
  }

  /**
   * Process an image through all registered processors
   */
  async process(context: ImageProcessorContext): Promise<ImageProcessorResult> {
    let currentContext = { ...context };

    for (const processor of this.processors) {
      try {
        currentContext = await processor(currentContext);
      } catch (error) {
        console.error(`Processor failed:`, error);
        // Continue with next processor even if one fails
      }
    }

    return {
      file: currentContext.file,
      filename: currentContext.filename,
      title: currentContext.title,
      altText: currentContext.altText,
      metadata: currentContext.metadata,
    };
  }
}

// Create singleton instance
export const imagePipeline = new ImageProcessingPipeline();

/**
 * Built-in Processors
 */

/**
 * Generates a URL-friendly filename based on the provided title
 * Falls back to original filename if no title provided
 */
export function createFilenameProcessor(
  getTitle: () => string | null | undefined,
  onMissingTitle?: () => Promise<string | null>
): ImageProcessor {
  return async (context) => {
    let baseTitle = getTitle();
    
    // If no title, try callback
    if (!baseTitle && onMissingTitle) {
      baseTitle = await onMissingTitle();
    }
    
    // If still no title, use original filename without extension
    if (!baseTitle) {
      const originalName = context.file.name;
      const lastDotIndex = originalName.lastIndexOf('.');
      baseTitle = lastDotIndex > 0 ? originalName.slice(0, lastDotIndex) : originalName;
    }

    // Convert to URL-friendly format
    const slug = baseTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Get original extension
    const originalName = context.file.name;
    const extension = originalName.split('.').pop() || 'jpg';
    
    const newFilename = `${slug}.${extension}`;
    
    // Create new File with updated name
    const newFile = new File([context.file], newFilename, { type: context.file.type });
    
    return {
      ...context,
      file: newFile,
      filename: newFilename,
      title: context.title || baseTitle,
    };
  };
}

/**
 * Processor for SEO data extraction and enrichment.
 * Populates missing SEO metadata (title, description, keywords) based on existing data or filename.
 */
export const seoDataProcessor: ImageProcessor = async (context) => {
  // Determine base title to use for generation
  let baseTitle = context.title;
  if (!baseTitle) {
    // Fallback to filename without extension
    const lastDotIndex = context.filename.lastIndexOf('.');
    baseTitle = lastDotIndex > 0 ? context.filename.slice(0, lastDotIndex) : context.filename;

    // Normalize filename: replace hyphens/underscores with spaces
    baseTitle = baseTitle.replace(/[-_]/g, ' ');
  }

  // Generate keywords from title
  // Filter out common stop words and short words
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'that', 'these', 'those'
  ]);

  const generatedKeywords = baseTitle
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove special chars (unicode aware)
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const uniqueKeywords = [...new Set(generatedKeywords)];

  // Prepare new SEO data
  const existingSeo = context.seoData || {};

  const newSeoData = {
    title: existingSeo.title || baseTitle,
    description: existingSeo.description || baseTitle, // Default description to title
    keywords: (existingSeo.keywords && existingSeo.keywords.length > 0)
      ? existingSeo.keywords
      : uniqueKeywords,
  };

  return {
    ...context,
    seoData: newSeoData,
  };
};

/**
 * Placeholder processor for Shortpixel image compression
 * TODO: Implement actual Shortpixel API integration
 */
export const shortpixelProcessor: ImageProcessor = async (context) => {
  // Placeholder: In the future, this will:
  // 1. Send image to Shortpixel API
  // 2. Wait for compressed version
  // 3. Replace file with compressed version
  // For now, just pass through unchanged
  
  console.log('[Shortpixel Placeholder] Would compress:', context.filename);
  
  return context;
};

/**
 * Creates a processor that validates image type and size
 */
export function createValidationProcessor(
  maxSizeMB: number = 10,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
): ImageProcessor {
  return async (context) => {
    // Validate file type
    if (!allowedTypes.includes(context.file.type)) {
      throw new Error(
        `Invalid file type: ${context.file.type}. Allowed types: ${allowedTypes.join(', ')}`
      );
    }

    // Validate file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (context.file.size > maxSizeBytes) {
      throw new Error(
        `File too large: ${(context.file.size / 1024 / 1024).toFixed(2)}MB. Max size: ${maxSizeMB}MB`
      );
    }

    return context;
  };
}
