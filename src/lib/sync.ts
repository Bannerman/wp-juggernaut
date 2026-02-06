import { getDb } from './db';
import {
  fetchAllTaxonomies,
  fetchAllResources,
  fetchResourceIds,
  getTaxonomies,
  type WPResource,
  type WPTerm,
} from './wp-client';
import { TAXONOMY_META_FIELD } from './plugins/bundled/metabox';
import { collectMetaBoxKeys, runFieldAudit, saveAuditResults } from './field-audit';
import { decodeHtmlEntities } from './utils';

// Cache for media URLs to avoid duplicate requests during sync
const mediaUrlCache = new Map<number, string>();

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

export function getLastSyncTime(): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('last_sync_time') as
    | { value: string }
    | undefined;
  return row?.value || null;
}

export function setLastSyncTime(timestamp: string) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)').run(
    'last_sync_time',
    timestamp
  );
}

export function saveTerm(term: WPTerm) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO terms (id, taxonomy, name, slug, parent_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(term.id, term.taxonomy, term.name, term.slug, term.parent || 0);
}

export function saveResource(resource: WPResource, featuredImageUrl?: string) {
  const db = getDb();
  const now = new Date().toISOString();

  // Handle potentially missing rendered fields and decode HTML entities
  const title = decodeHtmlEntities(resource.title?.rendered || '');
  const content = resource.content?.rendered || '';
  const excerpt = resource.excerpt?.rendered || '';

  db.prepare(`
    INSERT OR REPLACE INTO resources (id, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_dirty FROM resources WHERE id = ?), 0))
  `).run(
    resource.id,
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

  // Save meta_box fields
  const metaStmt = db.prepare(`
    INSERT OR REPLACE INTO resource_meta (resource_id, field_id, value)
    VALUES (?, ?, ?)
  `);
  
  // First, clear existing meta_box to handle removed fields
  db.prepare('DELETE FROM resource_meta WHERE resource_id = ?').run(resource.id);
  
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

  // Save taxonomy terms — prefer Meta Box fields (tax_*) which contain reliable
  // term objects, over top-level REST fields which can include stale term_taxonomy_ids.
  db.prepare('DELETE FROM resource_terms WHERE resource_id = ?').run(resource.id);

  const termStmt = db.prepare(`
    INSERT OR REPLACE INTO resource_terms (resource_id, term_id, taxonomy)
    VALUES (?, ?, ?)
  `);

  const taxonomies = getTaxonomies();
  for (const taxonomy of taxonomies) {
    const metaField = TAXONOMY_META_FIELD[taxonomy];
    let termIds: number[] = [];

    // Try Meta Box field first (more reliable for this CPT)
    const metaValue = metaField && resource.meta_box ? resource.meta_box[metaField] : undefined;
    if (metaValue !== undefined) {
      if (Array.isArray(metaValue)) {
        // Could be: array of term objects [{term_id, name, ...}, ...] OR plain number array [N, M]
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
        // Single number value
        termIds = [metaValue];
      } else if (typeof metaValue === 'string' && /^\d+$/.test(metaValue)) {
        // Single string number
        termIds = [parseInt(metaValue, 10)];
      } else if (typeof metaValue === 'object' && metaValue !== null) {
        // taxonomy (single-select): single term object {term_id, name, ...}
        const obj = metaValue as Record<string, unknown>;
        const termId = obj.term_id ?? obj.id;
        if (typeof termId === 'number') termIds = [termId];
        else if (typeof termId === 'string' && /^\d+$/.test(termId)) termIds = [parseInt(termId, 10)];
      }
    }

    // Fall back to top-level REST field only if Meta Box field wasn't present at all
    if (metaValue === undefined) {
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

export function deleteResource(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM resources WHERE id = ?').run(id);
}

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

export async function syncResources(incremental: boolean = false): Promise<{
  updated: number;
  deleted: number;
  rawResources: WPResource[];
}> {
  const lastSync = incremental ? getLastSyncTime() : null;
  console.log(`Fetching resources (incremental: ${incremental}, lastSync: ${lastSync})`);
  const resources = await fetchAllResources(lastSync || undefined);
  console.log(`Fetched ${resources.length} resources from WordPress`);

  // Clear media cache at start of sync
  mediaUrlCache.clear();

  // Collect media IDs that need to be fetched
  const mediaIdsToFetch = new Set<number>();
  for (const resource of resources) {
    if (resource.featured_media && resource.featured_media > 0) {
      mediaIdsToFetch.add(resource.featured_media);
    }
  }

  // Fetch all media URLs in parallel
  console.log(`Fetching ${mediaIdsToFetch.size} media URLs...`);
  await Promise.all(
    Array.from(mediaIdsToFetch).map(async (mediaId) => {
      await fetchMediaUrl(mediaId);
    })
  );

  // Save resources with their featured image URLs
  for (const resource of resources) {
    let featuredImageUrl: string | undefined;
    if (resource.featured_media && resource.featured_media > 0) {
      featuredImageUrl = mediaUrlCache.get(resource.featured_media) || undefined;
    }
    saveResource(resource, featuredImageUrl);
  }

  // Check for deleted resources
  let deletedCount = 0;
  if (!incremental) {
    const serverIds = new Set(await fetchResourceIds());
    const db = getDb();
    const localIds = db
      .prepare('SELECT id FROM resources')
      .all() as { id: number }[];

    for (const { id } of localIds) {
      if (!serverIds.has(id)) {
        deleteResource(id);
        deletedCount++;
      }
    }
  }

  return { updated: resources.length, deleted: deletedCount, rawResources: resources };
}

export async function fullSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let taxonomiesUpdated = 0;
  let resourcesUpdated = 0;
  let resourcesDeleted = 0;

  try {
    taxonomiesUpdated = await syncTaxonomies();
  } catch (error) {
    errors.push(`Taxonomy sync error: ${error}`);
  }

  let rawResources: WPResource[] = [];
  try {
    const result = await syncResources(false);
    resourcesUpdated = result.updated;
    resourcesDeleted = result.deleted;
    rawResources = result.rawResources;
  } catch (error) {
    errors.push(`Resource sync error: ${error}`);
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

export async function incrementalSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let taxonomiesUpdated = 0;
  let resourcesUpdated = 0;

  try {
    taxonomiesUpdated = await syncTaxonomies();
  } catch (error) {
    errors.push(`Taxonomy sync error: ${error}`);
  }

  try {
    const result = await syncResources(true);
    resourcesUpdated = result.updated;
  } catch (error) {
    errors.push(`Resource sync error: ${error}`);
  }

  if (errors.length === 0) {
    setLastSyncTime(new Date().toISOString());
  }

  return { taxonomiesUpdated, resourcesUpdated, resourcesDeleted: 0, errors };
}
