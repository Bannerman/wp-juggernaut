import { NextRequest, NextResponse } from 'next/server';
import { deletePlannerTerm } from '@/lib/plugins/bundled/content-planner/queries';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const removed = deletePlannerTerm(id);
    if (!removed) {
      return NextResponse.json(
        { error: 'planner term not found or already promoted to WP' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[planner] deletePlannerTerm failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete planner term' },
      { status: 500 },
    );
  }
}
