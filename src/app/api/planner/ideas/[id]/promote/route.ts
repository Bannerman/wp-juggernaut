import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  getIdea,
  listResearchEntries,
  type ResearchType,
} from '@/lib/plugins/bundled/content-planner/queries';

/**
 * Promote a planner idea to a local WordPress draft.
 *
 * Creates a row in `posts` with a synthetic negative ID (same pattern the MCP
 * `create_post` tool uses), maps the idea's title/description/notes plus a
 * research-brief HTML body to the post `content`, attaches any synced
 * (positive-ID) taxonomy terms via `post_terms`, marks the idea published
 * and stamps `promoted_post_id` so the modal can show the promoted state.
 *
 * Pending taxonomy terms (negative IDs from `planner_terms`) are skipped and
 * counted in the response — they need to be created on WP and re-synced
 * before they can be attached to the post.
 *
 * The created post is dirty / local-only. The user then clicks Push in the
 * main Juggernaut UI to send it to WordPress, where the resource gets its
 * real positive ID and the renumber pass updates the negative stub everywhere.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const idea = getIdea(id);
    if (!idea) {
      return NextResponse.json({ error: 'idea not found' }, { status: 404 });
    }
    if (idea.promoted_post_id !== null) {
      return NextResponse.json(
        { error: `Already promoted (post ${idea.promoted_post_id}). Edit the draft directly in the Posts view.` },
        { status: 409 },
      );
    }
    const entries = listResearchEntries(id);

    const db = getDb();
    const minRow = db.prepare('SELECT MIN(id) as m FROM posts').get() as { m: number | null };
    const localPostId = Math.min(minRow.m ?? 0, -1) - 1;
    const now = new Date().toISOString();
    const postType = 'resource';
    const title = idea.title;
    const slug = slugifyTitle(title);
    const content = buildContent(idea, entries);

    // Filter pending terms out — they have negative IDs and can't be pushed
    // until they're created on WP first.
    const syncedTopicIds = idea.topic_term_ids.filter((n) => n > 0);
    const syncedAudienceIds = idea.audience_term_ids.filter((n) => n > 0);
    const syncedResourceTypeId =
      idea.resource_type_term_id !== null && idea.resource_type_term_id > 0
        ? idea.resource_type_term_id
        : null;
    const pendingTermsCount =
      idea.topic_term_ids.filter((n) => n < 0).length +
      idea.audience_term_ids.filter((n) => n < 0).length +
      (idea.resource_type_term_id !== null && idea.resource_type_term_id < 0 ? 1 : 0);

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO posts (id, post_type, title, slug, status, content, excerpt, featured_media, date_gmt, modified_gmt, synced_at, is_dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`,
      ).run(localPostId, postType, title, slug, 'draft', content, '', now, now, now);

      const termStmt = db.prepare(
        'INSERT INTO post_terms (post_id, term_id, taxonomy) VALUES (?, ?, ?)',
      );
      const dirtyTaxonomies: string[] = [];
      if (syncedResourceTypeId !== null) {
        termStmt.run(localPostId, syncedResourceTypeId, 'resource-type');
        dirtyTaxonomies.push('resource-type');
      }
      if (syncedTopicIds.length > 0) {
        for (const tid of syncedTopicIds) termStmt.run(localPostId, tid, 'topic');
        dirtyTaxonomies.push('topic');
      }
      if (syncedAudienceIds.length > 0) {
        for (const aid of syncedAudienceIds) termStmt.run(localPostId, aid, 'audience');
        dirtyTaxonomies.push('audience');
      }
      if (dirtyTaxonomies.length > 0) {
        db.prepare(
          'INSERT INTO post_meta (post_id, field_id, value) VALUES (?, ?, ?)',
        ).run(localPostId, '_dirty_taxonomies', JSON.stringify(dirtyTaxonomies));
      }

      db.prepare(
        `UPDATE planner_ideas
         SET promoted_post_id = ?, status = 'published', updated_at = datetime('now')
         WHERE id = ?`,
      ).run(localPostId, id);

      db.prepare(
        'INSERT INTO change_log (post_id, field, old_value, new_value) VALUES (?, ?, ?, ?)',
      ).run(localPostId, '_created', '(none)', `promoted from planner idea ${id}`);
    });
    transaction();

    return NextResponse.json({
      local_post_id: localPostId,
      post_type: postType,
      title,
      slug,
      pending_terms_count: pendingTermsCount,
      synced_term_count:
        (syncedResourceTypeId !== null ? 1 : 0) + syncedTopicIds.length + syncedAudienceIds.length,
      note:
        'Local-only draft. Push from Juggernaut to publish on WordPress; the negative ID will be renumbered to the real WP post ID.',
    });
  } catch (error) {
    console.error('[planner] promote failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to promote idea' },
      { status: 500 },
    );
  }
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RESEARCH_TYPE_LABEL: Record<ResearchType, string> = {
  seo: 'SEO',
  structure: 'Structure',
  audience: 'Audience',
  competitor: 'Competitor',
  internal_linking: 'Internal Linking',
  monetization: 'Monetization',
  schema_markup: 'Schema Markup',
  serp_features: 'SERP Features',
  publishing: 'Publishing',
  templates: 'Templates',
  legal_compliance: 'Legal & Compliance',
  tech_notes: 'Tech Notes',
};

interface IdeaShape {
  description: string | null;
  notes: string | null;
}

interface ResearchEntryShape {
  id: number;
  type: ResearchType;
  content: string;
  source_url: string | null;
}

function buildContent(idea: IdeaShape, entries: ResearchEntryShape[]): string {
  const parts: string[] = [];
  parts.push('<!-- Promoted from the Content Planner. -->');
  if (idea.description) {
    parts.push(`<p>${escapeHtml(idea.description)}</p>`);
  }
  if (entries.length > 0) {
    parts.push('<h2>Research Brief</h2>');
    const grouped: Record<string, ResearchEntryShape[]> = {};
    for (const e of entries) {
      const key = e.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }
    for (const type of Object.keys(grouped)) {
      const label = RESEARCH_TYPE_LABEL[type as ResearchType] || type;
      parts.push(`<h3>${escapeHtml(label)}</h3>`);
      parts.push('<ul>');
      for (const e of grouped[type]) {
        const link = e.source_url ? ` (<a href="${escapeHtml(e.source_url)}" rel="nofollow">source</a>)` : '';
        parts.push(`<li>${escapeHtml(e.content)}${link}</li>`);
      }
      parts.push('</ul>');
    }
  }
  if (idea.notes) {
    parts.push('<!-- Scratch notes carried over from the Planner. -->');
    parts.push(`<p><em>${escapeHtml(idea.notes)}</em></p>`);
  }
  return parts.join('\n');
}
