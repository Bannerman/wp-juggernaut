/**
 * Content Planner queries — CRUD over `planner_ideas`, `planner_keywords`,
 * and `planner_research_entries`.
 *
 * All three tables are plugin-global (not keyed on post_id), unlike the shared
 * `plugin_data` table. Schema lives in src/lib/db.ts (migrateV3toV4 +
 * migrateV4toV5 + migrateV5toV6).
 */

import { getDb } from '../../../db';

export type IdeaStatus = 'idea' | 'researching' | 'drafting' | 'ready' | 'published';

export type ResearchType =
  | 'seo'
  | 'structure'
  | 'audience'
  | 'competitor'
  | 'internal_linking'
  | 'monetization'
  | 'schema_markup'
  | 'serp_features'
  | 'publishing'
  | 'templates'
  | 'legal_compliance'
  | 'tech_notes';

export const RESEARCH_TYPES: ResearchType[] = [
  'seo',
  'structure',
  'audience',
  'competitor',
  'internal_linking',
  'monetization',
  'schema_markup',
  'serp_features',
  'publishing',
  'templates',
  'legal_compliance',
  'tech_notes',
];

export type Frequency = 'annual' | 'seasonal' | 'quarterly' | 'once' | null;

/**
 * @deprecated Use {@link Frequency}. Kept for callers that haven't migrated
 * past the rc.20 naming.
 */
export type RefreshCadence = Frequency;

export interface PlannerIdea {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: number[];
  promoted_post_id: number | null;
  deadline: string | null;
  frequency: Frequency;
  refresh_next_due: string | null;
  cluster: string | null;
  priority: number | null;
  estimated_effort_hours: number | null;
  schema_types: string[];
  monetization_angles: string[];
  serp_targets: string[];
  /** @deprecated Replaced by audience_term_ids (audience taxonomy). */
  audience_personas: string[];
  resource_type_term_id: number | null;
  topic_term_ids: number[];
  audience_term_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface PlannerKeyword {
  id: number;
  term: string;
  volume: number | null;
  target_post_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannerResearchEntry {
  id: number;
  idea_id: number;
  type: ResearchType;
  content: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

interface IdeaRow {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: string | null;
  promoted_post_id: number | null;
  deadline: string | null;
  frequency: Frequency;
  refresh_next_due: string | null;
  cluster: string | null;
  priority: number | null;
  estimated_effort_hours: number | null;
  schema_types: string | null;
  monetization_angles: string | null;
  serp_targets: string | null;
  audience_personas: string | null;
  resource_type_term_id: number | null;
  topic_term_ids: string | null;
  audience_term_ids: string | null;
  created_at: string;
  updated_at: string;
}

interface KeywordRow {
  id: number;
  term: string;
  volume: number | null;
  target_post_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    /* fall through */
  }
  return [];
}

function parseNumberArray(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n): n is number => typeof n === 'number');
  } catch {
    /* fall through */
  }
  return [];
}

function rowToIdea(row: IdeaRow): PlannerIdea {
  let linked: number[] = [];
  if (row.linked_keyword_ids) {
    try {
      const parsed = JSON.parse(row.linked_keyword_ids);
      if (Array.isArray(parsed)) linked = parsed.filter((n) => typeof n === 'number');
    } catch {
      linked = [];
    }
  }
  return {
    ...row,
    linked_keyword_ids: linked,
    schema_types: parseStringArray(row.schema_types),
    monetization_angles: parseStringArray(row.monetization_angles),
    serp_targets: parseStringArray(row.serp_targets),
    audience_personas: parseStringArray(row.audience_personas),
    topic_term_ids: parseNumberArray(row.topic_term_ids),
    audience_term_ids: parseNumberArray(row.audience_term_ids),
  };
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

export function listIdeas(): PlannerIdea[] {
  const rows = getDb()
    .prepare('SELECT * FROM planner_ideas ORDER BY updated_at DESC')
    .all() as IdeaRow[];
  return rows.map(rowToIdea);
}

export interface CreateIdeaInput {
  title: string;
  status?: IdeaStatus;
  description?: string;
  notes?: string;
  linked_keyword_ids?: number[];
  deadline?: string;
  frequency?: Frequency;
  refresh_next_due?: string;
  cluster?: string;
  priority?: number;
  estimated_effort_hours?: number;
  schema_types?: string[];
  monetization_angles?: string[];
  serp_targets?: string[];
  audience_personas?: string[];
  resource_type_term_id?: number | null;
  topic_term_ids?: number[];
  audience_term_ids?: number[];
}

export function createIdea(input: CreateIdeaInput): PlannerIdea {
  const result = getDb()
    .prepare(
      `INSERT INTO planner_ideas (
         title, status, description, notes, linked_keyword_ids,
         deadline, frequency, refresh_next_due, cluster, priority,
         estimated_effort_hours, schema_types, monetization_angles,
         serp_targets, audience_personas,
         resource_type_term_id, topic_term_ids, audience_term_ids
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.status ?? 'idea',
      input.description ?? null,
      input.notes ?? null,
      input.linked_keyword_ids ? JSON.stringify(input.linked_keyword_ids) : null,
      input.deadline ?? null,
      input.frequency ?? null,
      input.refresh_next_due ?? null,
      input.cluster ?? null,
      input.priority ?? null,
      input.estimated_effort_hours ?? null,
      input.schema_types ? JSON.stringify(input.schema_types) : null,
      input.monetization_angles ? JSON.stringify(input.monetization_angles) : null,
      input.serp_targets ? JSON.stringify(input.serp_targets) : null,
      input.audience_personas ? JSON.stringify(input.audience_personas) : null,
      input.resource_type_term_id ?? null,
      input.topic_term_ids ? JSON.stringify(input.topic_term_ids) : null,
      input.audience_term_ids ? JSON.stringify(input.audience_term_ids) : null,
    );
  const id = Number(result.lastInsertRowid);
  return getIdea(id)!;
}

export function getIdea(id: number): PlannerIdea | null {
  const row = getDb()
    .prepare('SELECT * FROM planner_ideas WHERE id = ?')
    .get(id) as IdeaRow | undefined;
  return row ? rowToIdea(row) : null;
}

export type IdeaPatch = Partial<Pick<
  PlannerIdea,
  | 'title'
  | 'status'
  | 'description'
  | 'notes'
  | 'linked_keyword_ids'
  | 'promoted_post_id'
  | 'deadline'
  | 'frequency'
  | 'refresh_next_due'
  | 'cluster'
  | 'priority'
  | 'estimated_effort_hours'
  | 'schema_types'
  | 'monetization_angles'
  | 'serp_targets'
  | 'audience_personas'
  | 'resource_type_term_id'
  | 'topic_term_ids'
  | 'audience_term_ids'
>>;

export function updateIdea(id: number, patch: IdeaPatch): PlannerIdea | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };

  if (patch.title !== undefined) push('title', patch.title);
  if (patch.status !== undefined) push('status', patch.status);
  if (patch.description !== undefined) push('description', patch.description);
  if (patch.notes !== undefined) push('notes', patch.notes);
  if (patch.linked_keyword_ids !== undefined) push('linked_keyword_ids', JSON.stringify(patch.linked_keyword_ids));
  if (patch.promoted_post_id !== undefined) push('promoted_post_id', patch.promoted_post_id);
  if (patch.deadline !== undefined) push('deadline', patch.deadline);
  if (patch.frequency !== undefined) push('frequency', patch.frequency);
  if (patch.refresh_next_due !== undefined) push('refresh_next_due', patch.refresh_next_due);
  if (patch.cluster !== undefined) push('cluster', patch.cluster);
  if (patch.priority !== undefined) push('priority', patch.priority);
  if (patch.estimated_effort_hours !== undefined) push('estimated_effort_hours', patch.estimated_effort_hours);
  if (patch.schema_types !== undefined) push('schema_types', JSON.stringify(patch.schema_types));
  if (patch.monetization_angles !== undefined) push('monetization_angles', JSON.stringify(patch.monetization_angles));
  if (patch.serp_targets !== undefined) push('serp_targets', JSON.stringify(patch.serp_targets));
  if (patch.audience_personas !== undefined) push('audience_personas', JSON.stringify(patch.audience_personas));
  if (patch.resource_type_term_id !== undefined) push('resource_type_term_id', patch.resource_type_term_id);
  if (patch.topic_term_ids !== undefined) push('topic_term_ids', JSON.stringify(patch.topic_term_ids));
  if (patch.audience_term_ids !== undefined) push('audience_term_ids', JSON.stringify(patch.audience_term_ids));

  if (fields.length === 0) return getIdea(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb()
    .prepare(`UPDATE planner_ideas SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
  return getIdea(id);
}

export function deleteIdea(id: number): boolean {
  const result = getDb().prepare('DELETE FROM planner_ideas WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Research entries ────────────────────────────────────────────────────────

export function listResearchEntries(ideaId: number): PlannerResearchEntry[] {
  return getDb()
    .prepare('SELECT * FROM planner_research_entries WHERE idea_id = ? ORDER BY created_at ASC')
    .all(ideaId) as PlannerResearchEntry[];
}

export function createResearchEntry(input: {
  idea_id: number;
  type: ResearchType;
  content: string;
  source_url?: string;
}): PlannerResearchEntry {
  if (!RESEARCH_TYPES.includes(input.type)) {
    throw new Error(`invalid research type: ${input.type}`);
  }
  const result = getDb()
    .prepare(
      `INSERT INTO planner_research_entries (idea_id, type, content, source_url)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.idea_id, input.type, input.content, input.source_url ?? null);
  const id = Number(result.lastInsertRowid);
  return getResearchEntry(id)!;
}

export function getResearchEntry(id: number): PlannerResearchEntry | null {
  const row = getDb()
    .prepare('SELECT * FROM planner_research_entries WHERE id = ?')
    .get(id) as PlannerResearchEntry | undefined;
  return row ?? null;
}

export function updateResearchEntry(
  id: number,
  patch: Partial<Pick<PlannerResearchEntry, 'type' | 'content' | 'source_url'>>,
): PlannerResearchEntry | null {
  if (patch.type !== undefined && !RESEARCH_TYPES.includes(patch.type)) {
    throw new Error(`invalid research type: ${patch.type}`);
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.type !== undefined) { fields.push('type = ?'); values.push(patch.type); }
  if (patch.content !== undefined) { fields.push('content = ?'); values.push(patch.content); }
  if (patch.source_url !== undefined) { fields.push('source_url = ?'); values.push(patch.source_url); }
  if (fields.length === 0) return getResearchEntry(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb()
    .prepare(`UPDATE planner_research_entries SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
  return getResearchEntry(id);
}

export function deleteResearchEntry(id: number): boolean {
  const result = getDb().prepare('DELETE FROM planner_research_entries WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Keywords ────────────────────────────────────────────────────────────────

export function listKeywords(): PlannerKeyword[] {
  return getDb()
    .prepare('SELECT * FROM planner_keywords ORDER BY (volume IS NULL), volume DESC, term ASC')
    .all() as KeywordRow[];
}

export function createKeyword(input: {
  term: string;
  volume?: number;
  target_post_id?: number;
  notes?: string;
}): PlannerKeyword {
  const result = getDb()
    .prepare(
      `INSERT INTO planner_keywords (term, volume, target_post_id, notes)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.term, input.volume ?? null, input.target_post_id ?? null, input.notes ?? null);
  const id = Number(result.lastInsertRowid);
  return getKeyword(id)!;
}

export function getKeyword(id: number): PlannerKeyword | null {
  const row = getDb()
    .prepare('SELECT * FROM planner_keywords WHERE id = ?')
    .get(id) as KeywordRow | undefined;
  return row ?? null;
}

export function getKeywordByTerm(term: string): PlannerKeyword | null {
  const row = getDb()
    .prepare('SELECT * FROM planner_keywords WHERE term = ?')
    .get(term) as KeywordRow | undefined;
  return row ?? null;
}

export function updateKeyword(
  id: number,
  patch: Partial<Pick<PlannerKeyword, 'term' | 'volume' | 'target_post_id' | 'notes'>>,
): PlannerKeyword | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.term !== undefined) {
    fields.push('term = ?');
    values.push(patch.term);
  }
  if (patch.volume !== undefined) {
    fields.push('volume = ?');
    values.push(patch.volume);
  }
  if (patch.target_post_id !== undefined) {
    fields.push('target_post_id = ?');
    values.push(patch.target_post_id);
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?');
    values.push(patch.notes);
  }
  if (fields.length === 0) return getKeyword(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb()
    .prepare(`UPDATE planner_keywords SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
  return getKeyword(id);
}

export function deleteKeyword(id: number): boolean {
  const result = getDb().prepare('DELETE FROM planner_keywords WHERE id = ?').run(id);
  return result.changes > 0;
}
