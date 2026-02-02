import { getDb } from './db';
import {
  fetchAllTaxonomies,
  fetchAllResources,
  fetchResourceIds,
  TAXONOMIES,
  type WPResource,
  type WPTerm,
  type TaxonomySlug,
} from './wp-client';

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

export function saveResource(resource: WPResource) {
  const db = getDb();
  const now = new Date().toISOString();

  // Handle potentially missing rendered fields
  const title = resource.title?.rendered || '';
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
  if (resource.meta_box) {
    const metaStmt = db.prepare(`
      INSERT OR REPLACE INTO resource_meta (resource_id, field_id, value)
      VALUES (?, ?, ?)
    `);
    
    for (const [fieldId, value] of Object.entries(resource.meta_box)) {
      metaStmt.run(resource.id, fieldId, JSON.stringify(value));
    }
  }

  // Save taxonomy terms
  db.prepare('DELETE FROM resource_terms WHERE resource_id = ?').run(resource.id);
  
  const termStmt = db.prepare(`
    INSERT OR REPLACE INTO resource_terms (resource_id, term_id, taxonomy)
    VALUES (?, ?, ?)
  `);

  for (const taxonomy of TAXONOMIES) {
    const termIds = resource[taxonomy as keyof WPResource] as number[] | undefined;
    if (Array.isArray(termIds)) {
      for (const termId of termIds) {
        termStmt.run(resource.id, termId, taxonomy);
      }
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

  for (const taxonomy of TAXONOMIES) {
    const terms = allTerms[taxonomy];
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
}> {
  const lastSync = incremental ? getLastSyncTime() : null;
  console.log(`Fetching resources (incremental: ${incremental}, lastSync: ${lastSync})`);
  const resources = await fetchAllResources(lastSync || undefined);
  console.log(`Fetched ${resources.length} resources from WordPress`);

  for (const resource of resources) {
    saveResource(resource);
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

  return { updated: resources.length, deleted: deletedCount };
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

  try {
    const result = await syncResources(false);
    resourcesUpdated = result.updated;
    resourcesDeleted = result.deleted;
  } catch (error) {
    errors.push(`Resource sync error: ${error}`);
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
