import { NextRequest, NextResponse } from 'next/server';
import {
  updateIdea,
  deleteIdea,
  type IdeaStatus,
  type IdeaPatch,
} from '@/lib/plugins/bundled/content-planner/queries';

const VALID_STATUSES: IdeaStatus[] = ['idea', 'researching', 'drafting', 'ready', 'published'];
const VALID_FREQUENCIES = ['annual', 'seasonal', 'quarterly', 'once'] as const;

function pickStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((s): s is string => typeof s === 'string');
}

function pickNumberArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((n): n is number => typeof n === 'number');
}

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
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    const freqIn = body.frequency ?? body.refresh_cadence;
    if (freqIn !== undefined && freqIn !== null && !VALID_FREQUENCIES.includes(freqIn)) {
      return NextResponse.json(
        { error: `frequency must be one of ${VALID_FREQUENCIES.join(', ')}` },
        { status: 400 },
      );
    }
    const patch: IdeaPatch = {
      title: typeof body.title === 'string' ? body.title : undefined,
      status: body.status,
      description: typeof body.description === 'string' ? body.description : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      linked_keyword_ids: Array.isArray(body.linked_keyword_ids) ? body.linked_keyword_ids : undefined,
      promoted_post_id: typeof body.promoted_post_id === 'number' ? body.promoted_post_id : undefined,
      deadline: typeof body.deadline === 'string' || body.deadline === null ? body.deadline : undefined,
      frequency: freqIn,
      refresh_next_due: typeof body.refresh_next_due === 'string' || body.refresh_next_due === null ? body.refresh_next_due : undefined,
      cluster: typeof body.cluster === 'string' || body.cluster === null ? body.cluster : undefined,
      priority: typeof body.priority === 'number' || body.priority === null ? body.priority : undefined,
      estimated_effort_hours: typeof body.estimated_effort_hours === 'number' || body.estimated_effort_hours === null ? body.estimated_effort_hours : undefined,
      schema_types: pickStringArray(body.schema_types),
      monetization_angles: pickStringArray(body.monetization_angles),
      serp_targets: pickStringArray(body.serp_targets),
      audience_personas: pickStringArray(body.audience_personas),
      resource_type_term_id: typeof body.resource_type_term_id === 'number' || body.resource_type_term_id === null ? body.resource_type_term_id : undefined,
      topic_term_ids: pickNumberArray(body.topic_term_ids),
      audience_term_ids: pickNumberArray(body.audience_term_ids),
    };
    const idea = updateIdea(id, patch);
    if (!idea) {
      return NextResponse.json({ error: 'idea not found' }, { status: 404 });
    }
    return NextResponse.json({ idea });
  } catch (error) {
    console.error('[planner] updateIdea failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update idea' },
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
    const removed = deleteIdea(id);
    if (!removed) {
      return NextResponse.json({ error: 'idea not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[planner] deleteIdea failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete idea' },
      { status: 500 },
    );
  }
}
