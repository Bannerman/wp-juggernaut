import { NextRequest, NextResponse } from 'next/server';
import {
  listIdeas,
  createIdea,
  type IdeaStatus,
} from '@/lib/plugins/bundled/content-planner/queries';

const VALID_STATUSES: IdeaStatus[] = ['idea', 'researching', 'drafting', 'ready', 'published'];

export async function GET() {
  try {
    return NextResponse.json({ ideas: listIdeas() });
  } catch (error) {
    console.error('[planner] listIdeas failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list ideas' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    const idea = createIdea({
      title: body.title.trim(),
      status: body.status,
      description: typeof body.description === 'string' ? body.description : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      linked_keyword_ids: Array.isArray(body.linked_keyword_ids) ? body.linked_keyword_ids : undefined,
    });
    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    console.error('[planner] createIdea failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create idea' },
      { status: 500 },
    );
  }
}
