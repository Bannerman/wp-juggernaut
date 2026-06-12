import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getIdea } from '@/lib/plugins/bundled/content-planner/queries';

/**
 * DELETE /api/planner/ideas/[id]/draft — destructive "delete draft" path.
 *
 * Deletes the local resource stub linked via `promoted_post_id`, but does
 * NOT revert the idea's status. The idea stays in 'published' on the
 * planner with `promoted_post_id` cleared, which models "the draft is
 * abandoned but the planner record is preserved as history".
 *
 * For the non-destructive flow (delete stub AND revert status to the
 * pre-promote stage so the user can revise and re-promote), use
 * DELETE /api/planner/ideas/[id]/promote instead.
 *
 * As with recall, refuses if the stub has already been pushed to WP.
 */
export async function DELETE(
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
    if (idea.promoted_post_id === null) {
      return NextResponse.json(
        { error: 'idea has no linked draft' },
        { status: 400 },
      );
    }
    if (idea.promoted_post_id > 0) {
      return NextResponse.json(
        {
          error:
            'The draft has already been pushed to WordPress. Delete it from the Posts view (and trash on WP) instead.',
        },
        { status: 409 },
      );
    }

    const db = getDb();
    const postId = idea.promoted_post_id;
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM change_log WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM plugin_data WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

      db.prepare(
        `UPDATE planner_ideas
         SET promoted_post_id = NULL,
             pre_promote_status = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      ).run(id);
    });
    transaction();

    return NextResponse.json({ ok: true, removed_post_id: postId });
  } catch (error) {
    console.error('[planner] delete draft failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete draft' },
      { status: 500 },
    );
  }
}
