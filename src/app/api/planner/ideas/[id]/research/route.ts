import { NextRequest, NextResponse } from 'next/server';
import {
  listResearchEntries,
  createResearchEntry,
  getIdea,
  RESEARCH_TYPES,
} from '@/lib/plugins/bundled/content-planner/queries';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    return NextResponse.json({ entries: listResearchEntries(id) });
  } catch (error) {
    console.error('[planner] listResearchEntries failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list research entries' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ideaId = parseInt(params.id, 10);
    if (!Number.isFinite(ideaId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    if (!getIdea(ideaId)) {
      return NextResponse.json({ error: 'idea not found' }, { status: 404 });
    }
    const body = await request.json();
    if (!body.type || !RESEARCH_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `type must be one of ${RESEARCH_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    const entry = createResearchEntry({
      idea_id: ideaId,
      type: body.type,
      content: body.content,
      source_url: typeof body.source_url === 'string' && body.source_url.trim() ? body.source_url.trim() : undefined,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('[planner] createResearchEntry failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create research entry' },
      { status: 500 },
    );
  }
}
