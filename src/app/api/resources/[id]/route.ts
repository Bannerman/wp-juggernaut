import { NextRequest, NextResponse } from 'next/server';
import { getResourceById, updateLocalResource, getResourceSeo, saveResourceSeo, getSyncedSnapshot } from '@/lib/queries';
import { getEnvDb } from '@/lib/db';
import { trashResource } from '@/lib/wp-client';
import { getRestBaseForPostType } from '@/lib/push';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const resource = getResourceById(id);

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // Include SEO data
    const seo = getResourceSeo(id);

    // Include synced snapshot when dirty (for field-level change detection)
    const synced_snapshot = resource.is_dirty ? getSyncedSnapshot(id) : null;

    return NextResponse.json({ ...resource, seo, synced_snapshot });
  } catch (error) {
    console.error('Error fetching resource:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const resource = getResourceById(id);
    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // Update resource fields
    updateLocalResource(id, {
      title: body.title,
      slug: body.slug,
      status: body.status,
      taxonomies: body.taxonomies,
      meta_box: body.meta_box,
    });

    // Update SEO data if provided
    if (body.seo) {
      saveResourceSeo(id, body.seo, true); // true = mark dirty
    }

    const updated = getResourceById(id);
    const seo = getResourceSeo(id);
    return NextResponse.json({ ...updated, seo });
  } catch (error) {
    console.error('Error updating resource:', error);
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/resources/[id]
 *
 * Two distinct behaviors depending on the ID sign:
 *
 *  - Negative ID (local-only stub from planner promote or MCP create_post):
 *    hard delete locally — there is nothing to undo on WP because the post
 *    never existed there. If a planner_ideas row references this stub via
 *    promoted_post_id, it's recalled (status reverts to pre_promote_status
 *    or 'ready', promoted_post_id cleared) so the planner doesn't keep
 *    showing a dead "promoted" link.
 *
 *  - Positive ID (real WP post): trash on WordPress via DELETE without
 *    force, then mirror status='trash' locally. Same flow the rc.15 push
 *    path uses for status='trash' updates. Linked planner_ideas keep their
 *    link — the post still exists on WP in trash — but the planner UI can
 *    surface the trashed state via a later sync.
 *
 * Refuses if the row doesn't exist. WP-side errors bubble back as 500.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const resource = getResourceById(id);
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Env DB has the project DB ATTACHed as `project` — planner tables live
    // there. The transaction below spans both files and stays atomic.
    const db = getEnvDb();
    const linkedPlannerIdea = db
      .prepare('SELECT id, pre_promote_status FROM project.planner_ideas WHERE promoted_post_id = ?')
      .get(id) as { id: number; pre_promote_status: string | null } | undefined;

    if (id < 0) {
      // Local stub — hard delete.
      const transaction = db.transaction(() => {
        db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(id);
        db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(id);
        db.prepare('DELETE FROM change_log WHERE post_id = ?').run(id);
        db.prepare('DELETE FROM plugin_data WHERE post_id = ?').run(id);
        db.prepare('DELETE FROM posts WHERE id = ?').run(id);
        if (linkedPlannerIdea) {
          const fallback = linkedPlannerIdea.pre_promote_status || 'ready';
          db.prepare(
            `UPDATE project.planner_ideas
             SET promoted_post_id = NULL,
                 promoted_target_id = NULL,
                 status = ?,
                 pre_promote_status = NULL,
                 updated_at = datetime('now')
             WHERE id = ?`,
          ).run(fallback, linkedPlannerIdea.id);
        }
      });
      transaction();
      return NextResponse.json({
        ok: true,
        mode: 'local_delete',
        recalled_planner_idea: linkedPlannerIdea?.id ?? null,
      });
    }

    // Real WP post — trash via REST, then mirror local.
    const restBase = getRestBaseForPostType((resource as { post_type?: string }).post_type || 'resource');
    try {
      await trashResource(id, restBase);
    } catch (err) {
      console.error('[resources] WP trash failed:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'WP trash failed' },
        { status: 502 },
      );
    }
    db.prepare(
      "UPDATE posts SET status = 'trash', is_dirty = 0, modified_gmt = ? WHERE id = ?",
    ).run(new Date().toISOString(), id);

    return NextResponse.json({ ok: true, mode: 'wp_trash' });
  } catch (error) {
    console.error('Error deleting resource:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete resource' },
      { status: 500 }
    );
  }
}
