import { NextRequest, NextResponse } from 'next/server';
import {
  listIdeas,
  createIdea,
  type IdeaStatus,
  type CreateIdeaInput,
} from '@/lib/plugins/bundled/content-planner/queries';

const VALID_STATUSES: IdeaStatus[] = ['idea', 'researching', 'drafting', 'ready', 'published'];
const VALID_CADENCES = ['annual', 'seasonal', 'quarterly', 'once'] as const;

function pickStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((s): s is string => typeof s === 'string');
}

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
    if (body.refresh_cadence && !VALID_CADENCES.includes(body.refresh_cadence)) {
      return NextResponse.json(
        { error: `refresh_cadence must be one of ${VALID_CADENCES.join(', ')}` },
        { status: 400 },
      );
    }
    const input: CreateIdeaInput = {
      title: body.title.trim(),
      status: body.status,
      description: typeof body.description === 'string' ? body.description : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      linked_keyword_ids: Array.isArray(body.linked_keyword_ids) ? body.linked_keyword_ids : undefined,
      deadline: typeof body.deadline === 'string' ? body.deadline : undefined,
      refresh_cadence: body.refresh_cadence,
      refresh_next_due: typeof body.refresh_next_due === 'string' ? body.refresh_next_due : undefined,
      cluster: typeof body.cluster === 'string' ? body.cluster : undefined,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      estimated_effort_hours: typeof body.estimated_effort_hours === 'number' ? body.estimated_effort_hours : undefined,
      schema_types: pickStringArray(body.schema_types),
      monetization_angles: pickStringArray(body.monetization_angles),
      serp_targets: pickStringArray(body.serp_targets),
      audience_personas: pickStringArray(body.audience_personas),
    };
    const idea = createIdea(input);
    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    console.error('[planner] createIdea failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create idea' },
      { status: 500 },
    );
  }
}
