import { getDb } from './db';
import {
  fetchAllTaxonomies,
  fetchAllResources,
  fetchResourceIds,
  getTaxonomies,
  getWpBaseUrl,
  getWpCredentials,
  getPrimaryPostTypeRestBase,
  type WPResource,
  type WPTerm,
} from './wp-client';
import { getProfileManager, ensureProfileLoaded } from './profiles';
import { TAXONOMY_META_FIELD } from './plugins/bundled/metabox';
import { collectMetaBoxKeys, runFieldAudit, saveAuditResults } from './field-audit';
import { decodeHtmlEntities, pMap } from './utils';
import { saveResourceSeo, type LocalSeoData } from './queries';

// Cache for media URLs to avoid duplicate requests during sync
const mediaUrlCache = new Map<number, string>();

// Fetch SEO data from SEOPress for a resource
async function fetchSeoData(resourceId: number): Promise<LocalSeoData | null> {
  try {
    const creds = getWpCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

    const response = await fetch(
      `${getWpBaseUrl()}/wp-json/seopress/v1/posts/${resourceId}`,
      {
        headers: { Authorization: authHeader },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      console.warn(`Failed to fetch SEO for resource ${resourceId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    return {
      title: data.title || '',
      description: data.description || '',
      canonical: data.canonical || '',
      targetKeywords: data.target_kw || '',
      og: {
        title: data.og?.title || '',
        description: data.og?.description || '',
        image: data.og?.image || '',
      },
      twitter: {
        title: data.twitter?.title || '',
        description: data.twitter?.description || '',
        image: data.twitter?.image || '',
      },
      robots: {
        noindex: data.robots?.noindex || false,
        nofollow: data.robots?.nofollow || false,
        nosnippet: data.robots?.nosnippet || false,
        noimageindex: data.robots?.noimageindex || false,
      },
    };
  } catch (error) {
    console.error(`Error fetching SEO for resource ${resourceId}:`, error);
    return null;
  }
}

async function fetchMediaUrl(mediaId: number): Promise<string | null> {
  // Check cache first
  if (mediaUrlCache.has(mediaId)) {
    return mediaUrlCache.get(mediaId) || null;
  }

  try {
    const { getWpBaseUrl, WP_USERNAME, WP_APP_PASSWORD } = await import('./wp-client');
    const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

    const response = await fetch(
      `${getWpBaseUrl()}/wp-json/wp/v2/media/${mediaId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch media ${mediaId}: ${response.status}`);
      return null;
    }

    const data = await response.json() as { source_url?: string; guid?: { rendered?: string } };
    const url = data.source_url || data.guid?.rendered || null;
    
    // Cache the result
    mediaUrlCache.set(mediaId, url || '');
    
    return url;
  } catch (error) {
    console.error(`Error fetching media ${mediaId}:`, error);
    return null;
  }
}

export interface SyncResult {
  taxonomiesUpdated: number;
  resourcesUpdated: number;
  resourcesDeleted: number;
  errors: string[];
}

/**
 * Returns the timestamp of the last successful sync, or null if never synced.
 * @returns ISO timestamp string or null
 */
export function getLastSyncTime(): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('last_sync_time') as
    | { value: string }
    | undefined;
  return row?.value || null;
}

/**
 * Updates the last sync timestamp in the sync_meta table.
 * @param timestamp - ISO timestamp string to store
 */
export function setLastSyncTime(timestamp: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run(
    'last_sync_time',
    timestamp
  );
}

/**
 * Saves a single taxonomy term to the local database (INSERT OR REPLACE).
 * @param term - The WordPress term object to persist
 */
export function saveTerm(term: WPTerm): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO terms (id, taxonomy, name, slug, parent_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(term.id, term.taxonomy, term.name, term.slug, term.parent || 0);
}

/**
 * Resolves various term ID formats into an array of numbers.
 * @param metaValue - The raw value from the meta field (number, string, object, array, etc.)
 * @returns Array of resolved term IDs
 */
function resolveTermIds(metaValue: unknown): number[] {
  if (metaValue === undefined) return [];

  if (Array.isArray(metaValue)) {
    // Could be: array of term objects [{term_id, name, ...}, ...] OR plain number array [N, M]
    return metaValue
      .map((t: unknown) => {
        if (typeof t === 'number') return t;
        if (typeof t === 'string' && /^\d+$/.test(t)) return parseInt(t, 10);
        if (typeof t === 'object' && t !== null) {
          const obj = t as Record<string, unknown>;
          const id = obj.term_id ?? obj.id;
          if (typeof id === 'number') return id;
          if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10);
        }
        return null;
      })
      .filter((id): id is number => typeof id === 'number');
  } else if (typeof metaValue === 'number') {
    // Single number value
    return [metaValue];
  } else if (typeof metaValue === 'string' && /^\d+$/.test(metaValue)) {
    // Single string number
    return [parseInt(metaValue, 10)];
  } else if (typeof metaValue === 'object' && metaValue !== null) {
    // taxonomy (single-select): single term object {term_id, name, ...}
    const obj = metaValue as Record<string, unknown>;
    const termId = obj.term_id ?? obj.id;
    if (typeof termId === 'number') return [termId];
    else if (typeof termId === 'string' && /^\d+$/.test(termId)) return [parseInt(termId, 10)];
  }

  return [];
}

/**
 * Saves the main post record to the local database.
 */
function savePostRecord(db: ReturnType<typeof getDb>, resource: WPResource, type: string, now: string): void {
  // Handle potentially missing rendered fields and decode HTML entities
  const title = decodeHtmlEntities(resource.title?.rendered || '');
  const content = resource.content?.rendered || '';
  const excerpt = resource.excerpt?.rendered || '';

  db.prepare(`
    INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_dirty FROM posts WHERE id = ?), 0))
  `).run(
    resource.id,
    type,
    title,
    resource.slug,
    resource.status,
    content,
    excerpt,
    resource.featured_media || 0,
    resource.date_gmt,
    resource.modified_gmt,
    now,
    resource.id
  );
}

/**
 * Saves post meta fields to the local database.
 */
function savePostMeta(db: ReturnType<typeof getDb>, resource: WPResource, featuredImageUrl?: string): void {
  const metaStmt = db.prepare(`
    INSERT OR REPLACE INTO post_meta (post_id, field_id, value)
    VALUES (?, ?, ?)
  `);

  // First, clear existing meta_box to handle removed fields
  db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(resource.id);

  // Save the featured_image_url and featured_media_id if we have them
  if (featuredImageUrl) {
    metaStmt.run(resource.id, 'featured_image_url', JSON.stringify(featuredImageUrl));
  }
  if (resource.featured_media && resource.featured_media > 0) {
    metaStmt.run(resource.id, 'featured_media_id', JSON.stringify(resource.featured_media));
  }

  // Save other meta_box fields from WordPress
  if (resource.meta_box) {
    for (const [fieldId, value] of Object.entries(resource.meta_box)) {
      // Skip featured_image_url if we already set it from media
      if (fieldId === 'featured_image_url' && featuredImageUrl) continue;
      metaStmt.run(resource.id, fieldId, JSON.stringify(value));
    }
  }
}

/**
 * Saves post taxonomy term assignments to the local database.
 */
function savePostTerms(db: ReturnType<typeof getDb>, resource: WPResource): void {
  // Save taxonomy terms — prefer Meta Box fields (tax_*) which contain reliable
  // term objects, over top-level REST fields which can include stale term_taxonomy_ids.
  db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(resource.id);

  const termStmt = db.prepare(`
    INSERT OR REPLACE INTO post_terms (post_id, term_id, taxonomy)
    VALUES (?, ?, ?)
  `);

  const taxonomies = getTaxonomies();
  for (const taxonomy of taxonomies) {
    const metaField = TAXONOMY_META_FIELD[taxonomy];
    let termIds: number[] = [];

    // Try Meta Box field first (more reliable for this CPT)
    const metaValue = metaField && resource.meta_box ? resource.meta_box[metaField] : undefined;

    if (metaValue !== undefined) {
      termIds = resolveTermIds(metaValue);
    } else {
      // Fall back to top-level REST field only if Meta Box field wasn't present at all
      const topLevel = resource[taxonomy as keyof WPResource] as number[] | undefined;
      if (Array.isArray(topLevel)) {
        termIds = topLevel;
      }
    }

    for (const termId of termIds) {
      termStmt.run(resource.id, termId, taxonomy);
    }
  }
}

/**
 * Saves a WordPress resource to the local database, including its meta fields
 * and taxonomy term assignments. Preserves the `is_dirty` flag if the resource
 * already exists with local edits. Also fetches and stores SEO data if available.
 * @param resource - The WordPress resource object from the REST API
 * @param featuredImageUrl - Optional pre-resolved featured image URL
 * @param postType - Optional post type slug override (defaults to 'resource')
 */
export function saveResource(resource: WPResource, featuredImageUrl?: string, postType?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const type = postType || 'resource';

  // Use a transaction to ensure atomicity
  const transaction = db.transaction(() => {
    savePostRecord(db, resource, type, now);
    savePostMeta(db, resource, featuredImageUrl);
    savePostTerms(db, resource);
  });

  transaction();
}

/**
 * Deletes a resource and its associated meta/terms from the local database.
 * Cascading deletes handle post_meta and post_terms via foreign keys.
 * @param id - The resource/post ID to delete
 */
export function deleteResource(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
}

/**
 * Syncs all taxonomy terms from WordPress into the local database.
 * Fetches terms for all taxonomies defined in the active profile.
 * @returns The total number of terms synced
 */
export async function syncTaxonomies(): Promise<number> {
  const allTerms = await fetchAllTaxonomies();
  let count = 0;

  const taxonomies = getTaxonomies();
  for (const taxonomy of taxonomies) {
    const terms = allTerms[taxonomy] || [];
    for (const term of terms) {
      saveTerm(term);
      count++;
    }
  }

  return count;
}

/** Get the primary post type slug from the profile */
function getPrimaryPostTypeSlug(): string {
  try {
    ensureProfileLoaded();
    const pt = getProfileManager().getPrimaryPostType();
    return pt?.slug || 'resource';
  } catch {
    return 'resource';
  }
}

/** Resolve a REST base back to its post type slug */
function resolvePostTypeSlug(restBase: string): string {
  try {
    ensureProfileLoaded();
    const postTypes = getProfileManager().getPostTypes();
    const match = postTypes.find(pt => pt.rest_base === restBase || pt.slug === restBase);
    return match?.slug || restBase;
  } catch {
    return restBase;
  }
}

/**
 * Syncs resources from WordPress to the local database.
 * In full mode, also detects and deletes resources that no longer exist on the server.
 * In incremental mode, only fetches resources modified since the last sync.
 * @param incremental - If true, only fetch resources modified since last sync
 * @param postType - Optional post type REST base override
 * @returns Object with `updated` count, `deleted` count, and `rawResources` array
 */
export type SyncProgressCallback = (phase: string, progress: number, detail?: string) => void;

export async function syncResources(
  incremental: boolean = false,
  postType?: string,
  onProgress?: SyncProgressCallback
): Promise<{
  updated: number;
  deleted: number;
  rawResources: WPResource[];
}> {
  const lastSync = incremental ? getLastSyncTime() : null;
  // Resolve the REST base for the WP API and the slug for local storage
  const restBase = postType || getPrimaryPostTypeRestBase();
  const typeSlug = postType ? resolvePostTypeSlug(postType) : getPrimaryPostTypeSlug();

  console.log(`Fetching ${typeSlug} (incremental: ${incremental}, lastSync: ${lastSync})`);
  onProgress?.('fetching', 0, `Counting ${typeSlug}...`);
  const resources = await fetchAllResources(lastSync || undefined, restBase, (fetched, total) => {
    const pct = total > 0 ? fetched / total : 0;
    onProgress?.('fetching', pct, `Fetched ${fetched} of ${total} ${typeSlug}`);
  });
  console.log(`Fetched ${resources.length} ${typeSlug} from WordPress`);

  // Clear media cache at start of sync
  mediaUrlCache.clear();

  // Collect media IDs that need to be fetched
  const mediaIdsToFetch = new Set<number>();
  for (const resource of resources) {
    if (resource.featured_media && resource.featured_media > 0) {
      mediaIdsToFetch.add(resource.featured_media);
    }
  }

  // Fetch all media URLs in parallel with concurrency limit
  console.log(`Fetching ${mediaIdsToFetch.size} media URLs...`);
  onProgress?.('media', 0, `Fetching ${mediaIdsToFetch.size} media URLs...`);
  let mediaFetched = 0;
  const mediaTotal = mediaIdsToFetch.size;
  await pMap(Array.from(mediaIdsToFetch), async (mediaId) => {
    await fetchMediaUrl(mediaId);
    mediaFetched++;
    onProgress?.('media', mediaTotal > 0 ? mediaFetched / mediaTotal : 1);
  }, 5);

  // Save resources with their featured image URLs
  for (const resource of resources) {
    let featuredImageUrl: string | undefined;
    if (resource.featured_media && resource.featured_media > 0) {
      featuredImageUrl = mediaUrlCache.get(resource.featured_media) || undefined;
    }
    saveResource(resource, featuredImageUrl, typeSlug);
  }

  // Fetch and save SEO data for all resources in parallel with concurrency limit
  console.log(`Fetching SEO data for ${resources.length} ${typeSlug}...`);
  onProgress?.('seo', 0, `Fetching SEO data for ${resources.length} ${typeSlug}...`);
  let seoFetched = 0;
  const seoTotal = resources.length;
  const seoResults = await pMap(resources, async (resource) => {
    const seo = await fetchSeoData(resource.id);
    seoFetched++;
    onProgress?.('seo', seoTotal > 0 ? seoFetched / seoTotal : 1);
    return { id: resource.id, seo };
  }, 5);

  let seoSaved = 0;
  for (const { id, seo } of seoResults) {
    if (seo) {
      saveResourceSeo(id, seo, false); // false = don't mark dirty during sync
      seoSaved++;
    }
  }
  console.log(`Saved SEO data for ${seoSaved} ${typeSlug}`);

  // Check for deleted resources
  let deletedCount = 0;
  if (!incremental) {
    const serverIds = new Set(await fetchResourceIds(restBase));
    const db = getDb();
    const localIds = db
      .prepare('SELECT id FROM posts WHERE post_type = ?')
      .all(typeSlug) as { id: number }[];

    for (const { id } of localIds) {
      if (!serverIds.has(id)) {
        deleteResource(id);
        deletedCount++;
      }
    }
  }

  return { updated: resources.length, deleted: deletedCount, rawResources: resources };
}

/** Get all configured post types from the profile */
function getConfiguredPostTypes(): Array<{ slug: string; rest_base: string }> {
  try {
    ensureProfileLoaded();
    return getProfileManager().getPostTypes();
  } catch {
    return [{ slug: 'resource', rest_base: 'resource' }];
  }
}

/**
 * Performs a complete sync: taxonomies first, then all resources, then deletion detection.
 * Errors are collected (not thrown) — partial success is acceptable.
 * Updates `last_sync_time` only if no errors occurred.
 * @returns SyncResult with counts and any errors
 */
export async function fullSync(onProgress?: SyncProgressCallback): Promise<SyncResult> {
  const errors: string[] = [];
  let taxonomiesUpdated = 0;
  let resourcesUpdated = 0;
  let resourcesDeleted = 0;

  // Phase weights: taxonomies 5%, resources across all post types 95%
  // Within each post type: fetching 50%, media 25%, seo 25%
  onProgress?.('taxonomies', 0, 'Syncing taxonomies...');
  try {
    taxonomiesUpdated = await syncTaxonomies();
  } catch (error) {
    errors.push(`Taxonomy sync error: ${error}`);
  }
  onProgress?.('taxonomies', 1, `Synced ${taxonomiesUpdated} terms`);

  // Sync all configured post types
  let rawResources: WPResource[] = [];
  const postTypes = getConfiguredPostTypes();
  const ptCount = postTypes.length;
  for (let i = 0; i < ptCount; i++) {
    const pt = postTypes[i];
    const ptBase = i / ptCount;       // base progress for this post type
    const ptSlice = 1 / ptCount;      // fraction of total for this post type
    try {
      const result = await syncResources(false, pt.rest_base, (phase, phasePct, detail) => {
        // Map sub-phases to overall progress within this post type's slice
        let subOffset = 0;
        let subWeight = 0.5;
        if (phase === 'fetching') { subOffset = 0; subWeight = 0.5; }
        else if (phase === 'media') { subOffset = 0.5; subWeight = 0.25; }
        else if (phase === 'seo') { subOffset = 0.75; subWeight = 0.25; }
        const overall = ptBase + ptSlice * (subOffset + subWeight * phasePct);
        onProgress?.(phase, overall, detail);
      });
      resourcesUpdated += result.updated;
      resourcesDeleted += result.deleted;
      rawResources = rawResources.concat(result.rawResources);
    } catch (error) {
      errors.push(`Sync error for ${pt.slug}: ${error}`);
    }
  }

  // Run field audit (non-fatal — errors logged but don't fail sync)
  if (rawResources.length > 0) {
    try {
      const wpFieldMap = collectMetaBoxKeys(rawResources);
      const auditEntries = runFieldAudit(wpFieldMap);
      const auditTime = saveAuditResults(auditEntries);
      console.log(`[sync] Field audit completed at ${auditTime}: ${auditEntries.length} fields checked`);
    } catch (error) {
      console.error('[sync] Field audit failed (non-fatal):', error);
    }
  }

  if (errors.length === 0) {
    setLastSyncTime(new Date().toISOString());
  }

  return { taxonomiesUpdated, resourcesUpdated, resourcesDeleted, errors };
}

/**
 * Performs an incremental sync: refreshes taxonomies, then fetches only resources
 * modified since the last sync timestamp. Skips deletion detection.
 * @returns SyncResult with counts and any errors
 */
export async function incrementalSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let taxonomiesUpdated = 0;
  let resourcesUpdated = 0;

  try {
    taxonomiesUpdated = await syncTaxonomies();
  } catch (error) {
    errors.push(`Taxonomy sync error: ${error}`);
  }

  // Incremental sync all configured post types
  const postTypes = getConfiguredPostTypes();
  for (const pt of postTypes) {
    try {
      const result = await syncResources(true, pt.rest_base);
      resourcesUpdated += result.updated;
    } catch (error) {
      errors.push(`Sync error for ${pt.slug}: ${error}`);
    }
  }

  if (errors.length === 0) {
    setLastSyncTime(new Date().toISOString());
  }

  return { taxonomiesUpdated, resourcesUpdated, resourcesDeleted: 0, errors };
}
