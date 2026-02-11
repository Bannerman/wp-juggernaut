import { getDb } from './db';
import type { WPResource } from './wp-client';
import { getTaxonomyMetaFieldMappingFromProfile } from './plugins/bundled/metabox';

export interface AuditEntry {
  field_name: string;
  source: 'local_only' | 'wordpress_only' | 'both';
  category: 'taxonomy_meta' | 'content_meta' | 'unknown';
  status: 'ok' | 'missing_in_wp' | 'unmapped_local';
  detail: string | null;
  affected_resources: number[];
}

export interface AuditResult {
  audit_run_at: string;
  entries: AuditEntry[];
  summary: {
    ok: number;
    missing_in_wp: number;
    unmapped_local: number;
    total: number;
  };
}

/** Known content meta fields that we actively use/reference */
const KNOWN_CONTENT_FIELDS: string[] = [
  'intro_text',
  'text_content',
  'text_',
  'group_features',
  'group_changelog',
  'download_sections',
  'timer_enable',
  'timer_title',
  'timer_single_datetime',
];

const KNOWN_CONTENT_FIELDS_SET = new Set(KNOWN_CONTENT_FIELDS);

/** Collect every unique meta_box key across all resources, with resource IDs */
export function collectMetaBoxKeys(
  resources: WPResource[]
): Map<string, number[]> {
  const fieldMap = new Map<string, number[]>();

  for (const resource of resources) {
    if (!resource.meta_box) continue;
    for (const key of Object.keys(resource.meta_box)) {
      if (key.startsWith('_')) continue; // skip internal fields
      const ids = fieldMap.get(key) || [];
      ids.push(resource.id);
      fieldMap.set(key, ids);
    }
  }

  return fieldMap;
}

/** Compare WP meta_box keys against our local field mappings */
export function runFieldAudit(
  wpFieldMap: Map<string, number[]>
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const processedFields = new Set<string>();

  // Build reverse lookup: meta field value -> taxonomy slug
  const taxonomyMapping = getTaxonomyMetaFieldMappingFromProfile();
  const taxonomyMetaValues = new Set(Object.values(taxonomyMapping));

  // Check each taxonomy meta field mapping
  for (const [taxonomy, metaField] of Object.entries(taxonomyMapping)) {
    processedFields.add(metaField);
    const wpResources = wpFieldMap.get(metaField);

    if (wpResources && wpResources.length > 0) {
      entries.push({
        field_name: metaField,
        source: 'both',
        category: 'taxonomy_meta',
        status: 'ok',
        detail: `Mapped to taxonomy "${taxonomy}", found in ${wpResources.length} resources`,
        affected_resources: wpResources,
      });
    } else {
      entries.push({
        field_name: metaField,
        source: 'local_only',
        category: 'taxonomy_meta',
        status: 'missing_in_wp',
        detail: `Mapped to taxonomy "${taxonomy}" but not found in any WP resource meta_box`,
        affected_resources: [],
      });
    }
  }

  // Check known content fields
  for (const field of KNOWN_CONTENT_FIELDS) {
    processedFields.add(field);
    const wpResources = wpFieldMap.get(field);

    if (wpResources && wpResources.length > 0) {
      entries.push({
        field_name: field,
        source: 'both',
        category: 'content_meta',
        status: 'ok',
        detail: `Content field found in ${wpResources.length} resources`,
        affected_resources: wpResources,
      });
    } else {
      entries.push({
        field_name: field,
        source: 'local_only',
        category: 'content_meta',
        status: 'missing_in_wp',
        detail: `Content field referenced locally but not found in any WP resource meta_box`,
        affected_resources: [],
      });
    }
  }

  // Check WP fields that we don't reference
  wpFieldMap.forEach((resourceIds, field) => {
    if (processedFields.has(field)) return;

    const isTaxField = taxonomyMetaValues.has(field);
    const isContentField = KNOWN_CONTENT_FIELDS_SET.has(field);

    entries.push({
      field_name: field,
      source: 'wordpress_only',
      category: isTaxField ? 'taxonomy_meta' : isContentField ? 'content_meta' : 'unknown',
      status: 'unmapped_local',
      detail: `Found in ${resourceIds.length} WP resources but not referenced in local mappings`,
      affected_resources: resourceIds,
    });
  });

  // Sort: missing_in_wp first, then unmapped_local, then ok
  const statusOrder = { missing_in_wp: 0, unmapped_local: 1, ok: 2 };
  entries.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return entries;
}

/** Store audit results in the database, pruning to last 5 runs */
export function saveAuditResults(entries: AuditEntry[]): string {
  const db = getDb();
  const auditRunAt = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO field_audit (audit_run_at, field_name, source, category, status, detail, affected_resources)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const entry of entries) {
      insertStmt.run(
        auditRunAt,
        entry.field_name,
        entry.source,
        entry.category,
        entry.status,
        entry.detail,
        JSON.stringify(entry.affected_resources)
      );
    }
  });

  insertAll();

  // Prune old runs, keeping only the last 5
  const runs = db.prepare(
    'SELECT DISTINCT audit_run_at FROM field_audit ORDER BY audit_run_at DESC'
  ).all() as { audit_run_at: string }[];

  if (runs.length > 5) {
    const cutoff = runs[4].audit_run_at;
    db.prepare('DELETE FROM field_audit WHERE audit_run_at < ?').run(cutoff);
  }

  return auditRunAt;
}

/** Retrieve the most recent audit run with entries and summary */
export function getLatestAudit(): AuditResult | null {
  const db = getDb();

  const latestRun = db.prepare(
    'SELECT DISTINCT audit_run_at FROM field_audit ORDER BY audit_run_at DESC LIMIT 1'
  ).get() as { audit_run_at: string } | undefined;

  if (!latestRun) return null;

  const rows = db.prepare(
    'SELECT field_name, source, category, status, detail, affected_resources FROM field_audit WHERE audit_run_at = ? ORDER BY id'
  ).all(latestRun.audit_run_at) as Array<{
    field_name: string;
    source: string;
    category: string;
    status: string;
    detail: string | null;
    affected_resources: string;
  }>;

  const entries: AuditEntry[] = rows.map((row) => ({
    field_name: row.field_name,
    source: row.source as AuditEntry['source'],
    category: row.category as AuditEntry['category'],
    status: row.status as AuditEntry['status'],
    detail: row.detail,
    affected_resources: JSON.parse(row.affected_resources || '[]'),
  }));

  const summary = {
    ok: entries.filter((e) => e.status === 'ok').length,
    missing_in_wp: entries.filter((e) => e.status === 'missing_in_wp').length,
    unmapped_local: entries.filter((e) => e.status === 'unmapped_local').length,
    total: entries.length,
  };

  return {
    audit_run_at: latestRun.audit_run_at,
    entries,
    summary,
  };
}
