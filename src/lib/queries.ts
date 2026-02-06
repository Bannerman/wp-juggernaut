import { getDb } from './db';
import { getTaxonomies } from './wp-client';

export interface LocalResource {
  id: number;
  title: string;
  slug: string;
  status: string;
  content: string;
  excerpt: string;
  featured_media: number;
  date_gmt: string;
  modified_gmt: string;
  synced_at: string;
  is_dirty: boolean;
  meta_box: Record<string, unknown>;
  taxonomies: Record<string, number[]>;
}

export interface LocalTerm {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

export function getAllTerms(): LocalTerm[] {
  const db = getDb();
  return db.prepare('SELECT * FROM terms ORDER BY taxonomy, name').all() as LocalTerm[];
}

export function getTermsByTaxonomy(taxonomy: string): LocalTerm[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM terms WHERE taxonomy = ? ORDER BY name')
    .all(taxonomy) as LocalTerm[];
}

export function getAllTermsGrouped(): Record<string, LocalTerm[]> {
  const terms = getAllTerms();
  const grouped: Record<string, LocalTerm[]> = {};

  const taxonomies = getTaxonomies();
  for (const taxonomy of taxonomies) {
    grouped[taxonomy] = [];
  }

  for (const term of terms) {
    if (grouped[term.taxonomy]) {
      grouped[term.taxonomy].push(term);
    }
  }
  
  return grouped;
}

export interface ResourceFilters {
  status?: string;
  search?: string;
  isDirty?: boolean;
  taxonomies?: Partial<Record<string, number[]>>;
}

export function getResources(filters: ResourceFilters = {}): LocalResource[] {
  const db = getDb();
  
  let query = 'SELECT * FROM resources WHERE 1=1';
  const params: unknown[] = [];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.search) {
    query += ' AND (title LIKE ? OR slug LIKE ?)';
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (filters.isDirty !== undefined) {
    query += ' AND is_dirty = ?';
    params.push(filters.isDirty ? 1 : 0);
  }

  query += ' ORDER BY modified_gmt DESC';

  const rows = db.prepare(query).all(...params) as Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    content: string;
    excerpt: string;
    featured_media: number;
    date_gmt: string;
    modified_gmt: string;
    synced_at: string;
    is_dirty: number;
  }>;

  return rows.map((row) => {
    const resource: LocalResource = {
      ...row,
      is_dirty: row.is_dirty === 1,
      meta_box: getResourceMeta(row.id),
      taxonomies: getResourceTaxonomies(row.id),
    };

    // Apply taxonomy filters
    if (filters.taxonomies) {
      for (const [taxonomy, termIds] of Object.entries(filters.taxonomies)) {
        if (termIds && termIds.length > 0) {
          const resourceTerms = resource.taxonomies[taxonomy] || [];
          const hasMatch = termIds.some((id) => resourceTerms.includes(id));
          if (!hasMatch) {
            return null;
          }
        }
      }
    }

    return resource;
  }).filter((r): r is LocalResource => r !== null);
}

export function getResourceById(id: number): LocalResource | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(id) as {
    id: number;
    title: string;
    slug: string;
    status: string;
    content: string;
    excerpt: string;
    featured_media: number;
    date_gmt: string;
    modified_gmt: string;
    synced_at: string;
    is_dirty: number;
  } | undefined;

  if (!row) return null;

  return {
    ...row,
    is_dirty: row.is_dirty === 1,
    meta_box: getResourceMeta(id),
    taxonomies: getResourceTaxonomies(id),
  };
}

function getResourceMeta(resourceId: number): Record<string, unknown> {
  const db = getDb();
  const rows = db
    .prepare('SELECT field_id, value FROM resource_meta WHERE resource_id = ?')
    .all(resourceId) as Array<{ field_id: string; value: string }>;

  const meta: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      meta[row.field_id] = JSON.parse(row.value);
    } catch {
      meta[row.field_id] = row.value;
    }
  }
  return meta;
}

function getResourceTaxonomies(resourceId: number): Record<string, number[]> {
  const db = getDb();
  const rows = db
    .prepare('SELECT term_id, taxonomy FROM resource_terms WHERE resource_id = ?')
    .all(resourceId) as Array<{ term_id: number; taxonomy: string }>;

  const taxonomies: Record<string, number[]> = {};
  const profileTaxonomies = getTaxonomies();
  for (const taxonomy of profileTaxonomies) {
    taxonomies[taxonomy] = [];
  }

  for (const row of rows) {
    // Initialize taxonomy if not already present (handles taxonomies from DB not in profile)
    if (!taxonomies[row.taxonomy]) {
      taxonomies[row.taxonomy] = [];
    }
    taxonomies[row.taxonomy].push(row.term_id);
  }

  return taxonomies;
}

export function updateLocalResource(
  id: number,
  updates: {
    title?: string;
    slug?: string;
    status?: string;
    taxonomies?: Partial<Record<string, number[]>>;
    meta_box?: Record<string, unknown>;
  }
) {
  const db = getDb();
  const resource = getResourceById(id);
  if (!resource) throw new Error(`Resource ${id} not found`);

  // Update basic fields
  if (updates.title !== undefined || updates.slug !== undefined || updates.status !== undefined) {
    const fields: string[] = ['is_dirty = 1'];
    const params: unknown[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.slug !== undefined) {
      fields.push('slug = ?');
      params.push(updates.slug);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }

    params.push(id);
    db.prepare(`UPDATE resources SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  // Update meta_box fields
  if (updates.meta_box) {
    const metaStmt = db.prepare(`
      INSERT OR REPLACE INTO resource_meta (resource_id, field_id, value)
      VALUES (?, ?, ?)
    `);
    
    for (const [fieldId, value] of Object.entries(updates.meta_box)) {
      metaStmt.run(id, fieldId, JSON.stringify(value));
    }
    
    db.prepare('UPDATE resources SET is_dirty = 1 WHERE id = ?').run(id);
  }

  // Update taxonomy terms
  if (updates.taxonomies) {
    for (const [taxonomy, termIds] of Object.entries(updates.taxonomies)) {
      if (termIds !== undefined) {
        // Delete existing terms for this taxonomy
        db.prepare(
          'DELETE FROM resource_terms WHERE resource_id = ? AND taxonomy = ?'
        ).run(id, taxonomy);

        // Insert new terms
        const termStmt = db.prepare(`
          INSERT INTO resource_terms (resource_id, term_id, taxonomy)
          VALUES (?, ?, ?)
        `);
        for (const termId of termIds) {
          termStmt.run(id, termId, taxonomy);
        }

        if (termIds.length > 0) {
          console.log(`[queries] Saved ${taxonomy} = [${termIds.join(', ')}] for resource ${id}`);
        }
      }
    }

    db.prepare('UPDATE resources SET is_dirty = 1 WHERE id = ?').run(id);
  }

  // Log changes
  const changeStmt = db.prepare(`
    INSERT INTO change_log (resource_id, field, old_value, new_value)
    VALUES (?, ?, ?, ?)
  `);
  
  if (updates.title !== undefined && updates.title !== resource.title) {
    changeStmt.run(id, 'title', resource.title, updates.title);
  }
  if (updates.status !== undefined && updates.status !== resource.status) {
    changeStmt.run(id, 'status', resource.status, updates.status);
  }
}

export function getDirtyResources(): LocalResource[] {
  return getResources({ isDirty: true });
}

export function markResourceClean(id: number) {
  const db = getDb();
  db.prepare('UPDATE resources SET is_dirty = 0 WHERE id = ?').run(id);
}

export function getSyncStats(): {
  totalResources: number;
  dirtyResources: number;
  lastSync: string | null;
  totalTerms: number;
} {
  const db = getDb();
  
  const resourceCount = db.prepare('SELECT COUNT(*) as count FROM resources').get() as { count: number };
  const dirtyCount = db.prepare('SELECT COUNT(*) as count FROM resources WHERE is_dirty = 1').get() as { count: number };
  const termCount = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
  const lastSync = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'").get() as { value: string } | undefined;

  return {
    totalResources: resourceCount.count,
    dirtyResources: dirtyCount.count,
    lastSync: lastSync?.value || null,
    totalTerms: termCount.count,
  };
}
