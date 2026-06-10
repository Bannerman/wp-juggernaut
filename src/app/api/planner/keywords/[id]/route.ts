import { NextRequest, NextResponse } from 'next/server';
import {
  updateKeyword,
  deleteKeyword,
} from '@/lib/plugins/bundled/content-planner/queries';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const body = await request.json();
    const keyword = updateKeyword(id, {
      term: typeof body.term === 'string' ? body.term : undefined,
      volume: typeof body.volume === 'number' ? body.volume : body.volume === null ? null : undefined,
      target_post_id: typeof body.target_post_id === 'number' ? body.target_post_id : body.target_post_id === null ? null : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });
    if (!keyword) {
      return NextResponse.json({ error: 'keyword not found' }, { status: 404 });
    }
    return NextResponse.json({ keyword });
  } catch (error) {
    console.error('[planner] updateKeyword failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update keyword' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const removed = deleteKeyword(id);
    if (!removed) {
      return NextResponse.json({ error: 'keyword not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[planner] deleteKeyword failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete keyword' },
      { status: 500 },
    );
  }
}
