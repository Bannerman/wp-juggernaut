import { getDb } from './db';
import {
  updateResource,
  batchUpdate,
  fetchResourceById,
  type UpdateResourcePayload,
  type BatchRequest,
  TAXONOMIES,
  TAXONOMY_META_FIELD,
  type TaxonomySlug,
} from './wp-client';
import { getResourceById, markResourceClean, getDirtyResources } from './queries';

export interface PushResult {
  success: boolean;
  resourceId: number;
  error?: string;
}

export interface ConflictInfo {
  resourceId: number;
  title: string;
  localModified: string;
  serverModified: string;
}

interface DownloadLink {
  link_text: string;
  download_link_type: string;
  download_file_format?: number | string;
  download_link_url?: string;
  download_link_upload?: string;
  [key: string]: unknown;
}

interface DownloadSection {
  download_section_heading: string;
  download_section_color?: string;
  download_archive?: boolean;
  download_links?: DownloadLink[];
  [key: string]: unknown;
}

/**
 * Normalize download_sections to ensure download_file_format is always a number.
 * WordPress expects term IDs as numbers, not strings.
 */
function normalizeDownloadSections(sections: unknown[]): DownloadSection[] {
  return sections.map((section) => {
    const s = section as DownloadSection;
    if (!s.download_links || !Array.isArray(s.download_links)) {
      return s;
    }

    return {
      ...s,
      download_links: s.download_links.map((link) => {
        const normalized = { ...link };
        // Convert download_file_format to number if it's a string
        if (normalized.download_file_format !== undefined) {
          const val = normalized.download_file_format;
          if (typeof val === 'string' && /^\d+$/.test(val)) {
            normalized.download_file_format = parseInt(val, 10);
          } else if (typeof val !== 'number') {
            // Remove invalid values
            delete normalized.download_file_format;
          }
        }
        return normalized;
      }),
    };
  });
}

export async function checkForConflicts(resourceIds: number[]): Promise<ConflictInfo[]> {
  const db = getDb();
  const conflicts: ConflictInfo[] = [];

  for (const id of resourceIds) {
    const localResource = db
      .prepare('SELECT id, title, modified_gmt FROM resources WHERE id = ?')
      .get(id) as { id: number; title: string; modified_gmt: string } | undefined;

    if (!localResource) continue;

    try {
      const serverResource = await fetchResourceById(id);
      
      if (serverResource.modified_gmt !== localResource.modified_gmt) {
        conflicts.push({
          resourceId: id,
          title: localResource.title,
          localModified: localResource.modified_gmt,
          serverModified: serverResource.modified_gmt,
        });
      }
    } catch (error) {
      console.error(`Error checking conflict for resource ${id}:`, error);
    }
  }

  return conflicts;
}

function buildUpdatePayload(resourceId: number): UpdateResourcePayload {
  const resource = getResourceById(resourceId);
  if (!resource) throw new Error(`Resource ${resourceId} not found`);

  // Get featured_media from meta_box if available, otherwise fall back to the column
  const metaMediaId = resource.meta_box?.featured_media_id;
  const featuredMediaId = (typeof metaMediaId === 'number' ? metaMediaId : 0) || resource.featured_media || 0;

  console.log(`[push] Resource ${resourceId} featured_media: meta_box.featured_media_id=${metaMediaId}, resource.featured_media=${resource.featured_media}, using=${featuredMediaId}`);
  console.log(`[push] Resource ${resourceId} featured_image_url: ${resource.meta_box?.featured_image_url}`);

  const payload: UpdateResourcePayload = {
    title: resource.title,
    status: resource.status,
    featured_media: featuredMediaId,
  };

  // Build meta_box: start with existing meta fields, filtering out synthetic ones
  const metaBox: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource.meta_box)) {
    // Skip synthetic fields that aren't real Meta Box fields
    if (key === 'featured_image_url' || key === 'featured_media_id') continue;
    // Skip taxonomy meta fields — we'll set them from local taxonomy data below
    if (key.startsWith('tax_') || key === 'taax_competition_format') continue;

    // Normalize download_sections to ensure download_file_format is always a number
    if (key === 'download_sections' && Array.isArray(value)) {
      metaBox[key] = normalizeDownloadSections(value);
    } else {
      metaBox[key] = value;
    }
  }

  // Add taxonomy assignments via BOTH:
  // 1. Top-level REST fields (standard WP REST API way)
  // 2. Meta Box field names (in case Meta Box intercepts these)
  // This ensures the assignment works regardless of how the CPT is configured.
  // Note: file_format is auto-synced from download_file_format in download links, so skip it.
  const taxSummary: Record<string, number[]> = {};
  for (const taxonomy of TAXONOMIES) {
    // Skip file_format - WP auto-syncs it from download_file_format in download links
    if (taxonomy === 'file_format') continue;

    const termIds = resource.taxonomies[taxonomy] || [];
    if (termIds.length > 0) {
      // Top-level taxonomy field (e.g., 'topic', 'resource-type')
      (payload as Record<string, unknown>)[taxonomy] = termIds;

      // Meta Box field (e.g., 'tax_topic', 'tax_resource_type')
      const metaField = TAXONOMY_META_FIELD[taxonomy];
      if (metaField) {
        metaBox[metaField] = termIds;
      }

      taxSummary[taxonomy] = termIds;
    }
  }

  console.log(`[push] Payload for resource ${resourceId}: taxonomies =`, JSON.stringify(taxSummary));

  if (Object.keys(metaBox).length > 0) {
    payload.meta_box = metaBox;
  }

  return payload;
}

export async function pushResource(
  resourceId: number,
  skipConflictCheck: boolean = false
): Promise<PushResult> {
  try {
    // Check for conflicts
    if (!skipConflictCheck) {
      const conflicts = await checkForConflicts([resourceId]);
      if (conflicts.length > 0) {
        return {
          success: false,
          resourceId,
          error: `Conflict detected: server was modified at ${conflicts[0].serverModified}`,
        };
      }
    }

    const payload = buildUpdatePayload(resourceId);
    const updated = await updateResource(resourceId, payload);

    // Update local modified_gmt and mark as clean
    const db = getDb();
    db.prepare('UPDATE resources SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
      updated.modified_gmt,
      resourceId
    );

    return { success: true, resourceId };
  } catch (error) {
    console.error(`[push] FAILED resource ${resourceId}:`, error);
    return {
      success: false,
      resourceId,
      error: String(error),
    };
  }
}

export async function pushAllDirty(
  skipConflictCheck: boolean = false
): Promise<{
  results: PushResult[];
  conflicts: ConflictInfo[];
}> {
  const dirtyResources = getDirtyResources();
  const resourceIds = dirtyResources.map((r) => r.id);

  if (resourceIds.length === 0) {
    return { results: [], conflicts: [] };
  }

  // Check for conflicts (warn but don't block — this is a single-user local tool
  // and stale modified_gmt from previous partial pushes shouldn't prevent retries)
  let conflicts: ConflictInfo[] = [];
  if (!skipConflictCheck) {
    conflicts = await checkForConflicts(resourceIds);
    if (conflicts.length > 0) {
      console.warn(`[push] ${conflicts.length} conflict(s) detected — pushing anyway`);
      for (const c of conflicts) {
        console.warn(`[push]   Resource ${c.resourceId} "${c.title}": local=${c.localModified}, server=${c.serverModified}`);
      }
    }
  }

  // Push resources individually to ensure all WP hooks fire correctly
  // (batch API can silently skip taxonomy assignments)
  const results: PushResult[] = [];

  for (let i = 0; i < resourceIds.length; i++) {
    const id = resourceIds[i];
    const result = await pushResource(id, true);
    results.push(result);

    // Small delay between requests to avoid rate limiting
    if (i < resourceIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return { results, conflicts };
}

async function pushBatch(
  resourceIds: number[],
  conflicts: ConflictInfo[]
): Promise<PushResult[]> {
  const conflictIds = new Set(conflicts.map((c) => c.resourceId));
  const results: PushResult[] = [];

  // Skip conflicting resources
  const safeIds = resourceIds.filter((id) => !conflictIds.has(id));
  
  if (safeIds.length === 0) {
    return resourceIds.map((id) => ({
      success: false,
      resourceId: id,
      error: 'Conflict detected',
    }));
  }

  try {
    const requests: BatchRequest[] = safeIds.map((id) => {
      const payload = buildUpdatePayload(id);
      return {
        method: 'POST' as const,
        path: `/wp/v2/resource/${id}`,
        body: payload as unknown as Record<string, unknown>,
      };
    });

    const batchResponse = await batchUpdate(requests);
    const db = getDb();

    for (let i = 0; i < safeIds.length; i++) {
      const response = batchResponse.responses[i];
      const resourceId = safeIds[i];

      if (response.status >= 200 && response.status < 300) {
        const body = response.body as { modified_gmt?: string };
        if (body.modified_gmt) {
          db.prepare('UPDATE resources SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
            body.modified_gmt,
            resourceId
          );
        }
        results.push({ success: true, resourceId });
      } else {
        results.push({
          success: false,
          resourceId,
          error: `HTTP ${response.status}`,
        });
      }
    }
  } catch (error) {
    // If batch fails, try individual updates
    for (const id of safeIds) {
      const result = await pushResource(id, true);
      results.push(result);
    }
  }

  // Add results for conflicting resources
  for (const id of resourceIds) {
    if (conflictIds.has(id)) {
      results.push({
        success: false,
        resourceId: id,
        error: 'Conflict detected',
      });
    }
  }

  return results;
}
