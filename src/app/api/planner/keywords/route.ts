import { NextRequest, NextResponse } from 'next/server';
import {
  listKeywords,
  createKeyword,
} from '@/lib/plugins/bundled/content-planner/queries';

export async function GET() {
  try {
    return NextResponse.json({ keywords: listKeywords() });
  } catch (error) {
    console.error('[planner] listKeywords failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list keywords' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.term || typeof body.term !== 'string' || !body.term.trim()) {
      return NextResponse.json({ error: 'term is required' }, { status: 400 });
    }
    const keyword = createKeyword({
      term: body.term.trim(),
      volume: typeof body.volume === 'number' ? body.volume : undefined,
      target_post_id: typeof body.target_post_id === 'number' ? body.target_post_id : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });
    return NextResponse.json({ keyword }, { status: 201 });
  } catch (error) {
    // UNIQUE constraint on `term` collisions land here.
    const message = error instanceof Error ? error.message : 'Failed to create keyword';
    const status = message.includes('UNIQUE') ? 409 : 500;
    console.error('[planner] createKeyword failed:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
