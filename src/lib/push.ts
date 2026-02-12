import { getDb } from './db';
import {
  updateResource,
  batchUpdate,
  fetchResourceById,
  getTaxonomies,
  getWpBaseUrl,
  getWpCredentials,
  type UpdateResourcePayload,
  type BatchRequest,
} from './wp-client';
import { getTaxonomyMetaFieldMappingFromProfile } from './plugins/bundled/metabox';
import { getResourceById, markResourceClean, getDirtyResources, getResourceSeo, type LocalSeoData } from './queries';
import { seopressPlugin } from './plugins/bundled/seopress';

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

/**
 * Push SEO data to WordPress via SEOPress API.
 * Uses the SEOPress plugin's updateSEOData method which calls the correct
 * individual endpoints (title-description-metas, target-keywords, social-settings,
 * meta-robot-settings) rather than the read-only general posts endpoint.
 */
async function pushSeoData(resourceId: number): Promise<{ success: boolean; error?: string }> {
  const seo = getResourceSeo(resourceId);

  // Check if there's any SEO data to push
  const hasData = seo.title || seo.description || seo.canonical || seo.targetKeywords ||
    seo.og.title || seo.og.description || seo.og.image ||
    seo.twitter.title || seo.twitter.description || seo.twitter.image ||
    seo.robots.noindex || seo.robots.nofollow || seo.robots.nosnippet || seo.robots.noimageindex;

  if (!hasData) {
    console.log(`[push] No SEO data to push for resource ${resourceId}`);
    return { success: true };
  }

  try {
    const creds = getWpCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

    console.log(`[push] Pushing SEO data for resource ${resourceId}`);

    const result = await seopressPlugin.updateSEOData(
      resourceId,
      seo,
      getWpBaseUrl(),
      authHeader
    );

    if (!result.success) {
      console.error(`[push] SEO push errors for resource ${resourceId}:`, result.errors);
      return { success: false, error: `SEO push failed: ${result.errors.join('; ')}` };
    }

    console.log(`[push] SEO data pushed successfully for resource ${resourceId}`);
    return { success: true };
  } catch (error) {
    console.error(`[push] SEO push error for resource ${resourceId}:`, error);
    return { success: false, error: `SEO push error: ${String(error)}` };
  }
}

/**
 * Checks for conflicts between local and server versions of resources.
 * Compares local `modified_gmt` timestamps with the server's current values.
 * @param resourceIds - Array of resource IDs to check
 * @returns Array of ConflictInfo objects for resources that have server-side changes
 */
export async function checkForConflicts(resourceIds: number[]): Promise<ConflictInfo[]> {
  const db = getDb();
  const conflicts: ConflictInfo[] = [];

  for (const id of resourceIds) {
    const localResource = db
      .prepare('SELECT id, title, modified_gmt FROM posts WHERE id = ?')
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

/**
 * Resolves a media URL to its WordPress attachment ID by extracting the
 * filename and searching the media library.
 */
async function resolveMediaIdFromUrl(url: string): Promise<number> {
  try {
    const baseUrl = getWpBaseUrl();
    const creds = getWpCredentials();
    const auth = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

    // Extract filename without extension for search
    // Also strip WordPress size suffixes like -1024x778, -300x200, etc.
    const urlPath = new URL(url).pathname;
    const filenameWithExt = urlPath.split('/').pop() || '';
    const filename = filenameWithExt
      .replace(/\.[^.]+$/, '')        // remove extension
      .replace(/-\d+x\d+$/, '');      // remove WP size suffix
    if (!filename) return 0;

    console.log(`[push] Resolving media URL: ${url} (search: "${filename}")`);

    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/media?search=${encodeURIComponent(filename)}&per_page=10`,
      { headers: { Authorization: auth } }
    );
    if (!response.ok) return 0;

    const media = await response.json() as Array<{ id: number; source_url?: string; guid?: { rendered?: string } }>;

    // Try exact URL match first
    const exactMatch = media.find(m =>
      m.source_url === url || m.guid?.rendered === url
    );
    if (exactMatch) {
      console.log(`[push] Resolved media URL to attachment ID ${exactMatch.id} (exact match)`);
      return exactMatch.id;
    }

    // Try matching by base filename (handles resized URLs like image-1024x778.png → image.png)
    const baseUrl_ = url.replace(/-\d+x\d+(\.[^.]+)$/, '$1');
    const baseMatch = media.find(m =>
      m.source_url === baseUrl_ || m.guid?.rendered === baseUrl_
    );
    if (baseMatch) {
      console.log(`[push] Resolved media URL to attachment ID ${baseMatch.id} (base URL match)`);
      return baseMatch.id;
    }

    // If only one result from search, use it
    if (media.length === 1) {
      console.log(`[push] Resolved media URL to attachment ID ${media[0].id} (single search result)`);
      return media[0].id;
    }

    console.warn(`[push] Could not resolve media URL: ${url} (${media.length} search results, no match)`);
    return 0;
  } catch (error) {
    console.warn(`[push] Failed to resolve media URL: ${error}`);
    return 0;
  }
}

async function buildUpdatePayload(resourceId: number): Promise<UpdateResourcePayload> {
  const resource = getResourceById(resourceId);
  if (!resource) throw new Error(`Resource ${resourceId} not found`);

  // Resolve featured_media: if we have a URL, always resolve it to an attachment ID
  // (handles the case where user pasted a new URL but featured_media_id still points to the old image)
  const metaMediaId = resource.meta_box?.featured_media_id;
  const storedMediaId = (typeof metaMediaId === 'number' ? metaMediaId : 0) || resource.featured_media || 0;
  const imageUrl = resource.meta_box?.featured_image_url as string | undefined;

  let featuredMediaId = storedMediaId;
  if (imageUrl) {
    const resolvedId = await resolveMediaIdFromUrl(imageUrl);
    if (resolvedId) {
      featuredMediaId = resolvedId;
    }
  }

  console.log(`[push] Resource ${resourceId} featured_media: meta_box.featured_media_id=${metaMediaId}, resource.featured_media=${resource.featured_media}, using=${featuredMediaId}`);
  console.log(`[push] Resource ${resourceId} featured_image_url: ${imageUrl}`);

  const payload: UpdateResourcePayload = {
    title: resource.title,
    slug: resource.slug,
    status: resource.status,
    featured_media: featuredMediaId,
  };

  // Build meta_box: start with existing meta fields, filtering out synthetic ones
  const metaBox: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource.meta_box)) {
    // Skip synthetic/internal fields that aren't real Meta Box fields
    if (key === 'featured_image_url' || key === 'featured_media_id' || key === '_dirty_taxonomies') continue;
    // Skip taxonomy meta fields — we'll set them from local taxonomy data below
    if (key.startsWith('tax_')) continue;

    // Normalize download_sections to ensure download_file_format is always a number
    if (key === 'download_sections' && Array.isArray(value)) {
      metaBox[key] = normalizeDownloadSections(value);
    } else {
      metaBox[key] = value;
    }
  }

  // Only push taxonomies that were explicitly edited by the user.
  // This avoids accidentally clearing taxonomies that were never loaded/synced locally.
  // The _dirty_taxonomies meta field tracks which taxonomies were modified in the UI.
  const dirtyTaxonomiesRaw = resource.meta_box?.['_dirty_taxonomies'];
  const dirtyTaxonomies: Set<string> = new Set(
    Array.isArray(dirtyTaxonomiesRaw) ? dirtyTaxonomiesRaw as string[] : []
  );

  const taxSummary: Record<string, number[]> = {};
  const taxonomies = getTaxonomies();
  const taxonomyMetaFieldMapping = getTaxonomyMetaFieldMappingFromProfile();
  for (const taxonomy of taxonomies) {
    // Skip file_format - WP auto-syncs it from download_file_format in download links
    if (taxonomy === 'file_format') continue;
    // Only include taxonomies the user actually edited
    if (!dirtyTaxonomies.has(taxonomy)) continue;

    const termIds = resource.taxonomies[taxonomy] || [];

    // Top-level REST field (e.g., 'topic', 'resource-type')
    (payload as Record<string, unknown>)[taxonomy] = termIds;

    // Meta Box field (e.g., 'tax_topic', 'tax_resource_type')
    const metaField = taxonomyMetaFieldMapping[taxonomy];
    if (metaField) {
      metaBox[metaField] = termIds;
    }

    taxSummary[taxonomy] = termIds;
  }

  console.log(`[push] Payload for resource ${resourceId}: taxonomies =`, JSON.stringify(taxSummary));

  if (Object.keys(metaBox).length > 0) {
    payload.meta_box = metaBox;
  }

  return payload;
}

/**
 * Pushes a single dirty resource to WordPress. Builds the update payload from
 * local data, optionally checks for conflicts, and updates the server.
 * On success, clears the dirty flag and updates local timestamps.
 * @param resourceId - The ID of the resource to push
 * @param skipConflictCheck - If true, skip conflict detection and force push
 * @returns PushResult with success status, resource ID, and any error message
 */
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

    const payload = await buildUpdatePayload(resourceId);
    const updated = await updateResource(resourceId, payload);

    // Push SEO data (non-blocking - log errors but don't fail the push)
    const seoResult = await pushSeoData(resourceId);
    if (!seoResult.success) {
      console.warn(`[push] SEO push warning for resource ${resourceId}: ${seoResult.error}`);
    }

    // Update local modified_gmt, mark as clean, and clear dirty taxonomy tracking
    const db = getDb();
    db.prepare('UPDATE posts SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
      updated.modified_gmt,
      resourceId
    );
    db.prepare("DELETE FROM post_meta WHERE post_id = ? AND field_id = '_dirty_taxonomies'").run(resourceId);

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

/**
 * Pushes all dirty (locally modified) resources to WordPress in batches of 25.
 * Returns detailed results including successes, failures, and conflicts.
 * @param skipConflictCheck - If true, skip conflict detection and force push all
 * @param postType - Optional post type filter (only push dirty resources of this type)
 * @returns Object with `results` array, `successCount`, `failureCount`, and `conflicts`
 */
export async function pushAllDirty(
  skipConflictCheck: boolean = false,
  postType?: string
): Promise<{
  results: PushResult[];
  conflicts: ConflictInfo[];
}> {
  const dirtyResources = getDirtyResources(postType);
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
    const payloads = await Promise.all(safeIds.map((id) => buildUpdatePayload(id)));
    const requests: BatchRequest[] = safeIds.map((id, i) => ({
      method: 'POST' as const,
      path: `/wp/v2/resource/${id}`,
      body: payloads[i] as unknown as Record<string, unknown>,
    }));

    const batchResponse = await batchUpdate(requests);
    const db = getDb();

    for (let i = 0; i < safeIds.length; i++) {
      const response = batchResponse.responses[i];
      const resourceId = safeIds[i];

      if (response.status >= 200 && response.status < 300) {
        const body = response.body as { modified_gmt?: string };
        if (body.modified_gmt) {
          db.prepare('UPDATE posts SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
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
