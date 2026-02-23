import { NextRequest, NextResponse } from 'next/server';
import { getResourceById, discardAllChanges, getResourceSeo, getSyncedSnapshot } from '@/lib/queries';

export async function POST(
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

    if (!resource.is_dirty) {
      return NextResponse.json(
        { error: 'Resource has no local changes' },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (body.type === 'all') {
      discardAllChanges(id);
    } else {
      return NextResponse.json(
        { error: 'Invalid reset type' },
        { status: 400 }
      );
    }

    const updated = getResourceById(id);
    const seo = getResourceSeo(id);
    const synced_snapshot = updated?.is_dirty ? getSyncedSnapshot(id) : null;

    return NextResponse.json({ ...updated, seo, synced_snapshot });
  } catch (error) {
    console.error('Error resetting resource:', error);
    return NextResponse.json(
      { error: `Failed to reset resource: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
