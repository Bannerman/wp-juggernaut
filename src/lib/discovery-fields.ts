/**
 * WordPress Custom Field Discovery Module
 *
 * Discovers custom fields (meta_box keys) by analyzing sample posts
 * from a WordPress site. This helps auto-generate field mappings
 * for profiles.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiscoveredField {
  /** Field key/name as used in meta_box */
  name: string;
  /** Inferred field type based on value analysis */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown';
  /** Number of posts this field appears in */
  appears_in: number;
  /** Sample value (first non-empty value found) */
  sample_value?: unknown;
  /** Whether this looks like a taxonomy field (tax_*) */
  is_taxonomy_field: boolean;
  /** Whether this looks like a repeater/group field */
  is_repeater: boolean;
}

export interface FieldDiscoveryResult {
  success: boolean;
  post_type: string;
  sample_size: number;
  fields: DiscoveredField[];
  errors: string[];
}

// ─── Discovery Functions ─────────────────────────────────────────────────────

/**
 * Discover custom fields from a post type by analyzing sample posts
 *
 * @param baseUrl - WordPress site URL
 * @param authHeader - Authorization header for REST API
 * @param postType - The REST base for the post type (e.g., 'posts', 'resource')
 * @param sampleSize - Number of posts to analyze (default 10)
 */
export async function discoverCustomFields(
  baseUrl: string,
  authHeader: string,
  postType: string,
  sampleSize: number = 10
): Promise<FieldDiscoveryResult> {
  const result: FieldDiscoveryResult = {
    success: false,
    post_type: postType,
    sample_size: 0,
    fields: [],
    errors: [],
  };

  try {
    // Fetch sample posts with all fields
    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/${postType}?per_page=${sampleSize}&_fields=id,meta_box`,
      {
        headers: { Authorization: authHeader },
      }
    );

    if (!response.ok) {
      result.errors.push(`Failed to fetch posts: ${response.status}`);
      return result;
    }

    const posts = await response.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      result.errors.push('No posts found to analyze');
      return result;
    }

    result.sample_size = posts.length;

    // Collect all meta_box keys and their occurrences
    const fieldMap = new Map<string, {
      count: number;
      values: unknown[];
    }>();

    for (const post of posts) {
      const metaBox = post.meta_box;
      if (!metaBox || typeof metaBox !== 'object') continue;

      for (const [key, value] of Object.entries(metaBox)) {
        const existing = fieldMap.get(key);
        if (existing) {
          existing.count++;
          if (value !== null && value !== undefined && value !== '' && existing.values.length < 3) {
            existing.values.push(value);
          }
        } else {
          fieldMap.set(key, {
            count: 1,
            values: value !== null && value !== undefined && value !== '' ? [value] : [],
          });
        }
      }
    }

    // Convert to DiscoveredField array
    const fields: DiscoveredField[] = Array.from(fieldMap.entries()).map(([name, data]) => {
      const sampleValue = data.values[0];
      return {
        name,
        type: inferFieldType(sampleValue),
        appears_in: data.count,
        sample_value: sampleValue,
        is_taxonomy_field: isTaxonomyField(name, sampleValue),
        is_repeater: isRepeaterField(sampleValue),
      };
    });

    // Sort by frequency (most common first)
    fields.sort((a, b) => b.appears_in - a.appears_in);

    result.fields = fields;
    result.success = true;

    return result;
  } catch (error) {
    result.errors.push(`Error discovering fields: ${error}`);
    return result;
  }
}

/**
 * Infer the field type from a sample value
 */
function inferFieldType(value: unknown): DiscoveredField['type'] {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Check if a field looks like a taxonomy field
 * - Starts with 'tax_' or 'taax_'
 * - Contains term IDs or term objects
 */
function isTaxonomyField(name: string, value: unknown): boolean {
  // Check name pattern
  if (name.startsWith('tax_') || name.startsWith('taax_')) {
    return true;
  }

  // Check if value looks like term IDs or term objects
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    // Array of numbers (term IDs)
    if (typeof first === 'number') return true;
    // Array of term objects
    if (typeof first === 'object' && first !== null) {
      const obj = first as Record<string, unknown>;
      if ('term_id' in obj || 'term_taxonomy_id' in obj) return true;
    }
  }

  return false;
}

/**
 * Check if a field looks like a repeater/group field
 * - Array of objects with consistent keys
 */
function isRepeaterField(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;

  // Check if all items are objects with similar structure
  const first = value[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) return false;

  const firstKeys = Object.keys(first as Record<string, unknown>).sort().join(',');

  // Check if at least 2 items have the same keys
  let matchingItems = 0;
  for (const item of value) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const itemKeys = Object.keys(item as Record<string, unknown>).sort().join(',');
      if (itemKeys === firstKeys) matchingItems++;
    }
  }

  return matchingItems >= 2;
}

/**
 * Filter discovered fields to only include those that appear frequently
 */
export function filterCommonFields(
  fields: DiscoveredField[],
  minAppearanceRate: number = 0.5,
  sampleSize: number
): DiscoveredField[] {
  const minAppearances = Math.floor(sampleSize * minAppearanceRate);
  return fields.filter(f => f.appears_in >= minAppearances);
}

/**
 * Group fields by their inferred category
 */
export function categorizeFields(fields: DiscoveredField[]): {
  taxonomy: DiscoveredField[];
  repeater: DiscoveredField[];
  simple: DiscoveredField[];
} {
  return {
    taxonomy: fields.filter(f => f.is_taxonomy_field),
    repeater: fields.filter(f => f.is_repeater && !f.is_taxonomy_field),
    simple: fields.filter(f => !f.is_taxonomy_field && !f.is_repeater),
  };
}
