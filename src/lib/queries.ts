import { getDb, getPrimaryPostType } from './db';
import { getTaxonomies } from './wp-client';

export interface SyncedSnapshot {
  title: string;
  slug: string;
  status: string;
  meta_box: Record<string, unknown>;
  taxonomies: Record<string, number[]>;
}

export interface LocalResource {
  id: number;
  post_type?: string;
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
  synced_snapshot?: SyncedSnapshot | null;
}

export interface LocalTerm {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

/**
 * Returns all taxonomy terms from the local database, ordered by taxonomy and name.
 * @returns Array of all LocalTerm objects
 */
export function getAllTerms(): LocalTerm[] {
  const db = getDb();
  return db.prepare('SELECT * FROM terms ORDER BY taxonomy, name').all() as LocalTerm[];
}

/**
 * Returns all terms for a specific taxonomy, ordered by name.
 * @param taxonomy - The taxonomy slug (e.g. 'category', 'post_tag')
 * @returns Array of LocalTerm objects for the given taxonomy
 */
export function getTermsByTaxonomy(taxonomy: string): LocalTerm[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM terms WHERE taxonomy = ? ORDER BY name')
    .all(taxonomy) as LocalTerm[];
}

/**
 * Returns all terms grouped by taxonomy slug. Keys are taxonomy slugs,
 * values are arrays of terms. Only includes taxonomies from the active profile.
 * @returns Record mapping taxonomy slugs to arrays of LocalTerm objects
 */
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

/**
 * Returns resources from the local database, with optional filtering by status,
 * search text, dirty state, and taxonomy assignments.
 * @param filters - Optional filters (status, search, isDirty, taxonomies)
 * @param postType - Optional post type slug filter (defaults to primary post type)
 * @returns Array of LocalResource objects with hydrated meta_box and taxonomies
 */
export function getResources(filters: ResourceFilters = {}, postType?: string): LocalResource[] {
  const db = getDb();
  const type = postType || getPrimaryPostType();

  let query = 'SELECT * FROM posts WHERE post_type = ?';
  const params: unknown[] = [type];

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
    post_type: string;
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

  if (rows.length === 0) {
    return [];
  }

  const postIds = rows.map((r) => r.id);
  const placeholders = postIds.map(() => '?').join(',');

  // Fetch all meta
  const metaRows = db
    .prepare(`SELECT post_id, field_id, value FROM post_meta WHERE post_id IN (${placeholders})`)
    .all(...postIds) as Array<{ post_id: number; field_id: string; value: string }>;

  const metaByPost: Record<number, Record<string, unknown>> = {};
  for (const row of metaRows) {
    if (!metaByPost[row.post_id]) {
      metaByPost[row.post_id] = {};
    }
    try {
      metaByPost[row.post_id][row.field_id] = JSON.parse(row.value);
    } catch {
      metaByPost[row.post_id][row.field_id] = row.value;
    }
  }

  // Fetch all taxonomies
  const termRows = db
    .prepare(`SELECT post_id, term_id, taxonomy FROM post_terms WHERE post_id IN (${placeholders})`)
    .all(...postIds) as Array<{ post_id: number; term_id: number; taxonomy: string }>;

  const termsByPost: Record<number, Record<string, number[]>> = {};
  const profileTaxonomies = getTaxonomies();

  for (const row of termRows) {
    if (!termsByPost[row.post_id]) {
      termsByPost[row.post_id] = {};
      // Initialize with empty arrays for all profile taxonomies
      for (const tax of profileTaxonomies) {
        termsByPost[row.post_id][tax] = [];
      }
    }

    // Ensure this specific taxonomy array exists (in case it wasn't in profile)
    if (!termsByPost[row.post_id][row.taxonomy]) {
      termsByPost[row.post_id][row.taxonomy] = [];
    }

    termsByPost[row.post_id][row.taxonomy].push(row.term_id);
  }

  return rows.map((row) => {
    // Ensure we have empty objects if no meta/terms found for this post
    const meta = metaByPost[row.id] || {};

    // For taxonomies, we need to make sure we return the structure with all profile taxonomies
    // even if no terms were found
    let taxonomies = termsByPost[row.id];
    if (!taxonomies) {
      taxonomies = {};
      for (const tax of profileTaxonomies) {
        taxonomies[tax] = [];
      }
    }

    const resource: LocalResource = {
      ...row,
      is_dirty: row.is_dirty === 1,
      meta_box: meta,
      taxonomies: taxonomies,
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

/**
 * Returns a single resource by ID with hydrated meta_box fields and taxonomy assignments.
 * @param id - The resource/post ID
 * @returns LocalResource object or null if not found
 */
export function getResourceById(id: number): LocalResource | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as {
    id: number;
    post_type: string;
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
    synced_snapshot: string | null;
  } | undefined;

  if (!row) return null;

  let snapshot: SyncedSnapshot | null = null;
  if (row.synced_snapshot) {
    try { snapshot = JSON.parse(row.synced_snapshot); } catch { /* ignore */ }
  }

  return {
    ...row,
    is_dirty: row.is_dirty === 1,
    meta_box: getPostMeta(id),
    taxonomies: getPostTaxonomies(id),
    synced_snapshot: snapshot,
  };
}

function getPostMeta(postId: number): Record<string, unknown> {
  const db = getDb();
  const rows = db
    .prepare('SELECT field_id, value FROM post_meta WHERE post_id = ?')
    .all(postId) as Array<{ field_id: string; value: string }>;

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

function getPostTaxonomies(postId: number): Record<string, number[]> {
  const db = getDb();
  const rows = db
    .prepare('SELECT term_id, taxonomy FROM post_terms WHERE post_id = ?')
    .all(postId) as Array<{ term_id: number; taxonomy: string }>;

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

// Backward-compatible aliases
function getResourceMeta(resourceId: number): Record<string, unknown> {
  return getPostMeta(resourceId);
}

function getResourceTaxonomies(resourceId: number): Record<string, number[]> {
  return getPostTaxonomies(resourceId);
}

/**
 * Updates a local resource with new field values and sets `is_dirty = 1`.
 * Handles core fields (title, slug, status, etc.), meta_box fields, and taxonomy
 * assignments. Logs changes to the change_log table for audit trail.
 * @param id - The resource/post ID to update
 * @param updates - Object containing fields to update (title, slug, status, content, excerpt, featured_media, meta_box, taxonomies)
 */
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
    db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  // Update meta_box fields
  if (updates.meta_box) {
    const metaStmt = db.prepare(`
      INSERT OR REPLACE INTO post_meta (post_id, field_id, value)
      VALUES (?, ?, ?)
    `);

    for (const [fieldId, value] of Object.entries(updates.meta_box)) {
      metaStmt.run(id, fieldId, JSON.stringify(value));
    }

    db.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(id);
  }

  // Update taxonomy terms and track which ones were edited
  if (updates.taxonomies) {
    // Get current dirty_taxonomies set from meta
    const existingDirtyMeta = db.prepare(
      "SELECT value FROM post_meta WHERE post_id = ? AND field_id = '_dirty_taxonomies'"
    ).get(id) as { value: string } | undefined;
    const dirtyTaxonomies: Set<string> = new Set(
      existingDirtyMeta ? JSON.parse(existingDirtyMeta.value) : []
    );

    for (const [taxonomy, termIds] of Object.entries(updates.taxonomies)) {
      if (termIds !== undefined) {
        // Compare against current values to detect actual changes
        const currentTerms = (resource.taxonomies[taxonomy] || []).slice().sort();
        const newTerms = termIds.slice().sort();
        const changed = currentTerms.length !== newTerms.length ||
          currentTerms.some((v, i) => v !== newTerms[i]);

        if (changed) {
          dirtyTaxonomies.add(taxonomy);
        }

        // Delete existing terms for this taxonomy
        db.prepare(
          'DELETE FROM post_terms WHERE post_id = ? AND taxonomy = ?'
        ).run(id, taxonomy);

        // Insert new terms
        const termStmt = db.prepare(`
          INSERT INTO post_terms (post_id, term_id, taxonomy)
          VALUES (?, ?, ?)
        `);
        for (const termId of termIds) {
          termStmt.run(id, termId, taxonomy);
        }

        if (changed) {
          console.log(`[queries] Saved ${taxonomy} = [${termIds.join(', ')}] for post ${id} (changed)`);
        }
      }
    }

    // Persist dirty taxonomy set
    db.prepare(
      "INSERT OR REPLACE INTO post_meta (post_id, field_id, value) VALUES (?, '_dirty_taxonomies', ?)"
    ).run(id, JSON.stringify(Array.from(dirtyTaxonomies)));

    db.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(id);
  }

  // Log changes
  const changeStmt = db.prepare(`
    INSERT INTO change_log (post_id, field, old_value, new_value)
    VALUES (?, ?, ?, ?)
  `);

  if (updates.title !== undefined && updates.title !== resource.title) {
    changeStmt.run(id, 'title', resource.title, updates.title);
  }
  if (updates.status !== undefined && updates.status !== resource.status) {
    changeStmt.run(id, 'status', resource.status, updates.status);
  }
}

/**
 * Returns all resources with `is_dirty = 1` (locally modified, not yet pushed).
 * @param postType - Optional post type filter
 * @returns Array of dirty LocalResource objects
 */
export function getDirtyResources(postType?: string): LocalResource[] {
  return getResources({ isDirty: true }, postType);
}

/**
 * Clears the dirty flag on a resource after a successful push.
 * @param id - The resource/post ID to mark as clean
 */
export function markResourceClean(id: number): void {
  const db = getDb();
  db.prepare('UPDATE posts SET is_dirty = 0 WHERE id = ?').run(id);
}

/**
 * Returns the parsed synced snapshot for a resource, or null if none exists.
 * @param id - The resource/post ID
 */
export function getSyncedSnapshot(id: number): SyncedSnapshot | null {
  const db = getDb();
  const row = db.prepare('SELECT synced_snapshot FROM posts WHERE id = ?').get(id) as { synced_snapshot: string | null } | undefined;
  if (!row?.synced_snapshot) return null;
  try {
    return JSON.parse(row.synced_snapshot);
  } catch {
    return null;
  }
}

/**
 * Restores all fields from the synced snapshot, clears `is_dirty`, and removes `_dirty_taxonomies`.
 * @param id - The resource/post ID to reset
 */
export function discardAllChanges(id: number): void {
  const db = getDb();
  const snapshot = getSyncedSnapshot(id);
  if (!snapshot) throw new Error(`No synced snapshot for post ${id}`);

  // Restore core fields
  db.prepare(`
    UPDATE posts SET title = ?, slug = ?, status = ?, is_dirty = 0 WHERE id = ?
  `).run(snapshot.title, snapshot.slug, snapshot.status, id);

  // Restore meta fields
  db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(id);
  const metaStmt = db.prepare('INSERT INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)');
  for (const [fieldId, value] of Object.entries(snapshot.meta_box)) {
    metaStmt.run(id, fieldId, JSON.stringify(value));
  }

  // Restore taxonomy terms
  db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(id);
  const termStmt = db.prepare('INSERT INTO post_terms (post_id, term_id, taxonomy) VALUES (?, ?, ?)');
  for (const [taxonomy, termIds] of Object.entries(snapshot.taxonomies)) {
    for (const termId of termIds) {
      termStmt.run(id, termId, taxonomy);
    }
  }
}

/**
 * Returns summary statistics for the dashboard: total resources, dirty count,
 * and last sync timestamp.
 * @param postType - Optional post type filter
 * @returns Object with totalResources, dirtyResources, and lastSync
 */
export function getSyncStats(postType?: string): {
  totalResources: number;
  dirtyResources: number;
  lastSync: string | null;
  totalTerms: number;
} {
  const db = getDb();
  const type = postType || getPrimaryPostType();

  const resourceCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE post_type = ?').get(type) as { count: number };
  const dirtyCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE post_type = ? AND is_dirty = 1').get(type) as { count: number };
  const termCount = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
  const lastSync = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'").get() as { value: string } | undefined;

  return {
    totalResources: resourceCount.count,
    dirtyResources: dirtyCount.count,
    lastSync: lastSync?.value || null,
    totalTerms: termCount.count,
  };
}

// ─── SEO Data ─────────────────────────────────────────────────────────────────

export interface LocalSeoData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: {
    title: string;
    description: string;
    image: string;
  };
  twitter: {
    title: string;
    description: string;
    image: string;
  };
  robots: {
    noindex: boolean;
    nofollow: boolean;
    nosnippet: boolean;
    noimageindex: boolean;
  };
}

const DEFAULT_SEO: LocalSeoData = {
  title: '',
  description: '',
  canonical: '',
  targetKeywords: '',
  og: { title: '', description: '', image: '' },
  twitter: { title: '', description: '', image: '' },
  robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
};

/**
 * Returns SEO data for a resource. Reads from the plugin_data table (seopress plugin).
 * Falls back to the legacy resource_seo table if plugin_data is empty.
 * @param resourceId - The resource/post ID
 * @returns LocalSeoData object (defaults to empty strings/false if no data)
 */
export function getResourceSeo(resourceId: number): LocalSeoData {
  const db = getDb();

  // Try new plugin_data table first
  const pluginRow = db.prepare(
    "SELECT data_value FROM plugin_data WHERE post_id = ? AND plugin_id = 'seopress' AND data_key = 'seo'"
  ).get(resourceId) as { data_value: string } | undefined;

  if (pluginRow?.data_value) {
    try {
      const seo = JSON.parse(pluginRow.data_value) as LocalSeoData;
      return {
        ...DEFAULT_SEO,
        ...seo,
        og: { ...DEFAULT_SEO.og, ...seo.og },
        twitter: { ...DEFAULT_SEO.twitter, ...seo.twitter },
        robots: { ...DEFAULT_SEO.robots, ...seo.robots },
      };
    } catch {
      // Fall through to legacy table
    }
  }

  // Fall back to legacy resource_seo table
  const row = db.prepare('SELECT * FROM resource_seo WHERE resource_id = ?').get(resourceId) as {
    seo_title: string;
    seo_description: string;
    seo_canonical: string;
    seo_target_keywords: string;
    og_title: string;
    og_description: string;
    og_image: string;
    twitter_title: string;
    twitter_description: string;
    twitter_image: string;
    robots_noindex: number;
    robots_nofollow: number;
    robots_nosnippet: number;
    robots_noimageindex: number;
  } | undefined;

  if (!row) return { ...DEFAULT_SEO };

  return {
    title: row.seo_title || '',
    description: row.seo_description || '',
    canonical: row.seo_canonical || '',
    targetKeywords: row.seo_target_keywords || '',
    og: {
      title: row.og_title || '',
      description: row.og_description || '',
      image: row.og_image || '',
    },
    twitter: {
      title: row.twitter_title || '',
      description: row.twitter_description || '',
      image: row.twitter_image || '',
    },
    robots: {
      noindex: row.robots_noindex === 1,
      nofollow: row.robots_nofollow === 1,
      nosnippet: row.robots_nosnippet === 1,
      noimageindex: row.robots_noimageindex === 1,
    },
  };
}

/**
 * Saves SEO data for a resource to the plugin_data table and optionally marks
 * the resource as dirty.
 * @param resourceId - The resource/post ID
 * @param seo - The SEO data to save
 * @param markDirty - Whether to set is_dirty = 1 on the resource (default: true)
 */
export function saveResourceSeo(resourceId: number, seo: LocalSeoData, markDirty = true): void {
  const db = getDb();

  // Save to new plugin_data table
  db.prepare(`
    INSERT OR REPLACE INTO plugin_data (post_id, plugin_id, data_key, data_value)
    VALUES (?, 'seopress', 'seo', ?)
  `).run(resourceId, JSON.stringify(seo));

  if (markDirty) {
    db.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(resourceId);
  }
}

// ─── Generic Plugin Data ──────────────────────────────────────────────────────

/**
 * Get plugin data for a post
 */
export function getPluginData<T = unknown>(
  postId: number,
  pluginId: string,
  dataKey: string
): T | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT data_value FROM plugin_data WHERE post_id = ? AND plugin_id = ? AND data_key = ?'
  ).get(postId, pluginId, dataKey) as { data_value: string } | undefined;

  if (!row?.data_value) return null;

  try {
    return JSON.parse(row.data_value) as T;
  } catch {
    return row.data_value as unknown as T;
  }
}

/**
 * Save plugin data for a post
 */
export function savePluginData(
  postId: number,
  pluginId: string,
  dataKey: string,
  value: unknown,
  markDirty = true
): void {
  const db = getDb();

  db.prepare(`
    INSERT OR REPLACE INTO plugin_data (post_id, plugin_id, data_key, data_value)
    VALUES (?, ?, ?, ?)
  `).run(postId, pluginId, dataKey, JSON.stringify(value));

  if (markDirty) {
    db.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(postId);
  }
}

/**
 * Delete plugin data for a post
 */
export function deletePluginData(
  postId: number,
  pluginId: string,
  dataKey?: string
): void {
  const db = getDb();

  if (dataKey) {
    db.prepare(
      'DELETE FROM plugin_data WHERE post_id = ? AND plugin_id = ? AND data_key = ?'
    ).run(postId, pluginId, dataKey);
  } else {
    // Delete all data for this plugin
    db.prepare(
      'DELETE FROM plugin_data WHERE post_id = ? AND plugin_id = ?'
    ).run(postId, pluginId);
  }
}

/**
 * Get all plugin data for a post
 */
export function getAllPluginData(postId: number): Record<string, Record<string, unknown>> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT plugin_id, data_key, data_value FROM plugin_data WHERE post_id = ?'
  ).all(postId) as Array<{ plugin_id: string; data_key: string; data_value: string }>;

  const result: Record<string, Record<string, unknown>> = {};

  for (const row of rows) {
    if (!result[row.plugin_id]) {
      result[row.plugin_id] = {};
    }
    try {
      result[row.plugin_id][row.data_key] = JSON.parse(row.data_value);
    } catch {
      result[row.plugin_id][row.data_key] = row.data_value;
    }
  }

  return result;
}
