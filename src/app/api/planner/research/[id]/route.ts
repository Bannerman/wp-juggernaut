import { NextRequest, NextResponse } from 'next/server';
import {
  updateResearchEntry,
  deleteResearchEntry,
  RESEARCH_TYPES,
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
    if (body.type && !RESEARCH_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `type must be one of ${RESEARCH_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    const entry = updateResearchEntry(id, {
      type: body.type,
      content: typeof body.content === 'string' ? body.content : undefined,
      source_url: typeof body.source_url === 'string' || body.source_url === null ? body.source_url : undefined,
    });
    if (!entry) {
      return NextResponse.json({ error: 'research entry not found' }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    console.error('[planner] updateResearchEntry failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update research entry' },
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
    const removed = deleteResearchEntry(id);
    if (!removed) {
      return NextResponse.json({ error: 'research entry not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[planner] deleteResearchEntry failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete research entry' },
      { status: 500 },
    );
  }
}
