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
import { getProfileManager, ensureProfileLoaded, getProfileTaxonomyMetaFieldMapping } from './profiles';
import { collectMetaBoxKeys, runFieldAudit, saveAuditResults } from './field-audit';
import { decodeHtmlEntities, pMap } from './utils';
import { saveResourceSeo, type LocalSeoData, type SyncedSnapshot } from './queries';

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
 * Normalize a MetaBox field value for local storage.
 * MetaBox image/file fields return expanded objects (with width, height, sizes, ID, etc.)
 * via the REST API, but expect a simple attachment ID when saving. Detect these objects
 * and extract just the numeric ID to prevent data corruption on push.
 */
function normalizeMetaBoxValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // MetaBox image/file single: object with ID + image_meta or sizes
    if (('ID' in obj || 'id' in obj) && ('image_meta' in obj || 'sizes' in obj || 'full_url' in obj)) {
      const id = obj.ID ?? obj.id;
      if (typeof id === 'number') return id;
      if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10);
    }
  }
  return value;
}

/**
 * Resolves taxonomy term IDs from a WP resource (Meta Box fields preferred, REST fallback).
 * Pure function returning { taxonomy_slug: number[] }.
 */
function computeTermsByTaxonomy(resource: WPResource): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  const taxonomies = getTaxonomies();
  const taxonomyMetaMapping = getProfileTaxonomyMetaFieldMapping();

  for (const taxonomy of taxonomies) {
    const metaField = taxonomyMetaMapping[taxonomy];
    let termIds: number[] = [];

    const metaValue = metaField && resource.meta_box ? resource.meta_box[metaField] : undefined;
    if (metaValue !== undefined) {
      if (Array.isArray(metaValue)) {
        termIds = metaValue
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
        termIds = [metaValue];
      } else if (typeof metaValue === 'string' && /^\d+$/.test(metaValue)) {
        termIds = [parseInt(metaValue, 10)];
      } else if (typeof metaValue === 'object' && metaValue !== null) {
        const obj = metaValue as Record<string, unknown>;
        const termId = obj.term_id ?? obj.id;
        if (typeof termId === 'number') termIds = [termId];
        else if (typeof termId === 'string' && /^\d+$/.test(termId)) termIds = [parseInt(termId, 10)];
      }
    }

    if (metaValue === undefined) {
      const topLevel = resource[taxonomy as keyof WPResource] as number[] | undefined;
      if (Array.isArray(topLevel)) {
        termIds = topLevel;
      }
    }

    result[taxonomy] = termIds;
  }

  return result;
}

/**
 * Builds a snapshot of the server-side values for a resource.
 * Used to detect which fields were changed locally.
 */
function buildSnapshot(
  resource: WPResource,
  featuredImageUrl: string | undefined,
  termsByTaxonomy: Record<string, number[]>
): SyncedSnapshot {
  const title = decodeHtmlEntities(resource.title?.rendered || '');
  const metaBox: Record<string, unknown> = {};

  if (featuredImageUrl) {
    metaBox.featured_image_url = featuredImageUrl;
  }
  if (resource.featured_media && resource.featured_media > 0) {
    metaBox.featured_media_id = resource.featured_media;
  }
  if (resource.meta_box) {
    for (const [fieldId, value] of Object.entries(resource.meta_box)) {
      if (fieldId === 'featured_image_url' && featuredImageUrl) continue;
      metaBox[fieldId] = normalizeMetaBoxValue(value);
    }
  }

  return {
    title,
    slug: resource.slug,
    status: resource.status,
    meta_box: metaBox,
    taxonomies: termsByTaxonomy,
  };
}

/**
 * Saves a WordPress resource to the local database, including its meta fields
 * and taxonomy term assignments. If the resource is dirty, only updates the
 * synced_snapshot (preserving local edits). Also fetches and stores SEO data if available.
 * @param resource - The WordPress resource object from the REST API
 * @param featuredImageUrl - Optional pre-resolved featured image URL
 * @param postType - Optional post type slug override (defaults to 'resource')
 */
export function saveResource(resource: WPResource, featuredImageUrl?: string, postType?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const type = postType || 'resource';

  const title = decodeHtmlEntities(resource.title?.rendered || '');
  const content = resource.content?.rendered || '';
  const excerpt = resource.excerpt?.rendered || '';

  // Compute taxonomy terms from WP response
  const termsByTaxonomy = computeTermsByTaxonomy(resource);

  // Build snapshot of server values
  const snapshot = buildSnapshot(resource, featuredImageUrl, termsByTaxonomy);
  const snapshotJson = JSON.stringify(snapshot);

  // Check if the post is currently dirty
  const existing = db.prepare('SELECT is_dirty FROM posts WHERE id = ?').get(resource.id) as { is_dirty: number } | undefined;
  const isDirty = existing?.is_dirty === 1;

  if (isDirty) {
    // Dirty post: only update the snapshot and sync metadata, preserving local edits
    db.prepare(`
      UPDATE posts SET synced_snapshot = ?, synced_at = ?, modified_gmt = ? WHERE id = ?
    `).run(snapshotJson, now, resource.modified_gmt, resource.id);
    return;
  }

  // Clean post: full INSERT OR REPLACE with snapshot
  db.prepare(`
    INSERT OR REPLACE INTO posts (id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty, synced_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
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
    snapshotJson
  );

  // Save meta_box fields
  const metaStmt = db.prepare(`
    INSERT OR REPLACE INTO post_meta (post_id, field_id, value)
    VALUES (?, ?, ?)
  `);

  db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(resource.id);

  if (featuredImageUrl) {
    metaStmt.run(resource.id, 'featured_image_url', JSON.stringify(featuredImageUrl));
  }
  if (resource.featured_media && resource.featured_media > 0) {
    metaStmt.run(resource.id, 'featured_media_id', JSON.stringify(resource.featured_media));
  }

  if (resource.meta_box) {
    for (const [fieldId, value] of Object.entries(resource.meta_box)) {
      if (fieldId === 'featured_image_url' && featuredImageUrl) continue;
      // MetaBox image/file fields return expanded objects with an ID property.
      // Store just the numeric ID so pushes send the correct value back.
      const normalized = normalizeMetaBoxValue(value);
      metaStmt.run(resource.id, fieldId, JSON.stringify(normalized));
    }
  }

  // Save taxonomy terms
  db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(resource.id);

  const termStmt = db.prepare(`
    INSERT OR REPLACE INTO post_terms (post_id, term_id, taxonomy)
    VALUES (?, ?, ?)
  `);

  for (const [taxonomy, termIds] of Object.entries(termsByTaxonomy)) {
    for (const termId of termIds) {
      termStmt.run(resource.id, termId, taxonomy);
    }
  }
}

/**
 * Clears orphaned dirty flags: posts marked dirty whose current values match
 * the synced snapshot (i.e. no actual local changes remain).
 */
export function clearOrphanedDirtyFlags(): void {
  const db = getDb();
  const dirtyRows = db.prepare(
    'SELECT id, title, slug, status, synced_snapshot FROM posts WHERE is_dirty = 1 AND synced_snapshot IS NOT NULL'
  ).all() as Array<{ id: number; title: string; slug: string; status: string; synced_snapshot: string }>;

  if (dirtyRows.length === 0) return;

  let cleared = 0;
  for (const row of dirtyRows) {
    let snapshot: SyncedSnapshot;
    try {
      snapshot = JSON.parse(row.synced_snapshot);
    } catch {
      continue;
    }

    // Compare core fields
    if (row.title !== snapshot.title || row.slug !== snapshot.slug || row.status !== snapshot.status) {
      continue;
    }

    // Compare meta
    const metaRows = db.prepare('SELECT field_id, value FROM post_meta WHERE post_id = ?').all(row.id) as Array<{ field_id: string; value: string }>;
    const currentMeta: Record<string, unknown> = {};
    for (const m of metaRows) {
      if (m.field_id === '_dirty_taxonomies') continue;
      try { currentMeta[m.field_id] = JSON.parse(m.value); } catch { currentMeta[m.field_id] = m.value; }
    }

    const snapshotMetaKeys = Object.keys(snapshot.meta_box);
    const currentMetaKeys = Object.keys(currentMeta);
    if (snapshotMetaKeys.length !== currentMetaKeys.length) continue;
    let metaMatch = true;
    for (const key of snapshotMetaKeys) {
      if (JSON.stringify(currentMeta[key]) !== JSON.stringify(snapshot.meta_box[key])) {
        metaMatch = false;
        break;
      }
    }
    if (!metaMatch) continue;

    // Compare taxonomies
    const termRows = db.prepare('SELECT term_id, taxonomy FROM post_terms WHERE post_id = ?').all(row.id) as Array<{ term_id: number; taxonomy: string }>;
    const currentTax: Record<string, number[]> = {};
    for (const t of termRows) {
      if (!currentTax[t.taxonomy]) currentTax[t.taxonomy] = [];
      currentTax[t.taxonomy].push(t.term_id);
    }
    let taxMatch = true;
    for (const [tax, ids] of Object.entries(snapshot.taxonomies)) {
      const currentIds = (currentTax[tax] || []).slice().sort((a, b) => a - b);
      const snapshotIds = ids.slice().sort((a, b) => a - b);
      if (currentIds.length !== snapshotIds.length || currentIds.some((v, i) => v !== snapshotIds[i])) {
        taxMatch = false;
        break;
      }
    }
    // Also check if current has extra taxonomies not in snapshot
    for (const tax of Object.keys(currentTax)) {
      if (!snapshot.taxonomies[tax] && currentTax[tax].length > 0) {
        taxMatch = false;
        break;
      }
    }
    if (!taxMatch) continue;

    // All values match — clear dirty flag
    db.prepare('UPDATE posts SET is_dirty = 0 WHERE id = ?').run(row.id);
    db.prepare("DELETE FROM post_meta WHERE post_id = ? AND field_id = '_dirty_taxonomies'").run(row.id);
    cleared++;
  }

  if (cleared > 0) {
    console.log(`[sync] Cleared ${cleared} orphaned dirty flag(s)`);
  }
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
 * Deletes multiple resources and their associated meta/terms from the local database.
 * Cascading deletes handle post_meta and post_terms via foreign keys.
 * Uses a transaction and bulk DELETE with WHERE IN for performance.
 * @param ids - Array of resource/post IDs to delete
 */
export function deleteResources(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();

  const deleteBatch = db.transaction((idsToDelete: number[]) => {
    // SQLite has a limit on the number of variables in a single query (usually 999).
    // We chunk the IDs to stay well within this limit.
    const CHUNK_SIZE = 900;
    for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
      const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).run(...chunk);
    }
  });

  deleteBatch(ids);
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
  // Wrap in a transaction for performance (SQLite is much faster with bulk inserts)
  const saveTransaction = getDb().transaction((resourcesToSave: WPResource[]) => {
    for (const resource of resourcesToSave) {
      let featuredImageUrl: string | undefined;
      if (resource.featured_media && resource.featured_media > 0) {
        featuredImageUrl = mediaUrlCache.get(resource.featured_media) || undefined;
      }
      saveResource(resource, featuredImageUrl, typeSlug);
    }
  });

  saveTransaction(resources);

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
  }, 3);

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

    const idsToDelete = localIds
      .map(row => row.id)
      .filter(id => !serverIds.has(id));

    if (idsToDelete.length > 0) {
      deleteResources(idsToDelete);
      deletedCount += idsToDelete.length;
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

  // Clear orphaned dirty flags (posts marked dirty but matching server values)
  try {
    clearOrphanedDirtyFlags();
  } catch (error) {
    console.error('[sync] Orphan detection failed (non-fatal):', error);
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

  // Clear orphaned dirty flags
  try {
    clearOrphanedDirtyFlags();
  } catch (error) {
    console.error('[sync] Orphan detection failed (non-fatal):', error);
  }

  if (errors.length === 0) {
    setLastSyncTime(new Date().toISOString());
  }

  return { taxonomiesUpdated, resourcesUpdated, resourcesDeleted: 0, errors };
}
