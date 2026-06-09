import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getResourceById } from '@/lib/queries';
import { updateResource } from '@/lib/wp-client';
import { getRestBaseForPostType } from '@/lib/push';

/**
 * Restore a trashed resource. POSTs `{status: 'draft'}` to WP (the standard
 * untrash transition) and updates the local row to match. Mirrors the trash
 * push path (which routes through DELETE) — this is the reverse.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const resource = getResourceById(id);

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    if (resource.status !== 'trash') {
      return NextResponse.json(
        { error: `Resource is not in trash (current status: ${resource.status})` },
        { status: 400 },
      );
    }

    const restBase = getRestBaseForPostType(resource.post_type || 'resource');
    const updated = await updateResource(id, { status: 'draft' }, restBase);

    const db = getDb();
    db.prepare('UPDATE posts SET status = ?, is_dirty = 0, modified_gmt = ? WHERE id = ?').run(
      'draft',
      updated.modified_gmt,
      id,
    );

    return NextResponse.json({ ...getResourceById(id) });
  } catch (error) {
    console.error('Error restoring resource:', error);
    return NextResponse.json(
      { error: `Failed to restore resource: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 },
    );
  }
}
