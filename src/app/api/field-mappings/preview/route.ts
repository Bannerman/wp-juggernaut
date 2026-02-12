/**
 * GET /api/field-mappings/preview?postType=resource
 *   Returns minimal post list for dropdown selection
 *
 * GET /api/field-mappings/preview?postId=123
 *   Returns field values for a specific post (core, meta, taxonomy)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPluginRegistry } from '@/lib/plugins/registry';
import { getDb } from '@/lib/db';

/** Truncate a string to maxLen characters */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/** Convert an arbitrary value to a short display string */
function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return truncate(value, 300);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (typeof value[0] === 'object' && value[0] !== null) return `${value.length} items`;
    return truncate(value.join(', '), 300);
  }
  if (typeof value === 'object') return '[object]';
  return String(value);
}

/** Convert an arbitrary value to a full string for tooltip display */
function toFullString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!getPluginRegistry().isPluginEnabled('convert-post-type')) {
    return NextResponse.json(
      { error: 'Convert Post Type plugin is not enabled' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const postType = searchParams.get('postType');
    const postId = searchParams.get('postId');

    const db = getDb();

    // Return post list for a post type
    if (postType) {
      const rows = db
        .prepare('SELECT id, title FROM posts WHERE post_type = ? ORDER BY modified_gmt DESC LIMIT 50')
        .all(postType) as Array<{ id: number; title: string }>;

      return NextResponse.json({
        posts: rows.map((r) => ({ id: r.id, title: r.title || `(no title #${r.id})` })),
      });
    }

    // Return field values for a specific post
    if (postId) {
      const id = parseInt(postId, 10);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid postId' }, { status: 400 });
      }

      const post = db.prepare('SELECT title, slug, status, content, excerpt, featured_media FROM posts WHERE id = ?')
        .get(id) as { title: string; slug: string; status: string; content: string; excerpt: string; featured_media: number } | undefined;

      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      const values: Record<string, string> = {};
      const fullValues: Record<string, string> = {};

      // Core fields
      values['title'] = truncate(post.title || '', 300);
      values['slug'] = truncate(post.slug || '', 300);
      values['status'] = post.status || '';
      values['content'] = truncate(post.content || '', 300);
      values['excerpt'] = truncate(post.excerpt || '', 300);
      values['featured_media'] = post.featured_media ? String(post.featured_media) : '';

      // Full values for core fields (only when different from display)
      if (post.content && post.content.length > 300) fullValues['content'] = post.content;
      if (post.excerpt && post.excerpt.length > 300) fullValues['excerpt'] = post.excerpt;

      // Meta fields
      const metaRows = db
        .prepare('SELECT field_id, value FROM post_meta WHERE post_id = ?')
        .all(id) as Array<{ field_id: string; value: string }>;

      for (const row of metaRows) {
        let parsed: unknown = row.value;
        try {
          parsed = JSON.parse(row.value);
        } catch {
          // keep as string
        }
        const display = toDisplayString(parsed);
        if (display) {
          values[row.field_id] = display;
          const full = toFullString(parsed);
          if (full !== display) fullValues[row.field_id] = full;
        }
      }

      // Taxonomy fields — resolve term IDs to names
      const termRows = db
        .prepare('SELECT term_id, taxonomy FROM post_terms WHERE post_id = ?')
        .all(id) as Array<{ term_id: number; taxonomy: string }>;

      const taxTerms: Record<string, number[]> = {};
      for (const row of termRows) {
        if (!taxTerms[row.taxonomy]) taxTerms[row.taxonomy] = [];
        taxTerms[row.taxonomy].push(row.term_id);
      }

      for (const [taxonomy, termIds] of Object.entries(taxTerms)) {
        if (termIds.length === 0) continue;
        const placeholders = termIds.map(() => '?').join(',');
        const names = db
          .prepare(`SELECT name FROM terms WHERE id IN (${placeholders})`)
          .all(...termIds) as Array<{ name: string }>;
        values[taxonomy] = truncate(names.map((n) => n.name).join(', '), 300);
      }

      return NextResponse.json({ values, fullValues });
    }

    return NextResponse.json({ error: 'Provide postType or postId parameter' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch preview: ${error}` },
      { status: 500 }
    );
  }
}
