/**
 * Content Planner queries — CRUD over `planner_ideas` and `planner_keywords`.
 *
 * Both tables are plugin-global (not keyed on post_id), unlike the shared
 * `plugin_data` table. Schema lives in src/lib/db.ts migrateV3toV4().
 */

import { getDb } from '../../../db';

export type IdeaStatus = 'idea' | 'researching' | 'drafting' | 'ready' | 'published';

export interface PlannerIdea {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: number[];
  promoted_post_id: number | null;
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

interface IdeaRow {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: string | null;
  promoted_post_id: number | null;
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
  return { ...row, linked_keyword_ids: linked };
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

export function listIdeas(): PlannerIdea[] {
  const rows = getDb()
    .prepare('SELECT * FROM planner_ideas ORDER BY updated_at DESC')
    .all() as IdeaRow[];
  return rows.map(rowToIdea);
}

export function createIdea(input: {
  title: string;
  status?: IdeaStatus;
  description?: string;
  notes?: string;
  linked_keyword_ids?: number[];
}): PlannerIdea {
  const result = getDb()
    .prepare(
      `INSERT INTO planner_ideas (title, status, description, notes, linked_keyword_ids)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.status ?? 'idea',
      input.description ?? null,
      input.notes ?? null,
      input.linked_keyword_ids ? JSON.stringify(input.linked_keyword_ids) : null,
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

export function updateIdea(
  id: number,
  patch: Partial<Pick<PlannerIdea, 'title' | 'status' | 'description' | 'notes' | 'linked_keyword_ids' | 'promoted_post_id'>>,
): PlannerIdea | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    fields.push('title = ?');
    values.push(patch.title);
  }
  if (patch.status !== undefined) {
    fields.push('status = ?');
    values.push(patch.status);
  }
  if (patch.description !== undefined) {
    fields.push('description = ?');
    values.push(patch.description);
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?');
    values.push(patch.notes);
  }
  if (patch.linked_keyword_ids !== undefined) {
    fields.push('linked_keyword_ids = ?');
    values.push(JSON.stringify(patch.linked_keyword_ids));
  }
  if (patch.promoted_post_id !== undefined) {
    fields.push('promoted_post_id = ?');
    values.push(patch.promoted_post_id);
  }
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
